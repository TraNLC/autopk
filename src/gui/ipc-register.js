const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const adbHelper = require('./adb-helper');
const sessionManager = require('./session-manager');
const config = require('../../config');
const { scanDatauItems, buyDatauItem, getShopDetails } = require('../features/datau');

const ADB = config.ADB_PATH || 'C:\\platform-tools\\adb.exe';

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

function sendLog(msg, type = 'info') {
  if (globalThis._mainWindow) {
    globalThis._mainWindow.webContents.send('tab-log', { msg, type });
  }
}

function traceLog(ipcName, deviceId, msg) {
    const timeStr = new Date().toLocaleTimeString();
    console.log(`[TRACE] [${timeStr}] [IPC:${ipcName}] [${deviceId || 'SYSTEM'}] ${msg}`);
}

function registerHandlers(win) {
    globalThis._mainWindow = win;
    traceLog('Init', null, 'Bat dau dang ky tat ca IPC main handlers...');

    // 1. Quét thiết bị
    ipcMain.handle('scan-devices', async (event) => {
        traceLog('scan-devices', null, 'Yeu cau quet thiet bi nhan duoc.');
        const res = await adbHelper.scanDevices(ADB, execAsync, sendLog);
        traceLog('scan-devices', null, `Quet thiet bi hoan tat: ok=${res.ok}`);
        return res;
    });

    // 2. Kết nối/Ngắt kết nối thiết bị
    ipcMain.handle('toggle-device', async (event, deviceId, connect) => {
        traceLog('toggle-device', deviceId, `Yeu cau toggle-device: connect=${connect}`);
        let res;
        if (connect) {
            res = await sessionManager.connectDevice(deviceId, config.GAME_PACKAGE || 'vn.perfingame.jx1mobile', sendLog);
        } else {
            res = await sessionManager.disconnectDevice(deviceId, sendLog);
        }
        traceLog('toggle-device', deviceId, `Toggle-device hoan tat: ok=${res.ok}`);
        return res;
    });

    // 3. Test Buff Nhanh
    ipcMain.handle('test-buff', async (event, deviceId) => {
        traceLog('test-buff', deviceId, `Yeu cau test buff nhanh nhan duoc.`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) {
            sendLog(`[${deviceId}] Lỗi: Máy chưa kết nối.`, 'error');
            return { ok: false, error: 'Máy chưa kết nối Frida.' };
        }

        try {
            const sect = (state.info && state.info.sect !== undefined) ? state.info.sect : -1;
            const sectName = (state.info && state.info.sectName) ? state.info.sectName : 'Chưa rõ';
            
            // Map môn phái sang ID kỹ năng buff
            const sectSkillMap = {
                0: 102, // Thiếu Lâm
                1: 111, // Thiên Vương
                2: 129, // Đường Môn
                3: 139, // Ngũ Độc
                4: 159, // Nga Mi
                5: 109, // Thúy Yên
                6: 179, // Cái Bang
                7: 189, // Thiên Nhẫn
                8: 209, // Võ Đang
                9: 219  // Côn Lôn
            };
            
            const targetSkill = sectSkillMap[sect] || 1;
            traceLog('test-buff', deviceId, `Tim thay buff cua phai ${sectName}: ID=${targetSkill}`);

            // Cast skill qua memory RPC
            await state.session.callRpc('doSkillHooked', targetSkill);
            
            // Gửi gói tin TCP dự phòng (mức độ gói tin socket)
            try {
                const p1 = Buffer.concat([writeVarint((1 << 3) | 0), writeVarint(targetSkill)]);
                const p2 = Buffer.concat([writeVarint((2 << 3) | 0), writeVarint(state.info ? state.info.x || 0 : 0)]);
                const p3 = Buffer.concat([writeVarint((3 << 3) | 0), writeVarint(state.info ? state.info.y || 0 : 0)]);
                const bodyHex = Buffer.concat([p1, p2, p3]).toString('hex');
                await state.session.callRpc('sendTcpPacket', 240, bodyHex);
            } catch(e) {
                traceLog('test-buff', deviceId, `Warning goi tin fallback gap loi: ${e.message}`);
            }
            
            sendLog(`[${deviceId}] ✅ Đã test buff (ID: ${targetSkill})!`, 'success');
            traceLog('test-buff', deviceId, `Test buff hoan tat.`);
            return { ok: true, skillId: targetSkill };
        } catch (err) {
            sendLog(`[${deviceId}] ❌ Lỗi test buff: ${err.message}`, 'error');
            traceLog('test-buff', deviceId, `Loi test buff: ${err.message}`);
            return { ok: false, error: err.message };
        }
    });

    // 4. Test Cast Skill Nhanh (Chiêu 9x)
    ipcMain.handle('test-cast-skill', async (event, deviceId) => {
        traceLog('test-cast-skill', deviceId, `Yeu cau test cast skill 9x nhan duoc.`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.injector || !state.info) {
            sendLog(`[${deviceId}] Lỗi: Chưa kết nối hoặc chưa có dữ liệu nhân vật.`, 'error');
            return { ok: false, error: 'Not ready' };
        }
        
        try {
            let targetSkill = 1;
            const sect = state.info.sect !== undefined ? state.info.sect : -1;
            const sectName = state.info.sectName || 'Chưa rõ';
            
            const sectSkill9xMap = {
                0: 104, // Thiếu Lâm
                1: 114, // Thiên Vương
                2: 132, // Đường Môn
                3: 142, // Ngũ Độc
                4: 152, // Nga Mi
                5: 172, // Thúy Yên
                6: 182, // Cái Bang
                7: 192, // Thiên Nhẫn
                8: 204, // Võ Đang
                9: 215  // Côn Lôn
            };
            if (sect !== -1 && sectSkill9xMap[sect]) {
                targetSkill = sectSkill9xMap[sect];
            }
            
            traceLog('test-cast-skill', deviceId, `Tim thay chieu 9x cua phai ${sectName}: ID=${targetSkill}`);
            await state.session.callRpc('doSkillHooked', targetSkill);
            
            // Gửi gói tin fallback TCP
            try {
                const p1 = Buffer.concat([writeVarint((1 << 3) | 0), writeVarint(targetSkill)]);
                const p2 = Buffer.concat([writeVarint((2 << 3) | 0), writeVarint(state.info ? state.info.x || 0 : 0)]);
                const p3 = Buffer.concat([writeVarint((3 << 3) | 0), writeVarint(state.info ? state.info.y || 0 : 0)]);
                const bodyHex = Buffer.concat([p1, p2, p3]).toString('hex');
                await state.session.callRpc('sendTcpPacket', 240, bodyHex);
            } catch(e) {}

            sendLog(`[${deviceId}] ✅ Đã test skill 9x (ID: ${targetSkill})!`, 'success');
            traceLog('test-cast-skill', deviceId, `Test cast skill 9x hoan tat.`);
            return { ok: true, skillId: targetSkill };
        } catch(e) {
            sendLog(`[${deviceId}] Lỗi test skill: ${e.message}`, 'error');
            traceLog('test-cast-skill', deviceId, `Loi test cast skill 9x: ${e.message}`);
            return { ok: false, error: e.message };
        }
    });

    // 5. NPC test và tương tác
    ipcMain.handle('test-npc-find-by-name', async (event, deviceId, npcName) => {
        traceLog('test-npc-find-by-name', deviceId, `Tim NPC theo ten: "${npcName}"`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) return { ok: false, error: 'Chưa kết nối' };
        try {
            return await state.session.callRpc('findNpcIdByName', npcName || 'Trinh Sat', 2000);
        } catch(e) { return { ok: false, error: e.message }; }
    });

    ipcMain.handle('test-npc-get-all', async (event, deviceId) => {
        traceLog('test-npc-get-all', deviceId, `Lay toan bo danh sach NPC o gan...`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) return { ok: false, error: 'Chưa kết nối' };
        try {
            return await state.session.callRpc('getAllNearNpcs');
        } catch(e) { return { ok: false, error: e.message }; }
    });

    ipcMain.handle('test-npc-near-names', async (event, deviceId) => {
        traceLog('test-npc-near-names', deviceId, `Lay ten tat ca NPC xung quanh...`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) return { ok: false, error: 'Chưa kết nối' };
        try {
            return await state.session.callRpc('getNearNpcNames');
        } catch(e) { return { ok: false, error: e.message }; }
    });

    ipcMain.handle('npc-interact', async (event, deviceId, npcId) => {
        traceLog('npc-interact', deviceId, `Tuong tac voi NPC ID: ${npcId}`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) return { ok: false, error: 'Chua ket noi' };
        try {
            return await state.session.callRpc('remoteNpcDialogue', npcId);
        } catch(e) { return { ok: false, error: e.message }; }
    });

    ipcMain.handle('npc-select-option', async (event, deviceId, index) => {
        traceLog('npc-select-option', deviceId, `Chon option hop thoai tai chi muc: ${index}`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) return { ok: false, error: 'Chua ket noi' };
        try {
            return await state.session.callRpc('selectDialogOption', parseInt(index, 10));
        } catch(e) { return { ok: false, error: e.message }; }
    });

    ipcMain.handle('collect-points', async (event, deviceId) => {
        traceLog('collect-points', deviceId, `Yeu cau gom diem tich luy`);
        try {
            return await sessionManager.runCollectPoints(deviceId, sendLog);
        } catch(e) {
            return { ok: false, error: e.message };
        }
    });

    // 6. Dã Tẩu quét sạp & mua hàng
    ipcMain.handle('scan-datau', async (event, deviceId, keyword, filters) => {
        traceLog('scan-datau', deviceId, `Quet do Da Tau voi tu khoa: "${keyword}"`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) {
            sendLog(`[${deviceId}] Loi: May chua ket noi.`, 'error');
            return { ok: false, error: 'May chua ket noi Frida.' };
        }
        const mapId = state.info ? state.info.mapId : 0;
        return await scanDatauItems(deviceId, state.session, mapId, keyword, filters, event, sendLog);
    });

    ipcMain.handle('buy-datau', async (event, deviceId, sellerId, itemIdx, price) => {
        traceLog('buy-datau', deviceId, `Mua do Da Tau tu seller: ${sellerId}, index: ${itemIdx}, gia: ${price}`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) {
            return { ok: false, error: 'May chua ket noi Frida.' };
        }
        return await buyDatauItem(deviceId, state.session, sellerId, itemIdx, price, sendLog);
    });

    ipcMain.handle('get-shop-details', (event, mapId, sellerId) => {
        traceLog('get-shop-details', null, `Lay chi tiet cua sap map: ${mapId}, seller: ${sellerId}`);
        return getShopDetails(mapId, sellerId);
    });

    // 7. Bật/Tắt Tống Kim toàn cục
    ipcMain.handle('toggle-auto-tk', (event, enable, tkConfigs) => {
        traceLog('toggle-auto-tk', null, `Yeu cau toggle Auto Tong Kim toan cuc: enable=${enable}`);
        return sessionManager.toggleGlobalAutoTK(enable, tkConfigs, sendLog);
    });

    // 8. Cửa sổ hiển thị chi tiết sạp hàng
    ipcMain.on('show-shop-detail', (event, shopData) => {
        traceLog('show-shop-detail', null, `Hien thi cua so chi tiet sap: ${shopData.shopName}`);
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
        traceLog('show-all-shops-detail', null, `Hien thi toan bo cua so sap hang.`);
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
        traceLog('show-5hanh-detail', null, `Hien thi cua so Ngu Hanh.`);
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
}

module.exports = {
    registerHandlers
};
