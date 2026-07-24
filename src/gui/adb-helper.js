const { execSync } = require('child_process');
const net = require('net');
const config = require('../../config');

/**
 * Kiểm tra thiết bị adb và quét cổng giả lập MuMu
 */
async function scanDevices(adbPath, execAsync, sendLog) {
    console.log(`[TRACE] [ADB-Helper] Bat dau scanDevices voi adbPath: ${adbPath}`);
    try {
        console.log(`[TRACE] [ADB-Helper] Step 1: Khoi dong adb server...`);
        try { 
            execSync(`"${adbPath}" start-server`, { timeout: 3000 }); 
            console.log(`[TRACE] [ADB-Helper] Step 1: Khoi dong adb server hoan tat.`);
        } catch (e) {
            console.log(`[TRACE] [ADB-Helper] Step 1 Warning: start-server gap loi: ${e.message}`);
        }

        const SCAN_START = 16380;
        const SCAN_END = 18000; // Expanded to 18000 to support up to 50 MuMu instances (port increments of 32)
        console.log(`[TRACE] [ADB-Helper] Step 2: Bat dau quet song song cac cong...`);

        function checkPort(port) {
            return new Promise((resolve) => {
                const s = new net.Socket();
                s.setTimeout(150);
                s.on('connect', () => { 
                    s.destroy(); 
                    console.log(`[TRACE] [ADB-Helper] Port ${port} is OPEN.`);
                    resolve(true); 
                });
                s.on('timeout', () => { s.destroy(); resolve(false); });
                s.on('error', () => { s.destroy(); resolve(false); });
                s.connect(port, '127.0.0.1');
            });
        }

        // Build list of all ports to scan (MuMu range + other common emulators)
        const scanPorts = new Set();
        for (let p = SCAN_START; p <= SCAN_END; p++) {
            scanPorts.add(p);
        }
        const commonPorts = [
            7555, 7556, 7557, 7558,             // MuMu defaults
        ];
        // LDPlayer / BlueStacks (5555, 5557, 5559, ...) up to 50 instances
        for (let i = 0; i < 50; i++) commonPorts.push(5555 + i * 2);
        // MEmu (21503, 21513, 21523, ...) up to 50 instances
        for (let i = 0; i < 50; i++) commonPorts.push(21503 + i * 10);
        // Nox (62001, 62025, 62026, ...)
        commonPorts.push(62001);
        for (let i = 0; i < 50; i++) commonPorts.push(62025 + i);
        for (const p of commonPorts) {
            scanPorts.add(p);
        }
        const allPorts = Array.from(scanPorts).sort((a, b) => a - b);

        // Phase 1: TCP scan all ports in parallel (lightning fast)
        console.log(`[TRACE] [ADB-Helper] Quet song song ${allPorts.length} cong...`);
        const results = await Promise.all(allPorts.map(p => checkPort(p).then(ok => ok ? p : null)));
        const openPorts = results.filter(r => r !== null);
        console.log(`[TRACE] [ADB-Helper] Hoan tat quet port. Tim thay cac cong dang mo:`, openPorts);

        // Phase 2: adb connect to open ports in parallel batches
        console.log(`[TRACE] [ADB-Helper] Step 3: Bat dau ket noi adb den cac port mo...`);
        
        let offlineDevices = [];
        let onlineDevices = [];
        try {
            const devicesRes = await execAsync(`"${adbPath}" devices`);
            const lines = devicesRes.stdout.split('\n');
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const parts = line.split(/\s+/);
                    const deviceId = parts[0];
                    const status = parts[1];
                    if (status === 'offline') {
                        if (deviceId) offlineDevices.push(deviceId);
                    } else if (status === 'device') {
                        if (deviceId) onlineDevices.push(deviceId);
                    }
                }
            }
            if (offlineDevices.length > 0) {
                console.log(`[TRACE] [ADB-Helper] Phat hien thiet bi offline. Thuc hien force reconnect:`, offlineDevices);
                await Promise.all(offlineDevices.map(async (devId) => {
                    await execAsync(`"${adbPath}" disconnect ${devId}`).catch(() => {});
                    await execAsync(`"${adbPath}" connect ${devId}`).catch(() => {});
                }));
            }
        } catch(e) {}

        // Chi thuc hien adb connect cho cac cong CHUA ket noi (tranh chay adb connect thua lam cham tool)
        const portsToConnect = openPorts.filter(p => {
            const devId = `127.0.0.1:${p}`;
            return !onlineDevices.includes(devId);
        });

        if (portsToConnect.length > 0) {
            console.log(`[TRACE] [ADB-Helper] Phat hien cac cong moi can ket noi adb:`, portsToConnect);
            for (let i = 0; i < portsToConnect.length; i += 10) {
                const batch = portsToConnect.slice(i, i + 10);
                await Promise.all(batch.map(p => {
                    console.log(`[TRACE] [ADB-Helper] Chay adb connect 127.0.0.1:${p}`);
                    return execAsync(`"${adbPath}" connect 127.0.0.1:${p}`, { timeout: 2000 })
                        .then(res => {
                            console.log(`[TRACE] [ADB-Helper] adb connect 127.0.0.1:${p} ket qua:`, res.stdout.trim());
                        })
                        .catch(err => {
                            console.log(`[TRACE] [ADB-Helper] adb connect 127.0.0.1:${p} error:`, err.message);
                        });
                }));
            }
        } else {
            console.log(`[TRACE] [ADB-Helper] Tat ca cac cong deu da duoc ket noi online. Bo qua chay adb connect.`);
        }

        // Phase 3: get devices, filter 5-digit ports
        console.log(`[TRACE] [ADB-Helper] Step 4: Lay danh sach thiet bi tu adb devices...`);
        const { stdout } = await execAsync(`"${adbPath}" devices -l`);
        console.log(`[TRACE] [ADB-Helper] Danh sach adb devices raw:\n`, stdout);
        
        const lines = stdout.split('\n');
        const devices = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || !line.includes('device') || line.includes('offline')) continue;
            
            const parts = line.split(/\s+/);
            const deviceId = parts[0];
            if (!deviceId) continue;

            let portMatch = deviceId.match(/:(\d+)$/);
            if (!portMatch) {
                // Try emulator-xxxx pattern
                portMatch = deviceId.match(/^emulator-(\d+)$/);
                if (!portMatch) {
                    console.log(`[TRACE] [ADB-Helper] Bo qua thiet bi khong hop le: ${deviceId}`);
                    continue;
                }
            }
            const port = parseInt(portMatch[1], 10);
            
            // Allow 127.0.0.1:xxxx and emulator-xxxx
            if (!deviceId.startsWith('127.0.0.1:') && !deviceId.startsWith('emulator-')) {
                console.log(`[TRACE] [ADB-Helper] Bo qua thiet bi khong phai local IP hay emulator: ${deviceId}`);
                continue;
            }
            
            // Skip MuMu's 4-digit duplicate ports (7555-7560) to avoid double listing
            if (port >= 7555 && port <= 7560) {
                console.log(`[TRACE] [ADB-Helper] Bo qua cong duplicate cua MuMu: ${deviceId}`);
                continue;
            }

            console.log(`[TRACE] [ADB-Helper] Phat hien thiet bi hop le: ${deviceId}`);
            devices.push({ id: deviceId, name: deviceId });
        }

        // Filter and deduplicate by Android ID
        console.log(`[TRACE] [ADB-Helper] Step 5: Loc va khu trung lap thiet bi...`);
        const gamePkg = config.GAME_PACKAGE || 'vn.perfingame.jx1mobile';
        const validDevices = [];
        
        const checkResults = await Promise.all(devices.map(async (dev) => {
            const pidRes = await execAsync(`"${adbPath}" -s ${dev.id} shell pidof ${gamePkg}`);
            const isRunning = !pidRes.error && pidRes.stdout.trim() && /^\d+/.test(pidRes.stdout.trim());
            
            let androidId = '';
            try {
                const idRes = await execAsync(`"${adbPath}" -s ${dev.id} shell settings get secure android_id`);
                androidId = idRes.stdout.trim() || dev.id;
            } catch (e) {
                androidId = dev.id;
            }
            
            return { dev, isRunning, androidId };
        }));

        // Deduplicate devices by grouping by Android ID
        // This effectively groups all cloned LDPlayer ports. If they have a 5-digit ADB port (e.g. 16384),
        // we will keep those and drop the duplicate 4-digit guest ports (e.g. 5555, 5557).
        const groups = new Map(); // androidId -> [checkResult]
        for (const r of checkResults) {
            if (r.androidId) {
                if (!groups.has(r.androidId)) {
                    groups.set(r.androidId, []);
                }
                groups.get(r.androidId).push(r);
            }
        }

        for (const [androidId, list] of groups.entries()) {
            const has5Digit = list.some(r => {
                const port = parseInt(r.dev.id.split(':')[1] || '0', 10);
                return String(port).length >= 5;
            });

            for (const r of list) {
                const port = parseInt(r.dev.id.split(':')[1] || '0', 10);
                const is5Digit = String(port).length >= 5;

                if (has5Digit && !is5Digit) {
                    console.log(`[TRACE] [ADB-Helper] Loai bo cong guest duplicate (cung Android ID: ${androidId}): ${r.dev.id}`);
                } else {
                    console.log(`[TRACE] [ADB-Helper] Chap nhan thiet bi: ${r.dev.id} (Android ID: ${androidId}, Game dang chay: ${r.isRunning})`);
                    validDevices.push(r.dev);
                }
            }
        }

        sendLog(`Tim thay ${validDevices.length} gia lap (quet ${SCAN_START}-${SCAN_END}).`, 'info');
        console.log(`[TRACE] [ADB-Helper] Quet thiet bi hoan tat. So luong: ${validDevices.length}`);
        return { ok: true, devices: validDevices };
    } catch (err) {
        console.error(`[TRACE] [ADB-Helper] Quet thiet bi gap loi he thong:`, err);
        return { ok: false, error: err.message };
    }
}

module.exports = {
    scanDevices
};
