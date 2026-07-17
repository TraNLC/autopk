const path = require('path');
const { FridaSession } = require('../frida-session');
const { AutoPK } = require('../auto-pk');
const { MemoryReader } = require('../memory-reader');
const { PacketInjector } = require('../packet-injector');
const { PacketSniffer } = require('../packet-sniffer');
const { autoTongKimLoop, npcCacheMap, ensureCache, collectPoints } = require('../features/tongkim');
const { updateNpcId } = require('../features/tongkim-data');
const { getMapName } = require('../item-db');

const sessions = new Map(); // deviceId -> { session, interval, info, sniffer, injector, memory, autoPK }
let globalAutoTKInterval = null;
let isAutoTKEnabled = false;
let globalTkConfigs = {};

function traceLog(deviceId, msg, type = 'info') {
    const timeStr = new Date().toLocaleTimeString();
    const formattedMsg = deviceId ? `[${deviceId}] ${msg}` : msg;
    console.log(`[TRACE] [${timeStr}] ${formattedMsg}`);
    if (globalThis._mainWindow && !globalThis._mainWindow.isDestroyed()) {
        try {
            const wc = globalThis._mainWindow.webContents;
            if (wc && !wc.isDestroyed()) {
                wc.send('tab-log', { msg: formattedMsg, type });
            }
        } catch(e) {}
    }
}
function parseShopKeyFromProto(hexStr) {
    if (!hexStr) return null;
    const hex = hexStr.replace(/\s+/g, '');
    const bytes = Buffer.from(hex, 'hex');
    // Bỏ qua 6 byte header (4 byte length + 2 byte opcode)
    if (bytes.length >= 8 && bytes[6] === 0x0a) {
        const len = bytes[7];
        if (bytes.length >= 8 + len) {
            return bytes.slice(8, 8 + len).toString('ascii');
        }
    }
    return null;
}

/**
 * Kết nối thiết bị qua Frida
 */
