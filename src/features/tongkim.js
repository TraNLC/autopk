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

function findSharedNpcIds(deviceId, mapId, campValue, isStaging) {
  for (const [otherDeviceId, otherCache] of npcCacheMap.entries()) {
    if (otherDeviceId === deviceId) continue;
    if (otherCache.lastMapId === mapId || otherCache.mapId === mapId) {
      if (isStaging) {
        if (otherCache.campValue === campValue) {
          if (otherCache.trinhSatId || otherCache.quanNhuId) {
            return {
              trinhSatId: otherCache.trinhSatId,
              quanNhuId: otherCache.quanNhuId
            };
          }
        }
      } else {
        if (otherCache.baodanhId) {
          return {
            baodanhId: otherCache.baodanhId
          };
        }
      }
    }
  }
  return null;
}

/**
 * Auto Tống Kim loop — được gọi từ loop chính trong main.js
 */
async function autoTongKimLoop(deviceId, session, info, _side, _lacs, sendLog, autoBaoDanh) {
  if (!session || !info) return;
  if (busyDevices.has(deviceId)) return;
  busyDevices.add(deviceId);

  try {
    const injector = new PacketInjector(session);
    const mapId    = info.mapId;
    
    // ── 0. KIỂM TRA BÁO DANH TRONG MAP 324 (PHÒNG CHỜ CHÍNH VÀO PHÒNG CHUẨN BỊ) ──
    if (mapId === 324) {
      if (autoBaoDanh !== false) {
        const { checkAndBaoDanhStaging } = require('./baodanh');
        await checkAndBaoDanhStaging(deviceId, session, info, _side, sendLog);
      }
      return; // Tuyệt đối không quét RAM, không gọi Trình Sát / Quân Nhu ở map 324
    }

    const BATTLE_MAPS  = [44, 375, 376, 377, 580, 581, 868, 869, 870, 879, 880, 881, 883, 884, 885, 902, 903, 904, 988];
    const STAGING_MAPS = [323, 325, 379, 382, 972, 973, 974];
    const CITY_MAPS    = [1, 11, 37, 78, 162, 176];

    const isBattlefield = BATTLE_MAPS.includes(mapId);
    const isStagingArea = STAGING_MAPS.includes(mapId);
    const isCity        = CITY_MAPS.includes(mapId);

    // ── 1. HOI SINH KHI CHET ─────────────────────────────────────────────
    if (info.hp !== undefined && info.hp <= 0) {
      sendLog(`[${deviceId}] Nhan vat da chet. Dang hoi sinh...`, 'warn');
      try {
        await session.callRpc('closeDialogPopups').catch(() => {});
        await session.callRpc('sendPacket', 232, '');
        await session.callRpc('closeDialogPopups').catch(() => {});
        sendLog(`[${deviceId}] OK da gui hoi sinh.`, 'success');
      } catch(e) {
        sendLog(`[${deviceId}] Loi hoi sinh: ${e.message}`, 'error');
      }
      return;
    }

    // ── 2. BAO DANH O THANH ──────────────────────────────────────────────
    if (isCity) {
      const cache = npcCacheMap.get(deviceId);
      if (cache && !cache.baodanhId) {
        const shared = findSharedNpcIds(deviceId, mapId, campValue, false);
        if (shared && shared.baodanhId) {
          cache.baodanhId = shared.baodanhId;
        }
      }
      const baodanhId = cache && cache.baodanhId;
      if (!baodanhId) {
        sendLog(`[${deviceId}] Chưa có ID NPC Báo Danh. Hãy click tay vào Chiêu Binh / Mộ Binh 1 lần.`, 'warn');
        return;
      }
      sendLog(`[${deviceId}] Đang thực hiện báo danh Tống Kim...`, 'info');
      try {
        await injector.sendNpcDialogue(baodanhId);
        await new Promise(r => setTimeout(r, 500));
        await injector.sendNpcSelect(0);
        await new Promise(r => setTimeout(r, 1000));
        sendLog(`[${deviceId}] Báo danh Tống Kim thành công!`, 'success');
      } catch(e) {
        sendLog(`[${deviceId}] Lỗi báo danh: ${e.message}`, 'error');
      }
      return;
    }

    // ── 3. KHU VUC STAGING (RA TRAN) ────────────────────────────────────
    if (isStagingArea) {
      try {
        // ── 0. KIỂM TRA BÁO DANH VÀO SÂN (13h, 15h, 20h, 23h) ──
        if (autoBaoDanh !== false) {
          const { checkAndBaoDanhStaging } = require('./baodanh');
          const didBaoDanh = await checkAndBaoDanhStaging(deviceId, session, info, _side, sendLog);
          if (didBaoDanh) {
            return; // Tạm dừng để chờ chuyển map
          }
        }

        const cache = ensureCache(deviceId);
        const campValue = (info && info.campValue) ? info.campValue : 1;

        // Reset cache khi doi phe
        if (cache.campValue !== undefined && cache.campValue !== campValue) {
          cache.trinhSatId = null;
          cache.learnedIds = [];
        }
        cache.campValue = campValue;

        // Reset thoi gian khi vao map moi
        if (cache.lastMapId !== mapId) {
          cache.enterStagingTime = Date.now();
          cache._lastHealTime = 0; // Đảm bảo lấy thuốc ngay lập tức khi mới vào map
        }
        cache.lastMapId = mapId;

        let trinhSatId = cache.trinhSatId || null;
        let quanNhuId  = cache.quanNhuId || null;

        // Thử lấy ID từ các cửa sổ khác cùng bản đồ + cùng phe
        if (!trinhSatId || !quanNhuId) {
          const shared = findSharedNpcIds(deviceId, mapId, campValue, true);
          if (shared) {
            if (!trinhSatId && shared.trinhSatId) {
              trinhSatId = shared.trinhSatId;
              cache.trinhSatId = shared.trinhSatId;
            }
            if (!quanNhuId && shared.quanNhuId) {
              quanNhuId = shared.quanNhuId;
              cache.quanNhuId = shared.quanNhuId;
            }
          }
        }

        // Quét RAM tìm cả Trình Sát và Quân Nhu dynamically nếu một trong hai chưa có
        if (!trinhSatId || !quanNhuId) {
          try {
            const npcNames = await session.callRpc('getNearNpcNames');
            if (npcNames && npcNames.ok && npcNames.npcMap) {
              for (const [npcId, npcName] of Object.entries(npcNames.npcMap)) {
                const lower = String(npcName).toLowerCase();
                
                // So khớp Trình Sát
                if (lower.includes('trinh') || lower.includes('trình')) {
                  if (!trinhSatId) {
                    trinhSatId = npcId;
                    cache.trinhSatId = npcId;
                  }
                }
                // So khớp Quân Nhu
                else if (lower.includes('nhu') || lower.includes('quan y') || lower.includes('quân y')) {
                  if (!quanNhuId) {
                    quanNhuId = npcId;
                    cache.quanNhuId = npcId;
                  }
                }
              }
            }
          } catch(e) {}
        }

        // ── Thống kê thời gian giãn cách 2.5s mỗi lần gọi Trình Sát để tránh bị rate-limit ──
        const now = Date.now();
        const callInterval = 2500;
        if (cache._lastCallTime && (now - cache._lastCallTime) < callInterval) {
          return; // Chưa tới lượt
        }
        cache._lastCallTime = now;

        if (quanNhuId && (!cache._lastHealTime || (now - cache._lastHealTime) > 3 * 60 * 1000)) {
          sendLog(`[${deviceId}] [Ra Trận] Đang nhận thuốc Quân Nhu...`, 'info');
          try {
            await injector.sendNpcDialogue(quanNhuId);
            await new Promise(r => setTimeout(r, 800));
            await injector.sendNpcSelect(0);
            await new Promise(r => setTimeout(r, 400));
            await session.callRpc('sendPacket', 232, '');
            await new Promise(r => setTimeout(r, 400));
            sendLog(`[${deviceId}] [Ra Trận] Nhận thuốc Quân Nhu thành công!`, 'success');
          } catch(e) {
            sendLog(`[${deviceId}] [Ra Trận] Lỗi nhận thuốc: ${e.message}`, 'error');
          }
          cache._lastHealTime = now;

          try { await session.callRpc('closeDialogPopups'); } catch(e) {}
          await new Promise(r => setTimeout(r, 200));
        }

        // Buff tran phai
        try {
          const sect = info.sect !== undefined ? info.sect : -1;
          const sectSkillMap = { 0: 102, 1: 111, 2: 129, 3: 139, 4: 159, 5: 109, 6: 179, 7: 189, 8: 209, 9: 219 };
          const buffSkillId = sectSkillMap[sect];
          if (buffSkillId && buffSkillId > 1) {
            await injector.sendDoSkillTargetPosition(buffSkillId, info.x || 0, info.y || 0);
            await new Promise(r => setTimeout(r, 400));
          }
        } catch(e) {}

        // Dong popup truoc khi goi Trinh Sat
        try { await session.callRpc('closeDialogPopups'); } catch(e) {}
        await new Promise(r => setTimeout(r, 200));

        // Goi Trinh Sat -> chon phe vao chien truong (0: Tong | 1: Kim)
        try {
          let battleOption = 0;
          if (_side === 'jin') {
            battleOption = 1;
          } else if (_side === 'song') {
            battleOption = 0;
          } else {
            battleOption = (campValue === 2) ? 1 : 0;
          }
          sendLog(`[${deviceId}] [Ra Trận] Đang qua cửa Trình Sát ra chiến trường...`, 'info');
          await injector.sendNpcDialogue(trinhSatId);
          await new Promise(r => setTimeout(r, 500));
          await injector.sendNpcSelect(battleOption);
          await new Promise(r => setTimeout(r, 600)); // Đợi 0.6 giây sau tương tác NPC
          try {
            await session.callRpc('closeDialogPopups'); // Đóng popup NPC, không che màn hình
          } catch(err) {}
          await new Promise(r => setTimeout(r, 400)); // Đợi nốt cự ly đồng bộ map
          try {
            await session.callRpc('clearFocus');
          } catch(err) {}
        } catch(e) {
          sendLog(`[${deviceId}] [Ra Trận] Lỗi qua cửa Trình Sát: ${e.message}`, 'error');
        }

        // Buff tran phai sau khi ra san (sau khi qua cua Trinh Sat)
        try {
          const sect = info.sect !== undefined ? info.sect : -1;
          const sectSkillMap = { 0: 102, 1: 111, 2: 129, 3: 139, 4: 159, 5: 109, 6: 179, 7: 189, 8: 209, 9: 219 };
          const buffSkillId = sectSkillMap[sect];
          if (buffSkillId && buffSkillId > 1) {
            sendLog(`[${deviceId}] [Ra Trận] Đang thực hiện buff hỗ trợ...`, 'info');
            await injector.sendDoSkillTargetPosition(buffSkillId, info.x || 0, info.y || 0);
            await new Promise(r => setTimeout(r, 400));
          }
        } catch(e) {}

      } catch(e) {
        sendLog(`[${deviceId}] Lỗi Auto Tống Kim: ${e.message}`, 'error');
      }
    }

  } finally {
    busyDevices.delete(deviceId);
  }
}

