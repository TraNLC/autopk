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
    
    this.attackCriteria = 'nearest'; // nearest | lowest_level | highest_level

    // Default skills to execute
    this.attackSkills = [1];
    this.currentSkillIndex = 0;
    this.lastLagFixTime = 0;
    this._lastSelfDieTime = Date.now(); // Khởi tạo bằng giờ hiện tại để không bị chết ngay lập tức
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

  /**
   * Start the PK loop.
   */
  async start() {
    if (this.running) return;
    this.running = true;
    this.loadProfile();

    console.log('[AutoPK] Starting Auto PK Loop...');

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
      // Khi dừng PK (hoặc nhảy map/tương tác NPC), tự gửi 1 lệnh di chuyển tại chỗ để huỷ target cũ
      const info = await this.memory.getPlayerInfo();
      if (info && info.x && info.y) {
        await this.injector.sendDoSkillTargetPosition(1, info.x, info.y);
      }
    } catch (e) {}
  }

  getElementRelation(mySeries, targetSeries) {
    if (mySeries === -1 || targetSeries === -1) return 0;
    // JX1 Series: 0: Kim, 1: Mộc, 2: Thủy, 3: Hỏa, 4: Thổ
    if ((mySeries === 0 && targetSeries === 1) ||
        (mySeries === 1 && targetSeries === 4) ||
        (mySeries === 4 && targetSeries === 2) ||
        (mySeries === 2 && targetSeries === 3) ||
        (mySeries === 3 && targetSeries === 0)) {
      return 1; // Mình khắc địch (Có lợi)
    }
    if ((targetSeries === 0 && mySeries === 1) ||
        (targetSeries === 1 && mySeries === 4) ||
        (targetSeries === 4 && mySeries === 2) ||
        (targetSeries === 2 && mySeries === 3) ||
        (targetSeries === 3 && mySeries === 0)) {
      return -1; // Địch khắc mình (Bất lợi)
    }
    return 0; // Hòa hệ
  }

  /**
   * Hàm tìm mục tiêu tốt nhất dựa trên tính điểm (Khoảng cách + HP + Khắc hệ)
   */
  findBestTarget(player, enemyList) {
    const maxRange = this.skillRange; // Chỉ tìm trong tầm đánh

    let bestEnemy = null;
    let highestScore = -99999;

    for (const enemy of enemyList) {
      // Bỏ qua mục tiêu bất tử
      if (this.ignoreInvulnerable && enemy.states && (enemy.states.includes(2) || enemy.states.includes(52))) {
        continue;
      }
      
      const dist = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
      if (dist > maxRange) continue;

      let score = 0;
      
      // 1. Điểm khoảng cách (Càng gần càng nhiều điểm)
      score += (maxRange - dist);
      
      // 2. Điểm thấp máu (Ưu tiên KS)
      if (enemy.maxHp > 0) {
        const hpRatio = enemy.hp / enemy.maxHp;
        if (hpRatio < 0.3) score += 500; // Dưới 30% máu -> Khả năng giết cực cao
        else if (hpRatio < 0.5) score += 200; // Dưới 50% máu
      }

      // 3. Điểm ngũ hành
      if (player.series !== -1 && enemy.series !== -1) {
          const relation = this.getElementRelation(player.series, enemy.series);
          if (relation === 1) score += 300; // Khắc hệ -> ưu tiên đấm
          else if (relation === -1) score -= 300; // Bị khắc -> né bớt
      }

      if (score > highestScore) {
          highestScore = score;
          bestEnemy = enemy;
      }
    }
    
    if (bestEnemy) {
      const dist = Math.sqrt(Math.pow(bestEnemy.x - player.x, 2) + Math.pow(bestEnemy.y - player.y, 2));
      console.log(`[AutoPK] 🎯 Chọn mục tiêu: ${bestEnemy.name || '???'} (Cách ${dist.toFixed(0)}m - Điểm: ${highestScore.toFixed(0)})`);
    }
    return bestEnemy;
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

    // 0.5. Mỗi 5 phút tự đứng im 5s để chết 1 lần (reset trạng thái)
    const now = Date.now();
    if (now - this._lastSelfDieTime > 300000) {
      console.log('[AutoPK] [Sinh Tử] 5 phút — đứng im 5s để chết...');
      this._lastSelfDieTime = now;
      await new Promise(r => setTimeout(r, 5000));
      return;
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
    const enemiesRes = await this.memory.getNearEnemies();
    
    // Nếu không có bridge (safe mode), chỉ sync vị trí mỗi 15s, không scan enemy
    if (enemiesRes && enemiesRes.noBridge) {
      if (now - this.lastLagFixTime > 15000) {
        this.lastLagFixTime = now;
        await this.injector.sendGotoPosition(info.x, info.y);
      }
      return;
    }
    
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
      const dist = Math.sqrt(Math.pow(bestTarget.x - playerState.x, 2) + Math.pow(bestTarget.y - playerState.y, 2));

      if (dist <= this.skillRange) {
        console.log(`[AutoPK] [Chiến Trường] Địch trong tầm chiêu. Tấn công: ${bestTarget.name || '???'} (${dist.toFixed(0)}m)`);
        await this.injector.sendDoSkillTargetPlayer(skillId, bestTarget.id);
      }
    }
    // Khi không có mục tiêu: KHÔNG cast để tiết kiệm mana, chỉ sync vị trí đã làm ở trên
  }
}

module.exports = { AutoPK };
