// test/test-reset-focus.js — Test reset target bang skill cast
// Dung: node test/test-reset-focus.js [skillId]
//   - skillId: ID skill de cast (mac dinh tu dong detect buff phai)
//   - VD: node test/test-reset-focus.js 102
//
// Cach hoat dong:
//   1. Doc PlayerInfo (vi tri, map, phai)
//   2. Doc target hien tai (0xA0)
//   3. Cast skill vao vi tri hien tai (sendDoSkillTargetPosition)
//   4. Doc lai target → bao cao ket qua

const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');
const { PacketInjector } = require('../src/packet-injector');

// Buff skill map theo phai (tu tongkim.js)
const SECT_SKILL_MAP = { 0: 102, 1: 111, 2: 129, 3: 139, 4: 159, 5: 109, 6: 179, 7: 189, 8: 209, 9: 219 };
const SECT_NAMES = ['Thien Vuong', 'Thieu Lam', 'Ngu Doc', 'Duong Mon', 'Nga My', 'Thuy Yen', 'Thien Nham', 'Vo Dang', 'Con Lon', 'Minh Giao'];

async function main() {
  const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
  const skillIdArg = parseInt(process.argv[2]) || 0;

  try {
    console.log('═══════════════════════════════════════');
    console.log('  TEST RESET FOCUS BANG SKILL CAST');
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
    console.log(`    Name: ${info.name || '???'}`);
    console.log(`    Map:  ${info.mapId}, Camp: ${info.campValue}`);
    console.log(`    Pos:  (${info.x}, ${info.y})`);
    console.log(`    Sect: ${info.sect} (${SECT_NAMES[info.sect] || '???'})`);
    console.log(`    HP:   ${info.hp}/${info.maxHp}`);

    // ── Xac dinh skill ──
    let skillId = skillIdArg;
    if (!skillId && info.sect !== undefined) {
      skillId = SECT_SKILL_MAP[info.sect] || 0;
    }
    if (!skillId) {
      console.log('\n    LOI: Khong xac dinh duoc skill ID.');
      console.log('    Dung: node test/test-reset-focus.js <skillId>');
      console.log('    Hoac dam bao dang trong game de auto-detect buff phai.');
      return;
    }
    console.log(`    Skill: ID=${skillId}\n`);

    // ── Doc target truoc khi cast ──
    console.log('[3] Doc target TRUOC khi cast skill...');
    const targetBefore = await session.callRpc('getPlayerInfo');
    let targetStateBefore = 'unknown';
    try {
      const rawTarget = await session.callRpc('debugReadTarget');
      if (rawTarget && rawTarget.ok) {
        targetStateBefore = rawTarget.target || 'NULL';
        console.log(`    Target ptr: ${targetStateBefore}`);
      } else {
        console.log('    Khong doc duoc target (RPC chua co), dung getPlayerInfo.');
      }
    } catch(e) {
      console.log(`    RPC debugReadTarget chua co: ${e.message}`);
    }

    // ── Cast skill tai vi tri hien tai ──
    console.log(`\n[4] CAST SKILL ${skillId} tai vi tri (${info.x}, ${info.y})...`);
    const castStart = Date.now();
    try {
      await injector.sendDoSkillTargetPosition(skillId, info.x, info.y);
      console.log(`    Da gui packet! (${Date.now() - castStart}ms)`);
    } catch(e) {
      console.log(`    LOI cast: ${e.message}`);
      return;
    }

    // ── Doi 1 giay de game xu ly ──
    console.log('    Doi 1.5s de game xu ly...');
    await new Promise(r => setTimeout(r, 1500));

    // ── Doc target sau khi cast ──
    console.log('\n[5] Doc target SAU khi cast skill...');
    const infoAfter = await session.callRpc('getPlayerInfo');
    try {
      const rawTarget = await session.callRpc('debugReadTarget');
      if (rawTarget && rawTarget.ok) {
        const targetAfter = rawTarget.target || 'NULL';
        console.log(`    Target ptr: ${targetAfter}`);

        if (targetBefore !== 'unknown') {
          if (targetBefore !== 'NULL' && targetAfter === 'NULL') {
            console.log('\n    ✅ THANH CONG! Target da duoc clear!');
            console.log(`       ${targetBefore} → NULL`);
          } else if (targetBefore === 'NULL' && targetAfter === 'NULL') {
            console.log('\n    ⚠️ Target da NULL tu truoc, khong the xac nhan.');
            console.log('       Hay test lai khi DANG CO target (dang danh ai do).');
          } else if (targetBefore === targetAfter) {
            console.log(`\n    ❌ KHONG DOI! Target van la: ${targetAfter}`);
            console.log('       Skill cast KHONG clear duoc target.');
          } else {
            console.log(`\n    ⚡ Target da thay doi: ${targetBefore} → ${targetAfter}`);
          }
        }
      }
    } catch(e) {
      console.log(`    Loi doc target: ${e.message}`);
    }

    // ── Kiem tra vi tri co thay doi khong ──
    console.log('\n[6] Kiem tra vi tri...');
    console.log(`    Truoc: (${info.x}, ${info.y})`);
    console.log(`    Sau:   (${infoAfter.x}, ${infoAfter.y})`);
    const dist = Math.sqrt(Math.pow(infoAfter.x - info.x, 2) + Math.pow(infoAfter.y - info.y, 2));
    console.log(`    Delta: ${dist.toFixed(1)}m`);

    // ── Goi y ──
    console.log('\n═══════════════════════════════════════');
    console.log('  KET LUAN:');
    if (skillIdArg === 0) {
      console.log(`  - Skill tu dong: ${skillId} (buff phai ${SECT_NAMES[info.sect] || '?'})`);
    }
    console.log('  - Neu target KHONG clear → skill nay khong phu hop');
    console.log('  - Thu skill khac: node test/test-reset-focus.js <skillId>');
    console.log('  - VD skill AoE/tu cast: 1 (danh thuong), buff phai...');
    console.log('═══════════════════════════════════════\n');

  } catch(e) {
    console.error('FATAL:', e.message);
  } finally {
    try { await session.disconnect(); } catch(e) {}
    console.log('Done.');
  }
}

main();
