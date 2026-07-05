// tools/test-offsets.js — Test offset chính xác từ dump
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
    console.log('🔬 Testing dump offsets...\n');
    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    
    try {
        await session.connect();
        await session.loadScript(require('path').join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Connected.\n');

        // Test verifyOffsets
        console.log('📊 verifyOffsets (target→controller→position→identify):');
        const r = await session.callRpc('verifyOffsets');
        console.log(JSON.stringify(r, null, 2));

        if (r.ok) {
            console.log('\n📊 So sánh với giá trị trong game:');
            if (r.name) console.log(`  Tên: ${r.name}`);
            if (r.mapId_0xE4 !== undefined) console.log(`  Map ID: ${r.mapId_0xE4}`);
            console.log(`  Camp: ${r.camp} | Series: ${r.series}`);
            console.log(`  HP: ${r.hp}/${r.maxHp}`);
            console.log(`  Pos: (${r.x}, ${r.y})`);
            console.log('\n✅ Offset verification PASSED! Có thể merge vào core.');
        } else {
            console.log('\n❌ Offset verification FAILED. Cần điều chỉnh.');
        }

        // Test getPlayerInfoNoIl2cpp
        console.log('\n📊 getPlayerInfoNoIl2cpp:');
        const info = await session.callRpc('getPlayerInfoNoIl2cpp');
        console.log(JSON.stringify(info, null, 2));

    } catch(e) {
        console.error(`❌ ${e.message}`);
    } finally {
        try { await session.disconnect(); } catch(e) {}
    }
}

main();
