// tools/test-probe-scan.js — Auto-probe NPCs bằng dialog keyword, không cần click
const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

const HEAL_KW = ['duoc pham', 'nhan thuoc', 'hoi phuc', 'dược phẩm', 'nhận thuốc', 'hồi phục'];
const WAR_KW = ['tran dia', 'chien truong', 'ra tran', 'trận địa', 'chiến trường', 'ra trận'];

function removeAccents(s) { return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }

async function probe(session, npcId) {
    // Close any existing dialog first
    await session.callRpc('closeDialogPopups').catch(() => {});
    await new Promise(r => setTimeout(r, 200));
    
    // Send dialogue
    await session.callRpc('remoteNpcDialogue', String(npcId));
    await new Promise(r => setTimeout(r, 800));
    
    // Check if dialog opened
    const check = await session.callRpc('isDialogOpen');
    
    let best = { id: npcId, type: null, open: false };
    if (check && check.ok && check.open) {
        best.open = true;
        // Try to identify by reading dialog via getRecvPackets fallback
        try {
            const all = await session.callRpc('getRecvPackets', null, 100);
            const pkts = (all && all.packets) ? all.packets : [];
            for (const pkt of pkts) {
                if (pkt.opcode !== 34) continue;
                if (!pkt.hex) continue;
                const bytes = Buffer.from(pkt.hex, 'hex');
                let text = '';
                for (let i = 0; i < bytes.length; i++) {
                    if (bytes[i] >= 0x20 && bytes[i] < 0x7f) text += String.fromCharCode(bytes[i]);
                }
                const lower = removeAccents(text);
                for (const kw of HEAL_KW) {
                    if (lower.includes(removeAccents(kw))) { best.type = 'HEAL'; break; }
                }
                if (!best.type) {
                    for (const kw of WAR_KW) {
                        if (lower.includes(removeAccents(kw))) { best.type = 'WAR'; break; }
                    }
                }
                if (best.type) { best.text = text.substring(0, 80); break; }
            }
        } catch(e) {}
        
        // If can't identify by recv, try selectDialogOption approach:
        // Trinh Sát has option 0="Trận địa bên Tống" — sending selectDialogOption will enter battle
        // We DON'T want that. Instead, we just know dialog opened → NPC exists.
        if (!best.type) best.type = 'EXISTS';
    }
    
    // Close dialog
    await session.callRpc('closeDialogPopups').catch(() => {});
    await new Promise(r => setTimeout(r, 200));
    return best;
}

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  🔍 AUTO-PROBE NPC — Quét dialog để tìm');
    console.log('═══════════════════════════════════════════\n');

    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    try {
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Đã kết nối!\n');

        // Get player info
        try {
            const info = await session.callRpc('getPlayerInfo');
            if (info && info.ok) {
                console.log(`📍 Map: ${info.mapId} | Camp: ${info.campValue===2?'KIM':'TỐNG'} | HP: ${info.hp}\n`);
            }
        } catch(e) {}

        // Probe range: try known ID first, then nearby
        const idsToTry = ['113']; // Known Trinh Sát
        // Add range 110-120
        for (let i = 110; i <= 120; i++) {
            if (!idsToTry.includes(String(i))) idsToTry.push(String(i));
        }

        let healId = null, warId = null, found = 0;

        console.log(`🔬 Đang probe ${idsToTry.length} IDs...\n`);
        
        for (const id of idsToTry) {
            if (healId && warId) break;
            
            process.stdout.write(`  Probe ${id}... `);
            const result = await probe(session, id);
            
            if (result.type === 'HEAL') {
                console.log(`❤️ QUÂN NHU! "${result.text}"`);
                healId = id;
                found++;
            } else if (result.type === 'WAR') {
                console.log(`⚔️ TRINH SÁT! "${result.text}"`);
                warId = id;
                found++;
            } else if (result.text) {
                console.log(`❓ Lạ: "${result.text.substring(0,50)}"`);
            } else {
                console.log(`— (không phản hồi)`);
            }
        }

        console.log('\n═══════════════════════════════════════════');
        if (healId) console.log(`  ❤️  Quân Nhu   = ${healId}`);
        if (warId)  console.log(`  ⚔️  Trinh Sát  = ${warId}`);
        if (!healId && !warId) console.log('  ❌ Không tìm thấy NPC nào!');
        console.log('═══════════════════════════════════════════');

    } catch(e) {
        console.error(`❌ ${e.message}`);
    } finally {
        await session.disconnect().catch(() => {});
        console.log('\n👋 Done');
        process.exit(0);
    }
}
main();
