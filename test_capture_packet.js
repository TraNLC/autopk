const { FridaSession } = require('./src/frida-session');
const path = require('path');

async function run() {
    const session = new FridaSession('127.0.0.1:5555', 'vn.perfingame.jx1mobile');
    try {
        await session.connect();
    } catch (e) {
        console.error("Lỗi kết nối:", e.message);
        process.exit(1);
    }
    
    // Tải bundle gốc
    const scriptPath = path.join(__dirname, 'frida-scripts/bot.bundle.js');
    await session.loadScript(scriptPath);
    
    console.log("=========================================");
    console.log("Đã kết nối! Bắt đầu ghi log các gói tin (Packet) gửi đi...");
    console.log("Anh hãy cho nhân vật CHẾT, sau đó bấm nút VỀ THÀNH nhé!");
    console.log("=========================================\n");

    // Bật cờ bắt tất cả các gói tin gửi ra
    await session.callRpc('setCaptureAllSends', true);
    
    // Set để lọc tránh in trùng lặp
    const printedKeys = new Set();

    // Vòng lặp mỗi giây lấy danh sách gói tin vừa gửi để in ra màn hình
    setInterval(async () => {
        try {
            const res = await session.callRpc('getSentPackets', 15);
            if (res && res.ok && res.packets && res.packets.length > 0) {
                // Loại trừ các packet di chuyển (opcode 9, 248) và ping (opcode 1, 0, v.v...) để đỡ rối mắt
                const filtered = res.packets.filter(p => p.opcode !== 9 && p.opcode !== 248 && p.opcode !== 1 && p.opcode !== 0);
                
                filtered.forEach(p => {
                    const key = `${p.opcode}_${p.hex}`;
                    if (!printedKeys.has(key)) {
                        printedKeys.add(key);
                        console.log(`[PACKET SEND] Mới gửi gói tin -> Opcode: ${p.opcode} (0x${p.opcode.toString(16)}) | Dữ liệu Hex: ${p.hex || 'RỖNG'}`);
                    }
                });
            }
        } catch(e) {}
    }, 1000);
}

run();
