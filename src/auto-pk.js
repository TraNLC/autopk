// src/auto-pk.js -- Auto PK and Tong Kim Loop Module (Step 5)
const fs = require('fs');
const { encodeField } = require('./packet-injector');
const path = require('path');

class AutoPK {
  /**
   * @param {FridaSession} session
   * @param {MemoryReader} memory
   * @param {PacketInjector} injector
   * @param {PacketSniffer} sniffer
   * @param {string} deviceId
   */
  constructor(session, memory, injector, sniffer, deviceId) {
    this.session = session;
    this.memory = memory;
    this.injector = injector;
    this.sniffer = sniffer;
    this.deviceId = deviceId ? deviceId.replace(/:/g, '_') : 'default';
    this.running = false;
    this.profileGuid = '';
    this.loopTimer = null;
    
    // Potions configuration
    this.hpThreshold = 0.65;
    this.mpThreshold = 0.30;
    


    // Default skills to execute
    this.attackSkills = [1];
    this.currentSkillIndex = 0;
    this.lastLagFixTime = 0;
    this.lastTargetId = null;
    this.lastX = 0;
    this.lastY = 0;
    this.lastMapId = 0;
    this._focusClearPending = false;  // Cờ: vừa clearFocus, bỏ qua tick sau để game sync

    // Skill dùng để reset target (ví dụ skill slot 9 - buff/AoE không cần target)
    // Đặt = 0 để tắt, hoặc set skill ID (vd: 102, 111, 129...) để cast khi clearFocus
    this.resetFocusSkillId = 0;

    // Item usage tracking
    this.lastUsedItems = {
      '45': 0, // Phi Tốc
      '51': 0, // Lệnh Bài
      '50': 0  // Chiến Cổ
    };
    // Cooldown in ms (15 mins for Phi Toc, 30 mins for Lenh Bai/Chien Co)
    this.itemCooldowns = {
      '45': 15 * 60 * 1000,
      '51': 30 * 60 * 1000,
      '50': 30 * 60 * 1000
    };

    // Auto Roaming state
    this.lastRoamTime = 0;

    // Trinh Sát NPC scanning state
    this._trinhSatCache = {};       // { mapId: { x, y, ts } }
    this._lastTrinhSatScanTime = 0;
    this._trinhSatTeleported = false; // Đã tốc biến đến Trinh Sát trong lần staging hiện tại chưa
  }

  log(msg, type = 'info') {
    const timeStr = new Date().toLocaleTimeString();
    const formattedMsg = `[AutoPK] ${msg}`;
    console.log(`[TRACE] [${timeStr}] [${this.deviceId}] ${formattedMsg}`);
    if (globalThis._mainWindow) {
      globalThis._mainWindow.webContents.send('tab-log', { msg: `[${this.deviceId}] ${formattedMsg}`, type });
    }
  }

