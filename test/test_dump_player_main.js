const { FridaSession } = require('../src/frida-session');
async function run() {
    const session = new FridaSession('127.0.0.1:5555');
    await session.connect('vn.perfingame.jx1mobile');
    const source = `
        function safeReadPointer(ptr) {
            try {
                var val = ptr.readPointer();
                if (val.isNull()) return null;
                if (parseInt(val.toString(), 16) < 0x10000) return null;
                return val;
            } catch(e) { return null; }
        }

        function safeReadU32(ptr) {
            try { return ptr.readU32(); } catch(e) { return 0; }
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
                        send("Found PlayerMain class: " + classPtr);
                        var staticFields = safeReadPointer(classPtr.add(0xB8));
                        if (staticFields) {
                            var inst = safeReadPointer(staticFields);
                            if (inst) {
                                send("Found PlayerMain instance: " + inst);
                                
                                // Scan for dictionaries in PlayerMain
                                for (var offset = 0x20; offset < 0x200; offset += 8) {
                                    var dict = safeReadPointer(inst.add(offset));
                                    if (dict) {
                                        var entries = safeReadPointer(dict.add(0x18));
                                        var count = safeReadU32(dict.add(0x20));
                                        if (entries && count > 0 && count < 5000) {
                                            send("Found dict at PlayerMain+0x" + offset.toString(16) + " with " + count + " items");
                                            // read first item
                                            var val = safeReadPointer(entries.add(0x20).add(0x10));
                                            if (val) {
                                                var namePtr = safeReadPointer(val.add(0x40));
                                                if (namePtr) {
                                                    var strLen = safeReadU32(namePtr.add(0x10));
                                                    if (strLen > 0 && strLen < 100) {
                                                        try {
                                                            var str = namePtr.add(0x14).readUtf16String(strLen);
                                                            send("  -> Found name: " + str);
                                                        } catch(e) {}
                                                    }
                                                }
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
                console.log(msg.payload);
                if (msg.payload === "DONE") {
                    session.disconnect();
                    process.exit(0);
                }
            } else {
                console.log(msg);
            }
        });
        await radarScript.load();
    } catch (e) {
        console.error("Lỗi:", e);
        process.exit(1);
    }
}
run();
