// src/adb.js — ADB Wrapper Module (Step 1)
// Dùng child_process gọi adb.exe, không phụ thuộc adbkit (nhẹ hơn, dễ debug)

const { execFileSync, execSync } = require('child_process');
const config = require('../config');

const ADB = config.ADB_PATH;
const PKG = config.GAME_PACKAGE;

// Ensure ADB server is running in this process context without stream blocks
try {
  execSync(`"${ADB}" start-server >nul 2>&1`, { timeout: 3000 });
} catch (e) {}

// ==================== HELPERS ====================

/** Chạy lệnh ADB, trả về stdout string (sync, timeout 15s) */
function adbShell(deviceId, args, timeout = 15000) {
  const cmdArgs = Array.isArray(args) ? args : args.split(/\s+/).filter(Boolean);
  const allArgs = deviceId ? ['-s', deviceId, ...cmdArgs] : cmdArgs;
  try {
    return execFileSync(ADB, allArgs, { timeout, encoding: 'utf-8', windowsHide: true }).trim();
  } catch (e) {
    return '';
  }
}

/** Chạy lệnh ADB shell (trên thiết bị) */
function adbDeviceShell(deviceId, shellCmd, timeout = 10000) {
  if (typeof shellCmd === 'string') {
    return adbShell(deviceId, ['shell', shellCmd], timeout);
  }
  return adbShell(deviceId, ['shell', ...shellCmd], timeout);
}

// ==================== DEVICE MANAGEMENT ====================

/** Lấy danh sách thiết bị đang kết nối */
function listDevices() {
  const out = adbShell(null, 'devices');
  const lines = out.split('\n').slice(1); // bỏ dòng "List of devices attached"
  const devices = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      devices.push({ id: parts[0], status: parts[1] });
    }
  }
  return devices;
}

/**
 * Auto-detect thiết bị đang chạy game.
 * @returns {{ deviceId: string, pid: number } | null}
 */
function detectDevice() {
  const devices = listDevices();
  for (const d of devices) {
    if (d.status !== 'device') continue;
    const pid = getGamePid(d.id);
    if (pid) {
      console.log(`[ADB] Auto-detected device: ${d.id} (game PID ${pid})`);
      return { deviceId: d.id, pid };
    }
  }
  return null;
}

/**
 * Auto-detect TẤT CẢ thiết bị đang chạy game (multi-instance).
 * @returns {Array<{ deviceId: string, pid: number }>}
 */
function detectDevices() {
  const devices = listDevices();
  const result = [];
  for (const d of devices) {
    if (d.status !== 'device') continue;
    const pid = getGamePid(d.id);
    if (pid) {
      console.log(`[ADB] Found: ${d.id} (game PID ${pid})`);
      result.push({ deviceId: d.id, pid });
    }
  }
  return result;
}

/** Lấy PID của game trên thiết bị (nếu đang chạy) */
function getGamePid(deviceId) {
  const out = adbDeviceShell(deviceId, `pidof ${PKG}`);
  if (out.length > 0 && /^\d+/.test(out)) {
    return parseInt(out, 10);
  }
  return null;
}

// ==================== GAME CONTROL ====================

/** Kiểm tra game có đang chạy không */
function isGameRunning(deviceId) {
  const out = adbDeviceShell(deviceId, `pidof ${PKG}`);
  return out.length > 0 && /^\d+/.test(out);
}

/** Kiểm tra game có đang foreground không */
function isGameForeground(deviceId) {
  const out = adbDeviceShell(deviceId, 'dumpsys window windows');
  // Tìm dòng mCurrentFocus hoặc mFocusedApp có chứa package name
  for (const line of out.split('\n')) {
    if ((line.includes('mCurrentFocus') || line.includes('mFocusedApp')) && line.includes(PKG)) {
      return true;
    }
  }
  return false;
}

/** Dừng game (force-stop) */
function stopGame(deviceId) {
  console.log(`[ADB] Stopping ${PKG} on ${deviceId}...`);
  return adbDeviceShell(deviceId, `am force-stop ${PKG}`);
}