  /**
   * Load autoplay profile GUID to prevent in-game profile wipe issues (op140 empty payload)
   */
  loadProfile() {
    try {
      const dataDir = path.join(__dirname, '..', 'data', 'output');
      const filename = `autoplay_profile_${this.deviceId}.json`;
      const filePath = path.join(dataDir, filename);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.profile) {
          this.profileGuid = parsed.profile;
          this.log(`Loaded profile GUID: ${this.profileGuid}`);
          return;
        }
      }
    } catch (e) {
      console.warn(`[AutoPK] Failed to load local profile guid: ${e.message}`);
    }
    
    // Default fallback GUIDs seen in logs
    this.profileGuid = '1dc8514c'; 
    this.log(`Using default fallback profile GUID: ${this.profileGuid}`);
  }

  /**
   * Start the PK loop.
   */
  async start() {
    if (this.running) return;
    this.running = true;
    this.loadProfile();

    this.log('Starting Auto PK Loop...', 'success');

    // Reset target focus to prevent chasing previous targets
    try {
      await this.session.callRpc('clearFocus');
    } catch(e) {}

    // Warm up the auto-play system (prevent wipes by applying profile)
    try {
      await this.injector.sendApplyAutoplayProfile(true, this.profileGuid);
    } catch (err) {
      console.warn(`[AutoPK] Initial profile application warning: ${err.message}`);
    }

    const run = async () => {
      if (!this.running) return;
      try {
        await this.tick();
      } catch (e) {
        console.error(`[AutoPK] Loop iteration error: ${e.message}`);
      }
      this.loopTimer = setTimeout(run, 500); // Fast tick: 500ms
    };
    run();
  }

  /**
   * Stop the PK loop.
   */
  async stop() {
    this.running = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    this.log('Stopping Auto PK Loop.', 'warn');
    try {
      await this.injector.sendApplyAutoplayProfile(false, this.profileGuid);
    } catch (e) {}
  }

  /**
   * Hàm kiểm tra mối quan hệ khắc hệ ngũ hành
   * 0: Kim, 1: Mộc, 2: Thủy, 3: Hỏa, 4: Thổ
   */
  getElementRelation(myElement, enemyElement) {
    const counterMap = {
      0: 1, // Kim khắc Mộc
      1: 4, // Mộc khắc Thổ
      4: 2, // Thổ khắc Thủy
      2: 3, // Thủy khắc Hỏa
      3: 0  // Hỏa khắc Kim
    };
    
    if (counterMap[myElement] === enemyElement) {
      return 1; // Khắc hệ (Lợi thế)
    }
    if (counterMap[enemyElement] === myElement) {
      return -1; // Bị khắc hệ (Bất lợi)
    }
    return 0; // Bình thường
  }

  /**
   * Hàm quét và tìm mục tiêu tối ưu nhất
   * - usePriorityRange=true:  Phạm vi ưu tiên → khắc hệ; còn lại → gần nhất
   * - usePriorityRange=false: Toàn bộ phạm vi → gần nhất thuần
   * - useOuterRange=true:      Filter max = outerRange (chỉ tìm mục tiêu có thể đánh)
   */
  findBestTarget(player, enemyList) {
    // Lọc theo khoảng cách và trạng thái đặc biệt
    const filteredEnemies = enemyList.filter(enemy => {
      const dist = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
      
      // Giới hạn phạm vi dò tìm cứng ở 700
      if (dist > 700) return false;

      // Loại bỏ đối thủ đang ở trạng thái bất tử (2 hoặc 52)
      if (enemy.states && (enemy.states.includes(2) || enemy.states.includes(52))) {
        return false;
      }
      return true;
    });

    if (filteredEnemies.length === 0) return null;

    // === Tầng 1: Tìm các mục tiêu trong phạm vi ưu tiên 400 ===
    const priorityEnemies = filteredEnemies.filter(enemy => {
      const dist = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
      return dist <= 400;
    });

    if (priorityEnemies.length > 0) {
      // Tìm đối thủ gần nhất trong phạm vi ưu tiên
      let nearest = null;
      let nearestDist = 99999;
      for (const enemy of priorityEnemies) {
        const dist = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = enemy;
        }
      }

      // Ưu tiên đối thủ khắc hệ ngũ hành (nếu đứng gần đó)
      const nearThreshold = nearestDist * 1.2;
      let bestKicHe = nearest;
      let bestKicHeDist = nearestDist;

      for (const enemy of priorityEnemies) {
        const dist = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
        if (dist > nearThreshold) continue;

        const relation = this.getElementRelation(player.series, enemy.series);
        if (relation === 1 && dist < bestKicHeDist + 50) {
          bestKicHe = enemy;
          bestKicHeDist = dist;
        }
      }
      return bestKicHe;
    } else {
      // === Tầng 2: Ngoài phạm vi ưu tiên (400 → 700), chọn đối thủ gần nhất ===
      let nearest = null;
      let nearestDist = 99999;
      for (const enemy of filteredEnemies) {
        const dist = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = enemy;
        }
      }
      return nearest;
    }
  }

  /**
   * Reset target: clearFocus memory + GotoPosition (universal, không cần skill)
   * GotoPosition gửi lệnh "đứng yên tại đây" lên server → server hủy pursuit
   * Cách này hoạt động với MỌI phái, không cần skill buff.
   * @param {number} x - player pos X
   * @param {number} y - player pos Y
   */
  async resetTarget(x, y) {
    // 1. Client-side: clear memory
    try { await this.session.callRpc('clearFocus'); } catch(e) {}

    // 2. Server-side: gửi GotoPosition → server hủy lệnh đuổi target (UNIVERSAL)
    if (x !== undefined && y !== undefined) {
      try {
        await this.injector.sendGotoPosition(x, y);
      } catch(e) {
        // Bỏ qua
      }
    }

    // 3. Bonus: nếu có config skill reset (ví dụ Tuyết ảnh 109), cast thêm
    if (this.resetFocusSkillId > 0 && x !== undefined && y !== undefined) {
      try {
        await this.injector.sendDoSkillTargetPosition(this.resetFocusSkillId, x, y);
        this.log(`Reset target: da cast skill ${this.resetFocusSkillId}.`, 'info');
      } catch(e) {}
    }
  }

  async checkAndUseItems(currentMapId) {
    const STAGING_MAPS = [323, 325, 379, 382, 972, 973, 974];
    // In Tống Kim staging or battle maps
    if (!STAGING_MAPS.includes(currentMapId) && currentMapId < 300) return;

    if (!this.devCfg || !this.devCfg.lacs || this.devCfg.lacs.length === 0) return;

    const now = Date.now();
    const intervalMs = (this.devCfg.lacInterval || 30) * 1000;
    
    let shouldCheckInventory = false;
    for (const particular of this.devCfg.lacs) {
      if (!this.lastUsedItems[particular]) this.lastUsedItems[particular] = 0;
      if (now - this.lastUsedItems[particular] > intervalMs) {
        shouldCheckInventory = true;
        break;
      }
    }

    if (!shouldCheckInventory) return;

    try {
      const invRes = await this.session.callRpc('getInventoryItemsNoIl2cpp');
      if (invRes && invRes.ok && invRes.items) {
        for (const particular of this.devCfg.lacs) {
          if (now - this.lastUsedItems[particular] > intervalMs) {
            const item = invRes.items.find(i => i.particular.toString() === particular);
            if (item && item.index !== undefined) {
              this.log(`Cắn tự động: ${item.name || 'Vật phẩm ' + particular} (Chu kỳ ${intervalMs/1000}s)`, 'success');
              await this.injector.sendPlayerUserItem(item.index);
              this.lastUsedItems[particular] = now;
              await new Promise(r => setTimeout(r, 500)); // Delay between items
            }
          }
        }
      }
    } catch(e) {
      // Ignore inventory check errors
    }
  }

  /**
   * Auto roam to find enemies when idle
   */
  async autoRoam(currentX, currentY) {
    const now = Date.now();
    if (now - this.lastRoamTime < 5000) return; // Only roam every 5 seconds at most

    // Generate a random roam offset (-15 to 15 in Unity coordinates)
    const offsetX = (Math.random() - 0.5) * 30;
    const offsetY = (Math.random() - 0.5) * 30;
    
    const targetX = currentX + offsetX;
    const targetY = currentY + offsetY;

    this.log(`[AutoPK] Không thấy địch. Tự động chạy dò đường đến (${targetX.toFixed(1)}, ${targetY.toFixed(1)})...`, 'info');
    
    // Sử dụng cơ chế bẻ khóa không gian (Direct Memory Write) để dịch chuyển
    if (this.session) {
      await this.session.callRpc('clientMoveMemory', targetX, targetY);
      // Gửi gói tin cập nhật tọa độ lên server
      if (this.injector) {
        await this.injector.sendStringData(`1|${Math.round(targetX)}|${Math.round(targetY)}`);
      }
    }
    
    this.lastRoamTime = now;
  }

  /**
   * Quét NPC Trinh Sát bằng Opcode 71/72 (server-side) và tốc biến đến tọa độ NPC.
   * Dùng khi nhân vật đang ở doanh trại (staging map) để nhanh chóng tiếp cận Trinh Sát.
   * @param {object} info - Thông tin nhân vật (x, y, mapId)
   * @returns {boolean} true nếu đã tốc biến thành công (skip tick)
   */
  async scanAndTeleportTrinhSat(info) {
    const now = Date.now();
    const mapId = info.mapId;

    // Kiểm tra cache: nếu đã có tọa độ Trinh Sát cho map này, dùng luôn
    const cached = this._trinhSatCache[mapId];
    if (cached && cached.x && cached.y) {
      // Đã tốc biến rồi thì không cần nữa
      if (this._trinhSatTeleported) return false;

      const dist = Math.sqrt(Math.pow(cached.x - info.x, 2) + Math.pow(cached.y - info.y, 2));
      if (dist < 80) {
        // Đã đứng gần Trinh Sát, đánh dấu hoàn thành
        this._trinhSatTeleported = true;
        return false;
      }

      // Tốc biến đến Trinh Sát
      this.log(`⚡ Tốc biến đến NPC Trinh Sát (${cached.x}, ${cached.y}). Cự ly: ${dist.toFixed(0)}`, 'success');
      try {
        await this.session.callRpc('clientMoveMemory', cached.x, cached.y);
        if (this.injector) {
          await this.injector.sendStringData(`1|${Math.round(cached.x)}|${Math.round(cached.y)}`);
          await new Promise(r => setTimeout(r, 300));
          await this.injector.sendStringData(`2|${Math.round(cached.x)}|${Math.round(cached.y)}|2`);
        }
        this.lastX = cached.x;
        this.lastY = cached.y;
        this._trinhSatTeleported = true;
      } catch (e) {
        this.log(`Lỗi tốc biến Trinh Sát: ${e.message}`, 'error');
      }
      return true; // Skip tick này
    }

    // Chưa có cache -> quét bằng Opcode 71/72 (cooldown 15s)
    if (now - this._lastTrinhSatScanTime < 15000) return false;
    this._lastTrinhSatScanTime = now;

    this.log(`[Staging] Quét tọa độ NPC Trinh Sát bằng Opcode 71 (mapId: ${mapId})...`, 'info');
    try {
      // Xóa buffer packet cũ
      await this.session.callRpc('getRecvPackets', 72, 100).catch(() => {});

      // Gửi yêu cầu quét NPC list
      const hexReq = encodeField(1, 'int32', mapId).toString('hex');
      await this.injector.sendRaw(71, hexReq);

      // Đợi server phản hồi
      await new Promise(r => setTimeout(r, 1500));

      // Đọc kết quả Opcode 72
      const recvRes = await this.session.callRpc('getRecvPackets', 72, 20);
      if (recvRes && recvRes.ok && recvRes.packets && recvRes.packets.length > 0) {
        for (const pkt of recvRes.packets) {
          const buf = Buffer.from(pkt.hex, 'hex');
          let offset = 0;
          let cx = 0, cy = 0, cName = '';
          while (offset < buf.length) {
            const tag = buf[offset++];
            const wireType = tag & 0x7;
            const fieldNum = tag >> 3;
            if (wireType === 0) {
              let val = 0n, shift = 0n;
              while (offset < buf.length) {
                const b = buf[offset++];
                val |= BigInt(b & 0x7f) << shift;
                if ((b & 0x80) === 0) break;
                shift += 7n;
              }
              if (fieldNum === 3) cx = Number(val);
              if (fieldNum === 4) cy = Number(val);
            } else if (wireType === 2) {
              let len = 0, shift = 0;
              while (offset < buf.length) {
                const b = buf[offset++];
                len |= (b & 0x7f) << shift;
                if ((b & 0x80) === 0) break;
                shift += 7;
              }
              if (len > 0 && offset + len <= buf.length) {
                if (fieldNum === 2) {
                  cName = buf.slice(offset, offset + len).toString('utf8').toLowerCase();
                  if (cName.includes('trinh sát') || cName.includes('trinh sat')) {
                    this._trinhSatCache[mapId] = { x: cx, y: cy, ts: now };
                    this.log(`🎯 Tìm thấy NPC Trinh Sát tại (${cx}, ${cy})!`, 'success');
                  }
                }
                offset += len;
              }
            } else if (wireType === 5) { offset += 4; } else if (wireType === 1) { offset += 8; }
          }
        }
      }

      if (!this._trinhSatCache[mapId]) {
        this.log(`[Staging] Không tìm thấy NPC Trinh Sát ở mapId ${mapId}.`, 'warn');
      }
    } catch (e) {
      this.log(`[Staging] Lỗi quét Trinh Sát: ${e.message}`, 'error');
    }

    return false;
  }


  /**
   * Core logic run at each tick interval.
   */
  async tick() {
    const info = await this.memory.getPlayerInfo();
    if (!info) return;

    const now = Date.now();

    // 0. Kiểm tra chết: nếu HP=0 thì dừng tick, để autoTongKimLoop xử lý hồi sinh
    if (info.hp !== undefined && info.hp <= 0) {
      return; // Không cast skill khi đã chết
    }

    // 0.5. Nhận thuốc từ Quân Nhu nếu đang đứng ở doanh trại (gần Quân Nhu)
    const STAGING_MAPS = [323, 325, 379, 382, 972, 973, 974];
    const isStagingArea = STAGING_MAPS.includes(info.mapId);

    // ── Staging: Quét tọa độ NPC Trinh Sát và tốc biến đến ──
    if (isStagingArea) {
      const didTeleport = await this.scanAndTeleportTrinhSat(info);
      if (didTeleport) return; // Đã tốc biến, bỏ qua tick này
    }

    if (isStagingArea && (!this._lastQuanNhuTime || (now - this._lastQuanNhuTime) > 30000)) {
      this._lastQuanNhuTime = now;
      try {
        const npcRes = await this.session.callRpc('getNearNpcNames');
        if (npcRes && npcRes.ok && npcRes.npcMap) {
          let quanNhuId = null;
          for (const [npcId, npcName] of Object.entries(npcRes.npcMap)) {
            const lower = String(npcName).toLowerCase();
            if (lower.includes('quân nhu') || lower.includes('quan nhu') || lower.includes('quan y') || lower.includes('quân y')) {
              quanNhuId = npcId;
              break;
            }
          }
          if (quanNhuId) {
            if (!this._lastHealRefillTime || (now - this._lastHealRefillTime) > 1 * 60 * 1000) {
              this.log(`Phat hien Quan Nhu o gan (Doanh trai). Dang tien hanh nhan thuoc...`, 'info');
              await this.injector.sendNpcDialogue(quanNhuId);
              await new Promise(r => setTimeout(r, 800));
              await this.injector.sendNpcSelect(0);
              await new Promise(r => setTimeout(r, 400));
              await this.session.callRpc('sendPacket', 232, '');
              await new Promise(r => setTimeout(r, 400));
              try { await this.session.callRpc('closeDialogPopups'); } catch(e) {}
              this.log(`Nhan thuoc tu Quan Nhu thanh cong!`, 'success');
              this._lastHealRefillTime = now;
              return; // Bỏ qua tick này để cập nhật trạng thái
            }
          }
        }
      } catch(e) {
        console.error(`[AutoPK] Quan Nhu check error: ${e.message}`);
      }
    }

    // ── Kiểm tra thay đổi bản đồ (vừa ra trận hoặc chuyển map) ──
    if (this.lastMapId !== info.mapId) {
      this.log(`Phat hien thay doi ban do (${this.lastMapId || 'None'} -> ${info.mapId}). Thuc hien reset target...`, 'warn');
      this.lastTargetId = null;
      this.lastMapId = info.mapId;
      this._trinhSatTeleported = false; // Reset cờ tốc biến khi đổi map
      await this.resetTarget(info.x, info.y);
      try {
        await this.injector.sendApplyAutoplayProfile(false, this.profileGuid);
        await new Promise(r => setTimeout(r, 300));
        await this.injector.sendApplyAutoplayProfile(true, this.profileGuid);
      } catch(e) {}
      this.lastX = info.x;
      this.lastY = info.y;
      return; // Bỏ qua tick này để game engine xử lý reset xong
    }

    // ── Kiểm tra teleport / dịch chuyển đột ngột ──
    const teleportThreshold = 500;
    if (this.lastX !== 0 && this.lastY !== 0) {
      const jumpDist = Math.sqrt(Math.pow(info.x - this.lastX, 2) + Math.pow(info.y - this.lastY, 2));
      if (jumpDist > teleportThreshold) {
        this.log(`Phat hien dich chuyen xa (${jumpDist.toFixed(0)}m). Reset focus...`, 'warn');
        this.lastTargetId = null;
        this._focusClearPending = true;
        await this.resetTarget(info.x, info.y);
        try {
          await this.injector.sendApplyAutoplayProfile(false, this.profileGuid);
          await new Promise(r => setTimeout(r, 300));
          await this.injector.sendApplyAutoplayProfile(true, this.profileGuid);
        } catch(e) {}
        this.lastX = info.x;
        this.lastY = info.y;
        return; // Bỏ qua tick này, game đang load map mới
      }
    }
    this.lastX = info.x;
    this.lastY = info.y;

    // ── Nếu focusClearPending: bỏ qua 1 tick để game engine xử lý xong clearFocus ──
    if (this._focusClearPending) {
      this._focusClearPending = false;
      return; // Skip tick, tick tiếp theo sẽ tìm target mới bình thường
    }

    // 1. Tự động xuống ngựa khi phát hiện mục tiêu chiến đấu
    if (info.riding) {
      this.log(`Phat hien cuoi ngua khi chien dau. Tu dong xuong ngua...`, 'warn');
      await this.session.callRpc('switchHorse');
      // Chờ 300ms để hoạt cảnh xuống ngựa hoàn tất
      await new Promise(r => setTimeout(r, 300));
      return;
    }

    // 2. Fix lag vị trí: chỉ đồng bộ khi KHÔNG có mục tiêu (tránh giật khi đang đánh)
    //    Khi đang tấn công, gói tin cast skill đã tự động cập nhật vị trí cho server
    const enemiesRes = await this.memory.getNearEnemies();
    let bestTarget = null;
    let hasEnemy = false;
    let playerState = { x: info.x, y: info.y, series: -1 };

    if (enemiesRes && enemiesRes.ok && enemiesRes.enemies && enemiesRes.enemies.length > 0) {
      hasEnemy = true;
      playerState = {
        x: enemiesRes.localX || info.x,
        y: enemiesRes.localY || info.y,
        series: enemiesRes.localSeries !== undefined ? enemiesRes.localSeries : -1
      };
      bestTarget = this.findBestTarget(playerState, enemiesRes.enemies);
    }

    // Chỉ sync vị trí khi IDLE (không có mục tiêu) và mỗi 15 giây
    if (!hasEnemy) {
      if (now - this.lastLagFixTime > 15000) {
        this.lastLagFixTime = now;
        await this.injector.sendGotoPosition(info.x, info.y);
      }
      
      // Auto roam when idle in battle maps
      const STAGING_MAPS = [323, 325, 379, 382, 972, 973, 974];
      if (!STAGING_MAPS.includes(info.mapId)) {
        await this.autoRoam(info.x, info.y);
      }
    }

    // Tự động kiểm tra và cắn thuốc nếu cần
    await this.checkAndUseItems(info.mapId);

    const skillId = this.attackSkills[this.currentSkillIndex];
    this.currentSkillIndex = (this.currentSkillIndex + 1) % this.attackSkills.length;

    if (bestTarget) {
      const dist = Math.sqrt(Math.pow(bestTarget.x - playerState.x, 2) + Math.pow(bestTarget.y - playerState.y, 2));

      // ── Khi đổi target -> clearFocus game engine trước khi tấn công target mới ──
      if (bestTarget.id !== this.lastTargetId) {
        if (this.lastTargetId !== null) {
          this.log(`Chuyen doi muc tieu: ${this.lastTargetId} -> ${bestTarget.id}. Clear focus truoc...`, 'info');
          await this.resetTarget(playerState.x, playerState.y);
          // Bỏ qua tick này, để game engine xóa target cũ xong rồi tick sau mới đánh
          this._focusClearPending = true;
          this.lastTargetId = bestTarget.id;
          return;
        }
        this.lastTargetId = bestTarget.id;
        this.log(`Bat dau tan cong muc tieu: ${bestTarget.name || '???'} (Cu ly: ${dist.toFixed(0)}m)`, 'success');
      }

      this.hadTarget = true;
      const targetRange = 700;

      if (dist <= targetRange) {
        if (dist > 512) {
          await this.injector.sendDoSkillTargetPosition(skillId, bestTarget.x, bestTarget.y);
        } else {
          await this.injector.sendDoSkillTargetPlayer(skillId, bestTarget.id);
        }
      }
    } else {
      // Khi không có mục tiêu: KHÔNG cast để tiết kiệm mana, chỉ sync vị trí đã làm ở trên
      if (this.hadTarget) {
        this.hadTarget = false;
        this.lastTargetId = null;
        this.log(`Da tieu diet hoac mat dau muc tieu.`, 'warn');
        await this.resetTarget(info.x, info.y);
      }
    }
  }
}

module.exports = { AutoPK };
