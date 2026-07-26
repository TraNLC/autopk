
const { FridaSession } = require('./src/frida-session');
const { scanDevices } = require('./src/gui/adb-helper');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);

async function main() {
    console.log('Đang tìm LDPlayer...');
    const adbPath = path.join(process.cwd(), 'tools', 'adb.exe'); 
    const res = await scanDevices(adbPath, execAsync, console.log);
    if (!res.ok || res.devices.length === 0) {
        console.log('Không tìm thấy thiết bị nào đang chạy.');
        return;
    }

    const device = res.devices[0];
    console.log('Kết nối vào giả lập ' + device.id + '...');

    const session = new FridaSession(device.id, 'vn.perfingame.jx1mobile');
    const ok = await session.connect();
    if (!ok) {
        console.log('Lỗi kết nối frida server vào game!');
        return;
    }

    const bundlePath = path.join(process.cwd(), 'frida-scripts', 'bot.bundle.js');
    await session.loadScript(bundlePath);

    console.log('\n=> Đang quét bộ nhớ tìm điểm Tống Kim...');
    console.time('Thời gian quét');
    const scoreRes = await session.callRpc('getTkScoreDeepScan');
    console.timeEnd('Thời gian quét');

    if (scoreRes && scoreRes.ok) {
        console.log('\n========= KẾT QUẢ TỐNG KIM =========');
        console.log('=> ĐIỂM CÁ NHÂN: ' + scoreRes.score);
        console.log('=> HẠNG:         ' + scoreRes.rank);
        console.log('=> SỐ KILL:      ' + scoreRes.kills);
        console.log('=> HẠNG 10 TẠM:  ' + scoreRes.top10Score);
        console.log('=> TỐNG QUÂN SỐ: ' + scoreRes.tongQuanSo);
        console.log('=> TỐNG TÍCH LŨY:' + scoreRes.tongTichLuy);
        console.log('=> KIM QUÂN SỐ:  ' + scoreRes.kimQuanSo);
        console.log('=> KIM TÍCH LŨY: ' + scoreRes.kimTichLuy);
        console.log('====================================\n');
    } else {
        console.log('\n=> Không tìm thấy điểm Tống Kim trên màn hình! (Bạn phải đang ở trong trận Tống Kim)');
    }
    process.exit(0);
}

main().catch(e => {
    console.error('Lỗi:', e);
    process.exit(1);
});
