const { PacketInjector } = require('../packet-injector');
const { getNpcPair, updateNpcId } = require('./tongkim-data');

const npcCacheMap = new Map(); // deviceId -> { mapId, campValue, trinhSatId, baodanhId, learnedIds, enterStagingTime, _lastCallTime }
const busyDevices = new Set();

function ensureCache(deviceId) {
  if (!npcCacheMap.has(deviceId)) {
    npcCacheMap.set(deviceId, { learnedIds: [] });
  }
  return npcCacheMap.get(deviceId);
}

/**
 * Auto Tống Kim loop — được gọi từ loop chính trong main.js
 */
async function autoTongKimLoop(deviceId, session, info, side, lacs, delay, sendLog) {
  if (!session || !info) return;
  if (busyDevices.has(deviceId)) return;
  busyDevices.add(deviceId);

  try {
    const injector = new PacketInjector(session);
    const mapId    = info.mapId;
    const BATTLE_MAPS  = [44, 375, 376, 377, 580];
    const STAGING_MAPS = [323, 324, 325, 379, 382, 972];
    const CITY_MAPS    = [1, 11, 37, 78, 162, 176];

    const isBattlefield = BATTLE_MAPS.includes(mapId);
    const isStagingArea = STAGING_MAPS.includes(mapId);
    const isCity        = CITY_MAPS.includes(mapId);

    // ── 1. HỒI SINH KHI CHẾT ─────────────────────────────────────────────
    if (info.hp !== undefined && info.hp <= 0) {
      sendLog(`[${deviceId}] 💀 Nhân vật đã chết. Đang hồi sinh...`, 'warn');
      try {
        await session.callRpc('closeDialogPopups').catch(() => {});
        await session.callRpc('sendPacket', 232, '');
        await session.callRpc('closeDialogPopups').catch(() => {});
        sendLog(`[${deviceId}] ✅ Đã gửi hồi sinh.`, 'success');
      } catch(e) {
        sendLog(`[${deviceId}] ❌ Lỗi hồi sinh: ${e.message}`, 'error');
      }
      return;
    }

    // ── 2. BÁO DANH Ở THÀNH ──────────────────────────────────────────────
    if (isCity) {
      const cache = npcCacheMap.get(deviceId);
      const baodanhId = cache && cache.baodanhId;
      if (!baodanhId) {
        sendLog(`[${deviceId}] ⚠️ Chưa có ID NPC Báo Danh. Hãy click tay vào Chiêu Binh Quân / Mộ Binh Quan 1 lần.`, 'warn');
        return;
      }
      sendLog(`[${deviceId}] 📋 Gọi NPC Báo Danh (ID: ${baodanhId})...`, 'info');
      try {
        // Gọi Trinh Sát bằng Packet Injection để tránh kẹt UI hoặc animation lock
        await injector.sendNpcDialogue(baodanhId);
        await new Promise(r => setTimeout(r, 500));
        await injector.sendNpcSelect(0);
        await new Promise(r => setTimeout(r, 1000)); // Chờ 1s để server xử lý dịch chuyển

        // Dùng map cố định ID skill 9x để xuất chiêu cancel target ngay lập tức
        let targetSkill = 1;
        const sect = info.sect !== undefined ? info.sect : -1;
        const sectSkill9xMap = {
          0: 104, // Thiếu Lâm (Đạt Ma)
          1: 114, // Thiên Vương (Truy Tinh)
          2: 132, // Đường Môn (Bạo Vũ)
          3: 142, // Ngũ Độc (Bách Độc)
          4: 152, // Nga Mi (Phong Sương)
          5: 172, // Thúy Yên (Băng Tâm Tiên Tử)
          6: 182, // Cái Bang (Kháng Long)
          7: 192, // Thiên Nhẫn (Vân Long / Thiên Ngoại)
          8: 204, // Võ Đang (Thiên Địa)
          9: 215  // Côn Lôn (Lôi Động)
        };
        
        if (sect !== -1 && sectSkill9xMap[sect]) {
          targetSkill = sectSkill9xMap[sect];
        }

        sendLog(`[${deviceId}] ⚡ Xuất chiêu 9x (ID ${targetSkill}) để giải phóng target Trinh Sát...`, 'info');
        await injector.sendDoSkillTargetPosition(targetSkill, info.x || 0, info.y || 0);

      } catch(e) {
        sendLog(`[${deviceId}] Lỗi báo danh: ${e.message}`, 'error');
      }
      return;
    }

    // ── 3. KHU VỰC STAGING (RA TRẬN) ──────────────────────────────────────
    if (isStagingArea) {
      try {
        const cache = ensureCache(deviceId);
        const campValue = (info && info.campValue) ? info.campValue : 1;

        // Reset cache khi đổi phe
        if (cache.campValue !== undefined && cache.campValue !== campValue) {
          cache.trinhSatId = null;
          cache.learnedIds = [];
          sendLog(`[${deviceId}] 🔄 Đổi phe → reset NPC cache.`, 'info');
        }
        cache.campValue = campValue;

        // Ghi nhận mốc thời gian bắt đầu vào staging để tính thời gian chờ
        if (!cache.enterStagingTime || cache.lastMapId !== mapId) {
          cache.enterStagingTime = Date.now();
        }
        cache.lastMapId = mapId;

        let trinhSatId = cache.trinhSatId || null;

        // Fallback từ DB
        if (!trinhSatId) {
          const pair = getNpcPair(mapId, campValue);
          if (pair && pair.trinhSat) {
            trinhSatId = pair.trinhSat;
            cache.trinhSatId = trinhSatId;
            sendLog(`[${deviceId}] 📋 Nạp Trinh Sát ID=${trinhSatId} từ Database.`, 'info');
          }
        }

        if (!trinhSatId) {
          sendLog(`[${deviceId}] ⚠️ Chưa có ID Trinh Sát. Hãy click tay vào NPC Trinh Sát 1 lần.`, 'warn');
          return;
        }

        // ── Tính toán khoảng giãn cách call (Không block loop chính) ─────────
        // Bình thường: gọi nhanh 2.5s / lần để vào trận.
        // Cứ mỗi mốc 5 phút (5p, 10p, 15p...): giãn cách 5s một lần duy nhất để reset rate-limit của server, sau đó tiếp tục 2.5s.
        const elapsed = Date.now() - (cache.enterStagingTime || Date.now());
        const minutesPassed = Math.floor(elapsed / (5 * 60 * 1000));
        
        let callInterval = 2500;
        let isSlowTick = false;

        if (minutesPassed > (cache.lastMinutesPassed || 0)) {
          callInterval = 5000;
          isSlowTick = true;
        }

        const now = Date.now();
        if (cache._lastCallTime && (now - cache._lastCallTime) < callInterval) {
          return; // Chưa tới lượt, thoát ngay để loop chạy các việc khác
        }
        cache._lastCallTime = now;

        if (isSlowTick) {
          cache.lastMinutesPassed = minutesPassed;
          sendLog(`[${deviceId}] ⏳ Chạm mốc ${minutesPassed * 5} phút dưỡng sức. Giãn cách lần này là 5s để chống dis...`, 'warn');
        } else {
          sendLog(`[${deviceId}] ⚔️ Gọi Trinh Sát giãn cách 2.5s/lần...`, 'success');
        }

        // Thực thi mở dialog
        await session.callRpc('closeDialogPopups').catch(() => {});
        await new Promise(r => setTimeout(r, 200));

        // Buff trấn phái
        const sect = info.sect !== undefined ? info.sect : -1;
        const sectSkillMap = { 0: 102, 1: 111, 2: 129, 3: 139, 4: 159, 5: 109, 6: 179, 7: 189, 8: 209, 9: 219 };
        const buffSkillId = sectSkillMap[sect];
        if (buffSkillId && buffSkillId > 1) {
          sendLog(`[${deviceId}] ⚡ Buff trấn phái (skill ${buffSkillId})...`, 'success');
          await injector.sendDoSkillTargetPosition(buffSkillId, info.x || 0, info.y || 0);
          await new Promise(r => setTimeout(r, 400));
        }

        // Lắc vật phẩm hỗ trợ
        if (lacs && lacs.length > 0) {
          const itemsRes = await session.callRpc('getInventoryItems');
          if (itemsRes && itemsRes.ok && itemsRes.items) {
            for (const lacValue of lacs) {
              let matchedItem = null;
              if (lacValue === '45') matchedItem = itemsRes.items.find(i => i.name.toLowerCase().includes('phi tốc') || i.name.toLowerCase().includes('phi toc'));
              else if (lacValue === '51') matchedItem = itemsRes.items.find(i => i.name.toLowerCase().includes('lệnh bài') || i.name.toLowerCase().includes('lenh bai'));
              else if (lacValue === '50') matchedItem = itemsRes.items.find(i => i.name.toLowerCase().includes('chiến cổ') || i.name.toLowerCase().includes('chien co'));
              if (matchedItem) {
                sendLog(`[${deviceId}] 🎒 Dùng: ${matchedItem.name}`, 'info');
                await session.callRpc('useItem', matchedItem.index);
                await new Promise(r => setTimeout(r, 400));
              }
            }
          }
        }

        // Chờ thêm nếu có config delay riêng
        if (delay > 0) {
          sendLog(`[${deviceId}] ⏳ Chờ ${delay / 1000}s trước khi ra trận...`, 'info');
          await new Promise(r => setTimeout(r, delay));
        }

        // Chọn option đúng theo phe (0: Tống | 1: Kim)
        const battleOption = (campValue === 2) ? 1 : 0;
        sendLog(`[${deviceId}] ⚔️ Gọi Trinh Sát (ID=${trinhSatId}) → Chọn Trận địa bên ${campValue === 2 ? 'Kim' : 'Tống'} (Option ${battleOption})...`, 'info');
        
        // Gọi Trinh Sát bằng Packet Injection để tránh bị kẹt UI hoặc animation lock do đánh skill
        await injector.sendNpcDialogue(trinhSatId);
        await new Promise(r => setTimeout(r, 500));
        await injector.sendNpcSelect(battleOption);
        await new Promise(r => setTimeout(r, 1000)); // Chờ tối thiểu 1s để server xử lý lệnh dịch chuyển

        // Dùng map cố định ID skill 9x để đánh 1 chiêu cancel target
        let targetSkill = 1;
        const sectSkill9xMap = {
          0: 104, // Thiếu Lâm (Đạt Ma)
          1: 114, // Thiên Vương (Truy Tinh)
          2: 132, // Đường Môn (Bạo Vũ)
          3: 142, // Ngũ Độc (Bách Độc)
          4: 152, // Nga Mi (Phong Sương)
          5: 172, // Thúy Yên (Băng Tâm Tiên Tử)
          6: 182, // Cái Bang (Kháng Long)
          7: 192, // Thiên Nhẫn (Vân Long / Thiên Ngoại)
          8: 204, // Võ Đang (Thiên Địa)
          9: 215  // Côn Lôn (Lôi Động)
        };
        
        if (sect !== -1 && sectSkill9xMap[sect]) {
          targetSkill = sectSkill9xMap[sect];
        }

        sendLog(`[${deviceId}] ⚡ Xuất chiêu 9x (ID ${targetSkill}) để cancel target Trinh Sát...`, 'info');
        await injector.sendDoSkillTargetPosition(targetSkill, info.x || 0, info.y || 0);

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
