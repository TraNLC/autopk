const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execSync, exec } = require('child_process');

function execAsync(cmd, options = {}) {
  return new Promise((resolve) => {
    exec(cmd, options, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}
const { FridaSession } = require('../frida-session');
const config = require('../../config');
const { autoTongKimLoop, npcCacheMap } = require('../features/tongkim');
const { scanDatauItems } = require('../features/datau');

let mainWindow = null;

// Multi-session state
const sessions = new Map(); // deviceId -> { session, interval, info }

let globalAutoTKInterval = null;
let isAutoTKEnabled = false;
let globalTkSide = 'auto'; // auto | song | jin
let globalLacSettings = []; // array of particular ids

const ADB = config.ADB_PATH || 'C:\\platform-tools\\adb.exe';
const PKG = config.GAME_PACKAGE || 'vn.perfingame.jx1mobile';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 720,
    minWidth: 400,
    minHeight: 500,
    resizable: true,
    frame: true,
    title: 'GST Auto TK ver 1.0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', async () => {
    await cleanup();
    mainWindow = null;
  });
}

async function cleanup() {
  if (globalAutoTKInterval) {
    clearInterval(globalAutoTKInterval);
    globalAutoTKInterval = null;
  }
  for (const [deviceId, state] of sessions.entries()) {
    if (state.interval) clearInterval(state.interval);
    if (state.session) {
      try { await state.session.disconnect(); } catch (e) {}
    }
  }
  sessions.clear();
}

function sendLog(msg, type = 'info') {
  if (mainWindow) {
    mainWindow.webContents.send('tab-log', { msg, type });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  await cleanup();
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler: Scan devices
ipcMain.handle('scan-devices', async () => {
  try {
    try { execSync(`"${ADB}" start-server`, { timeout: 3000 }); } catch (e) {}
    const ports = config.DEFAULT_PORTS || [16416, 5555, 5556, 5557, 26624, 26656, 26688, 26720, 26752, 26784, 26816, 26880];
    
    // Check ports using net.Socket first to avoid ADB crashes and hanging
    const net = require('net');
    function checkPort(port) {
      return new Promise((resolve) => {
        const s = new net.Socket();
        s.setTimeout(200);
        s.on('connect', () => { s.destroy(); resolve(true); });
        s.on('timeout', () => { s.destroy(); resolve(false); });
        s.on('error', () => { s.destroy(); resolve(false); });
        s.connect(port, '127.0.0.1');
      });
    }

    for (const port of ports) {
      if (await checkPort(port)) {
        try { await execAsync(`"${ADB}" connect 127.0.0.1:${port}`, { timeout: 1500 }); } catch(e){}
      }
    }

    const { stdout } = await execAsync(`"${ADB}" devices`);
    const lines = stdout.split('\n');
    const devices = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && line.includes('device') && !line.includes('offline')) {
        let deviceId = line.split('\t')[0];
        
        // Deduplicate common emulator console vs tcp ports
        let isDuplicate = false;
        for (const d of devices) {
          if (deviceId === '127.0.0.1:5555' && d.id === 'emulator-5554') isDuplicate = true;
          if (deviceId === 'emulator-5554' && d.id === '127.0.0.1:5555') isDuplicate = true;
          if (deviceId === '127.0.0.1:5557' && d.id === 'emulator-5556') isDuplicate = true;
          if (deviceId === 'emulator-5556' && d.id === '127.0.0.1:5557') isDuplicate = true;
          if (deviceId === '127.0.0.1:5559' && d.id === 'emulator-5558') isDuplicate = true;
          if (deviceId === 'emulator-5558' && d.id === '127.0.0.1:5559') isDuplicate = true;
          // Nox specific
          if (deviceId === '127.0.0.1:62001' && d.id === 'emulator-5554') isDuplicate = true;
          if (deviceId === 'emulator-5554' && d.id === '127.0.0.1:62001') isDuplicate = true;
        }
        
        if (!isDuplicate) {
          devices.push({ id: deviceId, name: deviceId });
        }
      }
    }
    return { ok: true, devices };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// IPC Handler: Toggle Device Connection
ipcMain.handle('toggle-device', async (event, deviceId, connect) => {
  if (!connect) {
    // Disconnect
    const state = sessions.get(deviceId);
    if (state) {
      if (state.interval) clearInterval(state.interval);
      if (state.session) await state.session.disconnect();
      sessions.delete(deviceId);
      npcCacheMap.delete(deviceId);
      sendLog(`[${deviceId}] Đã ngắt kết nối.`, 'warn');
      return { ok: true };
    }
    return { ok: true };
  }

  // Connect
  if (sessions.has(deviceId)) return { ok: true }; // Already connected
  sendLog(`[${deviceId}] Đang gắn kết (attach) Frida...`, 'info');
  
  const session = new FridaSession(deviceId);
  let ok = false;
  try {
    ok = await session.connect(PKG);
  } catch (err) {
    sendLog(`[${deviceId}] Lỗi kết nối Frida: ${err.message}`, 'error');
    return { ok: false, error: err.message };
  }
  
  if (!ok) {
    sendLog(`[${deviceId}] Lỗi kết nối (game chưa mở?).`, 'error');
    return { ok: false, error: 'Connection failed' };
  }
  
  sendLog(`[${deviceId}] Kết nối thành công! Bắt đầu tải script...`, 'success');
  
  try {
    const scriptPath = path.join(__dirname, '../../frida-scripts/bot.bundle.js');
    await session.loadScript(scriptPath);
    sendLog(`[${deviceId}] Tải script thành công. Đang đọc dữ liệu nhân vật...`, 'success');
    
    // TÍNH NĂNG "HỌC ID" NPC QUA GÓI TIN (CHỐNG VĂNG GAME)
    session.onMessage((payload, data) => {
      if (payload && payload.type === 'send_out' && payload.opcode === 33 && payload.hex) {
        // Phân tích ID NPC từ body của gói tin eNpcDialogue (Opcode 33)
        // Định dạng Protobuf: tag 1, type string -> 0x0a <len> <ascii chars>
        const hexStr = payload.hex.replace(/\s+/g, '');
        const bytes = Buffer.from(hexStr, 'hex');
        let dynamicId = null;
        
        if (bytes.length >= 2 && bytes[0] === 0x0a) {
          const len = bytes[1];
          if (bytes.length >= 2 + len) {
            dynamicId = bytes.slice(2, 2 + len).toString('ascii');
          }
        }
        
        // Fallback nếu không khớp Protobuf chuẩn
        if (!dynamicId) {
          let asciiStr = '';
          for (let i = 0; i < bytes.length; i++) {
            if (bytes[i] >= 48 && bytes[i] <= 57) asciiStr += String.fromCharCode(bytes[i]);
            else asciiStr += ' ';
          }
          const numbers = asciiStr.split(' ').filter(s => s.length > 0);
          if (numbers.length > 0) dynamicId = numbers[0];
        }

        if (dynamicId) {
          if (!npcCacheMap.has(deviceId)) npcCacheMap.set(deviceId, {});
          let cache = npcCacheMap.get(deviceId);
          
          if (!cache.learnedIds) cache.learnedIds = [];
          if (!cache.learnedIds.includes(dynamicId)) {
            cache.learnedIds.push(dynamicId);
            if (cache.learnedIds.length > 2) cache.learnedIds.shift(); // Giữ tối đa 2 ID gần nhất
          }
          
          if (state.info && state.info.mapId) cache.mapId = state.info.mapId;
          
          sendLog(`[${deviceId}] 🎓 ĐÃ HỌC ID NPC: ${dynamicId}. (Đã nhớ ${cache.learnedIds.length}/2 NPC)`, 'success');
        }
      }
    });

  } catch(e) {
    sendLog(`[${deviceId}] Lỗi tải script: ${e.message}`, 'error');
    return { ok: false, error: 'Script load failed' };
  }

  const state = { session, info: null, interval: null };
  sessions.set(deviceId, state);

  // Start status polling
  state.interval = setInterval(async () => {
    try {
      const infoStr = await session.callRpc('getPlayerInfo');
      if (infoStr) {
        const info = infoStr;
        state.info = info;
        
        if (info.error && info.error !== state.lastLoggedError) {
          sendLog(`[${deviceId}] Lỗi đọc thông tin: ${info.error}`, 'error');
          state.lastLoggedError = info.error;
        } else if (!info.error && state.lastLoggedError) {
          state.lastLoggedError = null; // Clear error if reading succeeds
        }
        
        if (mainWindow) {
          mainWindow.webContents.send('player-info-update', { deviceId, info });
        }
      }
    } catch(e) {
      if (e.message !== state.lastLoggedError) {
        sendLog(`[${deviceId}] Lỗi RPC đọc dữ liệu: ${e.message}`, 'error');
        state.lastLoggedError = e.message;
      }
    }
  }, 2000);

  return { ok: true };
});

ipcMain.handle('scan-datau', async (event, deviceId, keyword, filters) => {
  const state = sessions.get(deviceId);
  if (!state || !state.session) {
    sendLog(`[${deviceId}] Lỗi: Máy chưa kết nối.`, 'error');
    return { ok: false, error: 'Máy chưa kết nối Frida. Hãy nhấn Kết Nối ở menu trái trước!' };
  }
  return await scanDatauItems(deviceId, state.session, keyword, filters, event, sendLog);
});

let globalTkConfigs = {};

// IPC Handler: Toggle Global Auto TK
ipcMain.handle('toggle-auto-tk', (event, enable, tkConfigs) => {
  isAutoTKEnabled = enable;
  if (tkConfigs) globalTkConfigs = tkConfigs;

  if (enable) {
    sendLog(`BẬT Auto Tống Kim toàn cục.`, 'success');
    if (!globalAutoTKInterval) {
      globalAutoTKInterval = setInterval(async () => {
        // Run Tong Kim loop for all connected sessions sequentially
        for (const [deviceId, state] of sessions.entries()) {
          try {
            const devCfg = globalTkConfigs[deviceId] || { side: 'auto', lacs: [] };
            await autoTongKimLoop(deviceId, state.session, state.info, devCfg.side, devCfg.lacs, sendLog);
          } catch(e) {
            sendLog(`[${deviceId}] Lỗi Auto Tống Kim: ${e.message}`, 'error');
          }
        }
      }, 5000);
    }
  } else {
    sendLog(`TẮT Auto Tống Kim toàn cục.`, 'warn');
    if (globalAutoTKInterval) {
      clearInterval(globalAutoTKInterval);
      globalAutoTKInterval = null;
    }
  }
  return { ok: true };
});

// IPC Handler: Test Chat NPC (Sử dụng ID đã học)
ipcMain.handle('test-npc', async (event, deviceId, index) => {
  const state = sessions.get(deviceId);
  if (!state || !state.session) {
    sendLog(`[${deviceId}] Lỗi: Máy chưa kết nối.`, 'error');
    return { ok: false };
  }
  
  let cache = npcCacheMap.get(deviceId);
  if (!cache) {
    cache = { learnedIds: [] };
    npcCacheMap.set(deviceId, cache);
  }
  
  // Nạp sẵn ID cũ (5567, 5555) nếu user lười click lại sau khi restart app
  if (!cache.learnedIds || cache.learnedIds.length === 0) {
    cache.learnedIds = ["5567", "5555"];
    sendLog(`[${deviceId}] Đã tự động nạp lại 2 ID (5567, 5555) từ phiên trước để test!`, 'info');
  }
  
  if (cache.learnedIds.length <= index) {
    sendLog(`[${deviceId}] ⚠️ Lỗi: Chưa học đủ NPC. Bạn cần click tay vào NPC trên màn hình game trước. (Hiện đang có ${cache.learnedIds.length}/2 NPC)`, 'warn');
    return { ok: false };
  }
  
  const targetId = cache.learnedIds[index];
  sendLog(`[${deviceId}] TEST: Gọi NPC ${targetId} (Option 0)...`, 'info');
  try {
    await state.session.callRpc('remoteNpcDialogue', targetId);
    await new Promise(r => setTimeout(r, 800));
    await state.session.callRpc('selectDialogOption', 0);
    sendLog(`[${deviceId}] TEST THÀNH CÔNG! Đã gửi lệnh cho NPC ${targetId}.`, 'success');
  } catch(e) {
    sendLog(`[${deviceId}] Lỗi Test NPC: ${e.message}`, 'error');
  }
  return { ok: true };
});
