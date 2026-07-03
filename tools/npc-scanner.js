// tools/npc-scanner.js — Bắt ID NPC bằng cách CLICK vào NPC trong game
// Cách dùng: 
//   1. Chạy: node tools/npc-scanner.js
//   2. Click tay vào NPC muốn lấy ID trong game
//   3. Script tự bắt ID → chọn save

const fs = require('fs');
const path = require('path');

const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

const NPC_DB_FILE = path.join(__dirname, '..', 'data', 'output', 'npc_common.json');

// ─── Load/Save ─────────────────────────────────────────────────────
function loadNpcDb() {
    try {
        if (fs.existsSync(NPC_DB_FILE)) return JSON.parse(fs.readFileSync(NPC_DB_FILE, 'utf-8'));
    } catch(e) {}
    return {};
}

function saveNpcDb(db) {
    const dir = path.dirname(NPC_DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(NPC_DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function showDb(db) {
    const keys = Object.keys(db);
    if (keys.length === 0) { console.log('  (trống)\n'); return; }
    console.log(`\n📦 NPC Common DB (${keys.length} NPC):`);
    for (const [id, info] of Object.entries(db)) {
        console.log(`  ${id} → ${info.name || '(chưa đặt tên)'}${info.map ? ` [map ${info.map}]` : ''}`);
    }
    console.log();
}

// ─── Extract NPC ID từ packet opcode 33 ────────────────────────────
function extractNpcId(hexStr) {
    const bytes = Buffer.from(hexStr, 'hex');
    let dynamicId = null;
    
    if (bytes.length >= 2 && bytes[0] === 0x0a) {
        const len = bytes[1];
        if (bytes.length >= 2 + len) {
            dynamicId = bytes.slice(2, 2 + len).toString('ascii');
        }
    }
    
    if (!dynamicId) {
        let asciiStr = '';
        for (let i = 0; i < bytes.length; i++) {
            if (bytes[i] >= 48 && bytes[i] <= 57) asciiStr += String.fromCharCode(bytes[i]);
            else asciiStr += ' ';
        }
        const numbers = asciiStr.split(' ').filter(s => s.length > 0);
        if (numbers.length > 0) dynamicId = numbers[0];
    }
    return dynamicId;
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
    const db = loadNpcDb();
    
    console.log('═══════════════════════════════════════════');
    console.log('  🖱️  NPC SCANNER — Click NPC để bắt ID');
    console.log('═══════════════════════════════════════════\n');

    showDb(db);

    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    
    try {
        console.log('Đang kết nối...');
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Sẵn sàng! Click vào NPC trong game để bắt ID.\n');

        const deviceId = session.deviceId || 'default';
        const capturedIds = [];

// Cách 1: Bắt từ packet (click NPC)
        session.onMessage((payload) => {
            if (payload.type !== 'send_out') return;
            if (!payload.hex) return;
            const npcId = extractNpcId(payload.hex);
            if (!npcId || capturedIds.includes(npcId)) return;
            capturedIds.push(npcId);
            console.log(`\n🎯 Packet: NPC ID=${npcId} (opcode ${payload.opcode})`);
        });

        console.log('✅ Sẵn sàng! Click NPC hoặc đợi auto-scan...\n');

        // Cách 2: Dump toàn bộ NPC từ memory (kể cả ngoài nearNpcs)
        const tryDump = async () => {
            try {
                const res = await session.callRpc('getNearNpcNames');
                if (res && res.ok && res.npcMap) {
                    for (const [id, name] of Object.entries(res.npcMap)) {
                        if (!capturedIds.includes(id)) {
                            capturedIds.push(id);
                            console.log(`🔍 Memory: ID=${id} → ${name || '(không tên)'}`);
                        }
                    }
                }
            } catch(e) {}
            // Cũng thử quét enemies (NPC khác phe cũng có thể là NPC shop)
            try {
                const enemyRes = await session.callRpc('getNearEnemies');
                if (enemyRes && enemyRes.ok && enemyRes.enemies) {
                    // Log thêm nếu có NPC đặc biệt
                    for (const e of enemyRes.enemies) {
                        if (e.name && !capturedIds.includes(e.id)) {
                            capturedIds.push(e.id);
                            console.log(`🔍 Enemy: ID=${e.id} → ${e.name} (HP:${e.hp}/${e.maxHp})`);
                        }
                    }
                }
            } catch(e) {}
        };
        
        // Dump ngay và mỗi 3 giây
        await tryDump();
        const dumpInterval = setInterval(tryDump, 3000);

        // Graceful shutdown
        const cleanup = async () => {
            clearInterval(dumpInterval);
            console.log('\n───────────────────────────────────────────');
            
            if (capturedIds.length === 0) {
                console.log('❌ Chưa bắt được NPC nào.');
                await session.disconnect();
                process.exit(0);
            }

            console.log(`\n📋 Đã bắt ${capturedIds.length} NPC:\n`);
            capturedIds.forEach((id, i) => {
                const existing = db[id];
                const label = existing ? ` (đã có: ${existing.name || '?'})` : ' (MỚI)';
                console.log(`  ${i + 1}. ${id}${label}`);
            });

            console.log('\nNhập tên cho từng NPC (Enter để giữ nguyên/bỏ qua):');

            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const ask = (q) => new Promise(r => readline.question(q, r));

            for (const npcId of capturedIds) {
                const existing = db[npcId];
                const defaultName = existing ? existing.name || '' : '';
                const prompt = defaultName 
                    ? `  ${npcId} [${defaultName}] → tên mới (Enter giữ): `
                    : `  ${npcId} → đặt tên: `;
                
                const name = (await ask(prompt)).trim();
                if (name) {
                    db[npcId] = { name, savedAt: new Date().toISOString() };
                } else if (!existing) {
                    db[npcId] = { name: `NPC_${npcId}`, savedAt: new Date().toISOString() };
                }
            }

            readline.close();

            if (capturedIds.length > 0) {
                saveNpcDb(db);
                console.log(`\n📌 Đã lưu. Dùng: session.callRpc("remoteNpcDialogue", "<ID>")`);
            }

            await session.disconnect();
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        // Giữ process chạy
        await new Promise(() => {});

    } catch(e) {
        console.error(`❌ Lỗi: ${e.message}`);
        process.exit(1);
    }
}

main();
