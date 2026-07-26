
const { FridaSession } = require('./src/frida-session');
const { scanDevices } = require('./src/gui/adb-helper');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);

async function main() {
    const adbPath = path.join(process.cwd(), 'tools', 'adb.exe'); 
    const res = await scanDevices(adbPath, execAsync, console.log);
    if (!res.ok || res.devices.length === 0) return console.log('Không tìm thấy thiết bị');
    
    const device = res.devices[0];
    const session = new FridaSession(device.id, 'vn.perfingame.jx1mobile');
    if (!(await session.connect())) return console.log('Lỗi kết nối');
    
    const bundlePath = path.join(process.cwd(), 'frida-scripts', 'bot.bundle.js');
    await session.loadScript(bundlePath);
    
    console.log('Bật captureGoto...');
    const capRes = await session.callRpc('captureGoto');
    console.log(capRes);
    
    console.log('VUI LÒNG CLICK CHUỘT LÊN MÀN HÌNH ĐỂ NHÂN VẬT DI CHUYỂN TRONG GAME...');
    console.log('Đang chờ 8 giây...');
    await new Promise(r => setTimeout(r, 8000));
    
    console.log('Lấy log Goto...');
    const logRes = await session.callRpc('lastGotoArgs');
    console.log(JSON.stringify(logRes, null, 2));
    
    process.exit(0);
}
main();