async function connectDevice(deviceId, pkgName, sendLog) {
    traceLog(deviceId, `Dang ket noi thiet bi...`, 'info', sendLog);
    if (sessions.has(deviceId)) {
        traceLog(deviceId, `Thiet bi da duoc ket noi truoc do.`, 'warn', sendLog);
        return { ok: true };
    }

    const session = new FridaSession(deviceId);
    let ok = false;
    try {
        ok = await session.connect(pkgName);
    } catch (err) {
        traceLog(deviceId, `Loi ket noi Frida: ${err.message}`, 'error', sendLog);
        return { ok: false, error: err.message };
    }

    if (!ok) {
        traceLog(deviceId, `Loi ket noi (game chua mo?).`, 'error', sendLog);
        return { ok: false, error: 'Connection failed' };
    }

    const sniffer = new PacketSniffer(session);
    const injector = new PacketInjector(session);
    const memory = new MemoryReader(session);
    const autoPK = new AutoPK(session, memory, injector, sniffer, deviceId);

    const state = { session, info: null, interval: null, sniffer, injector, memory, autoPK, lastLoggedError: null };
    sessions.set(deviceId, state);

    // Bật sniffer chạy ngầm lặng lẽ
    sniffer.start(200);

    session.onMessage((payload, data) => {
        if (payload) {
            if (payload.log) {
                // Chỉ hiển thị log thực sự quan trọng của Frida lên UI
                traceLog(deviceId, `[Frida Log] ${payload.log}`, 'info');
                return;
            }
            if (payload.type === 'il2cpp_ready') {
                traceLog(deviceId, `Ket noi thanh cong! (IL2CPP Base: ${payload.base || 'null'})`, 'success');
            }
            if (payload.type === 'shop_data') {
                const shopKey = parseShopKeyFromProto(payload.hex);
                if (shopKey) {
                    let cache = ensureCache(deviceId);
                    cache.lastNpcShopKey = shopKey;
                    traceLog(deviceId, `Da ghi nhan shopKey NPC: ${shopKey}`, 'success');
                }
            }
        }

        if (payload && payload.type === 'send_out') {
            // Log debug opcode (disabled)
            // if ([33, 231, 35, 204, 71, 48].includes(payload.opcode)) {
            //     console.log(`[DEBUG_OPCODE] [${deviceId}] Sent ${payload.opcode}: ${payload.hex}`);
            // }

            // Phân tích ID NPC từ body của gói tin eNpcDialogue (Opcode 33)
            if (payload.opcode === 33 && payload.hex) {
                let cache = ensureCache(deviceId);
                let currentMapId = state.info ? state.info.mapId : null;

                const STAGING_MAPS = [323, 325, 379, 382, 972, 973, 974];
                const CITY_MAPS = [1, 11, 37, 78, 162, 176];
                
                const isStaging = STAGING_MAPS.includes(currentMapId);
                const isCity = CITY_MAPS.includes(currentMapId) || currentMapId === 324; // Bao Danh NPC lives in map 324 as well

                // NẾU ĐÃ HỌC XONG HOẶC ĐỒNG BỘ ĐƯỢC TỪ CỬA SỔ KHÁC CÙNG BẢN ĐỒ, BỎ QUA GÓI TIN ĐỂ TRÁNH QUÉT DƯ THỪA!
                if (isStaging) {
                    if (cache.trinhSatId === null || cache.trinhSatId === undefined || cache.quanNhuId === null || cache.quanNhuId === undefined) {
                        for (const [otherId, otherState] of sessions.entries()) {
                            if (otherId !== deviceId && otherState.info && otherState.info.mapId === currentMapId) {
                                const otherNpcCache = npcCacheMap.get(otherId);
                                if (otherNpcCache && otherNpcCache.campValue === cache.campValue) {
                                    if (!cache.trinhSatId && otherNpcCache.trinhSatId) cache.trinhSatId = otherNpcCache.trinhSatId;
                                    if (!cache.quanNhuId && otherNpcCache.quanNhuId) cache.quanNhuId = otherNpcCache.quanNhuId;
                                }
                            }
                        }
                    }
                    if (cache.trinhSatId !== null && cache.trinhSatId !== undefined && cache.quanNhuId !== null && cache.quanNhuId !== undefined) {
                        return;
                    }
                }
                if (isCity) {
                    if (cache.baodanhId === null || cache.baodanhId === undefined) {
                        for (const [otherId, otherState] of sessions.entries()) {
                            if (otherId !== deviceId && otherState.info && otherState.info.mapId === currentMapId) {
                                const otherNpcCache = npcCacheMap.get(otherId);
                                if (otherNpcCache && otherNpcCache.baodanhId) {
                                    cache.baodanhId = otherNpcCache.baodanhId;
                                }
                            }
                        }
                    }
                    if (cache.baodanhId !== null && cache.baodanhId !== undefined) {
                        return;
                    }
                }

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
                    // Nếu ID này đã được học rồi, không cần gọi RPC quét lại nữa
                    if (cache.learnedIds && cache.learnedIds.includes(dynamicId)) {
                        return;
                    }

                    // traceLog(deviceId, `Bat duoc goi tin eNpcDialogue (Opcode 33). Phai phan tich hex cho ID: ${dynamicId}...`, 'info');

                    let currentCamp = (state.info && state.info.campValue) ? state.info.campValue : 1;

                    const BATTLE_MAPS = [44, 375, 376, 377, 580, 581, 868, 869, 870, 879, 880, 881, 883, 884, 885, 902, 903, 904, 988];
                    const prevInTK = STAGING_MAPS.includes(cache.mapId) || BATTLE_MAPS.includes(cache.mapId);
                    const currInTK = STAGING_MAPS.includes(currentMapId) || BATTLE_MAPS.includes(currentMapId);

                    // Reset cache khi đổi phe hoặc thoát Tống Kim về thành
                    if (cache.campValue !== currentCamp || (cache.mapId !== null && prevInTK && !currInTK)) {
                        traceLog(deviceId, `Reset NPC cache: camp ${cache.campValue}->${currentCamp} / map ${cache.mapId}->${currentMapId}`, 'warn', sendLog);
                        cache.mapId = currentMapId;
                        cache.campValue = currentCamp;
                        cache.trinhSatId = null;
                        cache.baodanhId = null;
                        cache.learnedIds = [];
                    } else {
                        cache.mapId = currentMapId;
                        if (!cache.campValue) cache.campValue = currentCamp;
                    }

                    // Gọi RPC lấy danh sách NPC xung quanh để so khớp tên
                    state.session.callRpc('getNearNpcNames').then(res => {
                        if (res && res.ok && res.npcMap) {
                            const name = res.npcMap[dynamicId] || "";
                            const lowerName = name.toLowerCase();
                            const currentMapId = res.mapId || (state.info ? state.info.mapId : null);

                            if (lowerName.includes("trinh sát") || lowerName.includes("trinh sat")) {
                                cache.trinhSatId = dynamicId;
                                if (!cache.learnedIds.includes(dynamicId)) cache.learnedIds.push(dynamicId);
                                traceLog(deviceId, `Da hoc ID Trinh Sat: ${dynamicId} (${name})`, 'success');
                            } else if (lowerName.includes("quân nhu") || lowerName.includes("quan nhu") || lowerName.includes("quan y") || lowerName.includes("quân y")) {
                                cache.quanNhuId = dynamicId;
                                if (!cache.learnedIds.includes(dynamicId)) cache.learnedIds.push(dynamicId);
                                traceLog(deviceId, `Da hoc ID Quan Nhu: ${dynamicId} (${name})`, 'success');
                            } else if (lowerName.includes("chiêu binh") || lowerName.includes("chieu binh") || lowerName.includes("mộ binh") || lowerName.includes("mo binh")) {
                                cache.baodanhId = dynamicId;
                                if (!cache.learnedIds.includes(dynamicId)) cache.learnedIds.push(dynamicId);
                                traceLog(deviceId, `Da hoc ID Bao Danh: ${dynamicId} (${name})`, 'success');
                            }
                        }
                    }).catch(err => {
                        traceLog(deviceId, `Loi khi goi getNearNpcNames trong callback: ${err.message}`, 'error');
                        if (!cache.learnedIds.includes(dynamicId)) {
                            cache.learnedIds.push(dynamicId);
                        }
                    });
                }
            }

            // Giải mã gói tin Cast Skill nhắm mục tiêu (Focus Target)
            if ((payload.opcode === 238 || payload.opcode === 239) && payload.hex) {
                try {
                    const hexStr = payload.hex.replace(/\s+/g, '');
                    const bytes = Buffer.from(hexStr, 'hex');
                    let offset = 6; // Bỏ qua 6 bytes TCP header (4 byte length + 2 byte opcode)

                    // Hàm đọc varint từ buffer bytes
                    function readVarint() {
                        let result = 0n;
                        let shift = 0n;
                        while (offset < bytes.length) {
                            const b = bytes[offset++];
                            result |= BigInt(b & 0x7f) << shift;
                            if (!(b & 0x80)) break;
                            shift += 7n;
                        }
                        return result;
                    }

                    let skillId = 0;
                    let targetId = '';

                    while (offset < bytes.length) {
                        const tag = Number(readVarint());
                        const fieldNum = tag >> 3;
                        const wireType = tag & 0x7;

                        if (fieldNum === 1) {
                            if (wireType === 0) {
                                skillId = Number(readVarint());
                            } else {
                                offset = bytes.length; // Lỗi format
                            }
                        } else if (fieldNum === 2) {
                            if (wireType === 2) {
                                const len = Number(readVarint());
                                if (offset + len <= bytes.length) {
                                    targetId = bytes.slice(offset, offset + len).toString('utf-8');
                                    offset += len;
                                }
                            } else if (wireType === 0) { // Trường hợp targetId lưu dạng varint
                                targetId = readVarint().toString();
                            } else {
                                offset = bytes.length;
                            }
                        } else {
                            // Bỏ qua các field khác
                            if (wireType === 0) readVarint();
                            else if (wireType === 2) offset += Number(readVarint());
                            else offset = bytes.length;
                        }
                    }

                    if (targetId) {
                        const targetTypeName = payload.opcode === 238 ? 'PLAYER' : 'NPC/MONSTER';
                        // traceLog(deviceId, `[FOCUS DETECTED] Dang tan cong ${targetTypeName}: ID = ${targetId} (Ky nang: ${skillId})`, 'success');
                    }
                } catch (e) {
                    console.warn(`[Sniffer Focus Error] Parse target packet failed: ${e.message}`);
                }
            }
        }
    });

    const scriptPath = path.join(__dirname, '../../frida-scripts/bot.bundle.js');
    traceLog(deviceId, `Dang load script tu duong dan: ${scriptPath}`, 'info', sendLog);
    await session.loadScript(scriptPath);
    traceLog(deviceId, `Tai script thanh cong. Dang doc du lieu nhan vat...`, 'success', sendLog);

    // Bật chặn popup NPC tự động nếu Auto TK đang bật toàn cục
    if (isAutoTKEnabled) {
        session.callRpc('setBlockNpcDialog', true).catch(() => {});
    }

    // Khoi chay status polling cu moi 2s
    traceLog(deviceId, `Khoi chay vong lap doc trang thai nhan vat (Player Info Polling 2s)...`, 'info');
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
                    traceLog(deviceId, `Loi doc thong tin: ${info.error}`, 'error', sendLog);
                    state.lastLoggedError = info.error;
                } else if (!info.error && state.lastLoggedError) {
                    state.lastLoggedError = null;
                }

                // Deep scan for TK Score every 30 ticks (60 seconds) if in battle map
                state.pollCount = (state.pollCount || 0) + 1;
                const BATTLE_MAPS = [44, 375, 376, 377, 580, 581, 868, 869, 870, 879, 880, 881, 883, 884, 885, 902, 903, 904, 988];
                if (info.mapId && BATTLE_MAPS.includes(info.mapId) && state.pollCount % 30 === 0) {
                    try {
                        const tkRes = await session.callRpc('getTkScoreDeepScan');
                        if (tkRes && tkRes.ok) {
                            info.tkScore = tkRes.score;
                            info.tkRank = tkRes.rank;
                            info.tkKills = tkRes.kills;
                            state.lastTkScore = tkRes.score; // cache it
                        }
                    } catch(e) {}
                }
                
                // Use cached score for intermediate ticks
                if (state.lastTkScore !== undefined) {
                    info.tkScore = state.lastTkScore;
                }

                // Gui cap nhat trang thai len Renderer qua IPC (se duoc routed tu main.js)
                if (globalThis._mainWindow) {
                    globalThis._mainWindow.webContents.send('player-info-update', { deviceId, info });
                }
            }
        } catch (e) {
            if (e.message !== state.lastLoggedError) {
                traceLog(deviceId, `Loi RPC doc du lieu: ${e.message}`, 'error', sendLog);
                state.lastLoggedError = e.message;
            }
        }
    }, 2000);

    return { ok: true };
}

