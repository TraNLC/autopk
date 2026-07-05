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

function writeVarint(val) {
  const buf = [];
  let v = typeof val === 'bigint' ? val : BigInt(val);
  if (v < 0n) {
    v = (1n << 64n) + v;
  }
  while (v >= 128n) {
    buf.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  buf.push(Number(v));
  return Buffer.from(buf);
}
const { FridaSession } = require('../frida-session');
const { AutoPK } = require('../auto-pk');
const { MemoryReader } = require('../memory-reader');
const { PacketInjector } = require('../packet-injector');
const { PacketSniffer } = require('../packet-sniffer');
const config = require('../../config');
const { autoTongKimLoop, npcCacheMap, ensureCache } = require('../features/tongkim');
const { TongKimMapData, updateNpcId } = require('../features/tongkim-data');
const { scanDatauItems, buyDatauItem, getShopDetails } = require('../features/datau');
const { getMapName } = require('../item-db');

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
    height: 800,
    minWidth: 400,
    minHeight: 600,
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
// Smart scan: auto-detect MuMu console ports (16380-16500 range, parallel TCP check)
    const net = require('net');
    const SCAN_START = 16380;
    const SCAN_END = 16500;

    function checkPort(port) {
      return new Promise((resolve) => {
        const s = new net.Socket();
        s.setTimeout(150);
        s.on('connect', () => { s.destroy(); resolve(true); });
        s.on('timeout', () => { s.destroy(); resolve(false); });
        s.on('error', () => { s.destroy(); resolve(false); });
        s.connect(port, '127.0.0.1');
      });
    }

    // Phase 1: TCP scan in parallel batches of 30
    const openPorts = [];
    const allPorts = [];
    for (let p = SCAN_START; p <= SCAN_END; p++) allPorts.push(p);
    for (let i = 0; i < allPorts.length; i += 30) {
      const batch = allPorts.slice(i, i + 30);
      const results = await Promise.all(batch.map(p => checkPort(p).then(ok => ok ? p : null)));
      for (const r of results) if (r) openPorts.push(r);
    }

    // Phase 2: adb connect to open ports in parallel batches
    for (let i = 0; i < openPorts.length; i += 10) {
      const batch = openPorts.slice(i, i + 10);
      await Promise.all(batch.map(p => 
        execAsync(`"${ADB}" connect 127.0.0.1:${p}`, { timeout: 2000 }).catch(() => {})
      ));
    }

    // Phase 3: get devices, filter 5-digit ports, dedup by product model
    const { stdout } = await execAsync(`"${ADB}" devices -l`);
    const lines = stdout.split('\n');
    const devices = [];
    const seenModels = new Set();
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || !line.includes('device') || line.includes('offline')) continue;
      
      const parts = line.split(/\s+/);
      const deviceId = parts[0];
      if (!deviceId) continue;

      // Only 5-digit ports (MuMu console), skip 4-digit aliases (5555, 7555...)
      const portMatch = deviceId.match(/:(\d+)$/);
      if (!portMatch || portMatch[1].length !== 5) continue;

      // Each 5-digit port = unique emulator instance (no dedup needed)
      devices.push({ id: deviceId, name: deviceId });
    }

    sendLog(`📱 Tìm thấy ${devices.length} giả lập (quét ${SCAN_START}-${SCAN_END}).`, 'info');
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
      if (state.sniffer) state.sniffer.stop();
      if (state.autoPK) state.autoPK.stop();
      try {
        if (state.session) await state.session.disconnect();
      } catch (e) {
        // Ignore disconnect errors (script already destroyed, etc.)
      }
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
  
  const sniffer = new PacketSniffer(session);
  const injector = new PacketInjector(session);
  const memory = new MemoryReader(session);
  const autoPK = new AutoPK(session, memory, injector, sniffer, deviceId);
  
  const state = { session, info: null, interval: null, sniffer, injector, memory, autoPK };
  sessions.set(deviceId, state);

  // Start packet sniffer immediately (runs in background for diagnostic logging and packet captures)
  sniffer.start(200);

  sendLog(`[${deviceId}] Kết nối thành công! Bắt đầu tải script...`, 'success');
  
  try {
    // TÍNH NĂNG "HỌC ID" NPC QUA GÓI TIN (CHỐNG VĂNG GAME)
    session.onMessage((payload, data) => {
      if (payload) {
        if (payload.log) {
          sendLog(`[${deviceId}] 💡 [Frida Log] ${payload.log}`, 'info');
          return;
        }
        if (payload.event) {
          sendLog(`[${deviceId}] 📢 [Frida Event] ${payload.event}`, 'info');
        }
        if (payload.msg) {
          sendLog(`[${deviceId}] ⚠️ [Frida Msg] ${payload.msg}`, 'warn');
        }
        if (payload.type === 'il2cpp_ready') {
          sendLog(`[${deviceId}] 📡 [Frida] IL2CPP Base: ${payload.base || 'null'} (${payload.lib || ''})`, 'info');
        }
      }
      if (payload && payload.type === 'send_out') {
        // Debug
        if ([33, 231, 35, 204, 71, 48].includes(payload.opcode)) {
          console.log(`[DEBUG_OPCODE] Sent ${payload.opcode}: ${payload.hex}`);
        }
        
        if (payload.opcode === 33 && payload.hex) {
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
          let cache = ensureCache(deviceId);
          
          let currentMapId = state.info ? state.info.mapId : null;
          let currentCamp = (state.info && state.info.campValue) ? state.info.campValue : 1;
          
          const STAGING_MAPS = [323, 324, 325, 379, 382, 972];
          const BATTLE_MAPS  = [44, 375, 376, 377, 580];
          const prevInTK  = STAGING_MAPS.includes(cache.mapId) || BATTLE_MAPS.includes(cache.mapId);
          const currInTK  = STAGING_MAPS.includes(currentMapId) || BATTLE_MAPS.includes(currentMapId);

          // Chỉ reset khi đổi phe, hoặc khi ra ngoài vùng TK hẳn (về thành)
          if (cache.campValue !== currentCamp || (cache.mapId !== null && prevInTK && !currInTK)) {
            sendLog(`[${deviceId}] [DEBUG] Reset NPC cache: camp ${cache.campValue}→${currentCamp} / map ${cache.mapId}→${currentMapId}`, 'warn');
            cache.mapId = currentMapId;
            cache.campValue = currentCamp;
            cache.trinhSatId = null;
            cache.baodanhId = null;
            cache.learnedIds = [];
          } else {
            cache.mapId = currentMapId;
            if (!cache.campValue) cache.campValue = currentCamp;
          }

          state.session.callRpc('getNearNpcNames').then(res => {
            if (res && res.ok && res.npcMap) {
              const name = res.npcMap[dynamicId] || "";
              const lowerName = name.toLowerCase();

              if (lowerName.includes("trinh sát") || lowerName.includes("trinh sat")) {
                cache.trinhSatId = dynamicId;
                if (!cache.learnedIds.includes(dynamicId)) cache.learnedIds.push(dynamicId);
                const cv = (state.info && state.info.campValue) ? state.info.campValue : 1;
                updateNpcId(currentMapId, cv, 'trinhSat', dynamicId);
                sendLog(`[${deviceId}] 🎓 ĐÃ HỌC ID TRINH SÁT: ${dynamicId} (${name})`, 'success');
              } else if (lowerName.includes("chiêu binh") || lowerName.includes("chieu binh") || lowerName.includes("mộ binh") || lowerName.includes("mo binh")) {
                cache.baodanhId = dynamicId;
                if (!cache.learnedIds.includes(dynamicId)) cache.learnedIds.push(dynamicId);
                sendLog(`[${deviceId}] 🎓 ĐÃ HỌC ID BÁO DANH: ${dynamicId} (${name})`, 'success');
              } else {
                const stagingMaps = [323, 324, 325, 379, 382, 972];
                if (stagingMaps.includes(currentMapId)) {
                  if (!cache.trinhSatId) {
                    cache.trinhSatId = dynamicId;
                    if (!cache.learnedIds.includes(dynamicId)) cache.learnedIds.push(dynamicId);
                    sendLog(`[${deviceId}] 🎓 ĐÃ HỌC ID TRINH SÁT (tên lạ: "${name}"): ${dynamicId}`, 'success');
                  } else {
                    sendLog(`[${deviceId}] 📢 Click NPC không liên quan (${dynamicId} - ${name || 'Không rõ'}), bỏ qua.`, 'info');
                  }
                }
              }
            } else {
              // Fallback
              if (!cache.learnedIds.includes(dynamicId)) {
                cache.learnedIds.push(dynamicId);
                const stagingMaps = [323, 324, 325, 379, 382, 972];
                if (stagingMaps.includes(currentMapId)) {
                  if (!cache.trinhSatId) {
                    cache.trinhSatId = dynamicId;
                    sendLog(`[${deviceId}] 🎓 ĐÃ HỌC ID TRINH SÁT (dự phòng): ${dynamicId}`, 'success');
                  }
                }
              }
            }
          }).catch(err => {
             if (!cache.learnedIds.includes(dynamicId)) {
                cache.learnedIds.push(dynamicId);
             }
          });
        }
        } // End of if (payload.opcode === 33)
      } // End of if (payload.type === 'send_out')
    });

    const scriptPath = path.join(__dirname, '../../frida-scripts/bot.bundle.js');
    await session.loadScript(scriptPath);
    sendLog(`[${deviceId}] Tải script thành công. Đang đọc dữ liệu nhân vật...`, 'success');

  } catch(e) {
    sendLog(`[${deviceId}] Lỗi tải script: ${e.message}`, 'error');
    return { ok: false, error: 'Script load failed' };
  }

  // Start status polling
  state.interval = setInterval(async () => {
    try {
      const infoStr = await session.callRpc('getPlayerInfo');
      if (infoStr) {
        const info = infoStr;
        if (info.mapId) {
          info.mapName = getMapName(info.mapId);
        }
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

ipcMain.handle('test-cast-skill', async (event, deviceId) => {
  const state = sessions.get(deviceId);
  if (!state || !state.session) {
    sendLog(`[${deviceId}] Lỗi: Máy chưa kết nối.`, 'error');
    return { ok: false, error: 'Máy chưa kết nối Frida.' };
  }

  try {
    const sect = (state.info && state.info.sect !== undefined) ? state.info.sect : -1;
    const sectName = (state.info && state.info.sectName) ? state.info.sectName : 'Chưa rõ';
    
    // Map of sect to target buff skill ID (such as 109: Tuyết Ảnh for Thủy Yên)
    const sectSkillMap = {
        0: 102, // Thiếu Lâm
        1: 111, // Thiên Vương
        2: 129, // Đường Môn
        3: 139, // Ngũ Độc
        4: 159, // Nga Mi
        5: 109, // Thúy Yên (Tuyết Ảnh)
        6: 179, // Cái Bang
        7: 189, // Thiên Nhẫn
        8: 209, // Võ Đang
        9: 219  // Côn Lôn
    };
    
    const targetSkill = sectSkillMap[sect] || 1;
    
    const skillNameMap = {
        109: 'Tuyết Ảnh (Thúy Yên)',
        129: 'Đường Môn Độc Kinh',
        139: 'Ngũ Độc Kỳ Kinh',
        159: 'Phật Pháp Vô Biên',
        102: 'Dịch Cân Kinh',
        111: 'Thiên Vương Chiến Ý',
        179: 'Cái Bang Tâm Pháp',
        189: 'Thiên Nhẫn Tâm Pháp',
        209: 'Thái Cực Thần Công',
        219: 'Côn Lôn Tâm Pháp',
        1: 'Đánh thường'
    };
    
    const targetSkillName = skillNameMap[targetSkill] || `Kỹ năng phái (${targetSkill})`;

    sendLog(`[${deviceId}] ⚡ Thực hiện cast nhanh kỹ năng: ${targetSkillName} (ID: ${targetSkill}) | Môn phái: ${sectName}`, 'info');
    
    // Cast skill directly through the memory hook
    await state.session.callRpc('doSkillHooked', targetSkill);
    
    // Fallback: socket packet-level injection (extremely fast, works under all states)
    try {
      const p1 = Buffer.concat([
        writeVarint((1 << 3) | 0), // tag 1 (int32)
        writeVarint(targetSkill)
      ]);
      const p2 = Buffer.concat([
        writeVarint((2 << 3) | 0), // tag 2 (int32)
        writeVarint(state.info ? state.info.x || 0 : 0)
      ]);
      const p3 = Buffer.concat([
        writeVarint((3 << 3) | 0), // tag 3 (int32)
        writeVarint(state.info ? state.info.y || 0 : 0)
      ]);
      const bodyHex = Buffer.concat([p1, p2, p3]).toString('hex');
      const res = await state.session.callRpc('sendTcpPacket', 240, bodyHex);
      sendLog(`[${deviceId}] 📡 [Packet] Kết quả gửi: ${JSON.stringify(res)}`, res.ok ? 'success' : 'warn');
    } catch(e) {
      sendLog(`[${deviceId}] ⚠️ [Packet Fallback] ${e.message}`, 'warn');
    }
    
    // Wait 500ms and check fire status
    await new Promise(resolve => setTimeout(resolve, 500));
    const fireRes = await state.session.callRpc('skillLastFire');
    sendLog(`[${deviceId}] 📡 Kết quả gọi DoSkill: ${fireRes ? fireRes.fire : 'Không có phản hồi'}`, 'info');
    
    sendLog(`[${deviceId}] ✅ Đã gửi lệnh DoSkill(${targetSkill}) trực tiếp qua bộ nhớ!`, 'success');
    return { ok: true, skillId: targetSkill };
  } catch (err) {
    sendLog(`[${deviceId}] ❌ Lỗi test cast skill: ${err.message}`, 'error');
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('scan-datau', async (event, deviceId, keyword, filters) => {
  const state = sessions.get(deviceId);
  if (!state || !state.session) {
    sendLog(`[${deviceId}] Lỗi: Máy chưa kết nối.`, 'error');
    return { ok: false, error: 'Máy chưa kết nối Frida. Hãy nhấn Kết Nối ở menu trái trước!' };
  }
  const mapId = state.info ? state.info.mapId : 0;
  return await scanDatauItems(deviceId, state.session, mapId, keyword, filters, event, sendLog);
});

ipcMain.handle('buy-datau', async (event, deviceId, sellerId, itemIdx, price) => {
  const state = sessions.get(deviceId);
  if (!state || !state.session) {
    return { ok: false, error: 'Máy chưa kết nối Frida.' };
  }
  return await buyDatauItem(deviceId, state.session, sellerId, itemIdx, price, sendLog);
});

ipcMain.handle('get-shop-details', (event, mapId, sellerId) => {
  return getShopDetails(mapId, sellerId);
});

ipcMain.on('show-shop-detail', (event, shopData) => {
  const detailWin = new BrowserWindow({
    width: 650,
    height: 700,
    title: `Chi Tiết Sạp: ${shopData.shopName}`,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  detailWin.setMenuBarVisibility(false);
  detailWin.loadFile(path.join(__dirname, 'renderer', 'shop-detail.html'));
  detailWin.webContents.on('did-finish-load', () => {
    detailWin.webContents.send('load-shop-data', shopData);
  });
});

ipcMain.on('show-all-shops-detail', (event, globalData) => {
  const detailWin = new BrowserWindow({
    width: 800,
    height: 700,
    title: `Tất Cả Sạp Hàng`,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  detailWin.setMenuBarVisibility(false);
  detailWin.loadFile(path.join(__dirname, 'renderer', 'shop-detail.html'));
  detailWin.webContents.on('did-finish-load', () => {
    detailWin.webContents.send('load-all-shops-data', globalData);
  });
});

ipcMain.on('show-5hanh-detail', (event, globalData) => {
  const detailWin = new BrowserWindow({
    width: 900,
    height: 750,
    title: `Phối Đồ Ngũ Hành`,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  detailWin.setMenuBarVisibility(false);
  detailWin.loadFile(path.join(__dirname, 'renderer', '5hanh-detail.html'));
  detailWin.webContents.on('did-finish-load', () => {
    detailWin.webContents.send('load-5hanh-data', globalData);
  });
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
            const devCfg = globalTkConfigs[deviceId] || { side: 'auto', lacs: [], delay: 0 };
            
            // Determine map zone
            const mapId = state.info ? state.info.mapId : 0;
            const isBattlefield = [44, 375, 376, 377, 580].includes(mapId);
            
            if (isBattlefield) {
              // Battlefield: Run custom AutoPK logic, pause dialog NPC loops
              if (state.autoPK && !state.autoPK.running) {
                // Apply configurations from GUI profile
                state.autoPK.usePriorityRange = devCfg.usePriorityRange !== false;
                state.autoPK.priorityRange = devCfg.priorityRange !== undefined ? devCfg.priorityRange : 400;
                state.autoPK.extendedRange = devCfg.extendedRange !== undefined ? devCfg.extendedRange : 800;
                state.autoPK.skillRange = devCfg.skillRange !== undefined ? devCfg.skillRange : 512;
                state.autoPK.useOuterRange = devCfg.useOuterRange !== false;
                state.autoPK.outerRange = devCfg.outerRange !== undefined ? devCfg.outerRange : 700;
                state.autoPK.dismountOnFight = devCfg.dismountOnFight !== false;
                state.autoPK.ignoreInvulnerable = devCfg.ignoreInvulnerable !== false;

                sendLog(`[${deviceId}] ⚔️ Nhân vật đang ở Chiến trường. Khởi động luồng PK nhanh...`, 'success');
                state.autoPK.start();
              }
            } else {
              // Staging area/Dead/Town: Pause custom AutoPK, run autoTongKimLoop respawn logic
              if (state.autoPK && state.autoPK.running) {
                sendLog(`[${deviceId}] 🛡️ Nhân vật đang ở Dưỡng sức/Thành. Tạm dừng luồng PK.`, 'warn');
                await state.autoPK.stop();
              }
              await autoTongKimLoop(deviceId, state.session, state.info, devCfg.side, devCfg.lacs, devCfg.delay, sendLog);
            }
          } catch(e) {
            sendLog(`[${deviceId}] Lỗi Auto Tống Kim: ${e.message}`, 'error');
          }
        }
      }, 1000); // 1-second poll for precise staging/battlefield checking
    }
  } else {
    sendLog(`TẮT Auto Tống Kim toàn cục.`, 'warn');
    if (globalAutoTKInterval) {
      clearInterval(globalAutoTKInterval);
      globalAutoTKInterval = null;
    }
    // Stop all running AutoPK loops
    for (const [deviceId, state] of sessions.entries()) {
      if (state.autoPK && state.autoPK.running) {
        state.autoPK.stop();
      }
    }
  }
  return { ok: true };
});

