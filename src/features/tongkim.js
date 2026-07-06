const { PacketInjector } = require('../packet-injector');
const { getNpcPair } = require('./tongkim-data');

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
async function autoTongKimLoop(deviceId, session, info, _side, lacs, delay, sendLog) {
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
        await injector.sendNpcDialogue(baodanhId);
        await new Promise(r => setTimeout(r, 500));
        await injector.sendNpcSelect(0);
        await new Promise(r => setTimeout(r, 1000));
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

        // ── Throttle: 2.5s bình thường, mỗi mốc 5 phút gắn cờ gọi 5s một lần ──
        const now = Date.now();
        const elapsed = now - (cache.enterStagingTime || now);
        const minutesPassed = Math.floor(elapsed / (5 * 60 * 1000));

        // Cứ mỗi mốc 5 phút mới: đặt cờ _slowTickOnce để lần này gọi 5s
        // Sau lần đó reset cờ, quay về 2.5s
        if (minutesPassed > (cache._lastSlowMinutes || 0)) {
          cache._slowTickOnce = true;
          cache._lastSlowMinutes = minutesPassed;
        }

        const callInterval = cache._slowTickOnce ? 5000 : 2500;
        if (cache._lastCallTime && (now - cache._lastCallTime) < callInterval) {
          return; // Chưa tới lượt
        }
        cache._lastCallTime = now;

        if (cache._slowTickOnce) {
          cache._slowTickOnce = false; // Reset ngay sau khi vượt qua throttle
          sendLog(`[${deviceId}] ⏳ Chạm mốc ${minutesPassed * 5} phút. Giãn cách 5s lần này để reset rate-limit...`, 'warn');
        }

        // Đóng popup cũ trước khi mở dialog mới
        await session.callRpc('closeDialogPopups').catch(() => {});
        await new Promise(r => setTimeout(r, 200));

        // ── Nhận máu/mana từ Quân Nhu ──
        // Kiểm tra số lượng Ngũ Hoa Ngọc Lộ Hoàn, nếu >= 20 thì bỏ qua
        let quanNhuId = cache.quanNhuId || null;
        let needHeal = true;

        // Học ID Quân Nhu từ DB nếu chưa có
        if (!quanNhuId) {
          const pair = getNpcPair(mapId, campValue);
          if (pair && pair.quanNhu) {
            quanNhuId = pair.quanNhu;
            cache.quanNhuId = quanNhuId;
            sendLog(`[${deviceId}] 📋 Nạp Quân Nhu ID=${quanNhuId} từ Database.`, 'info');
          }
        }

        if (quanNhuId) {
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
                sendLog(`[${deviceId}] 💊 Còn ${potionCount} bình Ngũ Hoa → bỏ qua Quân Nhu.`, 'info');
              } else {
                sendLog(`[${deviceId}] 💊 Chỉ còn ${potionCount} bình → nhận thêm từ Quân Nhu.`, 'info');
              }
            }
          } catch(e) { /* ignore */ }

          if (needHeal) {
            sendLog(`[${deviceId}] 🎒 Gọi Quân Nhu (ID=${quanNhuId})...`, 'info');
            await injector.sendNpcDialogue(quanNhuId);
            await new Promise(r => setTimeout(r, 800));
            await injector.sendNpcSelect(0);
            await new Promise(r => setTimeout(r, 400));
            await session.callRpc('sendPacket', 232, '');
            await new Promise(r => setTimeout(r, 400));
            sendLog(`[${deviceId}] ✅ Đã nhận thuốc từ Quân Nhu!`, 'success');

            await session.callRpc('closeDialogPopups').catch(() => {});
            await new Promise(r => setTimeout(r, 200));
          }
        }

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

        // Gọi Trinh Sát → chọn phe vào chiến trường (0: Tống | 1: Kim)
        let battleOption = 0;
        if (_side === 'jin') {
          battleOption = 1;
        } else if (_side === 'song') {
          battleOption = 0;
        } else {
          // auto: dùng campValue từ game
          battleOption = (campValue === 2) ? 1 : 0;
        }
        sendLog(`[${deviceId}] ⚔️ Gọi Trinh Sát (ID=${trinhSatId}) → Phe ${battleOption === 1 ? 'Kim' : 'Tống'} (Option ${battleOption})...`, 'info');
        await injector.sendNpcDialogue(trinhSatId);
        await new Promise(r => setTimeout(r, 500));
        await injector.sendNpcSelect(battleOption);
        await new Promise(r => setTimeout(r, 1000));

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
