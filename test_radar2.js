const { FridaSession } = require('./src/frida-session');
async function run() {
    const session = new FridaSession(null, 'vn.perfingame.jx1mobile');
    try {
        await session.connect();
        await session.loadScript('frida-scripts/bot.bundle.js');
        session.script.message.connect((msg) => {
            if (msg.type === 'send' && msg.payload && msg.payload.type === 'log') {
                console.log("[Log]", msg.payload.message);
            }
        });
        console.log("✅ Kết nối Frida thành công!");
        console.log("Đang gọi getNearNpcsDetail...");
        
        const res = await session.callRpc('getNearNpcsDetail');
        if (res && res.ok && res.npcs) {
            console.log(`\n📡 RADAR TÌM THẤY ${res.npcs.length} NPC xung quanh:`);
            for (const npc of res.npcs) {
                console.log(` - Tên: "${npc.name}" | ID: ${npc.id}`);
            }
        } else {
            console.error("Lỗi:", res ? res.error : "Unknown");
        }
        
        await session.disconnect();
        process.exit(0);
    } catch (e) {
        console.error("Lỗi:", e.message);
        process.exit(1);
    }
}
run();
