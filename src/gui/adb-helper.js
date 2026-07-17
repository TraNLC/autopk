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
        const SCAN_END = 16700; // Expanded to 16700 to support up to 10 MuMu instances (port increments of 32)
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
            5555, 5557, 5559, 5561, 5563, 5565, // LDPlayer, BlueStacks, etc.
            7555, 7556, 7557, 7558,             // MuMu defaults
            21503, 21513, 21523, 21533,         // MEmu
            62001, 62025, 62026, 52001          // Nox
        ];
        for (const p of commonPorts) {
            scanPorts.add(p);
        }
        const allPorts = Array.from(scanPorts).sort((a, b) => a - b);

        // Phase 1: TCP scan in parallel batches of 30
        const openPorts = [];
        for (let i = 0; i < allPorts.length; i += 30) {
            const batch = allPorts.slice(i, i + 30);
            console.log(`[TRACE] [ADB-Helper] Quet batch cong tu ${batch[0]} den ${batch[batch.length - 1]}...`);
            const results = await Promise.all(batch.map(p => checkPort(p).then(ok => ok ? p : null)));
            for (const r of results) {
                if (r) openPorts.push(r);
            }
        }
        console.log(`[TRACE] [ADB-Helper] Hoan tat quet port. Tim thay cac cong dang mo:`, openPorts);

        // Phase 2: adb connect to open ports in parallel batches
        console.log(`[TRACE] [ADB-Helper] Step 3: Bat dau ket noi adb den cac port mo...`);
        
        // Detect offline devices first and force a disconnect/reconnect for them
        let offlineDevices = [];
        try {
            const devicesRes = await execAsync(`"${adbPath}" devices`);
            const lines = devicesRes.stdout.split('\n');
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line && line.includes('offline')) {
                    const deviceId = line.split(/\s+/)[0];
                    if (deviceId) offlineDevices.push(deviceId);
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

        for (let i = 0; i < openPorts.length; i += 10) {
            const batch = openPorts.slice(i, i + 10);
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

            // Check port number and filter duplicates
            const portMatch = deviceId.match(/:(\d+)$/);
            if (!portMatch) {
                console.log(`[TRACE] [ADB-Helper] Bo qua thiet bi khong co cong: ${deviceId}`);
                continue;
            }
            const port = parseInt(portMatch[1], 10);
            
            // Only accept local ADB connections (starts with 127.0.0.1:)
            if (!deviceId.startsWith('127.0.0.1:')) {
                console.log(`[TRACE] [ADB-Helper] Bo qua thiet bi khong phai local IP: ${deviceId}`);
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
        // For cloned instances, they share the same Android ID but listen on different host ports (5-digit ports).
        // A host port (5-digit) and a guest port (4-digit, like 5555) of the same VM also share the same Android ID.
        // We want to keep all 5-digit ports, and only keep 4-digit ports if there are no 5-digit ports for that Android ID.
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
