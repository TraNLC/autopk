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

  // Kết nối với giả lập đầu tiên
  const device = res.devices[0];
  console.log(`Kết nối vào giả lập ${device.id}...`);

  const session = new FridaSession(device.id, 'vn.perfingame.jx1mobile');
  const ok = await session.connect();
  if (!ok) {
    console.log('Lỗi kết nối frida server vào game!');
    return;
  }

  console.log('Đang load script bot.bundle.js...');
  const bundlePath = path.join(process.cwd(), 'frida-scripts', 'bot.bundle.js');
  await session.loadScript(bundlePath);

  console.log('Đang đọc thông tin rương đồ...');
  const invRes = await session.callRpc('getInventoryItemsNoIl2cpp');
  
  if (!invRes || !invRes.ok || !invRes.items) {
    console.log('Không thể lấy danh sách vật phẩm. Hãy kiểm tra xem nhân vật đã vào game chưa.');
    return;
  }

  console.log(`Đã đọc thành công. Tổng số vật phẩm: ${invRes.items.length}`);
  
  // 45 = Phi Tốc, 51 = Lệnh Bài, 50 = Chiến Cổ
  const targetParticulars = ['45', '51', '50']; 
  const usedParticulars = new Set();
  
  for (const item of invRes.items) {
    const part = item.particular.toString();
    // Chỉ sử dụng mỗi loại 1 cái duy nhất trong mỗi lần chạy test
    if (targetParticulars.includes(part) && !usedParticulars.has(part)) {
      console.log(`-> Tìm thấy [${item.name || 'Lắc'}] với ID particular ${item.particular}. Đang gọi lệnh sử dụng...`);
      const useRes = await session.callRpc('useItemNoIl2cpp', item.particular);
      
      if (useRes && useRes.ok) {
          console.log(`   [THÀNH CÔNG] Lệnh sử dụng ${item.name} đã được gửi vào Game!`);
      } else {
          console.log(`   [THẤT BẠI] Lỗi khi dùng ${item.name}:`, useRes ? useRes.error : 'Unknown');
      }
      
      usedParticulars.add(part);
      
      // Đợi một chút trước khi dùng món tiếp theo để game kịp xử lý
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (usedParticulars.size === 0) {
    console.log('-> Không tìm thấy bất kỳ Phi Tốc, Lệnh Bài hay Chiến Cổ nào trong rương!');
  } else {
    console.log('Hoàn tất test sử dụng vật phẩm!');
  }
  
  process.exit(0);
}

main().catch(e => {
  console.error('Lỗi khi chạy test:', e);
  process.exit(1);
});
