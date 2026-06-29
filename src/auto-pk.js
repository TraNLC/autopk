// src/auto-pk.js -- Auto PK + Tong Kim Loop (ported from pk_app.py Mac version, 100% tested)
const fs = require('fs');
const path = require('path');

// --- Constants ---
const CAMP_LABEL = { 1: 'Tong', 2: 'Kim' };
const SERIES_LABEL = { 0: 'Kim', 1: 'Moc', 2: 'Thuy', 3: 'Hoa', 4: 'Tho' };

// Tong Kim NPC fallback IDs
const TK_HEAL_NPC = 5554;
const TK_WAR_NPC = 5574;
const TK_WAR_OPT_TONG = 1;   // Button 1 = enter war as Tong faction
const TK_WAR_OPT_KIM = 2;    // Button 2 = enter war as Kim faction
const TK_WAR_OPT_CANCEL = 3; // Button 3 = cancel/exit dialog
const TK_WAR_OPT = 1;        // Default (Tong)
const TK_REJOIN_CD = 5.0;

// Dialog keywords for detecting heal/war options (matches Python Mac _HEAL_KW / _WAR_KW)
const HEAL_KEYWORDS = ['dược phẩm miễn phí', 'nhận dược phẩm', 'dược phẩm', 'nhận thuốc', 'hồi phục'];
const WAR_KEYWORDS = ['ra chiến trường', 'vào chiến trường', 'tham chiến', 'ra trận', 'xuất chiến', 'chiến trường', 'tham gia'];

// War side override: 'auto' = detect from camp, 'tong' = force button 1, 'kim' = force button 2
const TK_WAR_SIDE = 'auto';

// Speed items for Tong Kim (particular id, gap seconds)
const LAC_TYPES = [
  { label: 'Phi Toc Hoan', particular: 45, gap: 295 },
  { label: 'Lenh Bai',     particular: 51, gap: 175 },
  { label: 'Chien Co',     particular: 50, gap: 175 },
];

// --- Protobuf Decode Helpers ---
function readVarint(buf, offset) {
  let r = 0, s = 0;
  while (offset < buf.length) {
    const x = buf[offset]; offset++;
    r |= (x & 0x7f) << s;
    if (!(x & 0x80)) break;
    s += 7;
  }
  return { value: r, offset };
}

function parseOp33NpcId(hex) {
  try {
    const b = Buffer.from(hex, 'hex');
    if (b.length < 8 || b[6] !== 0x0a) return null;
    const ln = b[7];
    const s = b.slice(8, 8 + ln).toString('ascii');
    return /^\d+$/.test(s) ? s : null;
  } catch (e) { return null; }
}

function parseOp35SelectIndex(hex) {
  try {
    const b = Buffer.from(hex, 'hex');
    if (b.length < 7 || b[6] !== 0x08) return null;
    let val = 0, shift = 0, i = 7;
    while (i < b.length) {
      val |= (b[i] & 0x7f) << shift;
      if (!(b[i] & 0x80)) break;
      i++; shift += 7;
    }
    return val;
  } catch (e) { return null; }
}

