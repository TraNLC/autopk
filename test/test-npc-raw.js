// test/test-npc-raw.js — Test NPCScanner.getNearNpcNames (heap scan)
// Dung: node test/test-npc-raw.js

const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
  const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
  
  try {
    console.log('Ket noi...');
    await session.connect();
    await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
    console.log('OK.\n');

    const info = await session.callRpc('getPlayerInfo');
    console.log('Player Info:', JSON.stringify(info, null, 2));
    console.log('Map:', info.mapId, '| Camp:', info.campValue, '| Name:', info.name);

    console.log('\n--- TEST: getNearNpcNames (NPCScanner heap scan) ---');
    const start = Date.now();
    try {
      const res = await session.callRpc('getNearNpcNames');
      console.log('Time:', (Date.now() - start) + 'ms');
      console.log('Result:', JSON.stringify(res, null, 2));
      
      if (res && res.ok && res.npcMap) {
        const entries = Object.entries(res.npcMap);
        console.log('\nFound ' + entries.length + ' NPCs:');
        for (const [id, name] of entries) {
          console.log('  ' + id + ' -> ' + name);
          const lower = name.toLowerCase();
          if (lower.includes('trinh')) console.log('    *** TRINH SAT ***');
          if (lower.includes('nhu') || lower.includes('quan y')) console.log('    *** QUAN NHU ***');
        }
      }
    } catch(e) {
      console.log('Loi:', e.message);
    }

  } catch(e) {
    console.error('FATAL:', e.message);
  } finally {
    try { await session.disconnect(); } catch(e) {}
    console.log('\nDone.');
  }
}

main();
