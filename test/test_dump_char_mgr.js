const { FridaSession } = require('../src/frida-session');
async function run() {
    const session = new FridaSession('127.0.0.1:5555');
    await session.connect('vn.perfingame.jx1mobile');
    const source = `
        function safeReadPointer(ptr) {
            try { return (!ptr || ptr.isNull()) ? null : ptr.readPointer(); } catch(e) { return null; }
        }
        function safeReadU32(ptr) {
            try { return (!ptr || ptr.isNull()) ? 0 : ptr.readU32(); } catch(e) { return 0; }
        }

        setTimeout(() => {
            var maps = File.readAllText('/proc/self/maps').split('\\n');
            var metaRange = null;
            for (var i = 0; i < maps.length; i++) {
                if (maps[i].indexOf('global-metadata.dat') !== -1) {
                    var parts = maps[i].split(' ')[0].split('-');
                    metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                    break;
                }
            }
            if (metaRange) {
            var pattern = '50 6c 61 79 65 72 4d 61 69 6e'; // "PlayerMain"
            var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
            var nameStrAddr = null;
            for (var rIdx = 0; rIdx < results.length; rIdx++) {
                if (results[rIdx].address.readUtf8String() === "PlayerMain") {
                    nameStrAddr = results[rIdx].address;
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
        Il2Cpp.perform(() => {
          const klass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerDie");
          if (!klass) {
            send({type: "log", data: "PlayerDie not found"});
            return;
          }
          const methods = klass.methods.map(m => m.name);
          send({type: "log", data: "Methods: " + methods.join(', ')});
        });
      } catch (e) {
        send({type: "log", data: "Error: " + e.message});
      }                          var nsName = nsPtr.isNull() ? '' : nsPtr.readUtf8String();
                                var checkNamePtr = cand.add(0x10).readPointer();
                                if (checkNamePtr.toString() === nameStrAddr.toString() && nsName === '') {
                                    classPtr = cand;
                                    break;
                                }
                        }
                    } catch(e) {}
                    if (classPtr) break;
                }

                    if (_charManagerClass) {
                        send("Found CharManager: " + _charManagerClass);
                        var staticFields = safeReadPointer(_charManagerClass.add(0xB8));
                        if (staticFields) {
                            var inst = safeReadPointer(staticFields);
                            if (inst) {
                                send("Found CharManager instance: " + inst);
                                for (var offset = 0x20; offset < 0xa0; offset += 8) {
                                    var dict = safeReadPointer(inst.add(offset));
                                    if (!dict) continue;
                                    var entries = safeReadPointer(dict.add(0x18));
                                    var count = safeReadU32(dict.add(0x20));
                                    if (entries && count > 0 && count < 5000) {
                                        var max = safeReadU32(entries.add(0x18));
                                        if (max >= count && max < 5000) {
                                            send("Found dict at CharManager+0x" + offset.toString(16) + " with " + count + " items");
                                            var numPrinted = 0;
                                            for(var i=0; i<max && numPrinted<10; i++) {
                                                var entryBase = entries.add(0x20).add(i * 0x18);
                                                var key = safeReadU32(entryBase.add(8)); // uint key
                                                var val = safeReadPointer(entryBase.add(0x10)); // valuePtr
                                                if (val) {
                                                    var dataPtr = safeReadPointer(val.add(0x30));
                                                    if (dataPtr) {
                                                        var namePtr = safeReadPointer(dataPtr.add(0x40));
                                                        if (namePtr) {
                                                            var len = safeReadU32(namePtr.add(0x10));
                                                            if (len > 0 && len < 100) {
                                                                try {
                                                                    var name = namePtr.add(0x14).readUtf16String(len);
                                                                    send("  -> Key(RuntimeID): " + key + " | Name: " + name);
                                                                    numPrinted++;
                                                                } catch(e){}
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
                }
            }
            send("DONE");
        }, 1000);
    `;
    const script = await session.session.createScript(source);
    script.message.connect((msg) => { console.log(msg.payload); });
    await script.load();
    await new Promise(r => setTimeout(r, 3000));
    process.exit(0);
}
run();
