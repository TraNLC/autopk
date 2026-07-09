const { exec } = require('child_process');
const adb = require('../adb');
const sessionManager = require('../gui/session-manager');
const config = require('../../config');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Hàm khởi chạy CMD và không đợi nó kết thúc (chạy ngầm)
function launchMuMu(mumuPath, index) {
    return new Promise((resolve, reject) => {
        // MuMuManager.exe api -v 0 launch_player
        const cmd = `"${mumuPath}" api -v ${index} launch_player`;
        console.log(`[FullAuto] Đang gọi lệnh: ${cmd}`);
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`[FullAuto] Lỗi khởi động MuMu: ${error.message}`);
                // Lỗi có thể do đường dẫn sai hoặc timeout, nhưng ta vẫn cứ resolve
                // vì MuMu có thể mất nhiều thời gian để bật và CMD trả về lỗi time-out
            }
        });
        // Lệnh trên có thể chạy ngầm, ta sẽ trả về luôn
        resolve();
    });
}

// Hàm kết nối ADB liên tục cho đến khi thành công
async function connectAdb(port, timeoutSec = 60) {
    const deviceId = `127.0.0.1:${port}`;
    console.log(`[FullAuto] Đang cố gắng kết nối ADB đến ${deviceId}...`);
    
    for (let i = 0; i < timeoutSec; i++) {
        // Gọi lệnh connect
        const out = adb.adbShell(null, `connect ${deviceId}`);
        if (out.includes('connected to') || out.includes('already connected')) {
            console.log(`[FullAuto] Đã kết nối ADB thành công: ${deviceId}`);
            
            // Wait until device is actually listed as 'device' (not 'offline')
            for (let j = 0; j < 5; j++) {
                const devices = adb.listDevices();
                const found = devices.find(d => d.id === deviceId && d.status === 'device');
                if (found) return deviceId;
                await sleep(1000);
            }
        }
        await sleep(1000);
    }
    throw new Error(`Quá thời gian (${timeoutSec}s) chờ kết nối ADB đến cổng ${port}`);
}

async function performFullAutoLaunch(mumuPath, username, password, port, index, sendLog) {
    const deviceId = `127.0.0.1:${port}`;

    try {
        sendLog(`[${deviceId}] [Bước 1] Đang khởi động MuMu Player (Index: ${index})...`, 'info');
        await launchMuMu(mumuPath, index);

        sendLog(`[${deviceId}] [Bước 2] Chờ giả lập khởi động & kết nối ADB (Tối đa 60s)...`, 'info');
        await connectAdb(port, 60);

        sendLog(`[${deviceId}] [Bước 3] Đang mở Game VLTK...`, 'info');
        // Mở game
        adb.startGame(deviceId);

        sendLog(`[${deviceId}] [Bước 4] Chờ Game hiển thị (Tối đa 30s)...`, 'info');
        const isGameUp = await adb.waitForGame(deviceId, 30000);
        if (!isGameUp) {
            throw new Error('Game chưa thể mở lên hoặc bị văng!');
        }

        sendLog(`[${deviceId}] [Bước 5] Đang kết nối công cụ phân tích (Frida)...`, 'info');
        // Inject Frida (giống như thao tác bấm ô vuông toggleDevice)
        const isConnected = await sessionManager.toggleDevice(deviceId, true);
        if (!isConnected) {
            throw new Error('Kết nối Frida thất bại. Hãy kiểm tra lại giả lập đã root chưa.');
        }

        sendLog(`[${deviceId}] [Bước 6] Bắt đầu kích hoạt Auto Login...`, 'success');
        
        // Cập nhật cấu hình lưu trữ
        const state = sessionManager.sessions.get(deviceId);
        if (!state) throw new Error('Không tìm thấy session sau khi kết nối.');

        return { ok: true, deviceId: deviceId };
    } catch (e) {
        sendLog(`[${deviceId}] [LỖI AUTO LAUNCH] ${e.message}`, 'error');
        return { ok: false, error: e.message };
    }
}

module.exports = {
    performFullAutoLaunch
};
