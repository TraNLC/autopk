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
async function autoTongKimLoop(deviceId, session, info, _side, _lacs, sendLog, autoBaoDanh, autoThuoc, stopMaxScore, lacInterval) {
  if (!session || !info) return;
  if (busyDevices.has(deviceId)) return;
  busyDevices.add(deviceId);

  try {
    const injector = new PacketInjector(session);
    const mapId    = info.mapId;
    
    const mapNameLower = (info.mapName || '').toLowerCase();
    
    const BATTLE_MAPS  = [44, 375, 376, 377, 580, 581, 868, 869, 870, 879, 880, 881, 883, 884, 885, 902, 903, 904, 988];
    const STAGING_MAPS = [323, 324, 325, 379, 382, 972, 973, 974];
    const CITY_MAPS    = [1, 11, 37, 78, 162, 176];

    const isBattlefield = BATTLE_MAPS.includes(mapId) || (mapNameLower.includes('tống kim') && !mapNameLower.includes('danh'));
    const isStagingArea = STAGING_MAPS.includes(mapId) || mapNameLower.includes('báo danh') || mapNameLower.includes('bao danh');
    const isCity        = CITY_MAPS.includes(mapId) || mapNameLower.includes('tương dương') || mapNameLower.includes('ba lăng');

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

    // ── 1.5. SỬ DỤNG LẮC (BUFF) ───────────────────────────────────────────
    if (info.hp > 0 && _lacs && _lacs.length > 0) {
      const cache = ensureCache(deviceId);
      const nowTime = Date.now();
      const lacIntervalMs = (lacInterval || 5) * 1000;
      
      if (!cache._lastLacTime || (nowTime - cache._lastLacTime) >= lacIntervalMs) {
        try {
          const invRes = await session.callRpc('getInventoryItemsNoIl2cpp');
          if (invRes && invRes.ok && invRes.items) {
            let usedCount = 0;
            const usedParticulars = new Set();
            for (const item of invRes.items) {
               // Only use items that match the selected lacs and haven't been used in this cycle
               if (_lacs.includes(item.particular.toString()) && !usedParticulars.has(item.particular)) {
                 usedParticulars.add(item.particular);
                 sendLog(`[${deviceId}] [Buff] Dang su dung Item_${item.particular}...`, 'info');
                 await injector.sendPlayerUserItem(item.index);
                 await new Promise(r => setTimeout(r, 600));
                 usedCount++;
               }
            }
            if (usedCount > 0) {
              sendLog(`[${deviceId}] [Buff] Đã dùng ${usedCount} loại Lắc. (Chu kỳ ${lacInterval || 180}s)`, 'success');
            }
          }
        } catch(e) {
          sendLog(`[${deviceId}] [Buff] Lỗi sử dụng Lắc: ${e.message}`, 'error');
        }
        cache._lastLacTime = nowTime;
      }
    }

    // ── 2. BAO DANH O THANH ──────────────────────────────────────────────
    if (isCity) {
      return; // Bỏ qua tự động báo danh ở thành
    }

    // ── 3. KHU VUC STAGING (RA TRAN) ────────────────────────────────────
    if (isStagingArea) {
      try {
        // ── 0. KIỂM TRA BÁO DANH VÀO SÂN (13h, 15h, 20h, 23h) ──
        // Bỏ qua tự động báo danh ở đây, người dùng tự báo danh bằng tay

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
          cache._trinhSatReached = false; // Reset tốc biến để chạy lại khi vào map mới
        }
        cache.lastMapId = mapId;

        let trinhSatId = cache.trinhSatId || null;
        let quanNhuId  = cache.quanNhuId || null;

        // Thử lấy ID và tọa độ từ các cửa sổ khác cùng bản đồ + cùng phe
        if (!trinhSatId || !quanNhuId || !cache.trinhSatX) {
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
            if (!cache.trinhSatX && shared.trinhSatX) {
              cache.trinhSatX = shared.trinhSatX;
              cache.trinhSatY = shared.trinhSatY;
            }
          }
        }
        // Cố gắng tự học ID NPC xung quanh nếu chưa có
        if (!trinhSatId || !quanNhuId) {
            try {
                const npcNamesRes = await session.callRpc('getNearNpcNames');
                if (npcNamesRes && npcNamesRes.ok && npcNamesRes.npcMap) {
                    for (const [npcId, npcName] of Object.entries(npcNamesRes.npcMap)) {
                        const lower = String(npcName).toLowerCase();
                        if (lower.includes('trinh') || lower.includes('trình') || lower.includes('mã binh quan') || lower.includes('ma binh quan')) {
                            if (!trinhSatId) {
                                trinhSatId = npcId;
                                cache.trinhSatId = npcId;
                                sendLog(`[${deviceId}] [Staging] Da quet thay ID Trinh Sat tu vung nho: ${trinhSatId} (${npcName})`, 'success');
                            }
                        } else if (lower.includes('quân nhu') || lower.includes('quan nhu') || lower.includes('quan y') || lower.includes('quân y')) {
                            if (!quanNhuId) {
                                quanNhuId = npcId;
                                cache.quanNhuId = npcId;
                                sendLog(`[${deviceId}] [Staging] Da quet thay ID Quan Nhu tu vung nho: ${quanNhuId} (${npcName})`, 'success');
                            }
                        }
                    }
                }
            } catch (e) {
                sendLog(`[${deviceId}] [Staging] Loi khi quet RAM tim NPC: ${e.message}`, 'warn');
            }
        }

        // (Đoạn tốc biến cũ đã được chuyển xuống dưới logic Buff theo yêu cầu mới)





        // ── Thống kê thời gian giãn cách 2.5s (hoặc 5s sau mỗi 1 phút) ──
        const now = Date.now();
        
        // Khởi tạo mốc thời gian 5s ban đầu nếu chưa có
        if (!cache._lastFiveSecTime) {
          cache._lastFiveSecTime = now;
        }

        let callInterval = 2500;
        // Kiểm tra xem đã đến chu kỳ 1 phút để áp dụng giãn cách 5 giây chưa
        const isFiveSecTick = (now - cache._lastFiveSecTime) > 60 * 1000;

        if (isFiveSecTick) {
          callInterval = 5000; // Ép giãn cách lên 5s cho lần này
        }

        if (cache._lastCallTime && (now - cache._lastCallTime) < callInterval) {
          return; // Chưa tới lượt
        }

        // Cập nhật lại mốc 1 phút khi đã thỏa mãn và chuẩn bị gọi Trình Sát
        if (isFiveSecTick) {
          cache._lastFiveSecTime = now;
          sendLog(`[He Thong] Kich hoat gian cach 5s mot lan (het chu ky 1 phut, quay lai 2.5s)...`, 'info');
        }
        cache._lastCallTime = now;

        // Mac dinh luon nhan thuoc truoc khi qua cua Trinh Sat
        if (quanNhuId && (!cache._lastHealTime || (now - cache._lastHealTime) > 1 * 60 * 1000)) {
          sendLog(`[${deviceId}] [Ra Tran] Dang nhan thuoc Quan Nhu...`, 'info');
          try {
            await injector.sendNpcDialogue(quanNhuId);
            await new Promise(r => setTimeout(r, 800));
            await injector.sendNpcSelect(0);
            await new Promise(r => setTimeout(r, 400));
            await session.callRpc('sendPacket', 232, '');
            await new Promise(r => setTimeout(r, 400));
            sendLog(`[${deviceId}] [Ra Tran] Nhan thuoc Quan Nhu thanh cong!`, 'success');
          } catch(e) {
            sendLog(`[${deviceId}] [Ra Tran] Loi nhan thuoc: ${e.message}`, 'error');
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
          sendLog(`[${deviceId}] [Ra Tran] Dang qua cua Trinh Sat ra chien truong...`, 'info');
          
          if (cache.trinhSatX && cache.trinhSatY) {
              try {
                  await session.callRpc('clientMoveMemory', cache.trinhSatX, cache.trinhSatY);
                  await injector.sendStringData(`1|${Math.round(cache.trinhSatX)}|${Math.round(cache.trinhSatY)}`);
                  await new Promise(r => setTimeout(r, 300));
                  await injector.sendStringData(`2|${Math.round(cache.trinhSatX)}|${Math.round(cache.trinhSatY)}|2`);
                  
                  // Thêm gotoFindingPath RPC giống bên test-move
                  try {
                      await session.callRpc('gotoFindingPath', cache.trinhSatX, cache.trinhSatY, 20);
                  } catch(e) {}

                  sendLog(`[${deviceId}] [Staging] Đã tốc biến! Chờ 4s để ép load NPC...`, 'success');
                  await new Promise(r => setTimeout(r, 4000));
              } catch(e) {}
          }
          
          if (trinhSatId) {
              await injector.sendNpcDialogue(trinhSatId);
              sendLog(`[${deviceId}] [Ra Tran] Đã gọi Trinh Sát, chờ 5s...`, 'info');
              await new Promise(r => setTimeout(r, 5000));
              
              await injector.sendNpcSelect(battleOption);
              sendLog(`[${deviceId}] [Ra Tran] Đã chọn phe, chờ 5s chuyển map...`, 'info');
              await new Promise(r => setTimeout(r, 5000));
              try {
                await session.callRpc('clearFocus');
              } catch(err) {}
          } else {
              sendLog(`[${deviceId}] [Ra Tran] Chưa thấy ID NPC Trinh Sat, đợi server sync...`, 'warn');
          }
        } catch(e) {
          sendLog(`[${deviceId}] [Ra Tran] Loi qua cua Trinh Sat: ${e.message}`, 'error');
        }

        // Buff tran phai sau khi ra san (sau khi qua cua Trinh Sat)
        try {
          const sect = info.sect !== undefined ? info.sect : -1;
          const sectSkillMap = { 0: 102, 1: 111, 2: 129, 3: 139, 4: 159, 5: 109, 6: 179, 7: 189, 8: 209, 9: 219 };
          const buffSkillId = sectSkillMap[sect];
          if (buffSkillId && buffSkillId > 1) {
            sendLog(`[${deviceId}] [Ra Tran] Dang thuc hien buff ho tro...`, 'info');
            await injector.sendDoSkillTargetPosition(buffSkillId, info.x || 0, info.y || 0);
            await new Promise(r => setTimeout(r, 400));
          }
        } catch(e) {}

      } catch(e) {
        sendLog(`[${deviceId}] Loi Auto Tong Kim: ${e.message}`, 'error');
      }
    }

  } finally {
    busyDevices.delete(deviceId);
  }
}

