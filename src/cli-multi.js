// src/cli-multi.js — Lightweight Multi-Instance CLI Dashboard
const { FridaSession } = require('./frida-session');
const { PacketSniffer } = require('./packet-sniffer');
const { PacketInjector } = require('./packet-injector');
const { MemoryReader } = require('./memory-reader');
const { AutoPK } = require('./auto-pk');
const { scanDevices } = require('./gui/adb-helper');
const { autoTongKimLoop } = require('./features/tongkim');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_FILE = path.join(process.cwd(), 'cli_config.json');

// Default CLI Configuration
let cliConfig = {
    devices: {},
    default: {
        fightTop1: false,
        side: "auto",
        lacs: ["45", "51", "50"],
        autoBaoDanh: true,
        autoThuoc: true,
        stopMaxScore: true
    }
};

// Load or create config file
function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            cliConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        } catch(e) {}
    } else {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cliConfig, null, 2), 'utf-8');
    }
}
loadConfig();

const sessions = new Map();
let deviceList = [];
let lastStatusMsg = "Đang khởi tạo...";

function logAction(deviceId, msg) {
    lastStatusMsg = `[${deviceId}] ${msg}`;
}

async function initDevice(deviceId) {
    const session = new FridaSession(deviceId, 'vn.perfingame.jx1mobile');
    let ok = false;
    try {
        ok = await session.connect();
    } catch (err) {
        logAction(deviceId, `Lỗi kết nối: ${err.message}`);
        return null;
    }
    if (!ok) return null;

    const bundlePath = path.join(process.cwd(), 'frida-scripts', 'bot.bundle.js');
    try {
        await session.loadScript(bundlePath);
    } catch (err) {
        logAction(deviceId, `Lỗi nạp script: ${err.message}`);
        await session.disconnect();
        return null;
    }

    const sniffer = new PacketSniffer(session);
    const injector = new PacketInjector(session);
    const memory = new MemoryReader(session);
    const autoPK = new AutoPK(session, memory, injector, sniffer, deviceId);

    sniffer.start(200);

    const devState = {
        deviceId,
        session,
        sniffer,
        injector,
        memory,
        autoPK,
        info: { mapId: 0, tkScore: 0, top10Score: 0 },
        pollCount: 0,
        lastTkScore: 0,
        lastTop10Score: 0,
        statusText: "Đang đọc..."
    };

    sessions.set(deviceId, devState);
    logAction(deviceId, "Đã kết nối thành công!");
    return devState;
}

// Device Scanner
async function performScan() {
    const scanRes = await scanDevices(() => {});
    if (scanRes && scanRes.ok && scanRes.devices) {
        deviceList = scanRes.devices;
        
        // Remove disconnected devices
        for (const [id, state] of sessions.entries()) {
            if (!deviceList.some(d => d.id === id)) {
                logAction(id, "Thiết bị đã ngắt kết nối. Đang dọn dẹp...");
                state.sniffer.stop();
                state.autoPK.stop().catch(() => {});
                state.session.disconnect().catch(() => {});
                sessions.delete(id);
            }
        }

        // Connect to new devices
        for (const dev of deviceList) {
            if (!sessions.has(dev.id)) {
                initDevice(dev.id).catch(() => {});
            }
        }
    }
}

// Setup keyboard inputs to toggle fightTop1 on the fly
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}
process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
        cleanupAndExit();
    } else if (key.name === 'r') {
        performScan();
    } else {
        const num = parseInt(str, 10);
        if (num >= 1 && num <= 9) {
            const keys = Array.from(sessions.keys());
            const id = keys[num - 1];
            if (id) {
                const devCfg = cliConfig.devices[id] || { ...cliConfig.default };
                devCfg.fightTop1 = !devCfg.fightTop1;
                cliConfig.devices[id] = devCfg;
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(cliConfig, null, 2), 'utf-8');
                logAction(id, `Đã chuyển chế độ Đánh Top 1 thành: ${devCfg.fightTop1 ? 'BẬT' : 'TẮT'}`);
            }
        }
    }
});

async function cleanupAndExit() {
    console.log('\n\x1b[31mĐang dọn dẹp và thoát...\x1b[0m');
    for (const [id, state] of sessions.entries()) {
        try {
            state.sniffer.stop();
            await state.autoPK.stop();
            await state.session.disconnect();
        } catch(e) {}
    }
    process.exit(0);
}

