const { FridaSession } = require('../src/frida-session');

async function run() {
    const session = new FridaSession('127.0.0.1:16416');
    console.log("Dang ket noi den 127.0.0.1:16416 de quet chu tren man hinh...");
    
    try {
        await session.connect('vn.perfingame.jx1mobile');
        console.log("Ket noi thanh cong! Dang quet RAM tim dong chu 'Cá nhân giết'...");
    } catch(e) {
        console.error("Loi ket noi Frida:", e.message);
        process.exit(1);
    }

    const source = `
        setTimeout(function() {
            // "Cá " in UTF-16LE: 43 00 e1 00 20 00
            // "nhân " in UTF-16LE: 6e 00 68 00 e2 00 6e 00 20 00
            // "giết" in UTF-16LE: 67 00 69 00 1ebf 00 74 00 -> 67 00 69 00 bf 1e 74 00
            
            // Pattern for "Cá nhân" (UTF-16LE)
            var pattern = "43 00 e1 00 20 00 6e 00 68 00 e2 00 6e 00";
            
            send("Bat dau quet toan bo bo nho rw- tim chuoi 'Cá nhân'...");
            var ranges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
            var count = 0;
            for (var i = 0; i < ranges.length; i++) {
                try {
                    var matches = Memory.scanSync(ranges[i].base, ranges[i].size, pattern);
                    for (var j = 0; j < matches.length; j++) {
                        var addr = matches[j].address;
                        // Read backwards a bit to get string length if it's a C# string
                        var strStart = addr;
                        var len = 50; // Read 50 chars max
                        try {
                            var str = addr.readUtf16String(len);
                            if (str && str.indexOf("Cá nhân") !== -1) {
                                send("TIM THAY TAI: " + addr + " -> Noi dung: " + str);
                                count++;
                            }
                        } catch(e) {}
                    }
                } catch(e) {}
            }
            send("Tim thay tong cong " + count + " chuoi.");
            send("DONE");
        }, 1000);
    `;

    try {
        const script = await session.session.createScript(source);
        script.message.connect((msg) => {
            if (msg.type === 'send') {
                if (msg.payload === "DONE") {
                    console.log("[Ket Thuc] Kiem tra xong.");
                    session.disconnect();
                    process.exit(0);
                } else {
                    console.log(msg.payload);
                }
            }
        });
        await script.load();
    } catch (e) {
        console.error("Loi khi chay Script Frida:", e);
        process.exit(1);
    }
}

run();