async function collectPoints(deviceId, session, sendLog) {
  const cache = ensureCache(deviceId);
  
  try {
    sendLog(`[${deviceId}] [Gom Diem] Buoc 1: Bat dau gom diem tich luy...`, 'info');
    const injector = new PacketInjector(session);
    
    // Step 1: Quét tìm NPC Mộ binh / Chiêu binh / Quân nhu
    const npcNamesRes = await session.callRpc('getNearNpcNames');
    const info = await session.callRpc('getPlayerInfo');
    const mapId = (info && info.mapId) ? info.mapId : 0;
    const camp = (info && info.campValue) ? info.campValue : 1;

    let npcId = null;
    let npcName = '';
    
    if (npcNamesRes && npcNamesRes.ok && npcNamesRes.npcMap) {
      for (const [id, name] of Object.entries(npcNamesRes.npcMap)) {
        const lower = String(name).toLowerCase();
        
        if (mapId === 324) {
          // Báo danh area: only look for Mộ binh or Chiêu binh
          if (lower.includes('mộ binh') || lower.includes('chieu binh') || lower.includes('chiêu binh')) {
            npcId = id;
            npcName = name;
            break;
          }
        } else {
          // Staging area: only look for Quân nhu
          if (lower.includes('quân nhu') || lower.includes('quan nhu')) {
            npcId = id;
            npcName = name;
            break;
          }
        }
      }
    }
    
    // Fallback nếu không quét được NPC dynamically
    if (!npcId) {
      if (camp === 2) {
        npcId = "23"; // Mặc định Kim
        npcName = "NPC Chieu Binh Quan (Kim)";
      } else {
        npcId = "28"; // Mặc định Tong
        npcName = "NPC Mo Binh Quan (Tong)";
      }
    }
    
    // Động xác định quy trình mở shop dựa theo tên NPC
    const lowerNpcName = npcName.toLowerCase();
    const isStagingNpc = lowerNpcName.includes('quốc') || lowerNpcName.includes('quoc') || (mapId !== 324);
    
    if (isStagingNpc) {
      // NPC ở map Staging (Tống Quốc Quân nhu quan / Kim Quốc Quân nhu quan)
      // Mở shop trực tiếp bằng Option 1 trên màn hình đầu tiên
      sendLog(`[${deviceId}] [Gom Diem] Buoc 2: Tuong tac voi ${npcName} (Map chuan bi)...`, 'info');
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
      sendLog(`[${deviceId}] [Gom Diem] Buoc 2: Tuong tac voi ${npcName} (Map 324)...`, 'info');
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
    
    sendLog(`[${deviceId}] [Gom Diem] Buoc 3: Dang chon vat pham Phieu Tich Luy Tong Kim...`, 'info');
    await session.callRpc('clickFirstShopItem');
    await new Promise(r => setTimeout(r, 800)); // Đợi popup Số lượng hiện lên
    
    sendLog(`[${deviceId}] [Gom Diem] Dang gui lenh mua so luong toi da...`, 'info');
    await session.callRpc('buyActiveShopItem', 999);
    await new Promise(r => setTimeout(r, 800));
    
    // Đóng toàn bộ popup sau khi hoàn tất
    try { await session.callRpc('closeDialogPopups'); } catch(e) {}
    
    sendLog(`[${deviceId}] [Gom Diem] Buoc 4: Hoan tat gom diem tich luy thanh cong!`, 'success');
  } catch (err) {
    sendLog(`[${deviceId}] [Gom Diem] Loi khi thuc hien gom diem: ${err.message}`, 'error');
  }
}

module.exports = {
  autoTongKimLoop,
  npcCacheMap,
  ensureCache,
  collectPoints
};
