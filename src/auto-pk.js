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
    this.hpThreshold = 0.65; // Use health recovery when HP < 65%
    this.mpThreshold = 0.30; // Use mana recovery when MP < 30%
    
    // Default skills to execute (e.g. basic attacks or combos)
    this.attackSkills = [1, 2, 3];
    this.currentSkillIndex = 0;
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
      this.loopTimer = setTimeout(run, 1000); // Tick once per second
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
    } catch (e) {
      // Quiet fail
    }
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
    const maxRange = 1000; // Tầm nhìn tối đa
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
   */
  findBestTarget(player, enemyList) {
    let bestTarget = null;
    let highestScore = -1;

    for (const enemy of enemyList) {
      if (!enemy.id) continue;

      const score = this.calculateTargetScore(player, enemy);
      if (score > highestScore) {
        highestScore = score;
        bestTarget = { ...enemy, score };
      }
    }

    return bestTarget;
  }

  /**
   * Core logic run at each tick interval.
   */
  async tick() {
    const info = await this.memory.getPlayerInfo();
    if (!info) return;

    // 1. Health and Mana Recovery Checks
    const hpRatio = info.hp / (info.maxHp || 1000);
    const mpRatio = info.mp / (info.maxMp || 1000);

    if (hpRatio < this.hpThreshold) {
      console.log(`[AutoPK] HP Low: ${(hpRatio * 100).toFixed(1)}%. Triggering recovery.`);
      // Call standard skill or health use packet if needed, or rely on auto-potions.
    }

    if (mpRatio < this.mpThreshold) {
      console.log(`[AutoPK] MP Low: ${(mpRatio * 100).toFixed(1)}%. Triggering recovery.`);
    }

    // 2. PK / Tong Kim Attack Automation
    if (info.fighting) {
      // Tự động duy trì kỹ năng buff trấn phái (Ví dụ Tuyết Ảnh của phái Thúy Yên là ID 109)
      const sect = info.sect !== undefined ? info.sect : -1;
      const sectSkillMap = {
          0: 102, // Thiếu Lâm (Dịch Cân Kinh)
          1: 111, // Thiên Vương (Thiên Vương Chiến Ý)
          2: 129, // Đường Môn (Đường Môn Độc Kinh)
          3: 139, // Ngũ Độc (Ngũ Độc Kỳ Kinh)
          4: 159, // Nga Mi (Phật Pháp Vô Biên)
          5: 109, // Thúy Yên (Tuyết Ảnh)
          6: 179, // Cái Bang (Cái Bang Tâm Pháp)
          7: 189, // Thiên Nhẫn (Thiên Nhẫn Tâm Pháp)
          8: 209, // Võ Đang (Thái Cực Thần Công)
          9: 219  // Côn Lôn (Côn Lôn Tâm Pháp)
      };
      const buffSkillId = sectSkillMap[sect];
      if (buffSkillId && buffSkillId > 1) {
          const now = Date.now();
          if (!this.lastBuffTime || (now - this.lastBuffTime) > 60000) { // Buff mỗi 60 giây
              console.log(`[AutoPK] Tự động duy trì buff kỹ năng môn phái ID: ${buffSkillId}`);
              await this.injector.sendDoSkillTargetPosition(buffSkillId, info.x, info.y);
              this.lastBuffTime = now;
          }
      }

      const skillId = this.attackSkills[this.currentSkillIndex];
      this.currentSkillIndex = (this.currentSkillIndex + 1) % this.attackSkills.length;

      // Quét các kẻ địch xung quanh từ bộ nhớ RAM (cực kỳ nhanh dưới 1ms)
      const enemiesRes = await this.memory.getNearEnemies();
      let bestTarget = null;

      if (enemiesRes && enemiesRes.ok && enemiesRes.enemies && enemiesRes.enemies.length > 0) {
        // Tìm mục tiêu tối ưu nhất dựa trên khoảng cách, máu và khắc hệ Ngũ Hành
        const playerState = {
          x: enemiesRes.localX || info.x,
          y: enemiesRes.localY || info.y,
          series: enemiesRes.localSeries !== undefined ? enemiesRes.localSeries : -1
        };
        bestTarget = this.findBestTarget(playerState, enemiesRes.enemies);
      }

      if (bestTarget) {
        console.log(`[AutoPK] Casting skill ${skillId} on best counter target: ${bestTarget.name} (${bestTarget.id}) | Hệ: ${bestTarget.series} | HP: ${bestTarget.hp}/${bestTarget.maxHp} | Điểm: ${bestTarget.score.toFixed(3)}`);
        await this.injector.sendDoSkillTargetPlayer(skillId, bestTarget.id);
      } else if (info.targetId) {
        console.log(`[AutoPK] Fallback: Casting skill ${skillId} on target: ${info.targetId}`);
        await this.injector.sendDoSkillTargetPlayer(skillId, info.targetId);
      } else {
        // Area attack or positional attack at current player location if target is empty
        console.log(`[AutoPK] No target. Casting skill ${skillId} on position: (${info.x}, ${info.y})`);
        await this.injector.sendDoSkillTargetPosition(skillId, info.x, info.y);
      }
    }
  }
}

module.exports = { AutoPK };
