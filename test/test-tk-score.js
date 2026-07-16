const { FridaSession } = require('../src/frida-session');

async function run() {
    const session = new FridaSession('127.0.0.1:16416');
    console.log("Dang ket noi den 127.0.0.1:16416 (MuMu Index x)...");
    
    try {
        await session.connect('vn.perfingame.jx1mobile');
        console.log("Ket noi thanh cong! Dang tim kiem Diem Tong Kim trong RAM...");
    } catch(e) {
        console.error("Loi ket noi Frida:", e.message);
        process.exit(1);
    }

    const source = `
        function safeReadU32(ptr) {
            try { return ptr.readU32(); } catch(e) { return -1; }
        }
        function safeReadS32(ptr) {
            try { return ptr.readS32(); } catch(e) { return -1; }
        }
        function safeReadPointer(ptr) {
            try {
                var val = ptr.readPointer();
                if (val.isNull()) return null;
                if (parseInt(val.toString(), 16) < 0x10000) return null;
                return val;
            } catch(e) { return null; }
        }

        setTimeout(function() {
            var maps = File.readAllText('/proc/self/maps').split('\\n');
            var metaRange = null;
            for (var i = 0; i < maps.length; i++) {
                var line = maps[i];
                if (line.indexOf('global-metadata.dat') !== -1) {
                    var parts = line.split(' ')[0].split('-');
                    metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                    break;
                }
            }

            if (metaRange) {
                var pattern = '50 6c 61 79 65 72 4d 61 69 6e'; // "PlayerMain"
                var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
                var nameStrAddr = null;
                for (var i = 0; i < results.length; i++) {
                    if (results[i].address.readUtf8String() === "PlayerMain") {
                        nameStrAddr = results[i].address;
                        break;
                    }
                }
                
                if (nameStrAddr) {
                    var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
                    var hex = nameStrAddr.toString(16);
                    while (hex.length < 16) hex = '0' + hex;
                    var parts = [];
                    for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
                    var ptrPattern = parts.join(' ');

                    var classPtr = null;
                    for (var k = 0; k < allRanges.length; k++) {
                        try {
                            var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                            for (var m = 0; m < matches.length; m++) {
                                var cand = matches[m].address.sub(0x10);
                                var nsPtr = safeReadPointer(cand.add(0x18));
                                var nsName = nsPtr ? nsPtr.readUtf8String() : '';
                                var checkNamePtr = safeReadPointer(cand.add(0x10));
                                if (checkNamePtr && checkNamePtr.toString() === nameStrAddr.toString() && nsName === '') {
                                    classPtr = cand;
                                    break;
                                }
                            }
                        } catch(e) {}
                        if (classPtr) break;
                    }

                    if (classPtr) {
                        var staticFields = safeReadPointer(classPtr.add(0xB8));
                        if (staticFields) {
                            var inst = safeReadPointer(staticFields);
                            if (inst) {
                                send("DA TIM THAY PLAYER_MAIN TREN RAM: " + inst);
                                
                                // Deep scan for 39400, 75, or 8
                                send("--- BAT DAU QUET SAU TIM 39400 ---");
                                var targetScore = 39400;
                                var targetKills = 75;
                                var targetRank = 8;
                                
                                // First check PlayerMain up to 0x1000
                                for (var offset = 0; offset < 0x1000; offset += 4) {
                                    var val = safeReadS32(inst.add(offset));
                                    if (val === targetScore) send("!!! TIM THAY 39400 tai PlayerMain + 0x" + offset.toString(16));
                                    if (val === targetKills) send("Found 75 (Kills?) tai PlayerMain + 0x" + offset.toString(16));
                                }

                                // Check pointers inside PlayerMain
                                for (var offset = 0; offset < 0x500; offset += 4) {
                                    var ptrVal = safeReadPointer(inst.add(offset));
                                    if (ptrVal) {
                                        for (var inner = 0; inner < 0x500; inner += 4) {
                                            var innerVal = safeReadS32(ptrVal.add(inner));
                                            if (innerVal === targetScore) {
                                                send("!!! TIM THAY 39400 tai [PlayerMain + 0x" + offset.toString(16) + "] + 0x" + inner.toString(16));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            send("DONE");
        }, 1000);
    `;

    try {
        const radarScript = await session.session.createScript(source);
        radarScript.message.connect((msg) => {
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
        await radarScript.load();
    } catch (e) {
        console.error("Loi khi chay Script Frida:", e);
        process.exit(1);
    }
}

run();