/**
 * Ngắt kết nối thiết bị
 */
async function disconnectDevice(deviceId, sendLog) {
    traceLog(deviceId, `Yeu cau ngat ket noi thiet bi. Dang don dep...`, 'warn', sendLog);
    const state = sessions.get(deviceId);
    if (state) {
        if (state.interval) {
            clearInterval(state.interval);
            traceLog(deviceId, `Da dung vong lap Polling 2s.`, 'info');
        }
        if (state.sniffer) {
            state.sniffer.stop();
            traceLog(deviceId, `Da dung PacketSniffer.`, 'info');
        }
        if (state.autoPK) {
            await state.autoPK.stop();
            traceLog(deviceId, `Da dung AutoPK loop.`, 'info');
        }
        try {
            if (state.session) {
                await state.session.disconnect();
                traceLog(deviceId, `Da ngat ket noi Frida session.`, 'info');
            }
        } catch (e) {
            traceLog(deviceId, `Disconnect Session Warning: ${e.message}`, 'info');
        }
        sessions.delete(deviceId);
        npcCacheMap.delete(deviceId);
        traceLog(deviceId, `Da ngat ket noi thanh cong.`, 'warn', sendLog);
    }
    return { ok: true };
}

/**
 * Bật/tắt vòng lặp Tống Kim toàn cục
 */
