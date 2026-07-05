// tools/test-click-npc.js — Click NPC trong game → bắt ID từ packet op33 (ENpcDialogue)
// Cách dùng: node tools/test-click-npc.js
// Rồi click tay vào NPC (Quân Nhu / Trinh Sát) → script tự bắt ID

const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

function extractNpcId(hexStr) {
    try {
        const bytes = Buffer.from(hexStr, 'hex');
        // op33 body: 0a + len + ascii_string (NPC ID)
        if (bytes.length >= 3 && bytes[0] === 0x0a) {
            const len = bytes[1];
            if (bytes.length >= 2 + len) {
                const id = bytes.slice(2, 2 + len).toString('ascii');
                if (/^\d+$/.test(id)) return id;
            }
        }
        // Fallback: extract first numeric group
        let ascii = '';
        for (let i = 0; i < bytes.length; i++) {
            if (bytes[i] >= 48 && bytes[i] <= 57) ascii += String.fromCharCode(bytes[i]);
        }
        return ascii || null;
    } catch(e) { return null; }
}

function removeAccents(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  🖱️  CLICK NPC ĐỂ BẮT ID');
    console.log('═══════════════════════════════════════════');
    console.log('  👉 Click tay vào Quân Nhu hoặc Trinh Sát');
    console.log('  ⌨️  Nhấn Ctrl+C để dừng\n');

    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);

    try {
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Đã kết nối! Đợi click NPC...\n');

        const seen = new Set();
        let foundQuanNhu = null;
        let foundTrinhSat = null;

        // Bắt packet op33 từ send hook
        session.onMessage((payload) => {
            if (payload.type !== 'send_out') return;
            if (payload.opcode !== 33 && payload.opcode !== '33') return;
            if (!payload.hex) return;
            
            const npcId = extractNpcId(payload.hex);
            if (!npcId || seen.has(npcId)) return;
            seen.add(npcId);

            // Thử lấy tên NPC từ getNearNpcNames nếu có
            let npcName = '';
            try {
                session.callRpc('getNearNpcNames').then(res => {
                    if (res && res.ok && res.npcMap && res.npcMap[npcId]) {
                        npcName = res.npcMap[npcId];
                        const n = removeAccents(npcName);
                        if (n.includes('quan nhu') || n.includes('quân nhu')) {
                            foundQuanNhu = { id: npcId, name: npcName };
                            console.log(`\n❤️  QUÂN NHU:   ID=${npcId}  "${npcName}"`);
                        } else if (n.includes('trinh sat') || n.includes('trinh sát')) {
                            foundTrinhSat = { id: npcId, name: npcName };
                            console.log(`\n⚔️  TRINH SÁT:  ID=${npcId}  "${npcName}"`);
                        } else {
                            console.log(`\n👤 NPC:        ID=${npcId}  "${npcName}"`);
                        }
                    } else {
                        console.log(`\n👤 NPC:        ID=${npcId}  (không đọc được tên)`);
                    }
                    
                    if (foundQuanNhu && foundTrinhSat) {
                        console.log('\n═══════════════════════════════════════════');
                        console.log('  ✅ ĐÃ BẮT ĐỦ CẢ 2 NPC!');
                        console.log('═══════════════════════════════════════════');
                        console.log(`  quanNhuId  = "${foundQuanNhu.id}"   // ${foundQuanNhu.name}`);
                        console.log(`  trinhSatId = "${foundTrinhSat.id}"   // ${foundTrinhSat.name}`);
                        console.log('\n  📋 DÙNG TRONG CODE:');
                        console.log(`  await session.callRpc('remoteNpcDialogue', "${foundTrinhSat.id}")`);
                        console.log(`  await session.callRpc('remoteNpcDialogue', "${foundQuanNhu.id}")`);
                        console.log('═══════════════════════════════════════════\n');
                    }
                }).catch(() => {});
            } catch(e) {}
        });

        // Keep alive
        await new Promise(() => {});

    } catch(e) {
        console.error(`❌ ${e.message}`);
    } finally {
        await session.disconnect().catch(() => {});
        process.exit(0);
    }
}

process.on('SIGINT', () => process.exit(0));
main();
