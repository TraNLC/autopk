const { execSync } = require('child_process');
const net = require('net');

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
        const SCAN_END = 16500;
        console.log(`[TRACE] [ADB-Helper] Step 2: Bat dau quet song song cac cong tu ${SCAN_START} den ${SCAN_END}...`);

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

        // Phase 1: TCP scan in parallel batches of 30
        const openPorts = [];
        const allPorts = [];
        for (let p = SCAN_START; p <= SCAN_END; p++) allPorts.push(p);
        
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

            // Only 5-digit ports (MuMu console), skip 4-digit aliases (5555, 7555...)
            const portMatch = deviceId.match(/:(\d+)$/);
            if (!portMatch || portMatch[1].length !== 5) {
                console.log(`[TRACE] [ADB-Helper] Bo qua thiet bi khong hop le (khong phai port 5 so): ${deviceId}`);
                continue;
            }

            console.log(`[TRACE] [ADB-Helper] Chap nhan thiet bi: ${deviceId}`);
            devices.push({ id: deviceId, name: deviceId });
        }

        sendLog(`Tim thay ${devices.length} gia lap (quet ${SCAN_START}-${SCAN_END}).`, 'info');
        console.log(`[TRACE] [ADB-Helper] Quet thiet bi hoan tat. So luong: ${devices.length}`);
        return { ok: true, devices };
    } catch (err) {
        console.error(`[TRACE] [ADB-Helper] Quet thiet bi gap loi he thong:`, err);
        return { ok: false, error: err.message };
    }
}

module.exports = {
    scanDevices
};
