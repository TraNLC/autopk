const { FridaSession } = require('../src/frida-session');
const config = require('../config');

async function main() {
    const session = new FridaSession(null, config.GAME_PACKAGE);
    try {
        await session.connect();
        
        const source = `
            setTimeout(function() {
                try {
                    var is64Bit = Process.pointerSize === 8;
                    
                    var maps = File.readAllText('/proc/self/maps').split('\\n');
                    var metaRange = null;
                    for (var i = 0; i < maps.length; i++) {
                        if (maps[i].indexOf('global-metadata.dat') !== -1) {
                            var parts = maps[i].split(' ')[0].split('-');
                            metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                            break;
                        }
                    }
                    
                    var pattern = '43 68 61 72 4d 61 6e 61 67 65 72'; // "CharManager"
                    var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
                    var nameStrAddr = null;
                    for (var i = 0; i < results.length; i++) {
                        if (results[i].address.readUtf8String() === "CharManager") {
                            nameStrAddr = results[i].address;
                            break;
                        }
                    }
                    
                    var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
                    var hex = nameStrAddr.toString(16);
                    while (hex.length < (is64Bit ? 16 : 8)) hex = '0' + hex;
                    var parts = [];
                    for (var j = (is64Bit ? 14 : 6); j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
                    var ptrPattern = parts.join(' ');

                    var charMgrClass = null;
                    for (var k = 0; k < allRanges.length; k++) {
                        try {
                            var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                            for (var m = 0; m < matches.length; m++) {
                                var cand = matches[m].address.sub(is64Bit ? 0x10 : 0x8);
                                try {
                                    if (cand.add(is64Bit ? 0x10 : 0x8).readPointer().toString() === nameStrAddr.toString()) {
                                        var nsPtr = cand.add(is64Bit ? 0x18 : 0xC).readPointer();
                                        if (nsPtr.readUtf8String() === "game.scene") {
                                            charMgrClass = cand;
                                            break;
                                        }
                                    }
                                } catch (e) {}
                            }
                        } catch (e) {}
                        if (charMgrClass) break;
                    }

                    var staticFields = charMgrClass.add(is64Bit ? 0xB8 : 0x5C).readPointer();
                    var charManagerInstance = staticFields.readPointer();
                    
                    var out = [];
                    
                    // check salesmansDict
                    var salesmansDict = charManagerInstance.add(0x58).readPointer();
                    if (!salesmansDict.isNull()) {
                        var entriesArray = salesmansDict.add(0x18).readPointer();
                        if (!entriesArray.isNull()) {
                            var maxLength = entriesArray.add(0x18).readU32();
                            out.push("salesmansDict len: " + maxLength);
                            for (var idx = 0; idx < maxLength; idx++) {
                                var entryAddr = entriesArray.add(0x20).add(idx * 24);
                                var valuePtr = entryAddr.add(16).readPointer(); // value is a pointer
                                if (!valuePtr.isNull() && parseInt(valuePtr.toString()) > 0x10000) {
                                    var dataPtr = null;
                                    try { dataPtr = valuePtr.add(0x30).readPointer(); } catch(e){}
                                    if (dataPtr && !dataPtr.isNull() && parseInt(dataPtr.toString()) > 0x10000) {
                                        var name = '';
                                        try {
                                            var namePtr = dataPtr.add(0x40).readPointer();
                                            if (!namePtr.isNull() && parseInt(namePtr.toString()) > 0x10000) {
                                                var strLen = namePtr.add(0x10).readU32();
                                                if (strLen > 0 && strLen < 100) {
                                                    name = namePtr.add(0x14).readUtf16String(strLen);
                                                }
                                            }
                                        } catch(e) {}
                                        out.push("  -> salesman: " + name);
                                    }
                                }
                            }
                        }
                    }

                    // Dump ALL dictionaries in charManagerInstance just in case
                    for (var offset = (is64Bit ? 0x10 : 0x8); offset <= 0xA0; offset += Process.pointerSize) {
                        try {
                            var dictPtr = charManagerInstance.add(offset).readPointer();
                            if (!dictPtr.isNull() && parseInt(dictPtr.toString()) > 0x10000) {
                                var arrOff = is64Bit ? 0x18 : 0x10;
                                var entriesArray = dictPtr.add(arrOff).readPointer();
                                if (!entriesArray.isNull() && parseInt(entriesArray.toString()) > 0x10000) {
                                    var maxLength = entriesArray.add(is64Bit ? 0x18 : 0xC).readU32();
                                    if (maxLength > 0 && maxLength < 1000) {
                                        out.push("charManagerInstance +" + offset.toString(16) + " Dict! len=" + maxLength);
                                        if (maxLength > 0) {
                                            var entryAddr = entriesArray.add(is64Bit ? 0x20 : 0x10);
                                            var vPtr = entryAddr.add(is64Bit ? 0x10 : 0xC).readPointer();
                                            // try reading it as Controller
                                            if (!vPtr.isNull() && parseInt(vPtr.toString()) > 0x10000) {
                                                try {
                                                    var dataPtr = vPtr.add(0x30).readPointer();
                                                    var namePtr = dataPtr.add(0x40).readPointer();
                                                    var nLen = namePtr.add(is64Bit ? 0x10 : 0x8).readU32();
                                                    if (nLen > 0 && nLen < 50) {
                                                        var nameStr = namePtr.add(is64Bit ? 0x14 : 0xC).readUtf16String(nLen);
                                                        out.push("    -> entry 0 Controller name: " + nameStr);
                                                    }
                                                }catch(e){}
                                            }
                                        }
                                    }
                                }
                            }
                        } catch(e) {}
                    }

                    send({ type: 'done', data: out });
                } catch (err) {
                    send({ type: 'done', error: err.stack });
                }
            }, 100);
        `;

        const script = await session.session.createScript(source);
        const scanPromise = new Promise(resolve => {
            script.message.connect((msg) => {
                if (msg.type === 'send') {
                    if (msg.payload.type === 'log') console.log(msg.payload.msg);
                    else if (msg.payload.type === 'done') resolve(msg.payload);
                }
            });
        });
        await script.load();
        const res = await scanPromise;
        await script.unload();
        console.log("Result:");
        console.log(res.data.join('\\n'));
        
    } catch(e) {
        console.error(e);
    } finally {
        session.disconnect();
    }
}
main();
