// src/auto-pk.js -- Auto PK and Tong Kim Loop Module (Step 5)
const fs = require('fs');
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
    
    // Dynamic configurations (applied from GUI profile)
    this.priorityRange = 400;
    this.extendedRange = 800;
    this.skillRange = 512;
    this.outerRange = 700;
    this.usePriorityRange = true;
    this.useOuterRange = true;
    this.ignoreInvulnerable = true;
    this.dismountOnFight = true;
    this.attackCriteria = 'nearest'; // nearest | lowest_level | highest_level

    // Default skills to execute
    this.attackSkills = [1];
    this.currentSkillIndex = 0;
    this.lastLagFixTime = 0;
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
          console.log(`[AutoPK] Loaded profile GUID: ${this.profileGuid}`);
          return;
        }
      }
    } catch (e) {
      console.warn(`[AutoPK] Failed to load local profile guid: ${e.message}`);
    }
    
    // Default fallback GUIDs seen in logs
    this.profileGuid = '1dc8514c'; 
    console.log(`[AutoPK] Using default fallback profile GUID: ${this.profileGuid}`);
  }

  async start(sendLog) {
    if (this.running) return;
    this.running = true;
    this.loadProfile();

    console.log('[AutoPK] Starting Auto PK Loop...');
    if (sendLog) sendLog(`[${this.deviceId}] ⚔️ Khởi động luồng PK. Quét kỹ năng môn phái...`, 'info');

    // Clear target lock from previous staging area (NPC Trinh Sát)
    try {
      const info = await this.memory.getPlayerInfo();
      if (info) {
        // Tắt autoplay tạm thời để clear target
        await this.injector.sendApplyAutoplayProfile(false, "");
        await new Promise(r => setTimeout(r, 200));

        // Tự động gán skill 9x chủ động của môn phái bằng map cố định (tránh lỗi getMySkills)
        let targetSkill = 1;
        try {
          const sectSkill9xMap = {
            0: 104, // Thiếu Lâm (Đạt Ma)
            1: 114, // Thiên Vương (Truy Tinh)
            2: 132, // Đường Môn (Bạo Vũ)
            3: 142, // Ngũ Độc (Bách Độc)
            4: 152, // Nga Mi (Phong Sương)
            5: 172, // Thúy Yên (Băng Tâm Tiên Tử)
            6: 182, // Cái Bang (Kháng Long)
            7: 192, // Thiên Nhẫn (Vân Long)
            8: 204, // Võ Đang (Thiên Địa)
            9: 215  // Côn Lôn (Lôi Động)
          };
          
          const sect = info.sect !== undefined ? info.sect : -1;
          if (sect !== -1 && sectSkill9xMap[sect]) {
            targetSkill = sectSkill9xMap[sect];
            this.attackSkills = [targetSkill]; // Gán làm chiêu tấn công chính
            console.log(`[AutoPK] Gán cố định chiêu 9x theo phái: ID ${targetSkill}`);
            if (sendLog) sendLog(`[${this.deviceId}] 🎓 Phát hiện môn phái. Đặt chiêu 9x (ID ${targetSkill}) làm kỹ năng tấn công chính!`, 'success');
          } else {
            if (sendLog) sendLog(`[${this.deviceId}] ⚠️ Không xác định được hệ phái. Sử dụng đánh thường làm kỹ năng chính.`, 'warn');
          }
        } catch (e) {
          console.warn(`[AutoPK] Lỗi gán skill 9x: ${e.message}`);
        }

        // Cast chiêu thức 9x tại chỗ để hủy lock NPC cũ
        if (sendLog) sendLog(`[${this.deviceId}] ⚡ Thực hiện chiêu thức (ID ${targetSkill}) tại chỗ để hủy target NPC cũ...`, 'info');
        await this.injector.sendDoSkillTargetPosition(targetSkill, info.x || 0, info.y || 0);
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      console.warn(`[AutoPK] Failed to clear target: ${err.message}`);
    }

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
    console.log('[AutoPK] Stopping Auto PK Loop.');
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
   * Hàm chấm điểm cho một mục tiêu
   */
  calculateTargetScore(player, enemy) {
    // Cấu hình các trọng số ưu tiên (Weights)
    const WEIGHT_DISTANCE = 0.4; // Trọng số khoảng cách (càng gần càng tốt)
    const WEIGHT_HP = 0.3;       // Trọng số máu thấp (tiện dứt điểm)
    const WEIGHT_ELEMENT = 0.3;  // Trọng số khắc hệ ngũ hành

    let score = 0;

    // 1. Đánh giá khoảng cách (Chuẩn hóa về khoảng 0 - 1)
    const maxRange = this.extendedRange;
    const distance = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
    const distanceScore = distance < maxRange ? (1 - (distance / maxRange)) : 0;
    score += distanceScore * WEIGHT_DISTANCE;

    // 2. Đánh giá lượng máu (HP càng thấp điểm càng cao để tối ưu KS mạng)
    const hpRatio = enemy.maxHp > 0 ? (enemy.hp / enemy.maxHp) : 1;
    const hpScore = 1 - hpRatio; 
    score += hpScore * WEIGHT_HP;

    // 3. Đánh giá hệ Ngũ Hành
    const relation = this.getElementRelation(player.series, enemy.series);
    let elementScore = 0.5; // Mặc định trung tính
    if (relation === 1) {
      elementScore = 1.0; // Khắc hệ mục tiêu
    } else if (relation === -1) {
      elementScore = 0.1; // Tránh đánh đứa khắc mình
    }
    score += elementScore * WEIGHT_ELEMENT;

    return score;
  }

  /**
   * Hàm quét và tìm mục tiêu tối ưu nhất
   * - usePriorityRange=true:  Phạm vi ưu tiên → khắc hệ; còn lại → gần nhất
   * - usePriorityRange=false: Toàn bộ phạm vi → gần nhất thuần
   * - useOuterRange=true:      Filter max = outerRange (chỉ tìm mục tiêu có thể đánh)
   */
  findBestTarget(player, enemyList) {
    // Phạm vi filter hiệu quả: nếu bật outerRange thì dùng outerRange, không thì extendedRange
    const effectiveMaxRange = this.useOuterRange ? this.outerRange : this.extendedRange;

    // Lọc theo khoảng cách và trạng thái đặc biệt
    const filteredEnemies = enemyList.filter(enemy => {
      const dist = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
      
      if (dist > effectiveMaxRange) return false;

      if (this.ignoreInvulnerable && enemy.states && (enemy.states.includes(2) || enemy.states.includes(52))) {
        return false;
      }
      return true;
    });

    if (filteredEnemies.length === 0) return null;

    // Nếu KHÔNG dùng phạm vi ưu tiên → đánh gần nhất thuần
    if (!this.usePriorityRange) {
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

    // === CÓ dùng phạm vi ưu tiên: 2 tầng ===
    const priorityEnemies = filteredEnemies.filter(enemy => {
      const dist = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
      return dist <= this.priorityRange;
    });

    if (priorityEnemies.length > 0) {
      // === TRONG PHẠM VI ƯU TIÊN: khắc hệ ngũ hành ===
      let nearest = null;
      let nearestDist = 99999;
      for (const enemy of priorityEnemies) {
        const dist = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = enemy;
        }
      }

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

      if (bestKicHe !== nearest) {
        console.log(`[AutoPK] 🎯 [Ưu tiên] Khắc hệ: ${bestKicHe.name || '???'} (${bestKicHeDist.toFixed(0)}m) < gần nhất ${nearest.name || '???'} (${nearestDist.toFixed(0)}m)`);
      }
      return bestKicHe;

    } else {
      // === NGOÀI PHẠM VI ƯU TIÊN (priorityRange → effectiveMaxRange): gần nhất ===
      let nearest = null;
      let nearestDist = 99999;
      for (const enemy of filteredEnemies) {
        const dist = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = enemy;
        }
      }
      console.log(`[AutoPK] 🎯 [Mở rộng] Gần nhất: ${nearest.name || '???'} (${nearestDist.toFixed(0)}m)`);
      return nearest;
    }
  }

  /**
   * Core logic run at each tick interval.
   */
  async tick() {
    const info = await this.memory.getPlayerInfo();
    if (!info) return;

    // 0. Kiểm tra chết: nếu HP=0 thì dừng tick, để autoTongKimLoop xử lý hồi sinh
    if (info.hp !== undefined && info.hp <= 0) {
      return; // Không cast skill khi đã chết
    }

    // 1. Tự động xuống ngựa khi phát hiện mục tiêu chiến đấu
    if (this.dismountOnFight && info.riding) {
      console.log(`[AutoPK] Phát hiện cưỡi ngựa khi chiến đấu. Tự động xuống ngựa...`);
      await this.session.callRpc('switchHorse');
      // Chờ 300ms để hoạt cảnh xuống ngựa hoàn tất
      await new Promise(r => setTimeout(r, 300));
      return;
    }

    // 2. Fix lag vị trí: chỉ đồng bộ khi KHÔNG có mục tiêu (tránh giật khi đang đánh)
    //    Khi đang tấn công, gói tin cast skill đã tự động cập nhật vị trí cho server
    const now = Date.now();
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
    if (!hasEnemy && now - this.lastLagFixTime > 15000) {
      this.lastLagFixTime = now;
      await this.injector.sendGotoPosition(info.x, info.y);
    }

    const skillId = this.attackSkills[this.currentSkillIndex];
    this.currentSkillIndex = (this.currentSkillIndex + 1) % this.attackSkills.length;

    if (bestTarget) {
      // Dùng vị trí từ getNearEnemies (localX/Y) đồng bộ với findBestTarget
      const dist = Math.sqrt(Math.pow(bestTarget.x - playerState.x, 2) + Math.pow(bestTarget.y - playerState.y, 2));
      const targetRange = this.useOuterRange ? this.outerRange : this.skillRange;

      if (dist <= targetRange) {
        if (dist > this.skillRange && this.useOuterRange) {
          console.log(`[AutoPK] ⚡ Tấn công ngoài tầm chiêu (${dist.toFixed(0)}m > ${this.skillRange}m). Đứng im xả chiêu vào tọa độ (${bestTarget.x}, ${bestTarget.y})`);
          await this.injector.sendDoSkillTargetPosition(skillId, bestTarget.x, bestTarget.y);
        } else {
          console.log(`[AutoPK] ⚔️ Địch trong tầm chiêu. Tấn công: ${bestTarget.name || '???'} (${dist.toFixed(0)}m)`);
          await this.injector.sendDoSkillTargetPlayer(skillId, bestTarget.id);
        }
      }
    }
    // Khi không có mục tiêu: KHÔNG cast để tiết kiệm mana, chỉ sync vị trí đã làm ở trên
  }
}

module.exports = { AutoPK };
