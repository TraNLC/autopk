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
          sendLog(`[${deviceId}] Lay ID Bao Danh (${shared.baodanhId}) tu cua so khac cung map.`, 'success');
        }
      }
      const baodanhId = cache && cache.baodanhId;
      if (!baodanhId) {
        sendLog(`[${deviceId}] Chua co ID NPC Bao Danh. Hay click tay vao Chieu Binh Quan / Mo Binh Quan 1 lan.`, 'warn');
        return;
      }
      sendLog(`[${deviceId}] Goi NPC Bao Danh (ID: ${baodanhId})...`, 'info');
      try {
        await injector.sendNpcDialogue(baodanhId);
        await new Promise(r => setTimeout(r, 500));
        await injector.sendNpcSelect(0);
        await new Promise(r => setTimeout(r, 1000));
        sendLog(`[${deviceId}] OK da goi Bao Danh.`, 'success');
      } catch(e) {
        sendLog(`[${deviceId}] Loi bao danh: ${e.message}`, 'error');
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
          sendLog(`[${deviceId}] Doi phe -> reset NPC cache.`, 'info');
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
              sendLog(`[${deviceId}] Lay ID Trinh Sat (${shared.trinhSatId}) tu cua so khac cung map.`, 'success');
            }
            if (!quanNhuId && shared.quanNhuId) {
              quanNhuId = shared.quanNhuId;
              cache.quanNhuId = shared.quanNhuId;
              sendLog(`[${deviceId}] Lay ID Quan Nhu (${shared.quanNhuId}) tu cua so khac cung map.`, 'success');
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
                    sendLog(`[${deviceId}] Tim thay Trinh Sat qua bo nho: ID=${npcId} (${npcName})`, 'success');
                  }
                }
                // So khớp Quân Nhu
                else if (lower.includes('nhu') || lower.includes('quan y') || lower.includes('quân y')) {
                  if (!quanNhuId) {
                    quanNhuId = npcId;
                    cache.quanNhuId = npcId;
                    sendLog(`[${deviceId}] Tim thay Quan Nhu qua bo nho: ID=${npcId} (${npcName})`, 'success');
                  }
                }
              }
            }
          } catch(e) {
            sendLog(`[${deviceId}] NPC scan error: ${e.message}`, 'error');
          }
        }

        // ── Thống kê thời gian giãn cách 2.5s mỗi lần gọi Trình Sát để tránh bị rate-limit ──
        const now = Date.now();
        const callInterval = 2500;
        if (cache._lastCallTime && (now - cache._lastCallTime) < callInterval) {
          return; // Chưa tới lượt
        }
        cache._lastCallTime = now;

        if (quanNhuId && (!cache._lastHealTime || (now - cache._lastHealTime) > 3 * 60 * 1000)) {
          sendLog(`[${deviceId}] Goi Quan Nhu (ID=${quanNhuId})...`, 'info');
          try {
            await injector.sendNpcDialogue(quanNhuId);
            await new Promise(r => setTimeout(r, 800));
            await injector.sendNpcSelect(0);
            await new Promise(r => setTimeout(r, 400));
            await session.callRpc('sendPacket', 232, '');
            await new Promise(r => setTimeout(r, 400));
            sendLog(`[${deviceId}] OK da nhan thuoc tu Quan Nhu.`, 'success');
          } catch(e) {
            sendLog(`[${deviceId}] Loi Quan Nhu: ${e.message}`, 'error');
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
            sendLog(`[${deviceId}] Buff tran phai (skill ${buffSkillId})...`, 'info');
            await injector.sendDoSkillTargetPosition(buffSkillId, info.x || 0, info.y || 0);
            await new Promise(r => setTimeout(r, 400));
          }
        } catch(e) {
          sendLog(`[${deviceId}] Loi buff tran phai: ${e.message}`, 'error');
        }

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
          sendLog(`[${deviceId}] Goi Trinh Sat (ID=${trinhSatId}) -> Phe ${battleOption === 1 ? 'Kim' : 'Tong'} (Option ${battleOption})...`, 'info');
          await injector.sendNpcDialogue(trinhSatId);
          await new Promise(r => setTimeout(r, 500));
          await injector.sendNpcSelect(battleOption);
          await new Promise(r => setTimeout(r, 1000));
          try {
            await session.callRpc('clearFocus');
            sendLog(`[${deviceId}] Reset focus thanh cong sau khi qua cua Trinh Sat.`, 'success');
          } catch(err) {}
        } catch(e) {
          sendLog(`[${deviceId}] Loi goi Trinh Sat: ${e.message}`, 'error');
        }

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
    sendLog(`[${deviceId}] Bat dau thuc hien gom diem tich luy...`, 'info');
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
    
    sendLog(`[${deviceId}] Tuong tac voi NPC: ${npcName} (ID: ${npcId})...`, 'info');
    
    // Step 2: Gửi đối thoại với NPC
    try { await session.callRpc('closeDialogPopups'); } catch(e) {}
    await new Promise(r => setTimeout(r, 400));
    await injector.sendNpcDialogue(npcId);
    await new Promise(r => setTimeout(r, 1000));
    
    // Step 3: Chọn dòng "Điểm tích lũy" (Option index 1)
    sendLog(`[${deviceId}] Chon muc: Diem tich luy (Option 1)...`, 'info');
    await injector.sendNpcSelect(1);
    await new Promise(r => setTimeout(r, 1000));
    
    // Step 4: Chọn dòng "Mở shop" (Option index 0)
    sendLog(`[${deviceId}] Chon muc: Mo shop (Option 0)...`, 'info');
    
    cache.lastNpcShopKey = null; // Reset shopkey cũ
    await injector.sendNpcSelect(0);
    await new Promise(r => setTimeout(r, 400));
    
    // Đóng chỉ popup đối thoại để tránh che giao diện shop
    try {
      await session.callRpc('closeOnlyNpcDialog');
      sendLog(`[${deviceId}] Da dong popup doi thoai de lo shop UI.`, 'info');
    } catch(e) {
      sendLog(`[${deviceId}] Canh bao: Khong the tu dong dong dialog: ${e.message}`, 'warn');
    }
    
    // Đợi tối đa 2 giây để nhận shopkey từ server
    let waitShopkey = 0;
    while (!cache.lastNpcShopKey && waitShopkey < 20) {
      await new Promise(r => setTimeout(r, 100));
      waitShopkey++;
    }
    
    let shopKey = cache.lastNpcShopKey;
    if (!shopKey) {
      shopKey = "tong.kim.point.shop"; 
      sendLog(`[${deviceId}] Canh bao: Khong bat duoc shopKey, dung mac dinh: ${shopKey}`, 'warn');
    } else {
      sendLog(`[${deviceId}] Nhan duoc shopKey tu game: ${shopKey}`, 'success');
    }
    
    // Step 5: Mua Phiếu Tích Lũy Tống Kim (Item index 0, số lượng 999)
    sendLog(`[${deviceId}] Dang gui lenh mua Phieu Tich Luy Tong Kim (Item index 0, So luong: 999)...`, 'info');
    
    const { encodeField } = require('../packet-injector');
    const p1 = encodeField(1, 'string', shopKey);
    const p2 = encodeField(2, 'int32', 0);
    const p3 = encodeField(3, 'int32', 999);
    const bodyHex = Buffer.concat([p1, p2, p3]).toString('hex');
    
    await injector.sendRaw(148, bodyHex);
    await new Promise(r => setTimeout(r, 800));
    
    // Đóng toàn bộ popup sau khi hoàn tất
    try { await session.callRpc('closeDialogPopups'); } catch(e) {}
    
    sendLog(`[${deviceId}] Da hoan tat mua Phieu Tich Luy Tong Kim!`, 'success');
  } catch (err) {
    sendLog(`[${deviceId}] Loi khi thuc hien gom diem: ${err.message}`, 'error');
  }
}

module.exports = {
  autoTongKimLoop,
  npcCacheMap,
  ensureCache,
  collectPoints
};