async function collectPoints(deviceId, session, sendLog) {
  const cache = ensureCache(deviceId);
  
  try {
    sendLog(`[${deviceId}] [Gom Điểm] Bước 1: Bắt đầu gom điểm tích lũy...`, 'info');
    const injector = new PacketInjector(session);
    
    // Step 1: Quét tìm NPC Mộ binh / Chiêu binh / Quân nhu
    const npcNamesRes = await session.callRpc('getNearNpcNames');
    let npcId = null;
    let npcName = '';
    
    if (npcNamesRes && npcNamesRes.ok && npcNamesRes.npcMap) {
      for (const [id, name] of Object.entries(npcNamesRes.npcMap)) {
        const lower = String(name).toLowerCase();
        if (lower.includes('mộ binh') || lower.includes('chieu binh') || lower.includes('chiêu binh') || lower.includes('quân nhu') || lower.includes('quan nhu')) {
          npcId = id;
          npcName = name;
          break;
        }
      }
    }
    
    // Fallback nếu không quét được NPC dynamically
    if (!npcId) {
      const info = await session.callRpc('getPlayerInfo');
      const camp = (info && info.campValue) ? info.campValue : 1;
      if (camp === 2) {
        npcId = "23"; // Mặc định Kim
        npcName = "NPC Chieu Binh Quan (Kim)";
      } else {
        npcId = "28"; // Mặc định Tong
        npcName = "NPC Mo Binh Quan (Tong)";
      }
    }
    
    const info = await session.callRpc('getPlayerInfo');
    const camp = (info && info.campValue) ? info.campValue : 1;
    
    // Động xác định quy trình mở shop dựa theo tên NPC
    const lowerNpcName = npcName.toLowerCase();
    const isStagingNpc = lowerNpcName.includes('quốc') || lowerNpcName.includes('quoc');
    
    if (isStagingNpc) {
      // NPC ở map Staging (Tống Quốc Quân nhu quan / Kim Quốc Quân nhu quan)
      // Mở shop trực tiếp bằng Option 1 trên màn hình đầu tiên
      sendLog(`[${deviceId}] [Gom Điểm] Bước 2: Tương tác với ${npcName} (Map chuẩn bị)...`, 'info');
      try { await session.callRpc('closeDialogPopups'); } catch(e) {}
      await new Promise(r => setTimeout(r, 400));
      await injector.sendNpcDialogue(npcId);
      await new Promise(r => setTimeout(r, 1000));
      
      cache.lastNpcShopKey = null; // Reset shopkey cũ
      await injector.sendNpcSelect(1); // Option 1: Mở shop
      await new Promise(r => setTimeout(r, 600));
    } else {
      // NPC ở Map 324 (Quân Nhu quan, Mộ binh quan, Chiêu binh quan)
      // Màn hình 1: Chọn Option 1 (Xem điểm tích lũy)
      // Màn hình 2: Chọn Option 0 (Mở shop)
      sendLog(`[${deviceId}] [Gom Điểm] Bước 2: Tương tác với ${npcName} (Map 324)...`, 'info');
      try { await session.callRpc('closeDialogPopups'); } catch(e) {}
      await new Promise(r => setTimeout(r, 400));
      await injector.sendNpcDialogue(npcId);
      await new Promise(r => setTimeout(r, 1000));
      
      await injector.sendNpcSelect(1); // Option 1: Xem điểm tích lũy
      await new Promise(r => setTimeout(r, 1000));
      
      cache.lastNpcShopKey = null; // Reset shopkey cũ
      await injector.sendNpcSelect(0); // Option 0: Mở shop
      await new Promise(r => setTimeout(r, 600));
    }
    
    // Đợi 400ms để shop UI hoàn toàn render
    await new Promise(r => setTimeout(r, 400));
    
    sendLog(`[${deviceId}] [Gom Điểm] Bước 3: Đang chọn vật phẩm Phiếu Tích Lũy Tống Kim...`, 'info');
    await session.callRpc('clickFirstShopItem');
    await new Promise(r => setTimeout(r, 800)); // Đợi popup Số lượng hiện lên
    
    sendLog(`[${deviceId}] [Gom Điểm] Đang gửi lệnh mua số lượng tối đa...`, 'info');
    await session.callRpc('buyActiveShopItem', 999);
    await new Promise(r => setTimeout(r, 800));
    
    // Đóng toàn bộ popup sau khi hoàn tất
    try { await session.callRpc('closeDialogPopups'); } catch(e) {}
    
    sendLog(`[${deviceId}] [Gom Điểm] Bước 4: Hoàn tất gom điểm tích lũy thành công!`, 'success');
  } catch (err) {
    sendLog(`[${deviceId}] [Gom Điểm] Lỗi khi thực hiện gom điểm: ${err.message}`, 'error');
  }
}

module.exports = {
  autoTongKimLoop,
  npcCacheMap,
  ensureCache,
  collectPoints
};
