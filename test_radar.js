const { FridaSession } = require('./src/frida-session');
const fs = require('fs');

async function testRadar() {
    console.log("Đang kết nối thiết bị...");
    const session = new FridaSession(null, 'vn.perfingame.jx1mobile');
    try {
        await session.connect();
        console.log("✅ Kết nối Frida thành công!");
        
        console.log("Đang nạp radar.bundle.js để quét NPC...");
        const radarSource = fs.readFileSync('frida-scripts/radar.bundle.js', 'utf-8');
        const radarScript = await session.session.createScript(radarSource);
        
        radarScript.message.connect((msg) => {
            if (msg.type === 'log') {
                console.log("[FridaLog]", msg.payload);
            } else if (msg.type === 'error') {
                console.error("[FridaError]", msg.description);
            } else if (msg.type === 'send' && msg.payload && msg.payload.type === 'scan_result') {
                const npcs = msg.payload.npcs;
                console.log(`\n📡 RADAR TÌM THẤY ${npcs.length} NPC xung quanh:`);
                for (const npc of npcs) {
                    console.log(` - Tên: "${npc.name}" | ID: ${npc.id}`);
                }
                
                const quannhu = npcs.find(n => n.name.includes("Quân Nhu"));
                const trinhsat = npcs.find(n => n.name.includes("Trinh Sát"));
                
                console.log("\n🎯 KẾT QUẢ TÌM KIẾM THEO TÊN:");
                if (quannhu) console.log(` => ĐÃ TÌM THẤY: ${quannhu.name} (ID: ${quannhu.id})`);
                else console.log(" => KHÔNG TÌM THẤY Quân Nhu");
                
                if (trinhsat) console.log(` => ĐÃ TÌM THẤY: ${trinhsat.name} (ID: ${trinhsat.id})`);
                else console.log(" => KHÔNG TÌM THẤY Trinh Sát");
            }
        });
        
        await radarScript.load();
        
        // Wait 3 seconds for scan to complete
        await new Promise(r => setTimeout(r, 3000));
        
        console.log("\nĐang gỡ radar script...");
        await radarScript.unload();
        await session.disconnect();
        console.log("Xong!");
        process.exit(0);
    } catch (e) {
        console.error("Lỗi:", e.message);
        process.exit(1);
    }
}

testRadar();
