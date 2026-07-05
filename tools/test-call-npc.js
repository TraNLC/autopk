// tools/test-call-npc.js — Test gọi NPC từ xa
// Dùng: node tools/test-call-npc.js <NPC_ID>
// VD:   node tools/test-call-npc.js 713

const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

const npcId = process.argv[2];
if (!npcId) {
    console.log('Dùng: node tools/test-call-npc.js <NPC_ID>');
    console.log('VD:   node tools/test-call-npc.js 713');
    process.exit(1);
}

async function main() {
    console.log(`📞 Đang gọi NPC ID=${npcId}...`);
    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);

    try {
        await session.connect();
        await session.loadScript(require('path').join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));

        console.log('✅ Đã kết nối. Gọi NPC...');
        await session.callRpc('remoteNpcDialogue', npcId);
        
        console.log('✅ Đã gửi lệnh! Kiểm tra game xem shop có mở không.');
        console.log('   (nếu shop mở → chọn option 0 để mua đồ)');
        
        await new Promise(r => setTimeout(r, 2000));
        await session.callRpc('closeDialogPopups').catch(() => {});
        console.log('👋 Done.');
    } catch(e) {
        console.error(`❌ ${e.message}`);
    } finally {
        try { await session.disconnect(); } catch(e) {}
    }
}

main();
