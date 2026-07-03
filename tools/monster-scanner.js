// tools/monster-scanner.js — Quét toàn bộ quái trên bản đồ (bao gồm quái xanh)
// Cách dùng: node tools/monster-scanner.js [range]
//   range: bán kính quét (mặc định 800), VD: node tools/monster-scanner.js 1200

const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log(`  👹 MONSTER SCANNER — Toàn bộ quái đã load`);
    console.log('═══════════════════════════════════════════\n');

    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);

    try {
        await session.connect();
        await session.loadScript(require('path').join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Đã kết nối.\n');

        // Quét enemies (tự có localX/Y, không cần getPlayerInfo)
        const res = await session.callRpc('getNearEnemies');
        if (!res || !res.ok) {
            console.log(`❌ Lỗi quét: ${res ? res.error : 'unknown'}`);
            await session.disconnect();
            return;
        }

        if (!res.enemies || res.enemies.length === 0) {
            console.log(`⚠️  enemies rỗng. Debug:`);
            console.log(`   localCamp=${res.localCamp} localSeries=${res.localSeries}`);
            console.log(`   localX=${res.localX} localY=${res.localY}`);
            
            // Thử quét NPC xung quanh
            console.log('\n🔍 Đang quét NPC + tất cả entity...');
            try {
                const npcRes = await session.callRpc('getNearNpcNames');
                if (npcRes && npcRes.ok && npcRes.npcMap) {
                    const npcs = Object.entries(npcRes.npcMap);
                    console.log(`📋 NPC xung quanh (${npcs.length}):`);
                    for (const [id, name] of npcs.slice(0, 30)) {
                        console.log(`   ${id} → ${name || '(không tên)'}`);
                    }
                } else {
                    console.log('   getNearNpcNames cũng rỗng!');
                }
            } catch(e) {
                console.log(`   Lỗi: ${e.message}`);
            }
            
            await session.disconnect();
            return;
        }

        const px = res.localX || 0;
        const py = res.localY || 0;
        console.log(`📍 Vị trí: (${px}, ${py}) | Tổng entity: ${res.enemies.length}\n`);

        // Lọc: quái (không phải người chơi), KHÔNG giới hạn range
        const monsters = res.enemies.filter(e => {
            if (!e.name || e.name.length === 0) return false;
            // Lọc player: player thường có camp 1 hoặc 2, tên có dấu cách
            const isPlayer = (e.camp === 1 || e.camp === 2) && e.name.includes(' ');
            return !isPlayer;
        });

        // Phân loại theo màu tên (dựa vào level/HP để đoán)
        const normalMonsters = [];
        const eliteMonsters = [];  // Quái xanh (tinh anh) - HP cao hơn hẳn
        const bossMonsters = [];   // Boss - HP rất cao

        for (const m of monsters) {
            const dist = distance(px, py, m.x, m.y);
            m._dist = dist;
            
            if (m.maxHp > 500000) {
                bossMonsters.push(m);
            } else if (m.maxHp > 50000) {
                eliteMonsters.push(m);
            } else {
                normalMonsters.push(m);
            }
        }

        // Sắp xếp theo khoảng cách
        const sortByDist = (a, b) => a._dist - b._dist;
        normalMonsters.sort(sortByDist);
        eliteMonsters.sort(sortByDist);
        bossMonsters.sort(sortByDist);

        // Hiển thị
        const printTable = (title, list, emoji) => {
            if (list.length === 0) return;
            console.log(`\n${emoji} ${title} (${list.length} con):`);
            console.log('┌────────┬────────────────────────┬──────────┬────────────┬──────────┐');
            console.log('│ ID     │ Tên                    │ HP/MaxHP │ Series     │ Dist(m)  │');
            console.log('├────────┼────────────────────────┼──────────┼────────────┼──────────┤');
            for (const m of list.slice(0, 200)) {
                const id = String(m.id || '?').padEnd(6);
                const name = (m.name || '???').substring(0, 20).padEnd(20);
                const hp = `${m.hp}/${m.maxHp}`.padEnd(8);
                const series = String(m.series !== undefined ? m.series : '?').padEnd(10);
                const dist = String(Math.round(m._dist)).padEnd(8);
                console.log(`│ ${id} │ ${name} │ ${hp} │ ${series} │ ${dist} │`);
            }
            if (list.length > 30) console.log(`│ ... còn ${list.length - 30} con nữa`);
            console.log('└────────┴────────────────────────┴──────────┴────────────┴──────────┘');
        };

        printTable('BOSS / THỦ LĨNH', bossMonsters, '👑');
        printTable('QUÁI TINH ANH (xanh)', eliteMonsters, '🔵');
        printTable('QUÁI THƯỜNG', normalMonsters, '⚪');

        const total = monsters.length;
        console.log(`\n📊 Tổng: ${total} quái | 🔵 ${eliteMonsters.length} tinh anh | 👑 ${bossMonsters.length} boss | ⚪ ${normalMonsters.length} thường`);
        console.log('   Dùng ID quái với: session.callRpc("remoteNpcDialogue", "<ID>")');

    } catch(e) {
        console.error(`❌ ${e.message}`);
    } finally {
        try { await session.disconnect(); } catch(e) {}
    }
}

main();
