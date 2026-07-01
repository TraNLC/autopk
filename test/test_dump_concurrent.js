const { FridaSession } = require('../src/frida-session');
async function run() {
    const session = new FridaSession(null, 'vn.perfingame.jx1mobile');
    await session.connect();
    const source = \
    function safeReadPointer(ptr) {
        try { return ptr.readPointer(); } catch (e) { return null; }
    }
    setTimeout(function () {
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var pattern = '50 00 6c 00 61 00 79 00 65 00 72 00 4d 00 61 00 69 00 6e 00 00 00';
        var classPtr = null;
        for (var i = 0; i < allRanges.length && !classPtr; i++) {
            try {
                var matches = Memory.scanSync(allRanges[i].base, allRanges[i].size, pattern);
                for (var m = 0; m < matches.length && !classPtr; m++) {
                    var strAddr = matches[m].address;
                    var strObj = strAddr.sub(0x14);
                    var hex = strObj.toString(16);
                    while (hex.length < 16) hex = '0' + hex;
                    var parts = [];
                    for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
                    var ptrPattern = parts.join(' ');
                    for (var k = 0; k < allRanges.length && !classPtr; k++) {
                        var ptrMatches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                        for (var pm = 0; pm < ptrMatches.length; pm++) {
                            var cand = ptrMatches[pm].address.sub(0x10);
                            var nsPtr = safeReadPointer(cand.add(0x18));
                            var nsName = nsPtr ? nsPtr.readUtf8String() : '';
                            var checkNamePtr = safeReadPointer(cand.add(0x10));
                            if (checkNamePtr && checkNamePtr.toString() === nameStrAddr.toString() && nsName === '') {
                                classPtr = cand;
                                break;
                            }
                        }
                    }
                }
            } catch (e) { }
        }
        if (classPtr) {
            send("PlayerMain Class: " + classPtr);
            var staticFields = safeReadPointer(classPtr.add(0xB8));
            var inst = staticFields ? safeReadPointer(staticFields) : null;
            if (inst) {
                send("PlayerMain Inst: " + inst);
                for (var offset = 0x20; offset < 0x100; offset += 8) {
                    try {
                        var dict = safeReadPointer(inst.add(offset));
                        if (dict && parseInt(dict.toString()) > 0x10000) {
                            // ConcurrentDictionary has m_tables at 0x10
                            var tables = safeReadPointer(dict.add(0x10));
                            if (tables && parseInt(tables.toString()) > 0x10000) {
                                var nodesArray = safeReadPointer(tables.add(0x28));
                                if (nodesArray && parseInt(nodesArray.toString()) > 0x10000) {
                                    var nodesCount = nodesArray.add(0x18).readU32();
                                    if (nodesCount > 0 && nodesCount < 5000) {
                                        send("Found ConcurrentDictionary at offset 0x" + offset.toString(16) + " with nodes count " + nodesCount);
                                        // Let's dump first few nodes
                                        for (var ni = 0; ni < Math.min(nodesCount, 50); ni++) {
                                            // Array elements start at 0x20. Node struct size?
                                            // Node is a class? If it's a class, the array holds pointers.
                                            var nodePtr = safeReadPointer(nodesArray.add(0x20 + ni * 8));
                                            if (nodePtr && parseInt(nodePtr.toString()) > 0x10000) {
                                                // Node fields: TKey key (0x10), TValue value (0x18), Node next (0x20), int hashcode (0x28)
                                                var key = nodePtr.add(0x10).readU32();
                                                var valuePtr = safeReadPointer(nodePtr.add(0x18));
                                                if (key > 0 && valuePtr) {
                                                    send("  Node " + ni + ": Key=" + key + ", Value=" + valuePtr);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) { }
                }
            }
        }
        send("DONE");
    }, 500);
    \;
    const radarScript = await session.session.createScript(source.replace(/nameStrAddr/g, 'strAddr'));
    radarScript.message.connect((msg) => {
        if (msg.type === 'send') {
            console.log(msg.payload);
            if (msg.payload === 'DONE') {
                session.disconnect();
                process.exit(0);
            }
        }
    });
    await radarScript.load();
}
run();
