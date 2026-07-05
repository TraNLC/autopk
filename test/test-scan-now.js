// tools/test-scan-now.js — Test nhanh: đứng trong Tống Kim, chạy file này để quét NPC gần
// Cách dùng: node tools/test-scan-now.js

const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

function removeAccents(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  🔍 TEST SCAN NPC — Đứng trong Tống Kim');
    console.log('═══════════════════════════════════════════\n');

    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);

    try {
        console.log('⏳ Kết nối...');
        await session.connect();
        console.log(`✅ Đã kết nối: ${session.deviceId}\n`);

        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Script loaded\n');

        // ─── 1. getNearNpcNames ───
        console.log('📋 ĐANG QUÉT NPC GẦN...\n');
        const res = await session.callRpc('getNearNpcNames');
        
        if (!res || !res.ok) {
            console.log(`❌ RPC thất bại: ${res ? res.error : 'no response'}`);
            console.log('💡 Có thể cần build --bridge. Đang thử cách khác...\n');
        } else if (!res.npcMap || Object.keys(res.npcMap).length === 0) {
            console.log('⚠️  KHÔNG có NPC nào gần!');
            console.log('   - Bạn đã đứng trong khu Tống Kim chưa?');
            console.log('   - Game đã load hết NPC chưa?\n');
        } else {
            const npcs = Object.entries(res.npcMap);
            console.log(`✅ TÌM THẤY ${npcs.length} NPC:\n`);

            let quanNhu = null, trinhSat = null, chieuBinh = null;
            const others = [];

            for (const [id, name] of npcs) {
                const n = removeAccents(name);
                const entry = { id, name };

                if (n.includes('quan nhu') || n.includes('quân nhu')) {
                    quanNhu = entry;
                    console.log(`   ❤️  QUÂN NHU     → ID=${id}  "${name}"`);
                } else if (n.includes('trinh sat') || n.includes('trinh sát')) {
                    trinhSat = entry;
                    console.log(`   ⚔️  TRINH SÁT    → ID=${id}  "${name}"`);
                } else if (n.includes('chieu binh') || n.includes('chiêu binh')) {
                    chieuBinh = entry;
                    console.log(`   📋 CHIÊU BINH   → ID=${id}  "${name}"`);
                } else {
                    others.push(entry);
                    console.log(`   👤  NPC          → ID=${id}  "${name || '(không tên)'}"`);
                }
            }

            // ─── 2. Test gọi NPC nếu tìm thấy ───
            console.log('\n═══════════════════════════════════════════');
            console.log('  🧪 TEST GỌI NPC');
            console.log('═══════════════════════════════════════════\n');

            if (trinhSat) {
                console.log(`⏳ Test gọi Trinh Sát (ID=${trinhSat.id})...`);
                try {
                    await session.callRpc('remoteNpcDialogue', trinhSat.id);
                    console.log(`✅ ĐÃ GỌI Trinh Sát! Nhìn game xem có mở dialog không.\n`);
                } catch (e) {
                    console.log(`❌ Lỗi gọi Trinh Sát: ${e.message}\n`);
                }
            } else {
                console.log('⚠️  KHÔNG tìm thấy Trinh Sát trong NPC gần!\n');
            }

            if (quanNhu) {
                console.log(`⏳ Test gọi Quân Nhu (ID=${quanNhu.id})...`);
                try {
                    await session.callRpc('remoteNpcDialogue', quanNhu.id);
                    console.log(`✅ ĐÃ GỌI Quân Nhu! Nhìn game xem có mở dialog không.\n`);
                } catch (e) {
                    console.log(`❌ Lỗi gọi Quân Nhu: ${e.message}\n`);
                }
            }

            // ─── 3. Kết quả để copy ───
            console.log('═══════════════════════════════════════════');
            console.log('  📋 KẾT QUẢ (copy dùng cho code):');
            console.log('═══════════════════════════════════════════\n');
            if (quanNhu)   console.log(`   quanNhuId  = "${quanNhu.id}"`);
            if (trinhSat)  console.log(`   trinhSatId = "${trinhSat.id}"`);
            if (chieuBinh) console.log(`   baodanhId  = "${chieuBinh.id}"`);
            console.log();
        }

        // ─── 4. Player info ───
        console.log('📍 THÔNG TIN NHÂN VẬT:');
        try {
            const info = await session.callRpc('getPlayerInfo');
            if (info && info.ok) {
                console.log(`   Map: ${info.mapId}  |  Camp: ${info.campValue === 2 ? 'KIM' : info.campValue === 1 ? 'TỐNG' : info.campValue}`);
                console.log(`   Vị trí: (${info.x}, ${info.y})`);
                console.log(`   HP: ${info.hp}/${info.maxHp}  |  Cấp: ${info.level}`);
            }
        } catch (e) {
            console.log(`   Không đọc được: ${e.message}`);
        }

    } catch (e) {
        console.error(`\n❌ Lỗi: ${e.message}`);
    } finally {
        await session.disconnect().catch(() => {});
        console.log('\n👋 Done!');
        process.exit(0);
    }
}

main();
