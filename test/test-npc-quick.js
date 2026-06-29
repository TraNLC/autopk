// test/test-npc-quick.js
// Quick test: Gọi NPC button 2 & 3 bằng raw op33
// Tự động probe NPC ID gần đó để tìm Quan Nhu + Trinh Sat
// Usage: node test/test-npc-quick.js
const { FridaSession } = require('../src/frida-session');
const { PacketInjector, encodeField } = require('../src/packet-injector');
const config = require('../config');
const path = require('path');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Probe 1 NPC bằng raw op33, đọc dialog
async function probeOne(injector, nid) {
  const body = encodeField(1, 'string', String(nid));
  await injector.sendRaw(33, body.toString('hex')); // raw op33
  await sleep(600);

  // Đọc recv buffer tìm dialog
  let opts = [];
  try {
    const res = await injector.session.callRpc('getRecvPackets');
    if (res && res.ok && res.packets) {
      for (const p of res.packets) {
        if (p.opcode === 34 || p.opcode === 124) {
          const b = Buffer.from(p.hex || '', 'hex').slice(6);
          let o = 0;
          while (o < b.length) {
            let tag = 0, s = 0;
            while (o < b.length) { const x = b[o]; o++; tag |= (x & 0x7f) << s; if (!(x & 0x80)) break; s += 7; }
            const fn = tag >> 3, wt = tag & 7;
            if (wt === 0) { while (o < b.length && (b[o] & 0x80)) o++; o++; }
            else if (wt === 2) {
              let ln = 0; s = 0;
              while (o < b.length) { const x = b[o]; o++; ln |= (x & 0x7f) << s; if (!(x & 0x80)) break; s += 7; }
              const raw = b.slice(o, o + ln); o += ln;
              if (fn === 2) { try { const t = raw.toString('utf-8').replace(/[^\x20-\x7e\u00C0-\u1EF9]/g,'').trim(); if (t.length >= 2) opts.push(t); } catch(e){} }
            } else break;
          }
        }
      }
    }
  } catch(e) {}

  try { await injector.session.callRpc('closeDialogPopups'); } catch(e) {}
  return opts;
}

// Scan NPC IDs trong khoảng để tìm dialog có từ khóa
async function findNpcByDialog(injector, keywords, idStart, idEnd) {
  for (let nid = idStart; nid <= idEnd; nid++) {
    const opts = await probeOne(injector, nid);
    if (opts.length > 0) {
      const text = opts.join(' ').toLowerCase();
      if (keywords.some(k => text.includes(k.toLowerCase()))) {
        return { id: String(nid), opts };
      }
    }
    // Mỗi 10 lần probe, flush buffer
    if ((nid - idStart) % 5 === 0) {
      try { await injector.session.callRpc('getRecvPackets'); } catch(e) {}
    }
    await sleep(150);
  }
  return null;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  TEST: NPC Remote Button 2 (Kim) & 3 (Cancel)');
  console.log('═══════════════════════════════════════════\n');

  // 1. Connect
  console.log('[1] Connect Frida...');
  const session = new FridaSession(null, config.GAME_PACKAGE);
  await session.connect();
  await session.loadScript(path.join(config.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
  console.log('    ✅ Connected\n');

  const injector = new PacketInjector(session);

  // 2. Player info
  try {
    const info = await session.callRpc('getPlayerInfo');
    if (info && info.ok) console.log(`    📍 Map: ${info.mapId} | ${info.name} | Camp: ${info.campValue}\n`);
  } catch(e) {}

  // 3. Scan for NPCs by probing IDs 1-200
  console.log('[2] Probing NPC IDs 1-200 for Quan Nhu + Trinh Sat...\n');

  console.log('    🔍 Tìm Quan Nhu (heal)...');
  const heal = await findNpcByDialog(injector, ['dược phẩm', 'nhận thuốc', 'miễn phí', 'hồi phục'], 1, 100);
  if (heal) console.log(`    ✅ HEAL NPC found: id=${heal.id} "${heal.opts.slice(0,3).join(' | ')}"\n`);
  else console.log('    ❌ Not found in 1-100\n');

  console.log('    🔍 Tìm Trinh Sat (war)...');
  const war = await findNpcByDialog(injector, ['ra chiến trường', 'vào chiến trường', 'tham chiến', 'ra trận', 'xuất chiến'], 101, 200);
  if (war) console.log(`    ✅ WAR NPC found: id=${war.id} "${war.opts.slice(0,3).join(' | ')}"\n`);
  else {
    // Try wider range
    console.log('    🔍 Retry wider range 1-100...');
    const war2 = await findNpcByDialog(injector, ['ra chiến trường', 'vào chiến trường', 'tham chiến', 'ra trận', 'xuất chiến'], 1, 100);
    if (war2) {
      war.id = war2.id; war.opts = war2.opts;
      console.log(`    ✅ WAR NPC found: id=${war2.id}\n`);
    } else console.log('    ❌ WAR NPC not found\n');
  }

  if (!heal && !war) {
    console.log('[!] Không tìm thấy NPC nào. Về DOANH TRẠI rồi chạy lại.\n');
    await session.disconnect();
    return;
  }

  // 4. Test buttons
  if (heal) {
    console.log('───────────────────────────────────');
    console.log(`[TEST 1] Heal NPC id=${heal.id} - Nhận thuốc`);
    await injector.sendNpcDialogue(heal.id); await sleep(500);
    await injector.sendNpcSelect(0); // index 0 = dòng đầu
    console.log('    ✅ Sent eNpcSelect(0)\n');
    await sleep(600);
    try { await session.callRpc('closeDialogPopups'); } catch(e) {}
    await sleep(300);
  }

  if (war) {
    console.log('───────────────────────────────────');
    console.log(`[TEST 2] War NPC id=${war.id} - BUTTON 2 (Kim)`);
    await injector.sendNpcDialogue(war.id); await sleep(500);
    await injector.sendNpcSelect(1); // index 1 = button 2
    console.log('    ✅ Sent eNpcSelect(1) = BUTTON 2 (Kim)\n');
    await sleep(600);
    try { await session.callRpc('closeDialogPopups'); } catch(e) {}
    await sleep(300);

    console.log('───────────────────────────────────');
    console.log(`[TEST 3] War NPC id=${war.id} - BUTTON 3 (Cancel)`);
    await injector.sendNpcDialogue(war.id); await sleep(500);
    await injector.sendNpcSelect(2); // index 2 = button 3
    console.log('    ✅ Sent eNpcSelect(2) = BUTTON 3 (Cancel)\n');
    await sleep(400);
    try { await session.callRpc('closeDialogPopups'); } catch(e) {}
  }

  console.log('───────────────────────────────────');
  console.log('[DONE] Kiểm tra game:');
  console.log('  1. Có popup nhận thuốc không?');
  console.log('  2. Có vào trận phe KIM không?');
  console.log('  3. Dialog có ĐÓNG không?\n');

  await session.disconnect();
  console.log('Disconnected.');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
