// test/test-goto-reset.js — Test reset target bang sendGotoPosition (UNIVERSAL)
// Dung: node test/test-goto-reset.js
//
// GotoPosition (opcode 248) gui len server "toi dung yen tai day"
// → server huy lenh pursuit → target duoc clear
// Cach nay UNIVERSAL, khong can skill buff, moi phai deu dung duoc

const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');
const { PacketInjector } = require('../src/packet-injector');

async function main() {
  const session = new FridaSession(null, CONFIG.GAME_PACKAGE);

  try {
    console.log('═══════════════════════════════════════');
    console.log('  TEST GotoPosition RESET FOCUS');
    console.log('  (UNIVERSAL - khong can skill buff)');
    console.log('═══════════════════════════════════════\n');

    console.log('[1] Ket noi Frida...');
    await session.connect();
    await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
    console.log('    OK.\n');

    const injector = new PacketInjector(session);

    // ── Doc Player Info ──
    console.log('[2] Doc PlayerInfo...');
    const info = await session.callRpc('getPlayerInfo');
    if (!info) {
      console.log('    LOI: Khong doc duoc player info!');
      return;
    }
    const px = info.x !== undefined ? info.x : (info.position ? info.position.x : 0);
    const py = info.y !== undefined ? info.y : (info.position ? info.position.y : 0);
    console.log(`    Pos:  (${px}, ${py})`);
    console.log(`    Map:  ${info.mapId}`);
    console.log(`    HP:   ${info.hp}/${info.maxHp}\n`);

    // ── Doc target truoc ──
    console.log('[3] Doc target TRUOC...');
    const before = await session.callRpc('debugReadTarget');
    console.log('    Target ptr:      ' + (before.target || 'NULL'));
    console.log('    Target controller:' + (before.targetController || 'N/A'));
    console.log('    Target name:     ' + (before.targetName || 'N/A'));
    console.log('    Follow CID:      ' + (before.runFollowTargetCid || '(null)'));
    console.log('    PathRunning:     ' + before.findingPathIsRunning);
    console.log('    PathUpdate:      ' + before.findingPathUpdate);

    if (before.target === 'NULL') {
      console.log('\n    ⚠️  Chua co target! Hay target 1 nguoi choi truoc.');
      console.log('    (Click vao 1 nguoi choi hoac dang PK)\n');
    }

    // ── Goi clearFocus + GotoPosition ──
    console.log('\n[4] Goi clearFocus + sendGotoPosition(' + px + ', ' + py + ')...');
    
    // Clear memory
    try { await session.callRpc('clearFocus'); } catch(e) {
      console.log('    clearFocus RPC fail: ' + e.message);
    }

    // GotoPosition (UNIVERSAL KEY)
    try {
      await injector.sendGotoPosition(px, py);
      console.log('    Da gui eGotoPosition (opcode 248)');
    } catch(e) {
      console.log('    sendGotoPosition fail: ' + e.message);
    }

    // ── Đợi server xử lý ──
    console.log('    Đợi 1.5s...');
    await new Promise(r => setTimeout(r, 1500));

    // ── Đọc target sau ──
    console.log('\n[5] Doc target SAU...');
    const after = await session.callRpc('debugReadTarget');
    console.log('    Target ptr:      ' + (after.target || 'NULL'));
    console.log('    Target controller:' + (after.targetController || 'N/A'));
    console.log('    Target name:     ' + (after.targetName || 'N/A'));
    console.log('    Follow CID:      ' + (after.runFollowTargetCid || '(null)'));
    console.log('    PathRunning:     ' + after.findingPathIsRunning);
    console.log('    PathUpdate:      ' + after.findingPathUpdate);

    // ── Đọc vị trí sau ──
    const infoAfter = await session.callRpc('getPlayerInfo');
    console.log('\n[6] Vi tri...');
    console.log('    Truoc: (' + px + ', ' + py + ')');
    if (infoAfter) console.log('    Sau:   (' + (infoAfter.x||infoAfter.position?.x) + ', ' + (infoAfter.y||infoAfter.position?.y) + ')');

    // ── Kết luận ──
    console.log('\n═══════════════════════════════════════');
    var cleared = (before.target !== 'NULL' && before.targetController && after.targetController === 'NULL');
    if (cleared) {
      console.log('  ✅ Target da duoc clear!');
      console.log('     controller: ' + before.targetController + ' → NULL');
    } else if (before.targetController === after.targetController && before.targetController !== 'NULL') {
      console.log('  ❌ KHONG clear duoc! controller van: ' + after.targetController);
      console.log('  → Target.Clear() @ 0xF20280 co the SAI offset');
    } else if (before.target === 'NULL') {
      console.log('  ⚠️  Chua co target luc dau, khong the xac nhan.');
    } else {
      console.log('  ⚡ controller: ' + before.targetController + ' → ' + after.targetController);
    }
    console.log('═══════════════════════════════════════\n');

  } catch(e) {
    console.error('FATAL:', e.message);
  } finally {
    try { await session.disconnect(); } catch(e) {}
    console.log('Done.');
  }
}

main();
