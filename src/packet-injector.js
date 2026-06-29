// src/packet-injector.js -- Protobuf packet encoder and Frida RPC bridge (Step 5)

function writeVarint(val) {
  const buf = [];
  let v = typeof val === 'bigint' ? val : BigInt(val);
  if (v < 0n) {
    v = (1n << 64n) + v;
  }
  while (v >= 128n) {
    buf.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  buf.push(Number(v));
  return Buffer.from(buf);
}

function encodeField(num, type, value) {
  if (value === undefined || value === null) return Buffer.alloc(0);
  let wireType = 0;
  let body;

  if (type === 'int32' || type === 'int64' || type === 'uint32' || type === 'uint64' || type === 'bool') {
    wireType = 0;
    body = writeVarint(value === true ? 1 : value === false ? 0 : value);
  } else if (type === 'string') {
    wireType = 2;
    const strBuf = Buffer.from(value, 'utf-8');
    body = Buffer.concat([writeVarint(strBuf.length), strBuf]);
  } else if (type === 'bytes') {
    wireType = 2;
    const binBuf = Buffer.isBuffer(value) ? value : Buffer.from(value, 'hex');
    body = Buffer.concat([writeVarint(binBuf.length), binBuf]);
  } else {
    throw new Error('Unsupported type: ' + type);
  }

  const tag = (num << 3) | wireType;
  return Buffer.concat([writeVarint(tag), body]);
}

class PacketInjector {
  /**
   * @param {FridaSession} session
   */
  constructor(session) {
    this.session = session;
  }

  /**
   * Send a raw packet by opcode and body hex payload.
   */
  async sendRaw(opcode, hexBody) {
    if (!this.session) throw new Error('No Frida session');
    return await this.session.callRpc('sendPacket', opcode, hexBody);
  }

  /**
   * Send eNpcDialogue (opcode 33) - RAW packet, no il2cpp dependency.
   * This works REMOTELY (different map) because server doesn't check distance.
   * Use this instead of remoteNpcDialogue (il2cpp) for cross-map NPC calls.
   */
  async sendNpcDialogue(npcId) {
    const body = encodeField(1, 'string', npcId);
    return await this.sendRaw(33, body.toString('hex'));
  }

  /**
   * Open NPC dialog remotely (raw op33) and read response options.
   * Returns array of dialog option strings from op34/124.
   * This is the KEY to making buttons 2/3 work from different maps.
   */
  async talkNpcAndGetOptions(npcId, timeoutMs = 2000) {
    // 1. Send raw op33 (NO il2cpp - works cross-map)
    await this.sendNpcDialogue(npcId);
    await this._sleep(400);

    // 2. Poll for dialog response
    const start = Date.now();
    let opts = [];
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await this.session.callRpc('getRecvPackets');
        if (res && res.ok && res.packets) {
          for (const p of res.packets) {
            if (p.opcode === 34 || p.opcode === 124 || p.opcode === 166) {
              const found = this._parseDialogOptions(p.hex || '');
              if (found.length > 0) opts = found;
            }
          }
        }
      } catch (e) { /* retry */ }
      if (opts.length > 0) break;
      await this._sleep(150);
    }
    return opts;
  }

  /**
   * Parse dialog option strings from protobuf hex (op34/124/166).
   * Field 2 = repeated string selections.
   */
  _parseDialogOptions(hex) {
    try {
      const b = Buffer.from(hex, 'hex').slice(6); // skip 6-byte header
      const out = [];
      let o = 0;
      while (o < b.length) {
        // Read varint tag
        let tag = 0, shift = 0;
        while (o < b.length) {
          const x = b[o]; o++;
          tag |= (x & 0x7f) << shift;
          if (!(x & 0x80)) break;
          shift += 7;
        }
        const fieldNum = tag >> 3;
        const wireType = tag & 0x7;
        if (wireType === 0) {
          // varint - skip
          while (o < b.length && (b[o] & 0x80)) o++;
          o++;
        } else if (wireType === 2) {
          // length-delimited
          let ln = 0, s = 0;
          while (o < b.length) {
            const x = b[o]; o++;
            ln |= (x & 0x7f) << s;
            if (!(x & 0x80)) break;
            s += 7;
          }
          const raw = b.slice(o, o + ln);
          o += ln;
          if (fieldNum === 2) {
            // selections field
            try {
              const txt = raw.toString('utf-8').replace(/[^\x20-\x7e\u00C0-\u1EF9]/g, '').trim();
              if (txt.length >= 2) out.push(txt);
            } catch (e) { /* skip */ }
          }
        } else {
          break; // unknown wire type
        }
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  /**
   * Find dialog option index by keyword (no-accent matching, like Python _HEAL_KW / _WAR_KW).
   * Returns the index (0-based) or -1 if not found.
   */
  findOptionIndex(options, keywords) {
    if (!options || options.length === 0) return -1;
    const noAccent = (s) => (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const kwLower = keywords.map(k => noAccent(k));
    for (let i = 0; i < options.length; i++) {
      const optNorm = noAccent(options[i]);
      if (kwLower.some(k => optNorm.includes(k))) {
        return i;
      }
    }
    return -1;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send eNpcSelect (opcode 35)
   * selectIndex = 0-based position in dialog menu
   * For Tong Kim war NPC: 1=Tong, 2=Kim, 3=Cancel
   */
  async sendNpcSelect(selectIndex) {
    const body = encodeField(1, 'int32', selectIndex);
    return await this.sendRaw(35, body.toString('hex'));
  }

  /**
   * Send eDoSkillTargetNpc (opcode 239)
   */
  async sendDoSkillTargetNpc(skillId, npcId) {
    const body = Buffer.concat([
      encodeField(1, 'int32', skillId),
      encodeField(2, 'string', npcId)
    ]);
    return await this.sendRaw(239, body.toString('hex'));
  }

  /**
   * Send eDoSkillTargetPlayer (opcode 238)
   */
  async sendDoSkillTargetPlayer(skillId, playerId) {
    const body = Buffer.concat([
      encodeField(1, 'int32', skillId),
      encodeField(2, 'string', playerId)
    ]);
    return await this.sendRaw(238, body.toString('hex'));
  }

  /**
   * Send eDoSkillTargetPosition (opcode 240)
   */
  async sendDoSkillTargetPosition(skillId, x, y) {
    const body = Buffer.concat([
      encodeField(1, 'int32', skillId),
      encodeField(2, 'int32', x),
      encodeField(3, 'int32', y)
    ]);
    return await this.sendRaw(240, body.toString('hex'));
  }

  /**
   * Send eGotoPosition (opcode 248)
   */
  async sendGotoPosition(x, y) {
    const body = Buffer.concat([
      encodeField(1, 'int32', x),
      encodeField(2, 'int32', y)
    ]);
    return await this.sendRaw(248, body.toString('hex'));
  }

  /**
   * Send eApplyAutoplayProfile (opcode 140)
   */
  async sendApplyAutoplayProfile(startAuto, profileGuid) {
    const body = Buffer.concat([
      encodeField(1, 'bool', startAuto),
      encodeField(2, 'string', profileGuid)
    ]);
    return await this.sendRaw(140, body.toString('hex'));
  }

  /**
   * Send ePlayerUserItem (opcode 49)
   */
  async sendPlayerUserItem(itemIndex) {
    const body = encodeField(1, 'int32', itemIndex);
    return await this.sendRaw(49, body.toString('hex'));
  }

  /**
   * Send eClientCompleted (opcode 232) - Kim faction heal accept
   */
  async sendClientCompleted() {
    return await this.sendRaw(232, '');
  }

  /**
   * Close in-game dialog/popup via RPC
   */
  async closePopups() {
    try {
      return await this.session.callRpc('closeDialogPopups');
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

module.exports = { PacketInjector, encodeField, writeVarint };
