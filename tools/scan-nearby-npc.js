// tools/scan-nearby-npc.js — Quét ID NPC đứng gần trong game
// Cách dùng:
//   node tools/scan-nearby-npc.js                    → quét 1 lần
//   node tools/scan-nearby-npc.js --watch            → quét liên tục mỗi 3s
//   node tools/scan-nearby-npc.js --save mapId phe   → quét + lưu vào npc_db.json
//     VD: node tools/scan-nearby-npc.js --save 382 song
//         node tools/scan-nearby-npc.js --save 382 kim

const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

// ─── Helpers ───────────────────────────────────────────────────────
function removeAccents(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function classify(npcName) {
    const n = removeAccents(npcName);
    if (n.includes('quan nhu') || n.includes('quân nhu')) return { role: 'HEAL', emoji: '❤️', label: 'Quân Nhu (nhận máu)' };
    if (n.includes('trinh sat') || n.includes('trinh sát')) return { role: 'WAR', emoji: '⚔️', label: 'Trinh Sát (ra trận)' };
    if (n.includes('chieu binh') || n.includes('chiêu binh')) return { role: 'BAODANH', emoji: '📋', label: 'Chiêu Binh Quân (báo danh)' };
    // Các NPC quan trọng khác
    if (n.includes('thuc pham') || n.includes('thực phẩm')) return { role: 'FOOD', emoji: '🍖', label: 'Thực Phẩm' };
    if (n.includes('thuong gia') || n.includes('thương gia')) return { role: 'SHOP', emoji: '🛒', label: 'Thương Gia' };
    if (n.includes('bang hoi') || n.includes('bang hợi')) return { role: 'BANGHOI', emoji: '🏠', label: 'Bang Hội' };
    return { role: 'OTHER', emoji: '👤', label: 'NPC thường' };
}

// ─── Save to DB ────────────────────────────────────────────────────
const NPC_DB_FILE = path.join(__dirname, '..', 'data', 'output', 'npcs_scan.json');
function saveResults(mapId, faction, npcs) {
    let db = {};
    try {
        if (fs.existsSync(NPC_DB_FILE)) db = JSON.parse(fs.readFileSync(NPC_DB_FILE, 'utf-8'));
    } catch (e) {}
    
    const key = `map${mapId}_${faction}`;
    db[key] = {
        mapId: String(mapId),
        faction: faction,
        scannedAt: new Date().toISOString(),
        npcs: npcs
    };
    
    const dir = path.dirname(NPC_DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(NPC_DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    console.log(`\n📌 Đã lưu ${npcs.length} NPC vào ${NPC_DB_FILE} (key: ${key})`);
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const watchMode = args.includes('--watch');
    const saveIdx = args.indexOf('--save');
    const saveMode = saveIdx >= 0;
    const saveMapId = saveMode ? args[saveIdx + 1] : null;
    const saveFaction = saveMode ? args[saveIdx + 2] : null;

    console.log('═══════════════════════════════════════════════');
    console.log('  🔍 SCAN NPC ĐỨNG GẦN — Quét ID + Tên NPC');
    console.log('═══════════════════════════════════════════════\n');

    if (saveMode) {
        console.log(`💾 Save mode: Map ${saveMapId}, Phe ${saveFaction}`);
    }
    if (watchMode) {
        console.log('👁️  Watch mode: quét liên tục 3s/lần. Ctrl+C để dừng.\n');
    }

    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);

    try {
        console.log('⏳ Đang kết nối thiết bị & game...');
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Đã kết nối!\n');

        const deviceId = session.deviceId || 'default';
        let scanCount = 0;
        let allNpcs = []; // Tích luỹ NPC qua các lần quét

        const doScan = async () => {
            scanCount++;
            const timestamp = new Date().toLocaleTimeString();
            console.log(`\n${'─'.repeat(50)}`);
            console.log(`🔍 Lần quét #${scanCount} [${timestamp}]`);
            console.log(`${'─'.repeat(50)}`);

            // ═══ getNearNpcNames ═══
            try {
                const res = await session.callRpc('getNearNpcNames');
                if (res && res.ok && res.npcMap) {
                    const npcs = Object.entries(res.npcMap);
                    console.log(`\n📋 NPC đứng gần (${npcs.length}):\n`);
                    
                    if (npcs.length === 0) {
                        console.log('   ⚠️  KHÔNG có NPC nào gần! Kiểm tra:\n' +
                            '   - Đã đứng trong khu Tống Kim chưa?\n' +
                            '   - Game đã load NPC xong chưa?\n' +
                            '   - Nếu dùng safe-mode (không bridge): cần build --bridge');
                        return;
                    }

                    // Phân loại
                    const healNpcs = [];
                    const warNpcs = [];
                    const baodanhNpcs = [];
                    const otherNpcs = [];

                    for (const [id, name] of npcs) {
                        const info = classify(name);
                        const npcEntry = { id, name, role: info.role, emoji: info.emoji, label: info.label };
                        
                        if (info.role === 'HEAL') healNpcs.push(npcEntry);
                        else if (info.role === 'WAR') warNpcs.push(npcEntry);
                        else if (info.role === 'BAODANH') baodanhNpcs.push(npcEntry);
                        else otherNpcs.push(npcEntry);

                        // Tích luỹ (không trùng ID)
                        if (!allNpcs.find(n => n.id === id)) {
                            allNpcs.push(npcEntry);
                        }
                    }

                    // Hiển thị nhóm quan trọng trước
                    const printGroup = (title, list, color) => {
                        if (list.length === 0) return;
                        console.log(`  ${color} ${title} (${list.length}):`);
                        for (const n of list) {
                            console.log(`     ID=${n.id.padEnd(8)} → ${n.name || '(không tên)'}`);
                        }
                        console.log();
                    };

                    printGroup('❤️  QUÂN NHU — Nhận máu', healNpcs, '');
                    printGroup('⚔️  TRINH SÁT — Ra chiến trường', warNpcs, '');
                    printGroup('📋 CHIÊU BINH QUÂN — Báo danh', baodanhNpcs, '');

                    if (otherNpcs.length > 0) {
                        console.log(`  👤 NPC khác (${otherNpcs.length}):`);
                        for (const n of otherNpcs) {
                            console.log(`     ID=${n.id.padEnd(8)} → ${n.name || '(không tên)'}`);
                        }
                        console.log();
                    }

                    // ═══ Gợi ý dùng ═══
                    if (healNpcs.length > 0 || warNpcs.length > 0) {
                        console.log('  📌 GỢI Ý SỬ DỤNG:');
                        if (healNpcs.length > 0) {
                            console.log(`     Heal:  session.callRpc("remoteNpcDialogue", "${healNpcs[0].id}")`);
                        }
                        if (warNpcs.length > 0) {
                            console.log(`     War:   session.callRpc("remoteNpcDialogue", "${warNpcs[0].id}")`);
                            console.log(`            → selectDialogOption(0) để vào trận`);
                        }
                        console.log();
                    }

                } else {
                    console.log(`   ❌ Lỗi RPC: ${res ? res.error || JSON.stringify(res) : 'no response'}`);
                    console.log('   💡 Thử build lại bot với bridge: node frida-scripts/build.js --bridge');
                }
            } catch (e) {
                console.log(`   ❌ Lỗi quét: ${e.message}`);
            }

            // ═══ getNearEnemies (bổ sung) ═══
            try {
                const enemyRes = await session.callRpc('getNearEnemies');
                if (enemyRes && enemyRes.ok && enemyRes.enemies) {
                    const namedEnemies = enemyRes.enemies.filter(e => e.name && e.name.trim());
                    if (namedEnemies.length > 0) {
                        console.log(`  🎯 Entity khác (enemies, ${namedEnemies.length}):`);
                        for (const e of namedEnemies.slice(0, 10)) {
                            const hpPct = e.maxHp > 0 ? ` HP:${Math.round(e.hp/e.maxHp*100)}%` : '';
                            console.log(`     ID=${String(e.id).padEnd(8)} → ${e.name}${hpPct}`);
                        }
                        console.log();
                    }
                }
            } catch (e) {
                // Bỏ qua — enemies optional
            }
        };

        await doScan();

        if (watchMode) {
            // Watch mode: quét liên tục
            const interval = setInterval(doScan, 3000);
            
            const cleanup = async () => {
                clearInterval(interval);
                console.log('\n\n═══════════════════════════════════════════════');
                console.log(`📋 TỔNG KẾT: ${allNpcs.length} NPC đã phát hiện qua ${scanCount} lần quét`);
                
                // In danh sách đầy đủ
                const grouped = {};
                for (const n of allNpcs) {
                    if (!grouped[n.role]) grouped[n.role] = [];
                    grouped[n.role].push(n);
                }
                for (const [role, npcs] of Object.entries(grouped)) {
                    const label = npcs[0].label;
                    console.log(`\n  ${npcs[0].emoji} ${label}:`);
                    for (const n of npcs) {
                        console.log(`     ${n.id} → ${n.name}`);
                    }
                }

                await session.disconnect().catch(() => {});
                process.exit(0);
            };

            process.on('SIGINT', cleanup);
            process.on('SIGTERM', cleanup);
            await new Promise(() => {}); // Giữ process
        } else if (saveMode) {
            // Save mode: lưu kết quả
            saveResults(saveMapId, saveFaction, allNpcs);
            await session.disconnect();
        } else {
            // One-shot mode: in tổng kết rồi thoát
            console.log(`${'─'.repeat(50)}`);
            console.log(`✅ Xong! Tổng: ${allNpcs.length} NPC.`);
            if (allNpcs.length > 0 && !saveMode) {
                console.log('💡 Dùng --save <mapId> <song|kim> để lưu kết quả.');
            }
            await session.disconnect();
        }

    } catch (e) {
        console.error(`\n❌ Lỗi: ${e.message}`);
        console.error(e.stack);
        try { await session.disconnect(); } catch (_) {}
        process.exit(1);
    }
}

main();
