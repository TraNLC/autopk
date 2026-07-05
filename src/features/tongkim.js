const { PacketInjector } = require('../packet-injector');
const { exec } = require('child_process');
const { getNpcPair, updateNpcId } = require('./tongkim-data');

function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const npcCacheMap = new Map(); // deviceId -> { mapId, campValue, quanNhuId, trinhSatId, baodanhId, learnedIds }
const busyDevices = new Set();   // Guard chống re-entry khi delay dài

function ensureCache(deviceId) {
  if (!npcCacheMap.has(deviceId)) {
    npcCacheMap.set(deviceId, { learnedIds: [] });
  }
  return npcCacheMap.get(deviceId);
}

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

  // Guard chống re-entry: nếu device đang xử lý (delay dài) thì bỏ qua
  if (busyDevices.has(deviceId)) return;
  busyDevices.add(deviceId);

  try {

  const injector = new PacketInjector(session);
  const mapId = info.mapId;
  const isBattlefield = [44, 375, 376, 377, 580].includes(mapId);
  const isCity = [1, 11, 37, 78, 162, 176].includes(mapId); // Explicitly check Phượng Tường, Thành Đô, Biện Kinh, Tương Dương, Đại Lý, Dương Châu
  
  let isStagingArea = [323, 324, 325, 379, 382, 972].includes(mapId);

  // 1. Kiểm tra trạng thái chết (HP <= 0)
  if (info.hp !== undefined && info.hp <= 0) {
    sendLog(`[${deviceId}] 💀 Phát hiện nhân vật đã chết (HP = 0). Đang hồi sinh...`, 'warn');
    try {
        await session.callRpc('closeDialogPopups').catch(() => {});
        await session.callRpc('sendPacket', 232, '');
        await session.callRpc('closeDialogPopups').catch(() => {});
        sendLog(`[${deviceId}] ✅ Đã gửi hồi sinh.`, 'success');
    } catch(e) {
        sendLog(`[${deviceId}] ❌ Lỗi hồi sinh: ${e.message}`, 'error');
    }
    return; // Dừng các hành động khác để chờ vòng lặp sau (sau khi đã đổi map)
  }

  // 2. Báo Danh (Ngoại thành -> Điểm báo danh)
  if (isCity) {
    sendLog(`[${deviceId}] Đang ở ngoài thành. Đang tìm Chiêu Binh Quân / Mộ Binh Quan để đăng ký...`, 'info');
    try {
      let cache = npcCacheMap.get(deviceId);
      
      // Dùng cache.baodanhId riêng biệt, KHÔNG dùng learnedIds[0] (tránh lấy nhầm ID Quân Nhu/Trinh Sát)
      let npcBaodanh = (cache && cache.baodanhId) ? cache.baodanhId : null;

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
      let cache = ensureCache(deviceId);
      
      let quanNhuId = cache.quanNhuId || null;
      let trinhSatId = cache.trinhSatId || null;
      const campValue = (info && info.campValue) ? info.campValue : 1;

      // Reset cache nếu phe đã đổi (cùng map khác phe = NPC khác)
      if (cache.campValue !== campValue) {
        cache.campValue = campValue;
        cache.quanNhuId = null;
        cache.trinhSatId = null;
        sendLog(`[${deviceId}] 🔄 Phát hiện đổi phe (${campValue === 2 ? 'Kim' : 'Tống'}). Reset NPC cache để học lại.`, 'info');
      }

      // Fallback từ DB nếu cache rỗng — chọn đúng phe (Tống/Kim)
      if ((!quanNhuId || !trinhSatId)) {
          const pair = getNpcPair(mapId, campValue);
          if (pair) {
              if (!quanNhuId && pair.quanNhu) quanNhuId = pair.quanNhu;
              if (!trinhSatId && pair.trinhSat) trinhSatId = pair.trinhSat;
              if (quanNhuId) cache.quanNhuId = quanNhuId;
              if (trinhSatId) cache.trinhSatId = trinhSatId;
              if (quanNhuId || trinhSatId) {
                  const factionName = campValue === 2 ? 'Kim' : 'Tống';
                  sendLog(`[${deviceId}] Đã nạp NPC ${factionName} cho map ${mapId} từ Database!`, 'info');
              }
          }
      }

      // Auto-scan: tự động quét NPC gần đó để tìm Quân Nhu & Trinh Sát
      if (!quanNhuId || !trinhSatId) {
          try {
              const npcNamesRes = await session.callRpc('getNearNpcNames');
              if (npcNamesRes && npcNamesRes.ok && npcNamesRes.npcMap) {
                  for (const [npcId, npcName] of Object.entries(npcNamesRes.npcMap)) {
                      const lowerName = (npcName || '').toLowerCase();
                      if (!quanNhuId && (lowerName.includes('quân nhu') || lowerName.includes('quan nhu'))) {
                          quanNhuId = npcId;
                          cache.quanNhuId = npcId;
                          updateNpcId(mapId, campValue, 'quanNhu', npcId);
                          sendLog(`[${deviceId}] 🔍 Auto-scan: tìm thấy Quân Nhu ID=${npcId} (${npcName})`, 'success');
                      } else if (!trinhSatId && (lowerName.includes('trinh sát') || lowerName.includes('trinh sat'))) {
                          trinhSatId = npcId;
                          cache.trinhSatId = npcId;
                          updateNpcId(mapId, campValue, 'trinhSat', npcId);
                          sendLog(`[${deviceId}] 🔍 Auto-scan: tìm thấy Trinh Sát ID=${npcId} (${npcName})`, 'success');
                      }
                      if (quanNhuId && trinhSatId) break; // Đủ cả 2 rồi thì dừng
                  }
              }
          } catch(e) {
              // Auto-scan fail → fall through to warning
          }
      }
      
      if (quanNhuId || trinhSatId) {
        // Đóng mọi popup trước khi tương tác NPC
        await session.callRpc('closeDialogPopups').catch(() => {});
        await new Promise(r => setTimeout(r, 200));

        // Kiểm tra số lượng Ngũ Hoa Ngọc Lộ Hoàn (thuốc máu)
        let needHeal = true;
        try {
            const itemsRes = await session.callRpc('getInventoryItems');
            if (itemsRes && itemsRes.ok && itemsRes.items) {
                let potionCount = 0;
                for (const item of itemsRes.items) {
                    const name = (item.name || '').toLowerCase();
                    if (name.includes('ngũ hoa') || name.includes('ngu hoa')) {
                        potionCount += (item.count || 0);
                    }
                }
                if (potionCount >= 20) {
                    needHeal = false;
                    sendLog(`[${deviceId}] 💊 Còn ${potionCount} bình Ngũ Hoa → bỏ qua Quân Nhu, ra trận luôn.`, 'info');
                } else {
                    sendLog(`[${deviceId}] 💊 Chỉ còn ${potionCount} bình → nhận thêm từ Quân Nhu.`, 'warn');
                }
            }
        } catch(e) {}

        // 1. Tương tác với NPC Quân Nhu (chỉ khi cần)
        if (needHeal && quanNhuId) {
          sendLog(`[${deviceId}] 🎒 Đang tương tác NPC Quân Nhu (${quanNhuId})...`, 'info');
          await session.callRpc('remoteNpcDialogue', quanNhuId);
          await new Promise(r => setTimeout(r, 800));
          
          sendLog(`[${deviceId}] Nhận thuốc từ Quân Nhu...`, 'info');
          await session.callRpc('selectDialogOption', 0);
          await new Promise(r => setTimeout(r, 400));
          
          await session.callRpc('sendPacket', 232, '');
          await new Promise(r => setTimeout(r, 400));
        } else if (!needHeal) {
          sendLog(`[${deviceId}] ⏭️ Đủ thuốc, bỏ qua Quân Nhu.`, 'info');
        }

        // Buff trấn phái giữa Quân Nhu và Trinh Sát (buff trước khi vào trận)
        const sect = info.sect !== undefined ? info.sect : -1;
        const sectSkillMap = {
            0: 102, 1: 111, 2: 129, 3: 139, 4: 159,
            5: 109, 6: 179, 7: 189, 8: 209, 9: 219
        };
        const buffSkillId = sectSkillMap[sect];
        if (buffSkillId && buffSkillId > 1) {
            sendLog(`[${deviceId}] ⚡ Buff trấn phái (ID: ${buffSkillId}) trước khi ra trận...`, 'success');
            await injector.sendDoSkillTargetPosition(buffSkillId, info.x || 0, info.y || 0);
            await new Promise(r => setTimeout(r, 400));
        }
        
        // 2. Tương tác với NPC Trinh Sát sau
        if (trinhSatId) {
          // Clear target cũ: tắt auto + cast skill tại chỗ để hủy lock mục tiêu
          await injector.sendApplyAutoplayProfile(false, "");
          await new Promise(r => setTimeout(r, 200));
          await injector.sendDoSkillTargetPosition(1, info.x || 0, info.y || 0);
          await new Promise(r => setTimeout(r, 300));
          sendLog(`[${deviceId}] 🧹 Đã xóa target cũ.`, 'info');
          
          if (delay > 0) {
              sendLog(`[${deviceId}] Chờ ${delay/1000} giây trước khi ra trận...`, 'info');
              await new Promise(r => setTimeout(r, delay));
          }
          
          sendLog(`[${deviceId}] ⚔️ Đang tương tác NPC Trinh Sát (${trinhSatId})...`, 'info');
          await session.callRpc('remoteNpcDialogue', trinhSatId);
          await new Promise(r => setTimeout(r, 800));

          let optionIndex = 0;
          if (side === 'jin') {
              optionIndex = 1; // Chọn phe Kim (Dòng 2)
          } else if (side === 'auto') {
              if (info && info.campValue === 2) {
                  optionIndex = 1;
              }
          }
          
          sendLog(`[${deviceId}] Gửi lệnh chọn Option ${optionIndex} cho NPC Trinh Sát (${trinhSatId})...`, 'info');
          await session.callRpc('selectDialogOption', optionIndex);
          await new Promise(r => setTimeout(r, 400));

          // 3. Tự động sử dụng Phi Tốc Hoàn, Lệnh Bài, Chiến Cổ (Lắc)
          if (lacs && lacs.length > 0) {
              sendLog(`[${deviceId}] 🎒 Đang quét hành trang để sử dụng Lắc/Vật phẩm hỗ trợ...`, 'info');
              const itemsRes = await session.callRpc('getInventoryItems');
              if (itemsRes && itemsRes.ok && itemsRes.items) {
                  for (const lacValue of lacs) {
                      let matchedItem = null;
                      if (lacValue === '45') { // Phi Tốc Hoàn
                          matchedItem = itemsRes.items.find(item => item.name.toLowerCase().includes("phi tốc") || item.name.toLowerCase().includes("phi toc"));
                      } else if (lacValue === '51') { // Lệnh Bài
                          matchedItem = itemsRes.items.find(item => item.name.toLowerCase().includes("lệnh bài") || item.name.toLowerCase().includes("lenh bai"));
                      } else if (lacValue === '50') { // Chiến Cổ
                          matchedItem = itemsRes.items.find(item => item.name.toLowerCase().includes("chiến cổ") || item.name.toLowerCase().includes("chien co") || item.name.toLowerCase().includes("trống") || item.name.toLowerCase().includes("trong"));
                      }

                      if (matchedItem) {
                          sendLog(`[${deviceId}] ⚡ Sử dụng vật phẩm hỗ trợ: ${matchedItem.name} (Index: ${matchedItem.index})`, 'success');
                          await session.callRpc('useItem', matchedItem.index);
                          await new Promise(r => setTimeout(r, 600)); // Chờ thời gian sử dụng
                      } else {
                          sendLog(`[${deviceId}] ⚠️ Cảnh báo: Không tìm thấy vật phẩm thích hợp trong rương cho lựa chọn này.`, 'warn');
                      }
                  }
              }
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
        sendLog(`[${deviceId}] ⚠️ CHƯA HỌC ĐƯỢC ID NPC! Hãy click tay vào "Quân Nhu" và "Mã Binh Quan / Trinh Sát" 1 lần để tool ghi nhớ!`, 'warn');
        return; // Dừng lại chờ người dùng click
      }
    } catch(e) {
      sendLog(`[${deviceId}] Lỗi Auto Tống Kim: ${e.message}`, 'error');
    }
  }

  } finally {
    busyDevices.delete(deviceId);
  }
}

module.exports = {
  autoTongKimLoop,
  npcCacheMap,
  ensureCache
};