function noAccent(s) {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ============================================================

class AutoPK {
  /**
   * @param {object} session - FridaSession
   * @param {object} memory - MemoryReader
   * @param {object} injector - PacketInjector
   * @param {object} sniffer - PacketSniffer
   * @param {string} deviceId - ADB device ID
   * @param {object} cfg - merged config
   */
  constructor(session, memory, injector, sniffer, deviceId, cfg = {}) {
    this.session = session;
    this.memory = memory;
    this.injector = injector;
    this.sniffer = sniffer;
    this.deviceId = (deviceId || 'default').replace(/:/g, '_');
    this.config = cfg;

    this.running = false;
    this.loopTimer = null;

    // Per-device dynamic state
    this.atCamp = false;
    this.dead = false;
    this.myCamp = null;
    this.myMapId = null;
    this.myCid = '';

    // NPC runtime IDs (resolved per session by name-match in camp)
    this.tkHealNpc = null;
    this.tkWarNpc = null;
    this.tkWarPkt = null;
    this.tkHealPkt = null;
    this.tkHealPart = null;
    this.tkHealSlot = null;
    this.tkHealOpt = null;

    // NPC learn from click
    this.npcLearn = {};
    this.lastNpc = null;

    // Timing
    this.lastCamp = 0;
    this.lastRejoin = 0;
    this.lastHeal = 0;
    this.lastBuff = 0;
    this.lastPop = 0;
    this.lastLearn = 0;

    // Speed items
    this.lacTimers = {};
    this.lacStocks = {};
    this.lacLogTs = {};

    this.errors = 0;
    this.rejoining = false;
    this.logThrottle = {};

    this.buffId = null;
    this.hpThreshold = 65;
    this.mpThreshold = 30;

    // Persistent NPC DB
    this.tkDbFile = path.join(__dirname, '..', 'data', 'output', 'tk_npc_learn.json');
    this.tkDb = {};
    this._tkLoadDb();
  }

  // ========== Persistent DB ==========
  _tkLoadDb() {
    try {
      const dir = path.dirname(this.tkDbFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.tkDbFile)) {
        this.tkDb = JSON.parse(fs.readFileSync(this.tkDbFile, 'utf-8')) || {};
      }
    } catch (e) { this.tkDb = {}; }
    if (!this.tkDb['2']) {
      this.tkDb['2'] = { heal: 126, war: 106, heal_part: 25 };
      this._tkSaveDb();
    }
  }

  _tkSaveDb() {
    try {
      const dir = path.dirname(this.tkDbFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.tkDbFile, JSON.stringify(this.tkDb, null, 2), 'utf-8');
    } catch (e) { /* quiet */ }
  }

  _tkLearn(key, val) {
    const camp = String(this.myCamp || '');
    if (!camp || camp === 'undefined' || camp === 'null') return;
    const rec = this.tkDb[camp] || (this.tkDb[camp] = {});
    if (rec[key] !== val) { rec[key] = val; this._tkSaveDb(); }
  }

  _tkApply(camp) {
    const rec = this.tkDb[String(camp)] || {};
    if (rec.heal)      this.tkHealNpc   = parseInt(rec.heal, 10);
    if (rec.war)       this.tkWarNpc    = parseInt(rec.war, 10);
    if (rec.war_pkt)   this.tkWarPkt    = rec.war_pkt;
    if (rec.heal_pkt)  this.tkHealPkt   = rec.heal_pkt;
    if (rec.heal_part) this.tkHealPart  = parseInt(rec.heal_part, 10);
    if (rec.heal_opt !== undefined) this.tkHealOpt = rec.heal_opt;
  }

  // ========== Logging ==========
  log(msg) {
    const ts = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    const line = `[${ts}] ${msg}`;
    console.log(line);
    try {
      const logDir = path.join(__dirname, '..', 'data', 'output');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, 'pk_app.log'), line + '\n', 'utf-8');
    } catch (e) { /* quiet */ }
  }

  logT(key, msg, gap = 30) {
    const now = Date.now() / 1000;
    if (now - (this.logThrottle[key] || 0) < gap) return;
    this.logThrottle[key] = now;
    this.log(msg);
  }

  // ========== Start / Stop ==========
  async start() {
    if (this.running) return;
    this.running = true;
    this.errors = 0;
    this.log('Auto PK Loop started');

    // Read camp
    try {
      const sect = await this.session.callRpc('getMySect');
      if (sect && sect.campValue !== undefined) {
        this.myCamp = sect.campValue;
        this._tkApply(sect.campValue);
        this.log(`Camp detected: ${CAMP_LABEL[this.myCamp] || 'c' + this.myCamp}`);
      }
    } catch (e) { /* skip */ }

    // Resolve heal slot
    try { await this._resolveHealSlot(); } catch (e) { /* skip */ }

    const run = async () => {
      if (!this.running) return;
      try { await this.tick(); } catch (e) {
        this.errors++;
        this.log(`Tick error: ${e.message}`);
        if (this.errors >= 8) {
          this.log('Too many errors - stopping (watchdog will recover)');
          this.running = false;
          return;
        }
      }
      this.loopTimer = setTimeout(run, 500);
    };
    run();
  }

  async stop() {
    this.running = false;
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
    this.log('Auto PK Loop stopped');
  }

  // ========== Main Loop ==========
  async tick() {
    const now = Date.now() / 1000;

    // 1. Poll packets
    let pkts = [];
    try {
      const res = await this.session.callRpc('getRecvPackets');
      if (res && res.ok && res.packets) pkts = res.packets;
    } catch (e) { this.errors++; return; }
    this.errors = 0;

    // 2. Parse TK score from op124
    for (const p of pkts) {
      if (p.opcode === 9) continue;
      try {
        const text = Buffer.from(p.hex || '', 'hex').slice(6)
          .toString('utf-8').toLowerCase().replace(/[^\x20-\x7e\u00C0-\u1EF9]/g, '');
        if (text.includes('ca nhan') && text.includes('diem')) {
          const m = text.match(/diem[\s:]*(\d+)/);
          if (m) this.log(`TK Score: ${m[1]}`);
        }
      } catch (e) { /* skip */ }
    }

    // 3. Close popups ~2s
    if (now - this.lastPop > 2) {
      this.lastPop = now;
      try { await this.session.callRpc('closeDialogPopups'); } catch (e) { /* skip */ }
    }

    // 4. Learn NPC ops from user clicks
    if (now - this.lastLearn > 0.9) {
      this.lastLearn = now;
      await this._learnNpcOps();
    }

    // 5. Speed items
    await this._useSpeedItems(now);

    // 6. Camp detect + Tong Kim rejoin
    if (now - this.lastCamp > 2.0) {
      this.lastCamp = now;
      await this._campDetectAndRejoin(now);
    }

    // 7. HP/MP recovery
    if (now - this.lastHeal > 2.0) {
      this.lastHeal = now;
      await this._checkVitals();
    }

    // 8. Buff
    if (this.buffId && now - this.lastBuff > 60) {
      this.lastBuff = now;
      await this._castBuff();
    }
  }

  // ========== Camp Detection ==========
  async _campDetectAndRejoin(now) {
    let nids = new Set();
    try {
      const info = await this.session.callRpc('getPlayerInfo');
      if (!info || !info.ok) return;
      this.myMapId = info.mapId;
      if (info.cid) this.myCid = String(info.cid);

      // Re-read camp if missing
      if (this.myCamp === null || this.myCamp === undefined) {
        try {
          const sect = await this.session.callRpc('getMySect');
          if (sect && sect.campValue !== undefined) {
            this.myCamp = sect.campValue;
            this._tkApply(sect.campValue);
          }
        } catch (e) { /* skip */ }
      }

      // Scan nearby NPCs
      try {
        const npc = await this.session.callRpc('get_near_npc_ids');
        if (npc && npc.ok && npc.ids) {
          nids = new Set(npc.ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id)));
        }
      } catch (e) {
        // Try detail scan for name matching
        try {
          const detail = await this.session.callRpc('get_near_npcs_detail');
          if (detail && detail.ok && detail.npcs) {
            this._tkAutoFind(detail.npcs, info.mapId);
            nids = new Set(detail.npcs.map(n => parseInt(n.id, 10)).filter(id => !isNaN(id)));
          }
        } catch (e2) { /* RPC may not exist */ }
      }
    } catch (e) { return; }

    const healNpc = this.tkHealNpc || TK_HEAL_NPC;
    const warNpc  = this.tkWarNpc  || TK_WAR_NPC;
    const wasCamp = this.atCamp;
    this.atCamp = nids.has(healNpc) || nids.has(warNpc);

    if (wasCamp && !this.atCamp) {
      this.lacTimers = {};
      this.lastBuff = 0;
      this.log('Left camp -> entering war zone');
    }

    if (this.atCamp && now - this.lastRejoin > TK_REJOIN_CD) {
      this.lastRejoin = now;
      if (!wasCamp) this.log('At camp -> healing + entering war');
      await this._doRejoin(healNpc, warNpc);
      await this._sleep(300);
    }
  }

  _tkAutoFind(npcs, mapId) {
    if (this.myCamp === null || mapId === undefined || mapId === null) return;
    let ch = false;
    for (const n of npcs) {
      const nid = parseInt(n.id, 10);
      if (isNaN(nid)) continue;
      const name = noAccent(n.name || '');
      if (!name || name.includes('chieu binh')) continue;

      if (name.includes('quan nhu') && this.tkHealNpc !== nid) {
        this.tkHealNpc = nid; this._tkLearn('heal', nid); ch = true;
        this.log(`Found heal NPC: ${nid} ('${n.name}')`);
      } else if (name.includes('trinh sat') && this.tkWarNpc !== nid) {
        this.tkWarNpc = nid; this._tkLearn('war', nid); ch = true;
        this.log(`Found war NPC: ${nid} ('${n.name}')`);
      }
    }
    if (ch) {
      const camp = String(this.myCamp || '');
      const rec = this.tkDb[camp] || (this.tkDb[camp] = {});
      const maps = rec.maps || (rec.maps = {});
      const mrec = maps[String(mapId)] || (maps[String(mapId)] = {});
      if (this.tkHealNpc) mrec.heal = this.tkHealNpc;
      if (this.tkWarNpc) mrec.war = this.tkWarNpc;
      this._tkSaveDb();
    }
    if (!this.tkHealNpc || !this.tkWarNpc) {
      this.logT('nomatch', `NPC not yet matched on map ${mapId}. Need Quan Nhu + Trinh Sat.`, 60);
    }
  }

  // ========== Rejoin (Heal + War Entry) — FIXED for remote NPC buttons 2/3 ==========
  async _doRejoin(healNpcId, warNpcId) {
    this.rejoining = true;
    try {
      // ========== HEAL ==========
      // USE RAW op33 (sendNpcDialogue) instead of il2cpp remoteNpcDialogue —
      // raw op33 works cross-map because server doesn't check distance.
      // il2cpp Talk() may fail when NPC is on a different map.
      try {
        const healOpts = await this.injector.talkNpcAndGetOptions(String(healNpcId), 2000);
        await this._sleep(200);

        const hOpt = this.tkHealOpt;
        if (hOpt === 'op232' || hOpt === 232) {
          try { await this.injector.sendRaw(232, ''); } catch (e) { /* skip */ }
        } else if (typeof hOpt === 'number') {
          try { await this.injector.sendNpcSelect(hOpt); } catch (e) { /* skip */ }
        } else {
          // No learned option → find "dược phẩm miễn phí" in dialog
          const healIdx = this.injector.findOptionIndex(healOpts, HEAL_KEYWORDS);
          if (healIdx >= 0) {
            try { await this.injector.sendNpcSelect(healIdx); } catch (e) { /* skip */ }
            this.log(`Heal auto-detected option index: ${healIdx} (dialog: ${healOpts.join(' | ')})`);
          } else {
            // Fallback: try op232 (Kim faction) then index 0
            try { await this.injector.sendRaw(232, ''); } catch (e) { /* skip */ }
          }
        }
      } catch (e) { this.log(`Heal NPC talk error: ${e.message}`); }

      await this._sleep(600);
      try { await this.session.callRpc('closeDialogPopups'); } catch (e) { /* skip */ }

      // ========== WAR ENTRY ==========
      // Same fix: use raw op33 for cross-map support + read dialog before selecting
      try {
        const warOpts = await this.injector.talkNpcAndGetOptions(String(warNpcId), 2000);
        await this._sleep(200);

        // Determine which button to press
        let warIdx = TK_WAR_OPT; // default = button 1 (Tong)

        // Check for learned option first
        const learnedIdx = this.npcLearn[String(warNpcId)];
        if (typeof learnedIdx === 'number') {
          warIdx = learnedIdx;
        } else if (warOpts.length > 0) {
          // Read dialog to find "ra chiến trường" option
          const foundIdx = this.injector.findOptionIndex(warOpts, WAR_KEYWORDS);
          if (foundIdx >= 0) {
            warIdx = foundIdx;
          }
          this.log(`War dialog options: [${warOpts.join(' | ')}] → selected index ${warIdx}`);
        }

        // Override based on TK_WAR_SIDE config
        if (TK_WAR_SIDE === 'tong') warIdx = TK_WAR_OPT_TONG;
        else if (TK_WAR_SIDE === 'kim') warIdx = TK_WAR_OPT_KIM;
        // 'auto' = use camp detection
        else if (TK_WAR_SIDE === 'auto' && this.myCamp !== null) {
          // Camp 1 = Tong → button 1, Camp 2 = Kim → button 2
          if (this.myCamp === 2) warIdx = TK_WAR_OPT_KIM;
          else warIdx = TK_WAR_OPT_TONG;
        }

        try { await this.injector.sendNpcSelect(warIdx); } catch (e) { /* skip */ }
        this.logT('war', `War entry: NPC ${warNpcId} → button ${warIdx} (camp=${this.myCamp})`, 20);
      } catch (e) { this.log(`War NPC talk error: ${e.message}`); }

      if (this.tkWarPkt) {
        await this._sleep(200);
        try { await this.session.callRpc('sendPacket', 229, this.tkWarPkt); } catch (e) { /* skip */ }
      }

      await this._sleep(500);
      try { await this.session.callRpc('closeDialogPopups'); } catch (e) { /* skip */ }
      this.logT('rejoin', 'Rejoin done', 20);
    } catch (e) {
      this.log(`Rejoin error: ${e.message}`);
    } finally {
      try { await this.session.callRpc('getSentPackets'); } catch (e) { /* skip */ }
      this.rejoining = false;
    }
  }

  // ========== Learn NPC from User Clicks ==========
  async _learnNpcOps() {
    if (this.rejoining) return;
    let pkts = [];
    try {
      const res = await this.session.callRpc('getSentPackets');
      if (res && res.ok && res.packets) pkts = res.packets;
    } catch (e) { return; }

    for (const p of pkts) {
      const op = p.opcode, hx = p.hex || '';
      if (op === 33) {
        const nid = parseOp33NpcId(hx);
        if (nid) { this.lastNpc = nid; this.logT('learn33', `User opened NPC ${nid}`, 5); }
      } else if (op === 35) {
        const si = parseOp35SelectIndex(hx);
        const ln = this.lastNpc;
        if (ln && si !== null && this.npcLearn[ln] !== si) {
          this.npcLearn[ln] = si;
          this.log(`Learned NPC ${ln} -> option ${si}`);
          if (ln === String(this.tkHealNpc)) {
            this.tkHealOpt = si; this._tkLearn('heal_opt', si);
          }
          if (ln !== String(this.tkHealNpc)) {
            this.tkWarNpc = parseInt(ln, 10); this._tkLearn('war', parseInt(ln, 10));
            this.log(`Learned war NPC: ${ln}`);
          }
        }
      } else if (op === 232) {
        const ln = this.lastNpc;
        if (ln && ln !== String(this.tkWarNpc)) {
          this.tkHealNpc = parseInt(ln, 10); this.tkHealOpt = 'op232';
          this._tkLearn('heal', parseInt(ln, 10)); this._tkLearn('heal_opt', 'op232');
          this.log(`Learned heal NPC (Kim): ${ln}`);
        }
      } else if (op === 229) {
        const ln = this.lastNpc;
        if (ln && ln !== String(this.tkHealNpc) && !this.npcLearn[ln]) {
          this.tkWarNpc = parseInt(ln, 10); this.tkWarPkt = hx;
          this._tkLearn('war', parseInt(ln, 10)); this._tkLearn('war_pkt', hx);
          this.log(`Learned war NPC (Kim, op229): ${ln}`);
        }
      }
    }
  }

  // ========== Speed Items ==========
  async _useSpeedItems(now) {
    if (this.atCamp || this.dead) return;
    for (const lac of LAC_TYPES) {
      const { label, particular: pid, gap } = lac;
      if (now - (this.lacTimers[pid] || 0) < gap) continue;
      this.lacTimers[pid] = now;

      const stock = this.lacStocks[pid];
      if (stock !== undefined && stock <= 0) {
        if (now - (this.lacLogTs[pid] || 0) > 60) {
          this.lacLogTs[pid] = now;
          this.log(`Out of ${label}`);
        }
        continue;
      }

      try {
        const items = await this._dumpBagItems();
        if (!items || items.length === 0) continue;
        const cand = items.filter(it =>
          it.particular === pid && it.location === 2 && (it.stack || 1) > 0
        );
        if (cand.length > 0) {
          const best = cand.reduce((a, b) => (a.stack || 1) > (b.stack || 1) ? a : b);
          const slot = best.slot !== undefined ? best.slot : best.index;
          if (slot !== undefined && slot !== null) {
            await this._useItem(slot);
            this.lacStocks[pid] = Math.max(0, (best.stack || 1) - 1);
            if (now - (this.lacLogTs[pid] || 0) > 25) {
              this.lacLogTs[pid] = now;
              this.log(`Used ${label} (slot ${slot}, ~${this.lacStocks[pid]} left)`);
            }
          }
        } else {
          this.lacStocks[pid] = 0;
          this.lacTimers[pid] = now + 180;
        }
      } catch (e) { /* skip */ }
    }
  }

  // ========== HP/MP Recovery ==========
  async _checkVitals() {
    try {
      const info = await this.session.callRpc('getPlayerInfo');
      if (!info || !info.ok) return;
      const hp = info.hp, maxHp = info.maxHp || 1000;
      const mp = info.mp, maxMp = info.maxMp || 1000;

      if (hp !== undefined && hp <= 0) {
        if (!this.dead) {
          this.dead = true;
          this.log('Player DIED - pausing PK');
          try { await this.session.callRpc('closeDialogPopups'); } catch (e) { /* skip */ }
        }
        return;
      }
      if (this.dead && hp > 0) {
        this.dead = false;
        this.log('Player respawned');
      }

      if (hp && maxHp && (hp / maxHp * 100) < this.hpThreshold) {
        const slot = this.tkHealSlot;
        if (slot !== null && slot !== undefined) {
          await this._useItem(slot);
          this.logT('hp', `HP recovery: ${hp}/${maxHp}`, 5);
        }
      }
      if (mp && maxMp && (mp / maxMp * 100) < this.mpThreshold) {
        const mpSlot = this.config.manaSlot || 1;
        await this._useItem(mpSlot);
        this.logT('mp', `MP recovery: ${mp}/${maxMp}`, 5);
      }
    } catch (e) { /* quiet */ }
  }

  // ========== Buff ==========
  async _castBuff() {
    if (!this.buffId || this.atCamp) return;
    try {
      await this.injector.sendDoSkillTargetPosition(this.buffId, 0, 0);
      this.logT('buff', `Buff cast: id=${this.buffId}`, 30);
    } catch (e) { /* skip */ }
  }

  // ========== Item Helpers ==========
  async _dumpBagItems() {
    try {
      const res = await this.session.callRpc('dumpBagItems');
      if (res && res.ok && res.items) return res.items;
    } catch (e) { /* RPC may not exist */ }
    return [];
  }

  async _useItem(slot) {
    try {
      await this.session.callRpc('useItem', parseInt(slot, 10));
    } catch (e) {
      try { await this.injector.sendPlayerUserItem(parseInt(slot, 10)); } catch (e2) { /* skip */ }
    }
  }

  async _resolveHealSlot() {
    try {
      const items = await this._dumpBagItems();
      if (!items || items.length === 0) return;
      const part = this.tkHealPart;
      if (part) {
        const cand = items.filter(it => it.particular === part && it.location === 2);
        if (cand.length > 0) {
          const best = cand.reduce((a, b) => (a.stack || 1) > (b.stack || 1) ? a : b);
          this.tkHealSlot = best.slot !== undefined ? best.slot : best.index;
          this.log(`Heal medicine: part=${part} slot=${this.tkHealSlot}`);
          return;
        }
      }
      const g6 = items.filter(it => it.genre === 6 && it.location === 2 && (it.stack || 1) > 1);
      if (g6.length > 0) {
        const best = g6.reduce((a, b) => (a.stack || 1) > (b.stack || 1) ? a : b);
        this.tkHealPart = best.particular;
        this.tkHealSlot = best.slot !== undefined ? best.slot : best.index;
        this._tkLearn('heal_part', best.particular);
        this.log(`Heal medicine (fallback): part=${best.particular} slot=${this.tkHealSlot}`);
      }
    } catch (e) { /* skip */ }
  }

  // ========== Utility ==========
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  setBuff(skillId) {
    this.buffId = skillId;
    this.log(`Buff set: id=${skillId}`);
  }

  setThresholds(hpPct, mpPct) {
    if (hpPct !== undefined) this.hpThreshold = hpPct;
    if (mpPct !== undefined) this.mpThreshold = mpPct;
    this.log(`Thresholds: HP<${this.hpThreshold}% MP<${this.mpThreshold}%`);
  }

  async forceRejoin() {
    const h = this.tkHealNpc || TK_HEAL_NPC;
    const w = this.tkWarNpc || TK_WAR_NPC;
    await this._doRejoin(h, w);
  }

  getState() {
    return {
      running: this.running,
      atCamp: this.atCamp,
      dead: this.dead,
      myCamp: this.myCamp,
      myMapId: this.myMapId,
      campLabel: CAMP_LABEL[this.myCamp] || `c${this.myCamp}`,
      tkHealNpc: this.tkHealNpc,
      tkWarNpc: this.tkWarNpc,
      tkHealSlot: this.tkHealSlot,
      errors: this.errors,
    };
  }
}

module.exports = { AutoPK, CAMP_LABEL, SERIES_LABEL };

