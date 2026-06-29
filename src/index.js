// src/index.js — Main orchestrator entry point
const { FridaSession } = require('./frida-session');
const { PacketSniffer } = require('./packet-sniffer');
const { PacketInjector } = require('./packet-injector');
const { MemoryReader } = require('./memory-reader');
const { AutoPK } = require('./auto-pk');
const config = require('../config');
const path = require('path');

const DEVICE_ID = null; // Auto-detect

async function main() {
  console.log('======================================================================');
  console.log('              VLTK1 MOBILE AUTO PK BOT (NODE.JS)');
  console.log('======================================================================\n');

  const session = new FridaSession(DEVICE_ID, config.GAME_PACKAGE);

  console.log('[1/4] Connecting Frida to game process...');
  try {
    await session.connect();
    console.log('  [OK] Connected to device + game process.');
  } catch (err) {
    console.error(`  [FAIL] Connection failed: ${err.message}`);
    process.exit(1);
  }

  const bundlePath = path.join(config.FRIDA_SCRIPTS_DIR, 'bot.bundle.js');
  console.log(`[2/4] Injecting Frida bundle: ${path.basename(bundlePath)}...`);
  try {
    await session.loadScript(bundlePath);
    console.log('  [OK] Script injected and initialized.');
  } catch (err) {
    console.error(`  [FAIL] Injection failed: ${err.message}`);
    await session.disconnect();
    process.exit(1);
  }

  // Instantiate layers
  const sniffer = new PacketSniffer(session);
  const injector = new PacketInjector(session);
  const memory = new MemoryReader(session);
  const autoPK = new AutoPK(session, memory, injector, sniffer, DEVICE_ID, config);

  // Handle Frida messages
  session.onMessage((payload) => {
    if (payload.type === 'game_fd') {
      console.log(`[FRIDA] Socket fd locked: ${payload.fd} (via ${payload.detectedBy || 'traffic'})`);
      sniffer.gameFd = payload.fd;
    } else if (payload.type === 'error') {
      console.error(`[FRIDA ERROR] ${payload.description || payload.msg || JSON.stringify(payload)}`);
    } else if (payload.type === 'log') {
      // Forward Frida script logs
      console.log(`[FRIDA] ${payload.msg}`);
    }
  });

  // Start packet sniffer
  console.log('[3/4] Starting packet sniffer (200ms interval)...');
  sniffer.start(200);

  // Read player info
  const sect = await memory.getMySect();
  console.log(`  Player Sect: ${sect}`);

  // Start Auto PK loop
  console.log('[4/4] Starting Auto PK loop...');
  await autoPK.start();

  // Status display interval
  const infoInterval = setInterval(async () => {
    try {
      const info = await session.callRpc('getPlayerInfo');
      const state = autoPK.getState();
      if (info && info.ok) {
        const hpPct = info.maxHp ? (info.hp / info.maxHp * 100).toFixed(0) : '?';
        const mpPct = info.maxMp ? (info.mp / info.maxMp * 100).toFixed(0) : '?';
        console.log(`[STATUS] ${info.name || '?'} | Lv${info.level || 0} | Map ${info.mapId || '?'} | ` +
          `HP ${hpPct}% MP ${mpPct}% | Camp:${state.campLabel} | ` +
          `${state.atCamp ? 'AT CAMP' : 'WAR ZONE'}${state.dead ? ' | DEAD' : ''}`);
      } else {
        console.log('[STATUS] Waiting for character... (move character in emulator)');
      }
    } catch (e) { /* skip */ }
  }, 5000);

  console.log('\nRunning... Press Ctrl+C to stop.\n');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    clearInterval(infoInterval);
    sniffer.stop();
    await autoPK.stop();
    try { await session.disconnect(); console.log('Frida disconnected.'); } catch (e) { /* skip */ }
    console.log('Bye.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[FATAL] Fatal error:', err);
  process.exit(1);
});
