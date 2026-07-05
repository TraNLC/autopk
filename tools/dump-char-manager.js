const { FridaSession } = require('../src/frida-session');
const config = require('../config');

async function main() {
    const session = new FridaSession(null, config.GAME_PACKAGE);
    try {
        await session.connect();
        await session.loadScript(require('path').join(config.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        
        const source = `
            setTimeout(function() {
                try {
                    var out = [];
                    // Using findElfExport from bot.bundle.js globally
                    if (typeof il2cppBase !== 'undefined' && il2cppBase) {
                        var domain = callNativeIl2Cpp('il2cpp_domain_get', 'pointer', [], []);
                        var assembly = callNativeIl2Cpp('il2cpp_domain_assembly_open', 'pointer', ['pointer', 'pointer'], [domain, Memory.allocUtf8String("Assembly-CSharp")]);
                        var image = callNativeIl2Cpp('il2cpp_assembly_get_image', 'pointer', ['pointer'], [assembly]);
                        var klass = callNativeIl2Cpp('il2cpp_class_from_name', 'pointer', ['pointer', 'pointer', 'pointer'], [image, Memory.allocUtf8String(""), Memory.allocUtf8String("PlayerMain")]);
                        
                        var fieldNearNpcs = callNativeIl2Cpp('il2cpp_class_get_field_from_name', 'pointer', ['pointer', 'pointer'], [klass, Memory.allocUtf8String("nearNpcs")]);
                        var offsetNearNpcs = callNativeIl2Cpp('il2cpp_field_get_offset', 'int', ['pointer'], [fieldNearNpcs]);
                        out.push("PlayerMain.nearNpcs offset = 0x" + offsetNearNpcs.toString(16));
                        
                        var pmRes = readPlayerMainDirect();
                        if (pmRes.ok && _playerMainInstance) {
                            var dictPtr = _playerMainInstance.add(offsetNearNpcs).readPointer();
                            out.push("nearNpcs dict: " + dictPtr);
                            if (!dictPtr.isNull() && parseInt(dictPtr.toString()) > 0x10000) {
                                var entriesArray = dictPtr.add(0x18).readPointer();
                                out.push("entriesArray: " + entriesArray);
                                if (!entriesArray.isNull() && parseInt(entriesArray.toString()) > 0x10000) {
                                    var maxLength = entriesArray.add(0x18).readU32();
                                    out.push("maxLength: " + maxLength);
                                    for (var idx = 0; idx < maxLength && idx < 50; idx++) {
                                        var entryAddr = entriesArray.add(0x20 + idx * 24);
                                        var keyPtr = entryAddr.add(0x8).readPointer();
                                        if (!keyPtr.isNull() && parseInt(keyPtr.toString()) > 0x10000) {
                                            try {
                                                var keyLen = keyPtr.add(0x10).readU32();
                                                if (keyLen > 0 && keyLen < 50) {
                                                    var keyStr = keyPtr.add(0x14).readUtf16String(keyLen);
                                                    out.push("Found nearNpc key: " + keyStr);
                                                    
                                                    // read value
                                                    var valPtr = entryAddr.add(0x10).readPointer();
                                                    var dataPtr = null;
                                                    try { dataPtr = valPtr.add(0x30).readPointer(); } catch(e){}
                                                    if (dataPtr && !dataPtr.isNull()) {
                                                        var namePtr = dataPtr.add(0x40).readPointer();
                                                        var nLen = namePtr.add(0x10).readU32();
                                                        out.push("  - Name: " + namePtr.add(0x14).readUtf16String(nLen));
                                                    }
                                                }
                                            } catch(e) {}
                                        }
                                    }
                                }
                            }
                        } else {
                            out.push("No _playerMainInstance");
                        }
                    } else {
                        out.push("No il2cppBase");
                    }
                    send({ type: 'done', data: out });
                } catch (err) {
                    send({ type: 'done', error: err.message });
                }
            }, 500);
        `;

        const script = await session.session.createScript(source);
        const scanPromise = new Promise(resolve => {
            script.message.connect((msg) => {
                if (msg.type === 'send' && msg.payload.type === 'done') {
                    resolve(msg.payload);
                }
            });
        });
        await script.load();
        const res = await scanPromise;
        await script.unload();
        console.log("Result:", res.data || res.error);
        
    } catch(e) {
        console.error(e);
    } finally {
        session.disconnect();
    }
}
main();
