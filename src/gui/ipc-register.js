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
    sendLog(`[${deviceId || 'SYSTEM'}] [Test NPC] ${msg}`, 'warn');
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
            sendLog(`[${deviceId}] Loi: May chua ket noi.`, 'error');
            return { ok: false, error: 'May chua ket noi Frida.' };
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
            
            sendLog(`[${deviceId}] Da test buff (ID: ${targetSkill})!`, 'success');
            traceLog('test-buff', deviceId, `Test buff hoan tat.`);
            return { ok: true, skillId: targetSkill };
        } catch (err) {
            sendLog(`[${deviceId}] Loi test buff: ${err.message}`, 'error');
            traceLog('test-buff', deviceId, `Loi test buff: ${err.message}`);
            return { ok: false, error: err.message };
        }
    });

    // 4. Test Cast Skill Nhanh (Chiêu 9x)
    ipcMain.handle('test-cast-skill', async (event, deviceId) => {
        traceLog('test-cast-skill', deviceId, `Yeu cau test cast skill 9x nhan duoc.`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.injector || !state.info) {
            sendLog(`[${deviceId}] Loi: Chua ket noi hoac chua co du lieu nhan vat.`, 'error');
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

            sendLog(`[${deviceId}] Da test skill 9x (ID: ${targetSkill})!`, 'success');
            traceLog('test-cast-skill', deviceId, `Test cast skill 9x hoan tat.`);
            return { ok: true, skillId: targetSkill };
        } catch(e) {
            sendLog(`[${deviceId}] Loi test skill: ${e.message}`, 'error');
            traceLog('test-cast-skill', deviceId, `Loi test cast skill 9x: ${e.message}`);
            return { ok: false, error: e.message };
        }
    });



    // 5. NPC test và tương tác
    ipcMain.handle('test-npc-find-by-name', async (event, deviceId, npcName) => {
        traceLog('test-npc-find-by-name', deviceId, `Tim NPC theo ten: "${npcName}"`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) return { ok: false, error: 'Chua ket noi' };
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

    // ==========================================
    // OPTIMIZATION HANDLERS
    // ==========================================
    
    // Set Game Speed (Freeze FPS)
    ipcMain.handle('set-game-speed', async (event, deviceId, speed) => {
        console.log(`[OPTIMIZE] Yeu cau setGameSpeed = ${speed} cho thiet bi ${deviceId}...`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) {
            console.log(`[OPTIMIZE] Loi setGameSpeed: Not connected (Thiet bi ${deviceId})`);
            return { ok: false, error: 'Not connected' };
        }
        try {
            const res = await state.session.callRpc('setGameSpeed', parseFloat(speed));
            if (res && res.ok) {
                console.log(`[OPTIMIZE] setGameSpeed thanh cong cho ${deviceId}. Method: ${res.method}`);
                return { ok: true, method: res.method };
            }
            console.log(`[OPTIMIZE] Loi setGameSpeed RPC: ${res ? res.error : 'Unknown'}`);
            return { ok: false, error: res ? res.error : 'Unknown error from rpc' };
        } catch (e) {
            console.log(`[OPTIMIZE] Exception setGameSpeed: ${e.message}`);
            return { ok: false, error: e.message };
        }
    });

    // Optimize ADB Resolution
    ipcMain.handle('optimize-adb-resolution', async (event, isLow) => {
        console.log(`[OPTIMIZE] Yeu cau ADB Optimize (isLow=${isLow}). Dang quet thiet bi...`);
        try {
            const util = require('util');
            const exec = util.promisify(require('child_process').exec);
            const { scanDevices } = require('./adb-helper');
            
            const scanRes = await scanDevices(config.ADB_PATH || 'adb', exec, () => {});
            if (!scanRes || !scanRes.ok || !scanRes.devices || scanRes.devices.length === 0) {
                console.log(`[OPTIMIZE] Khong tim thay thiet bi nao de toi uu ADB.`);
                return { ok: false, error: 'No devices found' };
            }
            const devices = scanRes.devices;

            let successCount = 0;
            for (const dev of devices) {
                try {
                    console.log(`[OPTIMIZE] Dang xu ly ADB cho thiet bi ${dev.id}...`);
                    if (isLow === 'superlow') {
                        // Cấu hình mờ tịt (tiết kiệm tối đa)
                        await exec(`"${config.ADB_PATH}" -s ${dev.id} shell wm size 240x432`);
                        await exec(`"${config.ADB_PATH}" -s ${dev.id} shell wm density 60`);
                    } else if (isLow === 'low' || isLow === true) {
                        // Ép cấu hình thấp
                        await exec(`"${config.ADB_PATH}" -s ${dev.id} shell wm size 480x854`);
                        await exec(`"${config.ADB_PATH}" -s ${dev.id} shell wm density 120`);
                    } else {
                        // Khôi phục mặc định
                        await exec(`"${config.ADB_PATH}" -s ${dev.id} shell wm size reset`);
                        await exec(`"${config.ADB_PATH}" -s ${dev.id} shell wm density reset`);
                    }
                    successCount++;
                    console.log(`[OPTIMIZE] OK ADB cho ${dev.id}`);
                } catch (e) {
                    console.error(`[OPTIMIZE] Loi ADB thiet bi ${dev.id}: ${e.message}`);
                }
            }
            
            console.log(`[OPTIMIZE] Hoan tat xu ly ADB cho ${successCount} thiet bi.`);
            return { ok: true, count: successCount };
        } catch (err) {
            console.log(`[OPTIMIZE] Exception ADB: ${err.message}`);
            return { ok: false, error: err.message };
        }
    });

    // ==========================================
    // MAP & NPC COORDINATES
    // ==========================================
    ipcMain.handle('get-player-position', async (event, deviceId) => {
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) return { ok: false, error: 'Chưa kết nối' };
        try {
            const res = await state.session.callRpc('getPlayerInfoNoIl2cpp');
            if (res && res.ok) {
                return { ok: true, x: res.x || 0, y: res.y || 0, mapId: res.mapId || 0, camp: res.camp || 0 };
            }
            return { ok: false, error: 'Không đọc được thông tin nhân vật' };
        } catch(e) {
            return { ok: false, error: e.message };
        }
    });

    // =====================================
    // SAVE NPC COORDS MANUAL (hardcode to npc_db.json + toado_trinhsat.txt)
    // =====================================
    ipcMain.handle('save-npc-coords-manual', async (event, { npcName, x, y, mapId, camp }) => {
        try {
            const fs = require('fs');
            const path = require('path');
            
            // 1. Lưu vào npc_db.json để Auto đọc (sử dụng process.cwd() để hỗ trợ app build)
            const dbDir = path.join(process.cwd(), 'data/output');
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }
            const dbFile = path.join(dbDir, 'npc_db.json');
            let db = {};
            if (fs.existsSync(dbFile)) {
                try {
                    db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
                } catch(e) {}
            }
            const key = String(mapId);
            if (!db[key]) db[key] = {};
            
            const npcKey = `${npcName}_${camp}`;
            db[key][npcKey] = { name: npcName, x, y, camp };
            fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');

            // 2. Lưu vào file txt cho user dễ nhìn
            const txtFile = path.join(process.cwd(), 'toado_trinhsat.txt');
            const now = new Date();
            const timeStr = `${now.getHours()}:${now.getMinutes()} ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`;
            const pheStr = camp == 1 ? 'Tống' : (camp == 2 ? 'Kim' : camp);
            const logLine = `[${timeStr}] Tên: ${npcName} | Phe: ${pheStr} | MapID: ${mapId} | Tọa độ: (${x}, ${y})\r\n`;
            
            fs.appendFileSync(txtFile, logLine, 'utf8');

            return { ok: true };
        } catch(e) {
            return { ok: false, error: e.message };
        }
    });    // =====================================
    // TEST NPC (OPCODE 72) IPC ENDPOINTS
    // =====================================
    ipcMain.handle('test-npc-network-scan', async (event, deviceId) => {
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session) {
            return { ok: false, error: 'Chưa kết nối thiết bị' };
        }

        try {
            traceLog('test-npc-network-scan', deviceId, `Bat dau quet bo nho de tim danh sach NPC (cuc manh)...`);
            
            // Gọi hàm quét bộ nhớ Il2Cpp (quét toàn bộ NPC đang hiển thị trên Map)
            const scanRes = await state.session.callRpc('getNearNpcNames');
            
            if (!scanRes || !scanRes.ok) {
                traceLog('test-npc-network-scan', deviceId, `Loi khi quet bo nho: ${scanRes ? scanRes.error : 'Unknown'}`);
                return { ok: false, error: 'Không quét được bộ nhớ' };
            }
            
            const npcMap = scanRes.npcMap || {};
            const npcCoords = scanRes.npcCoords || {};
            const mapId = scanRes.mapId || 0;

            // KÍCH HOẠT QUÉT BẰNG MẠNG (OPCODE 71) ĐỂ TÌM TỌA ĐỘ CHÍNH XÁC
            try {
                const { PacketInjector, encodeField } = require('../packet-injector');
                const injector = new PacketInjector(state.session);
                const hexReq = encodeField(1, 'int32', mapId).toString('hex');
                await injector.sendRaw(71, hexReq);
                
                await new Promise(r => setTimeout(r, 3000)); // Chờ server trả kết quả (tăng lên 3s cho Tống Kim)
                
                const npcRes = await state.session.callRpc('getNpcPackets');
                if (npcRes && npcRes.ok && npcRes.packets) {
                    traceLog('test-npc-network-scan', deviceId, `Nhan duoc ${npcRes.packets.length} packets tu mang`);
                    for (const pkt of npcRes.packets) {
                        const buf = Buffer.from(pkt.hex, 'hex');
                        let offset = 0, cx = 0, cy = 0, cName = '', cId = '';
                        while (offset < buf.length) {
                            const tag = buf[offset++];
                            const wireType = tag & 0x7;
                            const fieldNum = tag >> 3;
                            if (wireType === 0) {
                                let val = 0n, shift = 0n;
                                while (offset < buf.length) {
                                    const b = buf[offset++];
                                    val |= BigInt(b & 0x7f) << shift;
                                    if ((b & 0x80) === 0) break;
                                    shift += 7n;
                                }
                                if (fieldNum === 3) cx = Number(val);
                                if (fieldNum === 4) cy = Number(val);
                            } else if (wireType === 2) {
                                let len = 0, shift = 0;
                                while (offset < buf.length) {
                                    const b = buf[offset++];
                                    len |= (b & 0x7f) << shift;
                                    if ((b & 0x80) === 0) break;
                                    shift += 7;
                                }
                                if (len > 0 && offset + len <= buf.length) {
                                    if (fieldNum === 1) cId = buf.slice(offset, offset + len).toString('ascii');
                                    else if (fieldNum === 2) cName = buf.slice(offset, offset + len).toString('utf8');
                                    offset += len;
                                }
                            } else if (wireType === 5) { offset += 4; } 
                            else if (wireType === 1) { offset += 8; }
                        }
                        
                        if (cId && cx && cy) {
                            traceLog('test-npc-network-scan', deviceId, `Network NPC: ${cId} - ${cName} - ${cx},${cy}`);
                            npcMap[cId] = cName;
                            npcCoords[cId] = { x: cx, y: cy };
                        }
                    }
                } else {
                    traceLog('test-npc-network-scan', deviceId, `Khong nhan duoc packet mang nao hoac loi`);
                }
            } catch(e) {
                traceLog('test-npc-network-scan', deviceId, 'Loi quet mang: ' + e.message);
            }

            const results = [];
            
            // Các từ khóa nhận diện Shop, Rương, hoặc Tượng người chơi để bỏ qua
            const ignoreKeywords = [
                'rương', 'tiền trang', 'cửa hàng', 'tạp hóa', 'vũ khí', 'phòng cụ', 
                'dược', 'y quán', 'thợ rèn', 'thương nhân', 'chủ', 'chưởng quỹ', 
                '1st', '2nd', '3rd', 'top', 'heo trắng', 'hươu đốm', 'kim miêu', 'bán', 'mua'
            ];
            
            for (const npcId in npcMap) {
                const name = npcMap[npcId];
                const lowerName = name.toLowerCase();
                const coords = npcCoords[npcId] || { x: 0, y: 0 };
                
                let isGhost = false;
                // --- FALLBACK TỌA ĐỘ TĨNH TỪ MAP DATA NẾU NHƯ (0, 0) ---
                if (coords.x === 0 && coords.y === 0) {
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        // ipc-register.js is in src/gui/, so data/ is at ../../data/
                        const mapFile = path.join(__dirname, '../../data/output/maps', `map_${mapId}.json`);
                        if (fs.existsSync(mapFile)) {
                            const mapData = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
                            if (mapData && mapData.npcs) {
                                // Tìm NPC trong map có tên khớp một phần
                                const staticNpc = mapData.npcs.find(n => n.name === name || name.includes(n.name) || n.name.includes(name));
                                if (staticNpc && staticNpc.x && staticNpc.y) {
                                    coords.x = staticNpc.x;
                                    coords.y = staticNpc.y;
                                } else {
                                    // Tồn tại file cấu hình map nhưng không có NPC này => Bóng ma từ map trước
                                    isGhost = true;
                                }
                            }
                        }
                    } catch (e) {
                        // ignore error
                    }
                }
                
                // 1. Lọc NPC bóng ma (chỉ lọc khi biết chắc chắn map không có NPC này)
                if (isGhost) continue;
                
                // 2. Lọc shop bán hàng bằng ID chuỗi (vd: "mua set H")
                if (typeof npcId === 'string' && (npcId.includes('salesman') || isNaN(parseInt(npcId, 10)))) continue;
                
                // 3. Lọc người chơi thực (ID thường là số cực lớn >= 5000)
                const numericId = parseInt(npcId, 10);
                if (!isNaN(numericId) && numericId >= 5000) continue;
                
                // 4. Lọc theo danh sách từ khóa cấm (Thú cưng, Shop, Top Server...)
                const isIgnored = ignoreKeywords.some(kw => lowerName.includes(kw));
                if (isIgnored) continue;
                
                results.push({
                    id: npcId,
                    name: name,
                    x: coords.x,
                    y: coords.y,
                    mapId: scanRes.mapId || 0
                });
            }
            
            traceLog('test-npc-network-scan', deviceId, `Quet xong! Tim thay ${results.length} NPC (đã lọc shop/người chơi).`);
            
            // Xuất ra Terminal VSCode cho anh dễ nhìn
            console.log(`\n========== DANH SÁCH NPC (Map ${scanRes.mapId}) ==========`);
            results.forEach(r => {
                console.log(`[ID: ${r.id}] ${r.name} - Tọa độ: (${r.x}, ${r.y})`);
            });
            console.log(`==========================================================\n`);

            return { ok: true, npcs: results };
            
        } catch (err) {
            traceLog('test-npc-network-scan', deviceId, `Loi: ${err.message}`);
            return { ok: false, error: err.message };
        }
    });

    ipcMain.handle('save-npc-coordinates', async (event, npcs) => {
        try {
            const fs = require('fs');
            const path = require('path');
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const dateStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            
            const lines = ['ID NPC | Tên NPC | Tọa độ NPC (X, Y) | ID map', '-------------------------------------------------------'];
            npcs.forEach(n => {
                lines.push(`${n.id} | ${n.name} | ${n.x}, ${n.y} | ${n.mapId}`);
            });
            
            const fileName = `toado_${dateStr}.txt`;
            const outPath = path.join(process.cwd(), fileName);
            fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
            
            return { ok: true, path: outPath };
        } catch(e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('test-move', async (event, deviceId, x, y) => {
        traceLog('test-move', deviceId, `[Step 1] Gui lenh nhay den (${x}, ${y})`);
        const state = sessionManager.sessions.get(deviceId);
        if (!state || !state.session || !state.injector) return { ok: false, error: 'Chua ket noi' };
        try {
            // Step 1: Write memory (teleport)
            const memRes = await state.session.callRpc('clientMoveMemory', parseInt(x), parseInt(y));
            traceLog('test-move', deviceId, `[Step 2] clientMoveMemory: ${JSON.stringify(memRes)}`);

            // Step 2: Sync position to server (Opcode 9)
            await state.injector.sendStringData(`1|${Math.round(x)}|${Math.round(y)}`);
            traceLog('test-move', deviceId, `[Step 3] Da gui Opcode 9 dong bo server`);

            // Step 3: Send GotoPosition to trigger movement animation (same as bot TongKim)
            await new Promise(r => setTimeout(r, 200));
            await state.injector.sendStringData(`2|${Math.round(x)}|${Math.round(y)}|20`);
            traceLog('test-move', deviceId, `[Step 4] Da gui lenh GotoPosition (2|x|y|20)`);

            // Step 4: Try sendGotoPosition RPC if available (lech di 50 pixel de ep camera cap nhat)
            try {
                await state.session.callRpc('gotoFindingPath', parseInt(x) + 50, parseInt(y) + 50, 0);
                traceLog('test-move', deviceId, `[Step 5] gotoFindingPath offset thanh cong de update UI`);
            } catch(e2) {
                traceLog('test-move', deviceId, `[Step 5] gotoFindingPath khong co hoac loi: ${e2.message}`);
            }

            traceLog('test-move', deviceId, `[Done] Move hoan tat (${x}, ${y})`);
            return { ok: true };
        } catch(e) {
            traceLog('test-move', deviceId, `[ERROR] ${e.message}`);
            return { ok: false, error: e.message };
        }
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

    traceLog('Init', null, 'Dang ky tat ca IPC hoan tat. Cho doi yeu cau tu Frontend...');
}

module.exports = {
    registerHandlers
};
