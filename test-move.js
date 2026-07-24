const { FridaSession } = require('./src/frida-session');
const { scanDevices } = require('./src/gui/adb-helper');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);
const { PacketInjector } = require('./src/packet-injector');

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

  const injector = new PacketInjector(session);
  session.onMessage((msg) => {
    if (msg && msg.log) {
      console.log(msg.log);
    }
    if (msg && msg.type === 'send_out' && (msg.opcode === 9 || msg.opcode === 248)) {
      const hex = msg.hex;
      // Decode hex to string
      let str = '';
      for (let i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
      }
      console.log(`[PACKET RA] Opcode: ${msg.opcode}, Data: ${str.replace(/[^a-zA-Z0-9|]/g, '.')}`);
    }
  });

  console.log('Đang cài đặt Hook để theo dõi toàn diện lệnh di chuyển trong game...');
  const capRes = await session.callRpc('captureGoto');
  console.log('Kết quả cài Hook:', JSON.stringify(capRes));

  // Đầu tiên, lấy tọa độ hiện tại của nhân vật để đi tiếp cho an toàn
  const pmRes = await session.callRpc('getPlayerInfoNoIl2cpp');
  if (!pmRes || !pmRes.ok) {
    console.log('Lỗi không lấy được thông tin Player: ' + pmRes?.error);
    return process.exit(0);
  }

  const startX = pmRes.x;
  const startY = pmRes.y;
  console.log(`=> Tọa độ hiện tại: X=${startX}, Y=${startY}`);

  // Có thể truyền tọa độ xác định qua command line, ví dụ: node test-move.js 52000 52000
  let targetX = startX + 600;
  let targetY = startY + 600;

  if (process.argv.length >= 4) {
    targetX = parseFloat(process.argv[2]);
    targetY = parseFloat(process.argv[3]);
    console.log(`\n=> Nhận được yêu cầu nhảy tới Tọa độ xác định: X=${targetX}, Y=${targetY}`);
  } else {
    console.log(`\n=> Không nhập tọa độ, mặc định nhảy đi xa 600 mét...`);
  }

  console.log(`\n=> CÁCH 5: Dịch chuyển tức thời bằng Direct Memory Write tới tọa độ X=${targetX}, Y=${targetY}`);
  const directWriteRes = await session.callRpc('clientMoveMemory', targetX, targetY);
  console.log(`   [Inject] Ghi memory (${targetX}, ${targetY}):`, JSON.stringify(directWriteRes));

  // Gửi gói tin Opcode 9 để đồng bộ với Server
  console.log(`   [Inject] Đồng bộ Server (Opcode 9)...`);
  await injector.sendStringData(`1|${Math.round(targetX)}|${Math.round(targetY)}`);

  console.log(`\nĐang chờ 2 giây để kiểm tra lại tọa độ...`);
  await new Promise(r => setTimeout(r, 2000));

  const endPmRes = await session.callRpc('getPlayerInfoNoIl2cpp');
  if (endPmRes && endPmRes.ok) {
    console.log(`=> Tọa độ MỚI sau khi nhảy: X=${endPmRes.x}, Y=${endPmRes.y}`);
    if (Math.abs(endPmRes.x - targetX) < 10 && Math.abs(endPmRes.y - targetY) < 10) {
      console.log(`\n🎉 THÀNH CÔNG RỰC RỠ! Nhân vật đã dịch chuyển thành công đi một đoạn rất dài!`);
      console.log(`   Anh thử nhìn màn hình xem nhân vật có vút đi mất không nhé!`);
    } else {
      console.log(`\n⚠️ Tọa độ có thay đổi nhưng chưa nhảy tới đích.`);
    }
  }

  process.exit(0);
}

main().catch(e => {
  console.error('Lỗi khi chạy test move:', e);
  process.exit(1);
});
