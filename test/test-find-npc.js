// test/test-find-npc.js — Test tim ID NPC bang FindDialogNpcIdByName
// Dung: node test/test-find-npc.js

const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
  const session = new FridaSession(null, CONFIG.GAME_PACKAGE);

  try {
    console.log('Dang ket noi Frida...');
    await session.connect();
    await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
    console.log('OK da ket noi.\n');

    // Lay thong tin nhan vat
    const info = await session.callRpc('getPlayerInfo');
    console.log('Player info:', JSON.stringify({ mapId: info.mapId, name: info.name, campValue: info.campValue }, null, 2));

    // Test tim NPC bang FindDialogNpcIdByName
    const testNames = ['Trinh Sat', 'Quan Nhu', 'Chieu Binh Quan', 'Mo Binh Quan'];
    
    for (const name of testNames) {
      try {
        const result = await session.callRpc('findNpcIdByName', name, 2000);
        console.log(`  FindDialogNpcIdByName("${name}", 2000) =>`, JSON.stringify(result));
      } catch(e) {
        console.log(`  FindDialogNpcIdByName("${name}") => Loi: ${e.message}`);
      }
    }

    // Test getNearNpcs (all NPCs)
    console.log('\n--- Test GetNearNpcs ---');
    try {
      const npcs = await session.callRpc('getAllNearNpcs');
      console.log('getAllNearNpcs result:', JSON.stringify(npcs, null, 2));
    } catch(e) {
      console.log('getAllNearNpcs Loi:', e.message);
    }

  } catch(e) {
    console.error('Loi:', e.message);
  } finally {
    try { await session.disconnect(); } catch(e) {}
    console.log('\nDone.');
  }
}

main();
