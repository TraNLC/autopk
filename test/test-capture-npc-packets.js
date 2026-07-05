// tools/test-capture-npc-packets.js — Bắt NPC từ packet server (op72, op34, etc.)
const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  📡 CAPTURE NPC PACKETS — Đi lại gần NPC');
    console.log('═══════════════════════════════════════════');
    console.log('  👉 Chạy lại gần NPC Trinh Sát / Quân Nhu');
    console.log('  📋 Script sẽ log mọi packet có chứa text');
    console.log('  ⌨️  Ctrl+C để dừng\n');

    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);

    try {
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Đã kết nối!\n');

        // Monitor recv packets for any text content
        session.onMessage((payload) => {
            if (payload.type !== 'recv') return;
            if (!payload.hex) return;
            
            try {
                const bytes = Buffer.from(payload.hex, 'hex');
                // Extract readable text from packet
                let ascii = '';
                for (let i = 0; i < bytes.length; i++) {
                    const b = bytes[i];
                    if (b >= 0x20 && b < 0x7f) ascii += String.fromCharCode(b);
                    else if (ascii.length > 0) {
                        if (ascii.length >= 3) {
                            // Log any readable segment
                        }
                        ascii = '';
                    }
                }
                
                // Extract ALL readable strings >= 3 chars
                const strings = [];
                let cur = '';
                for (let i = 0; i < bytes.length; i++) {
                    const b = bytes[i];
                    if (b >= 0x20 && b < 0x7f) {
                        cur += String.fromCharCode(b);
                    } else {
                        if (cur.length >= 3) strings.push(cur);
                        cur = '';
                    }
                }
                if (cur.length >= 3) strings.push(cur);
                
                if (strings.length > 0) {
                    // Filter interesting packets: contains Chinese/Vietnamese or numbers
                    const hasText = strings.some(s => 
                        s.includes('Trinh') || s.includes('Quan') || 
                        s.includes('Tong') || s.includes('Kim') ||
                        s.includes('chien') || s.includes('binh') ||
                        /[\u4e00-\u9fff]/.test(s)  // Chinese chars
                    );
                    
                    if (hasText || payload.opcode === 72 || payload.opcode === 34 || 
                        payload.opcode === 71 || payload.opcode === 126 || payload.opcode === 166) {
                        const ts = new Date().toLocaleTimeString();
                        console.log(`\n[${ts}] 📩 RECV op=${payload.opcode} len=${bytes.length}`);
                        console.log(`  Strings: ${strings.slice(0, 20).join(' | ')}`);
                        if (strings.length > 20) console.log(`  ... +${strings.length - 20} more`);
                        
                        // Try to extract NPC IDs (numeric strings from protobuf)
                        const numIds = strings.filter(s => /^\d{1,6}$/.test(s) && s.length >= 2);
                        if (numIds.length > 0) {
                            console.log(`  🔢 IDs: ${numIds.join(', ')}`);
                        }
                    }
                }
            } catch(e) {}
        });

        // Also poll recv buffer periodically
        const pollInterval = setInterval(async () => {
            try {
                const res = await session.callRpc('getRecvPackets');
                if (res && res.ok && res.packets) {
                    for (const pkt of res.packets) {
                        if (pkt.opcode === 72 || pkt.opcode === 34 || pkt.opcode === 71) {
                            console.log(`  📦 Buffer op=${pkt.opcode} hex=${pkt.hex ? pkt.hex.substring(0, 80) : '?'}...`);
                        }
                    }
                }
            } catch(e) {}
        }, 5000);

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