function toggleGlobalAutoTK(enable, tkConfigs, sendLog) {
    isAutoTKEnabled = enable;
    if (tkConfigs) globalTkConfigs = tkConfigs;

    if (enable) {
        traceLog('SYSTEM', `BAT Auto Tong Kim toan cuc.`, 'success', sendLog);
        // Bật chặn popup NPC tự động cho tất cả thiết bị
        for (const [deviceId, state] of sessions.entries()) {
            state.session.callRpc('setBlockNpcDialog', true).catch(() => {});
        }
        if (!globalAutoTKInterval) {
            globalAutoTKInterval = setInterval(async () => {
                for (const [deviceId, state] of sessions.entries()) {
                    try {
                        const devCfg = globalTkConfigs[deviceId] || { side: 'auto', lacs: [] };
                        const mapId = state.info ? state.info.mapId : 0;
                        const isBattlefield = [
                            44, 375, 376, 377, 580, 581, 868, 869, 870, 879, 880, 881, 883, 884, 885, 902, 903, 904, 988
                        ].includes(mapId);

                        if (isBattlefield) {
                            if (state.autoPK) {
                                state.autoPK.autoThuoc = devCfg.autoThuoc !== false;
                                if (!state.autoPK.running) {
                                    traceLog(deviceId, `Nhan vat dang o Chien truong. Khoi dong luong PK nhanh...`, 'success', sendLog);
                                    state.autoPK.start();
                                }
                            }
                        } else {
                            if (state.autoPK && state.autoPK.running) {
                                traceLog(deviceId, `Nhan vat dang o Duong suc/Thanh. Tam dung luong PK.`, 'warn', sendLog);
                                await state.autoPK.stop();
                            }
                            // Goi autoTongKimLoop de mua thuoc / buff / bao danh vao san
                            await autoTongKimLoop(deviceId, state.session, state.info, devCfg.side, devCfg.lacs, sendLog, devCfg.autoBaoDanh, devCfg.autoThuoc, devCfg.stopMaxScore);
                        }
                    } catch (e) {
                        traceLog(deviceId, `Loi trong vong lapa Tong Kim: ${e.message}`, 'error', sendLog);
                    }
                }
            }, 1000);
        }
    } else {
        traceLog('SYSTEM', `TAT Auto Tong Kim toan cuc.`, 'warn', sendLog);
        // Tắt chặn popup NPC để cho phép tương tác tay bình thường
        for (const [deviceId, state] of sessions.entries()) {
            state.session.callRpc('setBlockNpcDialog', false).catch(() => {});
        }
        if (globalAutoTKInterval) {
            clearInterval(globalAutoTKInterval);
            globalAutoTKInterval = null;
        }
        // Dung toan bo cac luong PK dang chay
        for (const [deviceId, state] of sessions.entries()) {
            if (state.autoPK && state.autoPK.running) {
                traceLog(deviceId, `Dung AutoPK vi da tat Auto TK toan cuc.`, 'warn', sendLog);
                state.autoPK.stop();
            }
        }
    }
    return { ok: true };
}

