const { FridaSession } = require('../src/frida-session');
const config = require('../config');
const path = require('path');

async function main() {
    const session = new FridaSession(null, config.GAME_PACKAGE);
    console.log('[*] Connecting to game...');
    const connected = await session.connect();
    if (!connected) {
        console.log('[-] Failed to connect.');
        return;
    }

    const scriptPath = path.join(config.FRIDA_SCRIPTS_DIR, 'bot.bundle.js');
    console.log(`[*] Loading script: ${scriptPath}`);
    await session.loadScript(scriptPath);
    console.log('[+] Script loaded successfully.\n');

    console.log('[*] Testing closeDialogPopups...');
    const closeRes = await session.callRpc('closeDialogPopups');
    console.log('[*] Result of closeDialogPopups:', closeRes);
    
    console.log('[*] Testing closeOnlyNpcDialog...');
    const closeNpcRes = await session.callRpc('closeOnlyNpcDialog');
    console.log('[*] Result of closeOnlyNpcDialog:', closeNpcRes);
    
    console.log('\n[*] Disconnecting...');
    await session.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('[-] Fatal error:', err);
    process.exit(1);
});
