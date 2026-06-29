const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');

function execAsync(cmd, options = {}) {
  return new Promise((resolve) => {
    exec(cmd, options, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}
const { FridaSession } = require('../frida-session');
const { PacketSniffer } = require('../packet-sniffer');
const { PacketInjector } = require('../packet-injector');
const { MemoryReader } = require('../memory-reader');
const { AutoPK } = require('../auto-pk');
const config = require('../../config');

let mainWindow = null;
let activeSession = null;
let activeSniffer = null;
let activeInjector = null;
let activeMemory = null;
let activeAutoPK = null;
let infoInterval = null;

const ADB = config.ADB_PATH || 'C:\\platform-tools\\adb.exe';
const PKG = config.GAME_PACKAGE || 'vn.perfingame.jx1mobile';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 950,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    frame: true,
    title: 'GST Auto PK - VLTK1 Mobile',
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
  if (infoInterval) {
    clearInterval(infoInterval);
    infoInterval = null;
  }
  if (activeAutoPK) {
    await activeAutoPK.stop();
    activeAutoPK = null;
  }
  if (activeSniffer) {
    activeSniffer.stop();
    activeSniffer = null;
  }
  if (activeSession) {
    try {
      await activeSession.disconnect();
    } catch (e) {}
    activeSession = null;
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
    // 1. Ensure ADB server is running stably first
    try {
      execSync(`"${ADB}" start-server`, { timeout: 3000 });
    } catch (e) {}

    // 2. Connect to ports sequentially to avoid ADB daemon race conditions
    const ports = config.DEFAULT_PORTS || [16416, 5555, 5556, 5557];
    for (const port of ports) {
      try {
        execSync(`"${ADB}" connect 127.0.0.1:${port}`, { timeout: 800 });
      } catch (e) {}
    }

    const output = execSync(`"${ADB}" devices -l`, { encoding: 'utf8' });
    const devices = [];
    const lines = output.split('\n');
    const seenModels = new Set();
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && line.indexOf('device') !== -1 && line.indexOf('List of') === -1) {
        const parts = line.split(/\s+/);
        const id = parts[0];
        
        // Extract model name (e.g. model:SM_A5560 -> SM A5560)
        const modelMatch = line.match(/model:(\S+)/);
        const model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : '';
        
        // Deduplicate by model name to prevent same emulator appearing on multiple ports
        if (model) {
          if (seenModels.has(model)) {
            continue;
          }
          seenModels.add(model);
        }
        
        devices.push({
          id: id,
          name: model ? `${id} (${model})` : id
        });
      }
    }

    return { ok: true, devices };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// IPC Handler: Connect to Device and Frida
ipcMain.handle('connect-device', async (event, deviceId) => {
  await cleanup();
  
  try {
    sendTabLog('system', `Connecting to device ${deviceId}...`);
    
    // 0. Auto-start Frida Server on target emulator in root daemon mode
    try {
      sendTabLog('system', 'Dang khoi dong Frida server tren thiet bi...');
      
      // Try starting x86_64 server first (most emulators are x64)
      try {
        execSync(`"${ADB}" -s ${deviceId} shell "su -c '/data/local/tmp/frida-server-x86_64 -D'"`, { timeout: 2000 });
      } catch (e) {
        // Fallback to arm64/default server
        execSync(`"${ADB}" -s ${deviceId} shell "su -c '/data/local/tmp/frida-server -D'"`, { timeout: 2000 });
      }
      
      // Let the daemon warm up for 800ms
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (e) {
      sendTabLog('system', `[Note] Khong the khoi dong Frida Server tu dong (co the da chay): ${e.message}`);
    }
    
    // 1. Setup adb forward
    try {
      execSync(`"${ADB}" -s ${deviceId} forward tcp:27042 tcp:27042`);
      sendTabLog('system', 'Frida port forwarding configured (port 27042).');
    } catch (e) {
      sendTabLog('system', `[Warning] ADB port forwarding failed: ${e.message}. Continuing...`);
    }
 
    // 2. Attach Frida
    activeSession = new FridaSession(deviceId, PKG);
    await activeSession.connect();
    sendTabLog('system', `Attached to process: ${PKG} (PID: ${activeSession.pid})`);
 
    // 3. Rebuild (just in case) and Load Frida Script
    const bundlePath = path.join(__dirname, '..', '..', 'frida-scripts', 'bot.bundle.js');
    if (!fs.existsSync(bundlePath)) {
      sendTabLog('system', 'Building Frida bundle...');
      execSync('npm run build:frida');
    }
    
    sendTabLog('system', `Loading bot.bundle.js (${fs.statSync(bundlePath).size} bytes)...`);
    await activeSession.loadScript(bundlePath);
    sendTabLog('system', 'Frida scripts injected successfully!');
 
    // 4. Instantiate bot layers
    activeSniffer = new PacketSniffer(activeSession);
    activeInjector = new PacketInjector(activeSession);
    activeMemory = new MemoryReader(activeSession);
    activeAutoPK = new AutoPK(activeSession, activeMemory, activeInjector, activeSniffer, deviceId, config);
 
    // Setup logging
    activeSession.onMessage((payload) => {
      if (payload.type === 'game_fd') {
        sendTabLog('system', `Game socket FD locked: ${payload.fd}`);
        activeSniffer.gameFd = payload.fd;
      } else if (payload.type === 'error') {
        sendTabLog('system', `[FRIDA ERROR] ${payload.description || payload.msg}`);
      } else if (payload.type === 'il2cpp_event') {
        sendTabLog('system', `[Frida Event] ${payload.event} ${payload.ptr ? '@ ' + payload.ptr : ''}`);
      }
    });
 
    // Start sniffer
    activeSniffer.start(200);
    sendTabLog('system', 'Sniffer loop started.');
 
    // Start player info polling
    infoInterval = setInterval(async () => {
      try {
        const info = await activeSession.callRpc('getPlayerInfo');
        if (info && info.ok) {
          mainWindow.webContents.send('player-info-update', info);
        }
      } catch (e) {}
    }, 2000);
 
    return { ok: true, pid: activeSession.pid };
  } catch (err) {
    sendTabLog('system', `[Connection Error] ${err.stack || err.message}`);
    await cleanup();
    return { ok: false, error: err.message };
  }
});
 
// IPC Handler: Disconnect
ipcMain.handle('disconnect-device', async () => {
  await cleanup();
  sendTabLog('system', 'Disconnected device and terminated bot loops.');
  return { ok: true };
});

// IPC Handler: Toggle PK Loop
ipcMain.handle('toggle-autopk', async (event, run) => {
  if (!activeAutoPK) return { ok: false, error: 'Device not connected' };
  
  try {
    if (run) {
      await activeAutoPK.start();
      sendTabLog('pk', 'Auto PK Loop STARTED.');
    } else {
      await activeAutoPK.stop();
      sendTabLog('pk', 'Auto PK Loop STOPPED.');
    }
    return { ok: true, running: activeAutoPK.running };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// IPC Handler: Update Autoplay settings
ipcMain.handle('update-settings', async (event, settings) => {
  if (activeAutoPK) {
    if (settings.hpThreshold !== undefined) activeAutoPK.hpThreshold = settings.hpThreshold; // percentage 0-100
    if (settings.mpThreshold !== undefined) activeAutoPK.mpThreshold = settings.mpThreshold; // percentage 0-100
    if (settings.buffId !== undefined) activeAutoPK.setBuff(settings.buffId);
    if (settings.attackSkills !== undefined) {
      // Store for reference; actual combat uses in-game auto-play
      activeAutoPK._attackSkills = settings.attackSkills;
    }
    sendTabLog('cau_hinh', `Settings updated: HP<${settings.hpThreshold}%, MP<${settings.mpThreshold}%.`);
  }
  return { ok: true };
});

// IPC Handler: Scan Nearby Shops
ipcMain.handle('scan-nearby-shops', async () => {
  if (!activeMemory) return { ok: false, error: 'Device not connected' };
  try {
    const shops = await activeMemory.getNearbyShops();
    return { ok: true, shops };
  } catch (err) {
    sendTabLog('shop', `[Shop Scan Error] ${err.message}`);
    return { ok: false, error: err.message };
  }
});

// IPC Handler: Scan Shop Items
ipcMain.handle('scan-shop-items', async (event, stallIndex) => {
  if (!activeMemory) return { ok: false, error: 'Device not connected' };
  try {
    sendTabLog('shop', `Dang quet sap hang ID ${stallIndex}...`);
    const data = await activeMemory.getShopItems(stallIndex);
    return { ok: true, title: data.title, items: data.items };
  } catch (err) {
    sendTabLog('shop', `[Shop Items Error] ${err.message}`);
    return { ok: false, error: err.message };
  }
});

const MAGIC_NAMES_STATIC = {
  26: "Sat thuong vat ly ngoai cong (%)",
  27: "Sat thuong vat ly noi cong (%)",
  28: "Ngu hanh tuong khac (%)",
  29: "Sat thuong vat ly noi cong",
  30: "Sat thuong vat ly noi cong (khoang)",
  31: "Sat thuong vat ly ngoai cong",
  32: "Sat thuong vat ly ngoai cong (khoang)",
  33: "Doc sat noi cong",
  34: "Doc sat ngoai cong",
  35: "Loi sat noi cong",
  36: "Loi sat noi cong (khoang)",
  37: "Loi sat ngoai cong",
  38: "Loi sat ngoai cong (khoang)",
  39: "Bang sat noi cong",
  40: "Bang sat noi cong (khoang)",
  41: "Bang sat ngoai cong",
  42: "Bang sat ngoai cong (khoang)",
  43: "Hoa sat noi cong",
  44: "Hoa sat noi cong (khoang)",
  45: "Hoa sat ngoai cong",
  46: "Hoa sat ngoai cong (khoang)",
  47: "Hoa sat toi da (%)",
  48: "Do chinh xac",
  49: "Do chinh xac (%)",
  50: "Bo qua ne tranh (%)",
  51: "Toc do danh noi cong (%)",
  52: "Toc do danh ngoai cong (%)",
  53: "Ne tranh",
  54: "Ne tranh (%)",
  55: "Toc do di chuyen (%)",
  56: "Phan don can chien",
  57: "Phan don can chien (%)",
  58: "Khang tat ca (%)",
  59: "Hut sinh luc (%)",
  60: "Hut noi luc (%)",
  61: "Sinh luc toi da",
  62: "Sinh luc toi da (%)",
  63: "Noi luc toi da",
  64: "Noi luc toi da (%)",
  65: "The luc toi da",
  66: "The luc toi da (%)",
  67: "Phuc hoi sinh luc",
  68: "Tang phuc hoi sinh luc (%)",
  69: "Phuc hoi noi luc",
  70: "Phuc hoi the luc",
  71: "Suc manh",
  72: "Than phap",
  73: "Sinh khi",
  74: "Noi cong",
  75: "Chuyen hoa sat thuong thanh noi luc (%)",
  76: "Phong thu vat ly (%)",
  77: "Khang doc (%)",
  78: "Khang bang (%)",
  79: "Khang hoa (%)",
  80: "Khang loi (%)",
  81: "Khang tat ca toi da (%)",
  82: "Phong thu vat ly toi da (%)",
  83: "Khang doc toi da (%)",
  84: "Khang bang toi da (%)",
  85: "Khang hoa toi da (%)",
  86: "Khang loi toi da (%)",
  87: "Thoi gian phuc hoi",
  88: "Thoi gian choang (%)",
  89: "Thoi gian trung doc (%)",
  92: "Thoi gian lam cham (%)",
  94: "May man (%)",
  95: "Yeu cau than phap",
  96: "Yeu cau sinh khi",
  97: "Dang cap yeu cau",
  98: "Yeu cau suc manh",
  109: "Do ben",
  114: "Thuoc tinh ngu hanh",
  117: "Khong the pha huy",
  118: "Tan cong chi mang (%)",
  119: "Tang tan cong chi mang (%)",
  121: "Phan don tam xa (%)"
};

function getItemCategory(detailAndGenre) {
  const genre = detailAndGenre >> 16;
  const detail = detailAndGenre & 0xFFFF;
  
  if (genre === 0) {
    return "Vu Khi";
  } else if (genre === 1) {
    switch (detail) {
      case 0: return "Non";
      case 1: return "Ao";
      case 2: return "Dai";
      case 3: return "Giay";
      case 4: return "Bao Tay";
      default: return "Giap Khac";
    }
  } else if (genre === 2) {
    switch (detail) {
      case 0: return "Hu Than Phu";
      case 1: return "Nhan";
      case 2: return "Day Chuyen";
      case 3: return "Ngoc Boi";
      default: return "Trang Suc Khac";
    }
  }
  return "Khac";
}

// IPC Handler: Export All Shops Items to JSON
ipcMain.handle('export-all-shops-json', async () => {
  if (!activeMemory) return { ok: false, error: 'Device not connected' };
  try {
    sendTabLog('shop', 'Dang lay danh sach cac sap hang xung quanh...');
    const shops = await activeMemory.getNearbyShops();
    if (!shops || shops.length === 0) {
      return { ok: false, error: 'Khong tim thay sap hang nao xung quanh' };
    }
    
    sendTabLog('shop', `Tim thay ${shops.length} sap hang. Bat dau quet chi tiet tung sap...`);
    
    const exportData = {
      timestamp: new Date().toISOString(),
      totalShops: shops.length,
      shops: []
    };
    
    let scannedShops = 0;
    for (const shop of shops) {
      try {
        const parts = shop.cid.split('.');
        const stallIndex = parts[1];
        if (!stallIndex) continue;
        
        sendTabLog('shop', `Dang quet sap (${scannedShops + 1}/${shops.length}): ${shop.name} (ID: ${stallIndex})...`);
        
        const data = await activeMemory.getShopItems(stallIndex);
        
        // Format shop items for JSON output
        const items = (data.items || []).map(item => {
          // Decode Element Series
          const SERIES_NAMES = { 1: "Kim", 2: "Moc", 3: "Thuy", 4: "Hoa", 5: "Tho" };
          const seriesVal = item.stackAndSeries & 0x7;
          const seriesText = SERIES_NAMES[seriesVal] || 'Khong';
          
          // Decode Price
          let priceText = 'Mien phi';
          if (item.money > 0) {
            priceText = `${item.money.toLocaleString()} bac`;
          } else if (item.knb > 0) {
            priceText = `${item.knb.toLocaleString()} KNB`;
          }
          
          // Decode Magic Options
          const magicsList = [];
          if (item.magics && item.magics.length > 0) {
            for (let i = 0; i < item.magics.length; i += 2) {
              const attrId = item.magics[i];
              const attrVal = item.magics[i + 1];
              if (attrId > 0) {
                const attrName = MAGIC_NAMES_STATIC[attrId] || `Ma thuoc tinh ${attrId}`;
                magicsList.push({
                  attributeId: attrId,
                  name: attrName,
                  value: attrVal
                });
              }
            }
          }
          
          const category = getItemCategory(item.detailAndGenre);
          
          return {
            name: item.name,
            category: category,
            price: priceText,
            rawMoney: item.money,
            rawKnb: item.knb,
            element: seriesText,
            magics: magicsList
          };
        });
        
        exportData.shops.push({
          name: shop.name,
          cid: shop.cid,
          level: shop.level,
          title: data.title || shop.name,
          items: items
        });
        
        scannedShops++;
        
        // Small delay of 200ms between queries to prevent network spam/blocking
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (e) {
        sendTabLog('shop', `[Warning] Khong the quet sap ${shop.name}: ${e.message}`);
      }
    }
    
    // Write to JSON file
    const outDir = config.OUTPUT_DIR || path.join(__dirname, '..', '..', 'data', 'output');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const filePath = path.join(outDir, 'nearby_shops_items.json');
    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
    
    sendTabLog('shop', `Da luu du lieu quet vao file: ${filePath}`);
    return { ok: true, scannedShops, filePath };
  } catch (err) {
    sendTabLog('shop', `[Export Error] ${err.message}`);
    return { ok: false, error: err.message };
  }
});

// IPC Handler: Radar Scan (same as export but dedicated handler)
ipcMain.handle('radar-scan-shops', async () => {
  if (!activeMemory) return { ok: false, error: 'Device not connected' };
  try {
    sendTabLog('shop', '[Radar] Bat dau quet toan bo sap hang...');
    const { scanAllShops } = require('../shop-radar');
    // Radar uses its own Frida connection, so disconnect current session temporarily
    // Actually, just use the existing connection via MemoryReader
    const shops = await activeMemory.getNearbyShops();
    if (!shops || shops.length === 0) {
      return { ok: false, error: 'Khong tim thay sap hang nao' };
    }
    
    sendTabLog('shop', `[Radar] Tim thay ${shops.length} sap. Dang quet...`);
    
    const results = [];
    let scanned = 0, failed = 0;
    
    for (const shop of shops) {
      const parts = shop.cid.split('.');
      const stallIndex = parts[1];
      if (!stallIndex) continue;
      try {
        const data = await activeMemory.getShopItems(stallIndex);
        if (data.items && data.items.length > 0) {
          results.push({
            shopName: shop.name, shopCid: shop.cid, shopLevel: shop.level,
            distance: Math.round(shop.distance),
            pos: { x: shop.x, y: shop.y },
            title: data.title || '', itemCount: data.items.length,
            items: data.items.map(it => ({
              name: it.name || 'Unknown', money: it.money || 0, knb: it.knb || 0
            }))
          });
          scanned++;
        } else { failed++; }
      } catch (e) { failed++; }
      await new Promise(r => setTimeout(r, 200));
    }

    const exportData = {
      timestamp: new Date().toISOString(),
      totalShops: shops.length, scannedShops: scanned, failedShops: failed,
      totalItems: results.reduce((s, r) => s + r.itemCount, 0),
      shops: results
    };

    const outDir = path.join(__dirname, '..', '..', 'data', 'output');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const filePath = path.join(outDir, 'shops_export.json');
    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
    
    sendTabLog('shop', `[Radar] ✅ Da quet ${scanned}/${shops.length} shop, ${exportData.totalItems} items → ${filePath}`);
    return { ok: true, scannedShops: scanned, failedShops: failed, totalItems: exportData.totalItems, filePath };
  } catch (err) {
    sendTabLog('shop', `[Radar Error] ${err.message}`);
    return { ok: false, error: err.message };
  }
});

// IPC Handler: Trigger Remote NPC Dialogue
ipcMain.handle('remote-npc-dialogue', async (event, npcId) => {
  if (!activeSession || !activeSession.connected) return { ok: false, error: 'Thiet bi chua ket noi' };
  try {
    sendTabLog('nhan_vat', `Gui yeu cau doi thoai voi NPC ID ${npcId} tu xa...`);
    const res = await activeSession.callRpc('remoteNpcDialogue', npcId);
    return res;
  } catch (err) {
    sendTabLog('nhan_vat', `[NPC Dialogue Error] ${err.message}`);
    return { ok: false, error: err.message };
  }
});

const logDir = path.join(__dirname, '..', '..', 'log');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function sendTabLog(type, msg) {
  const timeStr = new Date().toLocaleTimeString();
  const logLine = `[${timeStr}] ${msg}\n`;
  const filePath = path.join(logDir, `${type}.log`);
  try {
    fs.appendFileSync(filePath, logLine, 'utf-8');
  } catch (e) {
    // Silently ignore or write to console
  }
  if (mainWindow) {
    mainWindow.webContents.send('tab-log', { type, time: timeStr, msg });
  }
}
