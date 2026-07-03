// tools/bulk-verify.js — Verify nhiều offset 1 lần
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
    console.log('🔬 Bulk Offset Verification...\n');
    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    
    try {
        await session.connect();
        await session.loadScript(require('path').join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Connected.\n');

        const r = await session.callRpc('bulkVerify');
        console.log(JSON.stringify(r, null, 2));
        
        if (r.ok) {
            console.log(`\n✅ Verified: ${r.verifiedFields || '?'} fields`);
            if (r.failed.length) console.log(`⚠️  Failed: ${r.failed.join(', ')}`);
        }

    } catch(e) {
        console.error(`❌ ${e.message}`);
    } finally {
        try { await session.disconnect(); } catch(e) {}
    }
}

main();
