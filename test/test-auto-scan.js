const { FridaSession } = require('../src/frida-session');
const config = require('../config');

async function main() {
    const session = new FridaSession(null, config.GAME_PACKAGE);
    try {
        console.log('[*] Đang kết nối giả lập...');
        await session.connect();
        
        console.log('[*] Đang load logic quét native...');
        const source = `
            setTimeout(function() {
                var maps = File.readAllText('/proc/self/maps').split('\\n');
                var metaRange = null;
                for (var i = 0; i < maps.length; i++) {
                    if (maps[i].indexOf('global-metadata.dat') !== -1) {
                        var parts = maps[i].split(' ')[0].split('-');
                        metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                        break;
                    }
                }
                if (!metaRange) return send({ error: "no global-metadata.dat" });

                var pattern = '4e 65 74 43 6f 72 65 4d 61 6e 61 67 65 72'; // "NetCoreManager"
                var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
                var nameStrAddr = null;
                for (var i=0; i<results.length; i++) {
                    if (results[i].address.readUtf8String() === "NetCoreManager") {
                        nameStrAddr = results[i].address; break;
                    }
                }
                
                var charMgrClass = null;
                pattern = '43 68 61 72 4d 61 6e 61 67 65 72'; // "CharManager"
                results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
                for (var i=0; i<results.length; i++) {
                    if (results[i].address.readUtf8String() === "CharManager") {
                        nameStrAddr = results[i].address; break;
                    }
                }
                
                if (!nameStrAddr) return send({ error: "no CharManager str" });
                
                var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
                var hex = nameStrAddr.toString(16);
                while(hex.length < 8) hex = '0' + hex;
                var parts = [];
                for (var j = 6; j >= 0; j -= 2) parts.push(hex.substring(j, j+2));
                var ptrPattern = parts.join(' ');
                
                for (var k = 0; k < allRanges.length; k++) {
                    try {
                        var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                        for (var m = 0; m < matches.length; m++) {
                            var cand = matches[m].address.sub(0x8); // 32-bit object header?
                            try {
                                var check = cand.add(0x8).readPointer();
                                if (check.toString() === nameStrAddr.toString()) {
                                    charMgrClass = cand; break;
                                }
                            } catch(e){}
                        }
                    } catch(e){}
                    if (charMgrClass) break;
                }
                
                if (!charMgrClass) return send({ error: "no charMgrClass" });
                
                var staticFields = charMgrClass.add(0x5c).readPointer(); 
                var charManagerInstance = staticFields.readPointer();
                if (charManagerInstance.isNull()) return send({ error: "no charManagerInstance" });
                
                var worldPtr = charManagerInstance.add(0x20).readPointer();
                if (worldPtr.isNull()) return send({ error: "no world" });
                
                var playerMainPtr = worldPtr.add(0x40).readPointer();
                if (playerMainPtr.isNull()) return send({ error: "no playerMain" });
                
                var npcontroller = playerMainPtr.add(0x20).readPointer();
                if (npcontroller.isNull()) return send({ error: "no npcontroller" });
                
                var foundNpcs = [];
                // scan fields of npcontroller for dictionaries
                for (var offset = 0x20; offset <= 0xa0; offset += 4) {
                    try {
                        var dictPtr = npcontroller.add(offset).readPointer();
                        if (!dictPtr.isNull() && parseInt(dictPtr.toString()) > 0x10000) {
                            // C# Dictionary typically has entries array at +0x10 or +0x14
                            for (var arrOff of [0x10, 0x14, 0x18]) {
                                try {
                                    var entriesArray = dictPtr.add(arrOff).readPointer();
                                    if (!entriesArray.isNull() && parseInt(entriesArray.toString()) > 0x10000) {
                                        var maxLength = entriesArray.add(0xC).readU32();
                                        // A reasonable size for a dictionary of nearby NPCs is < 1000
                                        if (maxLength > 0 && maxLength < 1000) {
                                            for (var idx = 0; idx < maxLength; idx++) {
                                                var entryAddr = entriesArray.add(0x10 + idx * 16);
                                                var keyPtr = entryAddr.add(0x8).readPointer();
                                                var valuePtr = entryAddr.add(0xC).readPointer();
                                                
                                                if (!keyPtr.isNull() && !valuePtr.isNull() && parseInt(keyPtr.toString()) > 0x10000 && parseInt(valuePtr.toString()) > 0x10000) {
                                                    // Check if key is a string
                                                    var keyLen = keyPtr.add(0x10).readU32();
                                                    if (keyLen > 0 && keyLen < 50) {
                                                        var keyStr = keyPtr.add(0x14).readUtf16String(keyLen);
                                                        
                                                        // Check if value is a pointer to NpcRes.Special or Controller
                                                        var dataPtr = null;
                                                        try { dataPtr = valuePtr.add(0x30).readPointer(); } catch(e){}
                                                        if (dataPtr && !dataPtr.isNull() && parseInt(dataPtr.toString()) > 0x10000) {
                                                            var namePtr = dataPtr.add(0x40).readPointer();
                                                            var cidPtr = dataPtr.add(0x10).readPointer();
                                                            var nameStr = "";
                                                            var cidStr = "";
                                                            
                                                            if (!namePtr.isNull() && parseInt(namePtr.toString()) > 0x10000) {
                                                                var nLen = namePtr.add(0x10).readU32();
                                                                if (nLen > 0 && nLen < 50) nameStr = namePtr.add(0x14).readUtf16String(nLen);
                                                            }
                                                            if (!cidPtr.isNull() && parseInt(cidPtr.toString()) > 0x10000) {
                                                                var cLen = cidPtr.add(0x10).readU32();
                                                                if (cLen > 0 && cLen < 50) cidStr = cidPtr.add(0x14).readUtf16String(cLen);
                                                            }
                                                            
                                                            if (nameStr) {
                                                                // check if already added
                                                                var isDup = false;
                                                                for(var fi=0; fi<foundNpcs.length; fi++){
                                                                    if(foundNpcs[fi].id === keyStr) isDup = true;
                                                                }
                                                                if(!isDup) {
                                                                    foundNpcs.push({ id: keyStr, name: nameStr, cid: cidStr });
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } catch(e){}
                            }
                        }
                    } catch(e) {}
                }
                
                send({ type: "done", npcs: foundNpcs });
            }, 100);
        `;
        
        const script = await session.session.createScript(source);
        const scanPromise = new Promise(resolve => {
            script.message.connect((msg) => {
                if (msg.type === 'send' && msg.payload.type === 'done') {
                    resolve(msg.payload.npcs);
                } else {
                    console.log("Log:", msg.payload);
                }
            });
        });
        await script.load();
        const npcs = await scanPromise;
        await script.unload();
        
        console.log("\n===============================================");
        console.log("    🎯 DANH SÁCH NPC XUNG QUANH TỰ ĐỘNG");
        console.log("===============================================\n");
        if (npcs && npcs.length > 0) {
            npcs.forEach((npc, idx) => {
                let cidText = npc.cid ? `(Mã gốc: ${npc.cid})` : '';
                console.log(`  [${idx + 1}] \x1b[36m${npc.name}\x1b[0m — ID: \x1b[32m${npc.id}\x1b[0m ${cidText}`);
            });
            console.log(`\n✅ Tổng cộng ${npcs.length} NPC xung quanh.`);
        } else {
            console.log("❌ Không tìm thấy NPC nào xung quanh.");
        }
        
    } catch(e) {
        console.error("❌ Lỗi:", e.message);
    } finally {
        session.disconnect();
    }
}
main();