/**
 * Dọn dẹp tất cả tài nguyên khi ứng dụng đóng
 */
async function cleanup(sendLog) {
    traceLog('SYSTEM', `Bat dau don dep toan bo thiet bi & session...`, 'warn', sendLog);
    if (globalAutoTKInterval) {
        clearInterval(globalAutoTKInterval);
        globalAutoTKInterval = null;
    }
    for (const [deviceId, state] of sessions.entries()) {
        if (state.interval) clearInterval(state.interval);
        if (state.sniffer) state.sniffer.stop();
        if (state.autoPK) {
            try { await state.autoPK.stop(); } catch(e) {}
        }
        if (state.session) {
            try { await state.session.disconnect(); } catch (e) {}
        }
    }
    sessions.clear();
    npcCacheMap.clear();
    traceLog('SYSTEM', `Don dep hoan tat.`, 'success', sendLog);
}

async function runCollectPoints(deviceId, sendLog) {
    const state = sessions.get(deviceId);
    if (!state || !state.session) {
        if (sendLog) sendLog(`[${deviceId}] Loi: Thiet bi chua ket noi.`, 'error');
        return { ok: false, error: 'Thiet bi chua ket noi.' };
    }
    await collectPoints(deviceId, state.session, sendLog || ((msg, type) => traceLog(deviceId, msg, type)));
    return { ok: true };
}

module.exports = {
    sessions,
    connectDevice,
    disconnectDevice,
    toggleGlobalAutoTK,
    cleanup,
    runCollectPoints
};
