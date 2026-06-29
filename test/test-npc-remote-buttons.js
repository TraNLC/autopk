// test/test-npc-remote-buttons.js
// Test script: Gọi NPC từ xa (map khác) + test button 2 (Kim) và button 3 (Cancel)
// TỰ ĐỘNG scan NPC theo tên trước khi test (không hardcode ID)
// Usage: node test/test-npc-remote-buttons.js
const { FridaSession } = require('../src/frida-session');
const { PacketInjector } = require('../src/packet-injector');
const config = require('../config');
const path = require('path');

const DEVICE_ID = null;

// Từ khóa nhận diện chức năng trong dialog
const HEAL_KW = ['dược phẩm miễn phí', 'nhận dược phẩm', 'dược phẩm', 'nhận thuốc', 'hồi phục'];
const WAR_KW = ['ra chiến trường', 'vào chiến trường', 'tham chiến', 'ra trận', 'xuất chiến', 'chiến trường', 'tham gia'];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function noAccent(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Scan NPCs by probing dialog (op33) - tìm NPC có dialog chứa từ khóa */
async function probeNpcByDialog(session, injector, keywordSets) {
  // Lấy danh sách NPC ID gần đó
  let nearbyIds = [];
  try {
    const res = await session.callRpc('get_near_npc_ids');
    if (res && res.ok && res.ids) {
      nearbyIds = res.ids.filter(id => /^\d+$/.test(String(id)));
    }
  } catch (e) { /* skip */ }

  // Fallback: thử getNearbyShops (có thể có NPC list)
  if (nearbyIds.length === 0) {
    try {
      const res2 = await session.callRpc('getPlayerInfo');
      // Try get_near_npc_ids_raw
      try {
        const raw = await session.callRpc('getNearNpcs');
        if (raw && raw.ok && raw.npcs) {
          nearbyIds = raw.npcs.map(n => String(n.id)).filter(id => /^\d+$/.test(id));
        }
      } catch (e3) { /* skip */ }
    } catch (e2) { /* skip */ }
  }

  console.log(`    🔍 Found ${nearbyIds.length} nearby NPC IDs, probing dialogs...`);

  // Probe từng NPC (tối đa 8 để không spam)
  const results = {};
  const maxProbe = Math.min(nearbyIds.length, 8);
  for (let i = 0; i < maxProbe; i++) {
    const nid = String(nearbyIds[i]);
    try {
      const opts = await injector.talkNpcAndGetOptions(nid, 1500);
      if (opts.length > 0) {
        const text = opts.join(' ').toLowerCase();
        for (const [label, keywords] of Object.entries(keywordSets)) {
          if (keywords.some(k => text.includes(k.toLowerCase()))) {
            results[label] = { id: nid, opts };
            console.log(`    ✅ ${label}: NPC id=${nid} dialog="${opts.slice(0, 2).join(' | ')}..."`);
            break;
          }
        }
        // Log NPC không khớp để debug
        if (!Object.values(results).some(r => r.id === nid)) {
          console.log(`       NPC ${nid}: "${opts.slice(0, 2).join(' | ')}" (no match)`);
        }
      }
      try { await session.callRpc('closeDialogPopups'); } catch (e) { /* skip */ }
      await sleep(300);
    } catch (e) { /* skip */ }
    if (Object.keys(results).length >= 2) break; // đủ cả heal + war
  }
  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  TEST: Remote NPC Call - Button 2 & 3');
  console.log('  (Auto-scan NPC by name → call via raw op33)');
  console.log('═══════════════════════════════════════════════\n');

  // 1. Connect Frida
  console.log('[1] Connecting Frida...');
  const session = new FridaSession(DEVICE_ID, config.GAME_PACKAGE);
  await session.connect();
  await session.loadScript(path.join(config.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
  console.log('    ✅ Frida connected + script loaded\n');

  const injector = new PacketInjector(session);

  // 2. Get player info
  let campValue = null;
  try {
    const info = await session.callRpc('getPlayerInfo');
    if (info && info.ok) {
      campValue = info.campValue;
      console.log(`    📍 Map: ${info.mapId} | Name: ${info.name} | Camp: ${campValue}`);
    }
  } catch (e) { /* skip */ }

  // 3. PROBE NPCs bằng dialog (op33) - tìm NPC có "dược phẩm" hoặc "ra chiến trường"
  console.log('\n[2] Probing NPC dialogs to find Heal/War NPCs...');
  const npcMap = await probeNpcByDialog(session, injector, {
    heal: ['dược phẩm', 'nhận thuốc', 'hồi phục', 'miễn phí'],
    war: ['ra chiến trường', 'vào chiến trường', 'tham chiến', 'ra trận', 'xuất chiến']
  });

  const healNpc = npcMap.heal || null;
  const warNpc = npcMap.war || null;

  if (healNpc) console.log(`    ❤️  HEAL NPC: id=${healNpc.id}`);
  else console.log('    ❌ HEAL NPC (Quan Nhu) NOT found');

  if (warNpc) console.log(`    ⚔️  WAR NPC: id=${warNpc.id}`);
  else console.log('    ❌ WAR NPC (Trinh Sat) NOT found');

  if (!healNpc && !warNpc) {
    console.log('\n    ⛔ Cả 2 NPC đều KHÔNG có ở map này!');
    console.log('    → Về DOANH TRẠI (camp) rồi chạy lại test.\n');
    await session.disconnect();
    return;
  }

  // ═══════════════════════════════════════════════
  // TEST 1: NPC Quan Nhu (Heal) - Remote call
  // ═══════════════════════════════════════════════
  if (healNpc) {
    console.log('───────────────────────────────────────────────');
    console.log(`[TEST 1] NPC Quan Nhu - Remote Call (id=${healNpc.id})`);
    console.log(`         Map hiện tại: camp=${campValue} → gọi raw op33...\n`);

    const healOpts = await injector.talkNpcAndGetOptions(healNpc.id, 3000);

    if (healOpts.length > 0) {
      console.log(`    📋 Dialog options (${healOpts.length}):`);
      healOpts.forEach((opt, i) => {
        const marker = injector.findOptionIndex([opt], HEAL_KW) >= 0 ? ' ✅ HEAL' : '';
        console.log(`       [${i}] "${opt}"${marker}`);
      });

      const healIdx = injector.findOptionIndex(healOpts, HEAL_KW);
      if (healIdx >= 0) {
        console.log(`\n    🔘 Sending eNpcSelect index=${healIdx} (nhận thuốc)...`);
        await injector.sendNpcSelect(healIdx);
        console.log('    ✅ Sent! Kiểm tra game xem có nhận được thuốc không\n');
      }
    } else {
      console.log('    ⚠️  op33 gửi đi nhưng KHÔNG có dialog response');
      console.log('       → Thử gửi eClientCompleted (op232 - Kim faction)...');
      await injector.sendRaw(232, '');
      console.log('    ✅ Sent op232!\n');
    }

    await sleep(800);
    try { await session.callRpc('closeDialogPopups'); } catch (e) { /* skip */ }
    await sleep(500);
  }

  // ═══════════════════════════════════════════════
  // TEST 2: NPC Trinh Sat - Button 2 (Kim)
  // ═══════════════════════════════════════════════
  if (warNpc) {
    console.log('───────────────────────────────────────────────');
    console.log(`[TEST 2] NPC Trinh Sat - Button 2 KIM (id=${warNpc.id})`);
    console.log(`         Camp=${campValue} → chọn phe Kim (button 2)...\n`);

    const warOpts = await injector.talkNpcAndGetOptions(warNpc.id, 3000);

    if (warOpts.length > 0) {
      console.log(`    📋 Dialog options (${warOpts.length}):`);
      warOpts.forEach((opt, i) => {
        let tag = '';
        if (injector.findOptionIndex([opt], WAR_KW) >= 0) tag = ' ⚔️ WAR';
        console.log(`       [${i}] "${opt}"${tag}`);
      });

      // Button 2 = Kim faction
      const btn2 = 1; // index 1 = button 2 (0-based: 0=btn1 Tong, 1=btn2 Kim)
      console.log(`\n    🔘 Test BUTTON 2 (Kim): eNpcSelect index=${btn2}...`);
      await injector.sendNpcSelect(btn2);
      console.log('    ✅ Sent button 2! Kiểm tra game: vào trận phe KIM?\n');
    } else {
      console.log('    ⚠️  Không có dialog → gửi blind eNpcSelect index=1 (btn2)...');
      await injector.sendNpcSelect(1);
      console.log('    ✅ Sent blind button 2!\n');
    }

    await sleep(800);
    try { await session.callRpc('closeDialogPopups'); } catch (e) { /* skip */ }
    await sleep(500);

    // ═══════════════════════════════════════════════
    // TEST 3: Button 3 (Cancel)
    // ═══════════════════════════════════════════════
    console.log('───────────────────────────────────────────────');
    console.log(`[TEST 3] NPC Trinh Sat - Button 3 CANCEL (id=${warNpc.id})\n`);

    const cancelOpts = await injector.talkNpcAndGetOptions(warNpc.id, 3000);

    if (cancelOpts.length > 0) {
      console.log(`    📋 Dialog options (${cancelOpts.length}):`);
      cancelOpts.forEach((opt, i) => console.log(`       [${i}] "${opt}"`));

      const cancelIdx = cancelOpts.length >= 3 ? 2 : cancelOpts.length - 1;
      console.log(`\n    🔘 Test BUTTON 3 (Cancel): eNpcSelect index=${cancelIdx}...`);
      await injector.sendNpcSelect(cancelIdx);
      console.log('    ✅ Sent button 3! Dialog sẽ ĐÓNG\n');
    } else {
      console.log('    ⚠️  Không đọc được dialog → gửi blind eNpcSelect index=2 (cancel)...');
      await injector.sendNpcSelect(2);
      console.log('    ✅ Sent blind button 3!\n');
    }

    await sleep(500);
    try { await session.callRpc('closeDialogPopups'); } catch (e) { /* skip */ }
  }

  await sleep(500);
  try { await session.callRpc('closeDialogPopups'); } catch (e) { /* skip */ }

  // Cleanup
  console.log('───────────────────────────────────────────────');
  console.log('[DONE] Disconnecting Frida...');
  await session.disconnect();
  console.log('       ✅ Disconnected.\n');

  console.log('═══════════════════════════════════════════════');
  console.log('  TEST COMPLETE - Check game for results:');
  console.log('  1. Heal NPC: có popup nhận thuốc không?');
  console.log('  2. War Button 2: có vào trận phe Kim không?');
  console.log('  3. Cancel Button 3: dialog có đóng không?');
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Test Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
