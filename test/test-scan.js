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
  console.log(`Kết nối vào giả lập ${device.id}...`);

  const session = new FridaSession(device.id, 'vn.perfingame.jx1mobile');
  const ok = await session.connect();
  if (!ok) {
    console.log('Lỗi kết nối frida server vào game!');
    return;
  }

  const bundlePath = path.join(process.cwd(), 'frida-scripts', 'bot.bundle.js');
  await session.loadScript(bundlePath);

  console.log('Dang goi getNearNpcNames()...');
  const scanRes = await session.callRpc('getNearNpcNames');
  
  if (!scanRes || !scanRes.ok) {
      console.log('Loi getNearNpcNames: ' + (scanRes ? scanRes.error : 'null'));
      return process.exit(0);
  }

  console.log(`[Kết quả Scan] Found ${scanRes.count} NPCs, mapId: ${scanRes.mapId}`);
  console.log('--- Danh sach (Map: ' + scanRes.mapId + ') ---');
  
  const npcMap = scanRes.npcMap || {};
  const npcCoords = scanRes.npcCoords || {};
  
  for (const id in npcMap) {
      const name = npcMap[id];
      const coords = npcCoords[id] || {x: 0, y: 0};
      console.log(`ID: ${id.padEnd(20)} | Name: ${name.padEnd(25)} | Tọa độ: (${coords.x}, ${coords.y})`);
  }
  
  console.log('Hoan tat!');
  process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
