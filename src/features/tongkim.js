const { PacketInjector } = require('../packet-injector');
const { exec } = require('child_process');
const { TongKimMapData, getNpcName } = require('./tongkim-data');

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
 * @param {number} delay
 * @param {function} sendLog
 */
async function autoTongKimLoop(deviceId, session, info, side, lacs, delay, sendLog) {
  if (!session || !info) return;

  const injector = new PacketInjector(session);
  const mapId = info.mapId;
  const isBattlefield = [44, 375, 376, 377, 580].includes(mapId);
  const isCity = [1, 11, 37, 78, 162, 176].includes(mapId); // Explicitly check Phượng Tường, Thành Đô, Biện Kinh, Tương Dương, Đại Lý, Dương Châu
  
  let isStagingArea = [323, 324, 325, 379, 382, 972].includes(mapId);

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
        await session.callRpc('closeDialogPopups').catch(() => {}); // Gọi hàm đóng UI từ memory qua Frida
        // Chờ một chút để game kịp dịch chuyển nhân vật về Khu An Toàn (đổi mapId)
        await new Promise(r => setTimeout(r, 1500));
    } catch(e) {}
    return; // Dừng các hành động khác để chờ vòng lặp sau (sau khi đã đổi map)
  }

  // 2. Báo Danh (Ngoại thành -> Điểm báo danh)
  if (isCity) {
    sendLog(`[${deviceId}] Đang ở ngoài thành. Đang tìm Chiêu Binh Quân / Mộ Binh Quan để đăng ký...`, 'info');
    try {
      let cache = npcCacheMap.get(deviceId);
      
      // Fallback: Lấy ID báo danh đầu tiên trong mảng
      let npcBaodanh = (cache && cache.learnedIds && cache.learnedIds.length > 0) ? cache.learnedIds[0] : null;

      if (!npcBaodanh) {
          sendLog(`[${deviceId}] ⚠️ CHƯA CÓ ID NPC BÁO DANH! Hãy click tay vào Chiêu Binh Quân/Mộ Binh Quan 1 lần để tool ghi nhớ!`, 'warn');
          return; // Dừng lại chờ user click
      }
      
      sendLog(`[${deviceId}] Đang gọi NPC Báo Danh đã lưu (ID: ${npcBaodanh})...`, 'info');
      const talkRes = await session.callRpc('remoteNpcDialogue', npcBaodanh);
      
      // Chờ 1 chút để server phản hồi
      await new Promise(r => setTimeout(r, 400));
      
      // Lựa chọn vào chiến trường (Dòng 1 hoặc 2)
      sendLog(`[${deviceId}] Đang chọn tùy chọn vào chiến trường...`, 'info');
      await session.callRpc('selectDialogOption', 0); // Thường dòng đầu tiên là vào chiến trường
      
      // Đóng popup
      await new Promise(r => setTimeout(r, 500));
      await session.callRpc('closeDialogPopups').catch(() => {});
      
      sendLog(`[${deviceId}] Đã gửi lệnh vào khu chờ Tống Kim!`, 'success');
    } catch (e) {
      sendLog(`[${deviceId}] Lỗi khi báo danh: ${e.message}`, 'error');
    }
    return;
  }

  // 3. Nhận máu & Ra trận (Khu an toàn trong Chiến Trường)
  if (isStagingArea) {
    try {
      let cache = npcCacheMap.get(deviceId);
      let stagingNpcs = (cache && cache.learnedIds && cache.learnedIds.length > 0) ? [...cache.learnedIds] : [];
      
      // Fallback hardcode từ DB
      if (stagingNpcs.length === 0 && TongKimMapData[mapId]) {
          stagingNpcs = [...TongKimMapData[mapId].ids];
          sendLog(`[${deviceId}] Đã tự động nạp NPC chuẩn cho map ${mapId} từ Database!`, 'info');
      }
      
      if (stagingNpcs.length > 0) {
        // Tương tác tuần tự với tất cả các NPC đã lưu
        for (let i = 0; i < stagingNpcs.length; i++) {
          const npcId = stagingNpcs[i];
          const npcName = getNpcName(npcId) ? ` - ${getNpcName(npcId)}` : "";
          sendLog(`[${deviceId}] Đang tương tác NPC đã học trong khu chờ (${npcId}${npcName})...`, 'info');
          await session.callRpc('remoteNpcDialogue', npcId);
          await new Promise(r => setTimeout(r, 800));
          
          let optionIndex = 0;
          // Xác định nếu đây là NPC Trinh Sát (thường là NPC cuối cùng được học)
          const isTrinhSat = (i === stagingNpcs.length - 1);
          
          if (isTrinhSat) {
             if (delay > 0) {
                 sendLog(`[${deviceId}] Chờ ${delay/1000} giây trước khi ra trận...`, 'info');
                 await new Promise(r => setTimeout(r, delay));
             }
             if (side === 'jin') {
                 optionIndex = 1; // Chọn phe Kim (Dòng 2)
             } else if (side === 'auto') {
                 // Đọc từ campValue của nhân vật (1: Tống, 2: Kim)
                 if (info && info.campValue === 2) {
                     optionIndex = 1;
                 }
             }
             // Tống thì vẫn giữ optionIndex = 0
          }
          
          sendLog(`[${deviceId}] Gửi lệnh chọn Option ${optionIndex} cho NPC (${npcId}${npcName})...`, 'info');
          await session.callRpc('selectDialogOption', optionIndex);
          await new Promise(r => setTimeout(r, 400));
          
          if (!isTrinhSat) {
             // Fallback: Gửi thêm eClientCompleted cho Quân Nhu vì một số NPC phe Kim yêu cầu gói này để nhận máu
             await session.callRpc('sendPacket', 232, '');
             await new Promise(r => setTimeout(r, 400));
          }
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
        sendLog(`[${deviceId}] ⚠️ CHƯA CÓ ID NPC RA TRẬN! Hãy click tay vào "Mã binh quan" và "Quân Nhu" 1 lần để tool ghi nhớ!`, 'warn');
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
