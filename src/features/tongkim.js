const { PacketInjector } = require('../packet-injector');
const { exec } = require('child_process');

function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Encode a string ID into protobuf body for EEnterTongMap (opcode 172).
 * Format: field 1 (tag=0a) + length + hex string
 * Ví dụ: "2593" → "0a0432353933"
 */
function encodeEnterTongMapBody(strId) {
  const hex = Buffer.from(String(strId), 'utf-8').toString('hex');
  const lenHex = hex.length / 2;
  const lenByte = lenHex.toString(16).padStart(2, '0');
  return '0a' + lenByte + hex;
}

// Từ khoá nhận diện NPC qua nội dung dialog (op34)
const HEAL_KEYWORDS = ['dược phẩm', 'nhận thuốc', 'hồi phục', 'duoc pham', 'nhan thuoc', 'hoi phuc'];
const WAR_KEYWORDS = ['trận địa', 'chiến trường', 'ra trận', 'tham chiến', 'tran dia', 'chien truong', 'ra tran'];

/**
 * Probe 1 NPC bằng cách gửi remoteNpcDialogue rồi đọc op34 response.
 * @returns {Promise<'heal'|'war'|'unknown'|null>} null nếu NPC không phản hồi
 */
async function probeNpcType(session, deviceId, npcId, sendLog) {
  try {
    // Đếm packet op34 hiện tại
    const beforeRes = await session.callRpc('getRecvPackets', 34, 100);
    const beforeCount = (beforeRes && beforeRes.packets) ? beforeRes.packets.length : 0;

    // Gửi lệnh mở dialog
    await session.callRpc('remoteNpcDialogue', npcId);
    await new Promise(r => setTimeout(r, 500));

    // Đọc packet mới
    const afterRes = await session.callRpc('getRecvPackets', 34, 100);
    const afterPackets = (afterRes && afterRes.packets) ? afterRes.packets : [];
    
    // Tìm packet op34 MỚI (sau khi gửi)
    const newPackets = afterPackets.slice(beforeCount);
    
    for (const pkt of newPackets) {
      if (!pkt.hex) continue;
      try {
        const bytes = Buffer.from(pkt.hex, 'hex');
        // Extract readable text
        let text = '';
        for (let i = 0; i < bytes.length; i++) {
          const b = bytes[i];
          if (b >= 0x20 && b < 0x7f) text += String.fromCharCode(b);
        }
        const lower = text.toLowerCase();
        
        // Check heal keywords
        for (const kw of HEAL_KEYWORDS) {
          if (lower.includes(kw)) {
            sendLog(`[${deviceId}] [Quét Memory] Probe NPC ${npcId} → QUÂN NHU (dialog: "${text.substring(0,60)}...")`, 'info');
            await session.callRpc('closeDialogPopups').catch(() => {});
            return 'heal';
          }
        }
        // Check war keywords
        for (const kw of WAR_KEYWORDS) {
          if (lower.includes(kw)) {
            sendLog(`[${deviceId}] [Quét Memory] Probe NPC ${npcId} → TRINH SÁT (dialog: "${text.substring(0,60)}...")`, 'info');
            await session.callRpc('closeDialogPopups').catch(() => {});
            return 'war';
          }
        }
        
        // Unknown dialog - log nội dung để debug
        sendLog(`[${deviceId}] [Quét Memory] Probe NPC ${npcId} → dialog lạ: "${text.substring(0,80)}"`, 'warn');
        await session.callRpc('closeDialogPopups').catch(() => {});
        return 'unknown';
      } catch(e) {}
    }
    
    // Không có op34 mới → NPC không phản hồi
    return null;
  } catch(e) {
    sendLog(`[${deviceId}] [Cảnh Báo] Probe NPC lỗi: ${e.message}`, 'warn');
    return null;
  }
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
    sendLog(`[${deviceId}] [Sinh Tử] Phát hiện nhân vật đã chết (HP = 0). Đang hồi sinh...`, 'warn');
    try {
        await session.callRpc('closeDialogPopups').catch(() => {});
        await session.callRpc('sendPacket', 232, '');
        await session.callRpc('closeDialogPopups').catch(() => {});
        sendLog(`[${deviceId}] [Thành Công] Đã gửi hồi sinh.`, 'success');
    } catch(e) {
        sendLog(`[${deviceId}] [Lỗi] Lỗi hồi sinh: ${e.message}`, 'error');
    }
    return; // Dừng các hành động khác để chờ vòng lặp sau (sau khi đã đổi map)
  }

  // 2. Bỏ qua nếu đang ở thành (không làm gì)
  if (isCity) return;

  // 3. Buff + Gọi Trinh Sát (Khu staging)
  if (isStagingArea) {
    try {
      let cache = ensureCache(deviceId);
      let trinhSatId = cache.trinhSatId || null;
      const campValue = (info && info.campValue !== undefined) ? info.campValue : 1;

      // Reset retry flag khi vừa từ chiến trường về staging
      if (cache.lastMapId && cache.lastMapId !== mapId) {
        cache._trinhSatRetry = false;
        // KHÔNG set trinhSatId = null ở đây vì quét lại memory rất lag.
        // Trinh Sát ID ở khu Staging hầu như không đổi.
      }
      cache.lastMapId = mapId;

      if (!trinhSatId) {
        // Auto-scan: quét NpcController instances từ memory
        // Lọc theo phe (Tống/Kim) để tránh gọi nhầm NPC phe kia → bị đá ra map
        const phePrefix = campValue === 2 ? 'kim' : 'tong';
        try {
          sendLog(`[${deviceId}] [Quét Memory] Đang lấy danh sách NPC xung quanh (Dictionary scan)...`, 'info');
          const scanResult = await session.callRpc('getNearNpcNames');

          if (scanResult && scanResult.ok && scanResult.npcMap) {
              const npcs = [];
              for (const [id, name] of Object.entries(scanResult.npcMap)) {
                  npcs.push({ id, name });
              }
              for (const npc of npcs) {
                  const lowerName = removeAccents(npc.name);
                  if (lowerName.includes(phePrefix) && lowerName.includes('trinh sat')) {
                      trinhSatId = npc.id;
                      cache.trinhSatId = npc.id;
                      sendLog(`[${deviceId}] [Thành Công] Auto-detect: Trinh Sát = ${npc.id} (${npc.name}) [phe=${phePrefix}]`, 'success');
                      break;
                  }
              }
              if (!trinhSatId) {
                  for (const npc of npcs) {
                      const lowerName = removeAccents(npc.name);
                      if (lowerName.includes('trinh sat')) {
                          trinhSatId = npc.id;
                          cache.trinhSatId = npc.id;
                          sendLog(`[${deviceId}] [Cảnh Báo] Fallback Trinh Sát = ${npc.id} (${npc.name})`, 'warn');
                          break;
                      }
                  }
              }
          }
        } catch(e) {
          sendLog(`[${deviceId}] [Lỗi] Quét memory lỗi: ${e.message}`, 'error');
        }
      }

      if (!trinhSatId) {
        sendLog(`[${deviceId}] [Cảnh Báo] Chưa tìm thấy Trinh Sát! Hãy click tay 1 lần.`, 'warn');
        return;
      }

      const isRetry = cache._trinhSatRetry === true;
      const isKim = campValue === 2;
      const warOption = 0; // Luôn luôn chọn dòng đầu tiên (index 0) là "Tiến vào tiền tuyến"

      if (!isRetry) {
        await session.callRpc('closeDialogPopups').catch(() => {});

        // Bật auto game → tự clear target + tự đánh khi vào trận
        await injector.sendApplyAutoplayProfile(true, "");
        await new Promise(r => setTimeout(r, 100));
        await injector.sendDoSkillTargetPosition(0, info.x || 0, info.y || 0);
        await new Promise(r => setTimeout(r, 200));

        // Buff trấn phái
        const sect = info.sect !== undefined ? info.sect : -1;
        const sectSkillMap = { 0: 102, 1: 111, 2: 129, 3: 139, 4: 159, 5: 109, 6: 179, 7: 189, 8: 209, 9: 219 };
        const buffSkillId = sectSkillMap[sect];
        if (buffSkillId && buffSkillId > 1) {
          sendLog(`[${deviceId}] [Kỹ Năng] Buff trấn phái...`, 'success');
          await injector.sendDoSkillTargetPosition(buffSkillId, info.x || 0, info.y || 0);
          await new Promise(r => setTimeout(r, 400));
        }

        // Lắc
        if (lacs && lacs.length > 0) {
          const itemsRes = await session.callRpc('getInventoryItems');
          if (itemsRes && itemsRes.ok && itemsRes.items) {
            for (const lacValue of lacs) {
              let matchedItem = null;
              if (lacValue === '45') matchedItem = itemsRes.items.find(i => i.name.toLowerCase().includes('phi tốc') || i.name.toLowerCase().includes('phi toc'));
              else if (lacValue === '51') matchedItem = itemsRes.items.find(i => i.name.toLowerCase().includes('lệnh bài') || i.name.toLowerCase().includes('lenh bai'));
              else if (lacValue === '50') matchedItem = itemsRes.items.find(i => i.name.toLowerCase().includes('chiến cổ') || i.name.toLowerCase().includes('chien co') || i.name.toLowerCase().includes('trống') || i.name.toLowerCase().includes('trong'));
              if (matchedItem) {
                await session.callRpc('useItem', matchedItem.index);
                await new Promise(r => setTimeout(r, 400));
              }
            }
          }
        }

        cache._trinhSatRetry = true;
        sendLog(`[${deviceId}] [Chiến Trường] Gọi Trinh Sát (ID=${trinhSatId})...`, 'info');
      }

      // Gọi Trinh Sát → vào trận
      await session.callRpc('remoteNpcDialogue', trinhSatId);
      await new Promise(r => setTimeout(r, 500));
      await session.callRpc('selectDialogOption', warOption);
      await new Promise(r => setTimeout(r, 5000));

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
