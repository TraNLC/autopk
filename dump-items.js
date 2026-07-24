const { FridaSession } = require('./src/frida-session');
const { scanDevices } = require('./src/gui/adb-helper');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);

async function main() {
  const adbPath = path.join(process.cwd(), 'tools', 'adb.exe'); 
  const res = await scanDevices(adbPath, execAsync, console.log);
  if (!res.ok || res.devices.length === 0) {
    console.log('Không tìm thấy thiết bị nào đang chạy.');
    return;
  }

  const device = res.devices[0];
  const session = new FridaSession(device.id, 'vn.perfingame.jx1mobile');
  await session.connect();
  const bundlePath = path.join(process.cwd(), 'frida-scripts', 'bot.bundle.js');
  await session.loadScript(bundlePath);

  const invRes = await session.callRpc('getInventoryItems');
  if (!invRes || !invRes.ok || !invRes.items) {
    console.log('Không lấy được túi đồ.');
    return;
  }

  console.log('--- DANH SÁCH VẬT PHẨM ---');
  for (const item of invRes.items) {
      console.log(`- Tên: ${item.name} | Particular: ${item.particular} | Count: ${item.count || 1}`);
  }
  process.exit(0);
}

main().catch(console.error);
