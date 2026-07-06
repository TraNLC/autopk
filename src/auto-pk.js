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
    
    this.attackCriteria = 'nearest'; // nearest | lowest_level | highest_level

    // Default skills to execute
    this.attackSkills = [1];
    this.currentSkillIndex = 0;
    this.lastLagFixTime = 0;
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
   * Hàm chấm điểm cho một mục tiêu
   */
  calculateTargetScore(player, enemy) {
    // Cấu hình các trọng số ưu tiên (Weights)
    const WEIGHT_DISTANCE = 0.4; // Trọng số khoảng cách (càng gần càng tốt)
    const WEIGHT_HP = 0.3;       // Trọng số máu thấp (tiện dứt điểm)
    const WEIGHT_ELEMENT = 0.3;  // Trọng số khắc hệ ngũ hành

    let score = 0;

    // 1. Đánh giá khoảng cách (Chuẩn hóa về khoảng 0 - 1)
    const maxRange = 800;
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
    if (info.riding) {
      this.log(`Phat hien cuoi ngua khi chien dau. Tu dong xuong ngua...`, 'warn');
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
      this.hadTarget = true;
      // Dùng vị trí từ getNearEnemies (localX/Y) đồng bộ với findBestTarget
      const dist = Math.sqrt(Math.pow(bestTarget.x - playerState.x, 2) + Math.pow(bestTarget.y - playerState.y, 2));
      const targetRange = 700;

      if (dist <= targetRange) {
        if (dist > 512) {
          this.log(`Tan cong ngoai tam chieu (${dist.toFixed(0)}m > 512m). Dung im xa chieu vao toa do (${bestTarget.x}, ${bestTarget.y})`, 'info');
          await this.injector.sendDoSkillTargetPosition(skillId, bestTarget.x, bestTarget.y);
        } else {
          this.log(`Dich trong tam chieu. Tan cong: ${bestTarget.name || '???'} (${dist.toFixed(0)}m)`, 'success');
          await this.injector.sendDoSkillTargetPlayer(skillId, bestTarget.id);
        }
      }
    } else {
      // Khi không có mục tiêu: KHÔNG cast để tiết kiệm mana, chỉ sync vị trí đã làm ở trên
      if (this.hadTarget) {
        this.hadTarget = false;
        this.log(`Mat muc tieu hoac muc tieu da bay mau. Dang Reset Focus de chong chay bay...`, 'warn');
        await this.session.callRpc('clearFocus');
      }
    }
  }
}

module.exports = { AutoPK };
