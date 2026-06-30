const { PacketInjector } = require('../packet-injector');

function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const npcCacheMap = new Map(); // deviceId -> { mapId, healId, warId }

/**
 * 
 * @param {string} deviceId 
 * @param {FridaSession} session 
 * @param {object} info 
 * @param {string} side 'auto' | 'song' | 'jin'
 * @param {string[]} lacs Array of particular ids (e.g. ['45', '50'])
 * @param {function} sendLog
 */
async function autoTongKimLoop(deviceId, session, info, side, lacs, sendLog) {
  if (!session || !info) return;

  const injector = new PacketInjector(session);
  const mapId = info.mapId;
  const isStagingArea = [323, 324, 325, 379, 972].includes(mapId);
  const isBattlefield = [44, 375, 376, 377, 580].includes(mapId);
  const isCity = !isStagingArea && !isBattlefield; // Tương Dương, etc.

  // 1. Tự dùng lắc (Phi tốc, Chiến cổ, Lệnh bài)
  if (lacs && lacs.length > 0) {
    try {
      const bagResStr = await session.callRpc('dumpBagItems');
      if (bagResStr) {
        const bag = bagResStr;
        if (bag.items && bag.items.length > 0) {
          for (const lac of lacs) {
            const item = bag.items.find(i => i.location === 2 && i.particular == lac);
            if (item && item.slot !== undefined) {
              await injector.sendPlayerUserItem(item.slot);
              sendLog(`[${deviceId}] Đã dùng lắc (Particular: ${lac}) tại ô ${item.slot}`, 'success');
            }
          }
        }
      }
    } catch(e) {}
  }

  // 1.5. Kiểm tra trạng thái chết (HP <= 0)
  if (info.hp !== undefined && info.hp <= 0) {
    sendLog(`[${deviceId}] 💀 Phát hiện nhân vật đã chết (HP = 0). Gửi Packet Hồi Sinh (Opcode 232)...`, 'warn');
    try {
        await session.callRpc('sendPacket', 232, ''); // Gửi opcode 232 (0xe8) để hồi sinh
        await session.callRpc('closeDialogPopups').catch(() => {}); // Giữ lại đóng UI phòng hờ
        // Chờ một chút để game kịp dịch chuyển nhân vật về Khu An Toàn (đổi mapId)
        await new Promise(r => setTimeout(r, 1500));
    } catch(e) {}
    return; // Dừng các hành động khác để chờ vòng lặp sau (sau khi đã đổi map)
  }

  // 2. Báo Danh (Ngoại thành -> Điểm báo danh)
  if (isCity) {
    sendLog(`[${deviceId}] Đang ở ngoài thành. Đang gọi Chiêu Binh Quân để đăng ký...`, 'info');
    try {
      const NPC_BAODANH = 23; 
      const talkRes = await session.callRpc('remoteNpcDialogue', NPC_BAODANH);
      if (talkRes && talkRes.ok) {
        await new Promise(r => setTimeout(r, 400));
        
        // Mặc định chọn dòng đầu tiên (0) vì server có thể đang báo danh ngẫu nhiên
        let optionIndex = 0; 
        // Nếu server CÓ cho chọn phe ở ngoài thành, anh em có thể tùy biến lại index chỗ này (vd 0 là Tống, 1 là Kim)
        // Nhưng tạm thời cứ ép lấy dòng 0 để vào được bên trong.

        await session.callRpc('selectDialogOption', optionIndex);
        await new Promise(r => setTimeout(r, 400));
        await session.callRpc('sendPacket', 232, ''); // eClientCompleted
        sendLog(`[${deviceId}] Đã gửi lệnh đăng ký báo danh (Option Index: ${optionIndex}).`, 'success');
      } else {
        sendLog(`[${deviceId}] Lỗi gọi NPC báo danh: ${talkRes ? talkRes.error : 'Unknown'}`, 'error');
      }
    } catch (e) {}
    return;
  }

  // 3. Nhận máu & Ra trận (Khu an toàn trong Chiến Trường)
  if (isStagingArea) {
    try {
      let cache = npcCacheMap.get(deviceId);
      
      // Ưu tiên dùng ID đã HỌC được từ thao tác click của người dùng
      if (cache && cache.learnedIds && cache.learnedIds.length > 0) {
        // Tương tác tuần tự với tất cả các NPC đã lưu (Tối đa 2)
        for (const npcId of cache.learnedIds) {
          sendLog(`[${deviceId}] Đang tương tác NPC đã học (${npcId})...`, 'info');
          await session.callRpc('remoteNpcDialogue', npcId);
          await new Promise(r => setTimeout(r, 800));
          
          // Gửi chọn Option 0 (Nhận máu hoặc Ra trận tùy NPC)
          sendLog(`[${deviceId}] Gửi lệnh chọn Option 0 cho NPC (${npcId})...`, 'info');
          await session.callRpc('selectDialogOption', 0);
          await new Promise(r => setTimeout(r, 800));
        }

        // Bồi thêm Opcode ngầm định (dự phòng)
        if (side === 'song' || side === 'jin') {
           const opCode = side === 'song' ? 228 : 229;
           const hexBody = "0a0432353933";
           await session.callRpc('sendPacket', opCode, hexBody);
        }

        // Đóng UI để không vướng màn hình
        await new Promise(r => setTimeout(r, 500));
        await session.callRpc('closeDialogPopups').catch(() => {});

      } else {
        sendLog(`[${deviceId}] ⚠️ CHƯA CÓ ID NPC! Hãy click tay vào "Mã binh quan" và "Quân Nhu" 1 lần để tool ghi nhớ (Học ID)!`, 'warn');
        return; // Dừng lại chờ người dùng click
      }
    } catch(e) {
      sendLog(`[${deviceId}] Lỗi Auto Tống Kim: ${e.message}`, 'error');
    }
  }
}

module.exports = {
  autoTongKimLoop,
  npcCacheMap
};
