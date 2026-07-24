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
    return await this.session.callRpc('sendTcpPacket', opcode, hexBody);
  }

  /**
   * Send eNpcDialogue (opcode 33)
   */
  async sendNpcDialogue(npcId) {
    const body = encodeField(1, 'string', String(npcId));
    return await this.sendRaw(33, body.toString('hex'));
  }

  /**
   * Send eNpcSelect (opcode 35)
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
   * Send eStringData (opcode 9)
   */
  async sendStringData(str) {
    // For eStringData, the payload is just the raw string bytes (no protobuf tags)
    const body = Buffer.from(str, 'utf8');
    return await this.sendRaw(9, body.toString('hex'));
  }

  /**
   * Send Move Start (1|X|Y)
   * x, y are actual float coordinates (already large integers like 48988)
   */
  async sendMoveStart(x, y) {
    const intX = Math.round(x);
    const intY = Math.round(y);
    const payload = `1|${intX}|${intY}`;
    return await this.sendStringData(payload);
  }

  /**
   * Send Move Stop (2|X|Y|2)
   */
  async sendMoveStop(x, y) {
    const intX = Math.round(x);
    const intY = Math.round(y);
    const payload = `2|${intX}|${intY}|2`;
    return await this.sendStringData(payload);
  }
}

module.exports = { PacketInjector, encodeField, writeVarint };