/** Khởi động game */
function startGame(deviceId) {
  console.log(`[ADB] Starting ${PKG} on ${deviceId}...`);
  return adbDeviceShell(deviceId, `monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
}

/** Đợi game lên foreground (timeout ms) */
async function waitForGame(deviceId, timeout = 30000) {
  console.log(`[ADB] Waiting for ${PKG} to reach foreground...`);
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (isGameForeground(deviceId)) {
      console.log('[ADB] Game is in foreground!');
      // Đợi thêm 5s để Il2Cpp load xong
      await sleep(5000);
      return true;
    }
    await sleep(1000);
  }
  console.log('[ADB] Timeout waiting for game foreground.');
  return false;
}

// ==================== TOUCH / INPUT ====================

/** Tap vào tọa độ (x, y) */
function tap(deviceId, x, y) {
  return adbDeviceShell(deviceId, `input tap ${x} ${y}`);
}

/** Swipe từ (x1,y1) đến (x2,y2) trong duration ms */
function swipe(deviceId, x1, y1, x2, y2, duration = 300) {
  return adbDeviceShell(deviceId, `input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
}

/** Gửi phím (KEYCODE_BACK=4, KEYCODE_HOME=3, etc.) */
function keyEvent(deviceId, keyCode) {
  return adbDeviceShell(deviceId, `input keyevent ${keyCode}`);
}

// ==================== UTILS ====================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Khởi động frida-server trên thiết bị */
function startFridaServer(deviceId) {
  try {
    const fs = require('fs');
    const path = require('path');

    // 1. Kiểm tra nhanh xem frida-server đã chạy chưa
    const checkRunning = adbDeviceShell(deviceId, 'pidof frida-server frida-server-x86_64');
    if (checkRunning.trim().length > 0) {
      console.log(`[ADB] frida-server is already running on ${deviceId}`);
      return true;
    }

    // 2. Kiểm tra và đẩy file frida-server-x86_64 nếu thiếu hoặc kích thước không khớp
    const local64 = path.join(config.TOOLS_DIR, 'frida-server-x86_64');
    const localSize64 = fs.existsSync(local64) ? fs.statSync(local64).size : 0;
    const checkFile64 = adbDeviceShell(deviceId, 'ls -l /data/local/tmp/frida-server-x86_64');
    const hasFullFile64 = checkFile64 && checkFile64.includes(localSize64.toString());

    if (!hasFullFile64 && localSize64 > 0) {
      console.log(`[ADB] Pushing frida-server-x86_64 to ${deviceId}...`);
      execFileSync(ADB, ['-s', deviceId, 'push', local64, '/data/local/tmp/frida-server-x86_64'], { timeout: 60000, windowsHide: true });
    }

    // 3. Kiểm tra và đẩy file frida-server (32-bit/ARM) nếu thiếu hoặc kích thước không khớp
    const local32 = path.join(config.TOOLS_DIR, 'frida-server');
    const localSize32 = fs.existsSync(local32) ? fs.statSync(local32).size : 0;
    const checkFile32 = adbDeviceShell(deviceId, 'ls -l /data/local/tmp/frida-server');
    const hasFullFile32 = checkFile32 && checkFile32.includes(localSize32.toString());

    if (!hasFullFile32 && localSize32 > 0) {
      console.log(`[ADB] Pushing frida-server (x86) to ${deviceId}...`);
      execFileSync(ADB, ['-s', deviceId, 'push', local32, '/data/local/tmp/frida-server'], { timeout: 60000, windowsHide: true });
    }

    console.log(`[ADB] Starting frida-server on ${deviceId}...`);
    // Cấp quyền thực thi
    adbDeviceShell(deviceId, 'su -c "chmod +x /data/local/tmp/frida-server*"', 5000);
    
    // Thử chạy bản x86_64 trước
    adbDeviceShell(deviceId, 'su -c "/data/local/tmp/frida-server-x86_64 -D"', 5000);
    // Đợi 1 giây sử dụng Atomics.wait
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    } catch (e) {}
    
    let check = adbDeviceShell(deviceId, 'pidof frida-server-x86_64 frida-server');
    if (check.trim().length > 0) return true;

    // Thử bản arm64/arm
    adbDeviceShell(deviceId, 'su -c "/data/local/tmp/frida-server -D"', 5000);
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    } catch (e) {}
    
    check = adbDeviceShell(deviceId, 'pidof frida-server-x86_64 frida-server');
    return check.trim().length > 0;
  } catch (e) {
    console.error(`[ADB] Lỗi khi start frida-server: ${e.message}`);
    return false;
  }
}

/**
 * Kiểm tra trạng thái ADB và Root của thiết bị
 * @returns {{ ok: boolean, error?: string, message?: string }}
 */
function checkAdbAndRootStatus(deviceId) {
  try {
    const devices = listDevices();
    const dev = devices.find(d => d.id === deviceId);

    if (!dev) {
      return { ok: false, error: 'device_not_found', message: `Không tìm thấy thiết bị hoặc chưa kết nối ADB.` };
    }
    if (dev.status === 'unauthorized') {
      return { ok: false, error: 'unauthorized', message: `Thiết bị chưa được ủy quyền ADB (unauthorized). Vui lòng đồng ý cho phép gỡ lỗi USB trên màn hình giả lập.` };
    }
    if (dev.status === 'offline') {
      return { ok: false, error: 'offline', message: `Thiết bị ở trạng thái ngoại tuyến (offline). Vui lòng khởi động lại giả lập.` };
    }
    if (dev.status !== 'device') {
      return { ok: false, error: 'invalid_status', message: `Thiết bị có trạng thái ADB không hợp lệ: ${dev.status}` };
    }

    // Check root status
    let isRooted = false;
    try {
      const rootCheck = adbShell(deviceId, ['shell', 'su', '-c', 'id'], 2000);
      isRooted = rootCheck.includes('uid=0') || rootCheck.includes('root');
    } catch (e) {
      // su check failed or timed out
    }

    if (!isRooted) {
      return { ok: false, error: 'no_root', message: `Giả lập CHƯA BẬT ROOT! Vui lòng bật chế độ Root (Root Mode) trong cài đặt của giả lập để sử dụng.` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'check_failed', message: `Lỗi khi kiểm tra trạng thái thiết bị: ${e.message}` };
  }
}

// ==================== EXPORT ====================

module.exports = {
  listDevices,
  detectDevice,
  detectDevices,
  getGamePid,
  isGameRunning,
  isGameForeground,
  stopGame,
  startGame,
  waitForGame,
  tap,
  swipe,
  keyEvent,
  adbShell,
  adbDeviceShell,
  startFridaServer,
  checkAdbAndRootStatus,
};
