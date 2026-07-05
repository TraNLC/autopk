// src/memory-reader.js -- Game Memory State Reader and RPC Wrapper (Step 3)

class MemoryReader {
  /**
   * @param {FridaSession} session
   */
  constructor(session) {
    this.session = session;
    this._lastPlayerInfoTime = 0;
    this._cachedPlayerInfo = null;
    this._lastEnemyTime = 0;
    this._cachedEnemies = null;
  }

  /**
   * Fetch player basic info (HP, MP, coordinates, target, state).
   * Throttled: max 1 RPC call per second, returns cached value otherwise.
   */
  async getPlayerInfo() {
    const now = Date.now();
    if (this._cachedPlayerInfo && (now - this._lastPlayerInfoTime < 1000)) {
      return this._cachedPlayerInfo;
    }
    try {
      const res = await this.session.callRpc('getPlayerInfo');
      if (res && res.ok) {
        this._cachedPlayerInfo = res;
        this._lastPlayerInfoTime = now;
        return res;
      }
    } catch (e) {
      console.warn(`[MemoryReader] Error calling getPlayerInfo: ${e.message}`);
    }
    if (this._cachedPlayerInfo) return this._cachedPlayerInfo;
    return {
      hp: 1000,
      maxHp: 1000,
      mp: 1000,
      maxMp: 1000,
      x: 0,
      y: 0,
      mapId: 0,
      targetId: '',
      fighting: false
    };
  }

  /**
   * Fetch player's current Sect / Guild faction.
   */
  async getMySect() {
    try {
      const info = await this.getPlayerInfo();
      if (info && info.sect !== undefined) {
        const SECT_NAMES = {
          0: "Thieu Lam",
          1: "Thien Vuong",
          2: "Duong Mon",
          3: "Ngu Doc",
          4: "Nga My",
          5: "Thuy Yen",
          6: "Cai Bang",
          7: "Thien Nhan",
          8: "Vo Dang",
          9: "Con Lon",
          10: "Minh Giao",
          11: "Doan Thi"
        };
        return SECT_NAMES[info.sect] || "None";
      }
    } catch (e) {
      // Return a safe fallback since we saw an access violation for sect properties
      return 'None';
    }
    return 'None';
  }

  /**
   * Get target NPC or player coordinates from memory if available.
   */
  async getTargetPosition(targetId) {
    if (!targetId) return null;
    try {
      // If we have custom RPC to look up other player coordinates, use it here
      const res = await this.session.callRpc('getPlayerPosition', targetId);
      if (res && res.ok && res.data) {
        return { x: res.data.x, y: res.data.y };
      }
    } catch (e) {
      // Quiet fail or fallback
    }
    return null;
  }

  /**
   * Scan nearby player shops.
   */
  async getNearbyShops() {
    try {
      const res = await this.session.callRpc('getNearbyShops');
      console.log(`[MemoryReader] getNearbyShops response:`, res);
      if (res && res.ok && res.shops) {
        return res.shops;
      }
      throw new Error(res ? res.error : 'Unknown error');
    } catch (e) {
      console.warn(`[MemoryReader] Error calling getNearbyShops: ${e.message}`);
      throw e;
    }
  }

  /**
   * Get items and attributes inside a specific shop.
   */
  async getShopItems(stallIndex) {
    try {
      const res = await this.session.callRpc('getShopItems', [stallIndex]);
      console.log(`[MemoryReader] getShopItems response:`, res);
      if (res && res.ok) {
        return { title: res.title, items: res.items };
      }
      throw new Error(res ? res.error : 'Unknown error');
    } catch (e) {
      console.warn(`[MemoryReader] Error calling getShopItems: ${e.message}`);
      throw e;
    }
  }

  /**
   * Get nearby enemies from game memory.
   * Throttled: max 1 RPC call per 2 seconds.
   */
  async getNearEnemies() {
    const now = Date.now();
    if (this._cachedEnemies && (now - this._lastEnemyTime < 2000)) {
      return this._cachedEnemies;
    }
    try {
      const res = await this.session.callRpc('getNearEnemies');
      if (res && res.ok) {
        this._cachedEnemies = res;
        this._lastEnemyTime = now;
        return res;
      }
      // If RPC fails (no bridge), cache the empty result for 5s
      this._cachedEnemies = { ok: false, enemies: [], noBridge: true };
      this._lastEnemyTime = now;
    } catch (e) {
      console.warn(`[MemoryReader] Error calling getNearEnemies: ${e.message}`);
    }
    if (this._cachedEnemies) return this._cachedEnemies;
    return { ok: false, enemies: [] };
  }
}

module.exports = { MemoryReader };