// Format columns for table helper
function pad(str, length) {
    str = String(str || '');
    // Strip ANSI color codes to measure length accurately
    const cleanStr = str.replace(/\x1b\[[0-9;]*m/g, '');
    const diff = length - cleanStr.length;
    return diff > 0 ? str + ' '.repeat(diff) : str.substring(0, length);
}

// Render loop: every 2 seconds
setInterval(() => {
    console.clear();
    console.log('\x1b[36m════════════════════════════════════════════════════════════════════════════════\x1b[0m');
    console.log('             \x1b[1m\x1b[33mGST AUTO PK - PHIÊN BẢN CONSOLE MULTI-INSTANCE (SIÊU NHẸ)\x1b[0m');
    console.log('\x1b[36m════════════════════════════════════════════════════════════════════════════════\x1b[0m');
    console.log(`\x1b[90m[Cấu hình]: Chỉnh sửa file 'cli_config.json' để cấu hình vĩnh viễn.\x1b[0m`);
    console.log(`\x1b[90m[Phím tắt] : Gõ phím số [1-9] để Bật/Tắt Đánh Top 1 | [R] Quét lại giả lập | [Ctrl+C] Thoát\x1b[0m`);
    console.log('\x1b[36m────────────────────────────────────────────────────────────────────────────────\x1b[0m');
    console.log('\x1b[1m\x1b[37mSTT  Cổng             Tên Nhân Vật    Phái         Điểm TK   Hạng 10   Chế độ    Trạng Thái\x1b[0m');
    console.log('\x1b[36m────────────────────────────────────────────────────────────────────────────────\x1b[0m');

    let idx = 1;
    for (const [id, state] of sessions.entries()) {
        const info = state.info;
        const devCfg = cliConfig.devices[id] || cliConfig.default;
        
        let charName = info.name || 'Đang nạp...';
        let sectName = info.sectName || 'Chờ';
        let mapName = info.mapName || `Map ${info.mapId || 0}`;
        let score = info.tkScore !== undefined ? String(info.tkScore) : '0';
        let top10 = info.top10Score !== undefined ? String(info.top10Score) : '0';
        
        let modeStr = devCfg.fightTop1 ? '\x1b[31mTop 1 🔥\x1b[0m' : '\x1b[32mDè chừng 🛡️\x1b[0m';
        let statusStr = state.statusText;

        const isBattle = [44, 375, 376, 377, 580, 581, 868, 869, 870, 879, 880, 881, 883, 884, 885, 902, 903, 904, 988].includes(info.mapId);
        if (isBattle) {
            if (state.autoPK && state.autoPK.running) {
                statusStr = '\x1b[33mĐang PK chiến trường\x1b[0m';
            } else {
                statusStr = '\x1b[36mTạm dừng (đợi/max)\x1b[0m';
            }
        }

        console.log(
            pad(idx++, 5) +
            pad(id, 17) +
            pad(charName, 16) +
            pad(sectName, 13) +
            pad(score, 10) +
            pad(top10, 10) +
            pad(modeStr, 20) +
            pad(statusStr, 25)
        );
    }
    
    if (sessions.size === 0) {
        console.log('   \x1b[90m(Không tìm thấy thiết bị nào đang kết nối. Bấm [R] để quét lại)\x1b[0m');
    }

    console.log('\x1b[36m────────────────────────────────────────────────────────────────────────────────\x1b[0m');
    console.log(`\x1b[90mLog mới nhất: ${lastStatusMsg}\x1b[0m`);
}, 1500);

// Automation Loop: every 1 second
async function autoLoop() {
    for (const [deviceId, state] of sessions.entries()) {
        try {
            const devCfg = cliConfig.devices[deviceId] || cliConfig.default;
            const info = await state.memory.getPlayerInfo();
            if (info) {
                state.info = { ...state.info, ...info };
            }

            const mapId = state.info ? state.info.mapId : 0;
            const isBattlefield = [
                44, 375, 376, 377, 580, 581, 868, 869, 870, 879, 880, 881, 883, 884, 885, 902, 903, 904, 988
            ].includes(mapId);

            // Deep scan for ranking scoreboard
            state.pollCount = (state.pollCount || 0) + 1;
            if (mapId && isBattlefield && state.pollCount % 30 === 0) {
                try {
                    const tkRes = await state.session.callRpc('getTkScoreDeepScan');
                    if (tkRes && tkRes.ok) {
                        state.info.tkScore = tkRes.score;
                        state.info.tkRank = tkRes.rank;
                        state.info.tkKills = tkRes.kills;
                        state.info.top10Score = tkRes.top10Score || 0;
                        state.lastTkScore = tkRes.score;
                        state.lastTop10Score = tkRes.top10Score || 0;
                    }
                } catch(e) {}
            }

            if (state.lastTkScore !== undefined) {
                state.info.tkScore = state.lastTkScore;
            }
            if (state.lastTop10Score !== undefined) {
                state.info.top10Score = state.lastTop10Score;
            }

            if (isBattlefield) {
                if (state.autoPK) {
                    state.autoPK.autoThuoc = devCfg.autoThuoc !== false;
                    state.autoPK.fightTop1 = devCfg.fightTop1 === true;

                    const myScore = state.info.tkScore || 0;
                    const top10Score = state.info.top10Score || 0;

                    let shouldPauseCombat = false;
                    if (devCfg.fightTop1 !== true) {
                        if (myScore >= 30000) {
                            shouldPauseCombat = true;
                            state.statusText = '\x1b[36mDừng (Đạt 30k)\x1b[0m';
                        }
                        if (top10Score > 0 && myScore >= top10Score) {
                            shouldPauseCombat = true;
                            state.statusText = `\x1b[36mDừng (Đợi hạng 10: ${top10Score})\x1b[0m`;
                        }
                    }

                    if (shouldPauseCombat) {
                        if (state.autoPK.running) {
                            await state.autoPK.stop();
                        }
                    } else {
                        if (!state.autoPK.running) {
                            state.statusText = 'Khởi động PK...';
                            state.autoPK.start();
                        }
                    }
                }
            } else {
                if (state.autoPK && state.autoPK.running) {
                    state.statusText = 'Dừng PK (về sảnh)';
                    await state.autoPK.stop();
                }
                state.statusText = 'Đang ở sảnh chờ';
                
                // Run autoTongKimLoop for potion refill / registration
                await autoTongKimLoop(
                    deviceId, 
                    state.session, 
                    state.info, 
                    devCfg.side, 
                    devCfg.lacs, 
                    (msg) => { logAction(deviceId, msg); }, 
                    devCfg.autoBaoDanh, 
                    devCfg.autoThuoc, 
                    devCfg.stopMaxScore
                );
            }
        } catch(e) {
            state.statusText = `Lỗi: ${e.message}`;
        }
    }
    setTimeout(autoLoop, 1000);
}

// Initial triggers
async function startApp() {
    await performScan();
    // Auto rescans devices list every 15 seconds
    setInterval(performScan, 15000);
    autoLoop();
}

startApp().catch(cleanupAndExit);
