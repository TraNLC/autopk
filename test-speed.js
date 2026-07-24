const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { scanDevices } = require('./src/gui/adb-helper');
const { FridaSession } = require('./src/frida-session');

async function main() {
  console.log('Đang tìm thiết bị...');
  const adbPath = path.join(process.cwd(), 'tools', 'adb.exe');
  const res = await scanDevices(adbPath, execAsync, console.log);
  if (!res.ok || res.devices.length === 0) {
    console.log('Không tìm thấy thiết bị nào đang chạy.');
    return process.exit(1);
  }

  const deviceId = res.devices[0].id;
  console.log(`Kết nối vào thiết bị ${deviceId}...`);

  const session = new FridaSession(deviceId);
  await session.start();
  await new Promise(r => setTimeout(r, 2000));

  const speed = process.argv.length >= 3 ? parseFloat(process.argv[2]) : 3.0;
  console.log(`=> Đang kích hoạt SPEED HACK x${speed} lần...`);

  const r = await session.callRpc('setGameSpeed', speed);
  if (r && r.ok) {
    console.log(`✅ Thành công! Game hiện tại đang chạy ở tốc độ x${speed}!`);
    console.log('   Hãy thử chạy bộ hoặc tung skill để tận hưởng!');
    console.log('   (Để trở lại bình thường, chạy: node test-speed.js 1.0)');
  } else {
    console.log(`❌ Thất bại: ${JSON.stringify(r)}`);
  }

  process.exit(0);
}

main().catch(e => {
  console.error('Lỗi:', e);
  process.exit(1);
});
