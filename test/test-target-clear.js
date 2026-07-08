// test/test-target-clear.js — Test Target.Clear() trực tiếp
// Dung: node test/test-target-clear.js
//
// Test:
//   1. Doc target hiện tại (0xA0 + Target object controller)
//   2. Gọi Target.Clear() @ 0xF20280
//   3. Doc lại → báo cáo

const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
  const session = new FridaSession(null, CONFIG.GAME_PACKAGE);

  try {
    console.log('═══════════════════════════════════════');
    console.log('  TEST Target.Clear() @ 0xF20280');
    console.log('═══════════════════════════════════════\n');

    console.log('[1] Ket noi Frida...');
    await session.connect();
    await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
    console.log('    OK.\n');

    // ── Đọc target trước ──
    console.log('[2] Doc target TRUOC khi goi Target.Clear()...');
    const before = await session.callRpc('debugReadTarget');
    console.log('    Target ptr:    ' + (before.target || 'NULL'));
    console.log('    Follow CID:    ' + (before.runFollowTargetCid || '(null)'));
    console.log('    PathRunning:   ' + before.findingPathIsRunning);
    console.log('    PathUpdate:    ' + before.findingPathUpdate);

    if (before.target === 'NULL') {
      console.log('\n    ⚠️  Chua co target! Hay target 1 nguoi choi truoc khi test.');
      console.log('    (Click vao 1 nguoi choi hoac dang danh ai do)\n');
    }

    // ── Gọi Target.Clear() trực tiếp ──
    console.log('\n[3] Goi Target.Clear() @ 0xF20280...');
    const result = await session.callRpc('testTargetClear');
    console.log('    Result: ' + JSON.stringify(result));

    // ── Đợi ──
    await new Promise(r => setTimeout(r, 800));

    // ── Đọc target sau ──
    console.log('\n[4] Doc target SAU khi goi Target.Clear()...');
    const after = await session.callRpc('debugReadTarget');
    console.log('    Target ptr:    ' + (after.target || 'NULL'));
    console.log('    Follow CID:    ' + (after.runFollowTargetCid || '(null)'));
    console.log('    PathRunning:   ' + after.findingPathIsRunning);
    console.log('    PathUpdate:    ' + after.findingPathUpdate);

    // ── Kết luận ──
    console.log('\n═══════════════════════════════════════');
    if (before.target !== 'NULL' && after.target === 'NULL') {
      console.log('  ✅ Target.Clear() HOAT DONG!');
      console.log('     ' + before.target + ' → NULL');
    } else if (before.target === after.target) {
      console.log('  ❌ Target.Clear() KHONG hoat dong!');
      console.log('     Van la: ' + after.target);
    } else {
      console.log('  ⚡ Target thay doi: ' + before.target + ' → ' + after.target);
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
