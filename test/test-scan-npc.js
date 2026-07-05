const { FridaSession } = require('../src/frida-session');
const config = require('../config');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
    console.log('==================================================');
    console.log('  TEST TỰ ĐỘNG QUÉT & GỌI NPC (KHÔNG CẦN NHẬP TÊN)');
    console.log('==================================================\n');

    const session = new FridaSession(null, config.GAME_PACKAGE);
    
    try {
        console.log('[*] Đang kết nối Frida và giả lập...');
        await session.connect();
        await session.loadScript(require('path').join(config.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Kết nối thành công!\n');

        console.log('⏳ Đang tự động quét tất cả NPC xung quanh (Native Mode)...');
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
                    if (!metaRange) return send({ type: 'done', error: 'Không tìm thấy global-metadata.dat' });

                    var pattern = '43 68 61 72 4d 61 6e 61 67 65 72'; // "CharManager"
                    var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
                    var nameStrAddr = null;
                    for (var i = 0; i < results.length; i++) {
                        if (results[i].address.readUtf8String() === "CharManager") {
                            nameStrAddr = results[i].address;
                            break;
                        }
                    }
                    if (!nameStrAddr) return send({ type: 'done', error: 'Không tìm thấy chuỗi CharManager' });

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
                    if (!charMgrClass) return send({ type: 'done', error: 'Không tìm thấy CharManager class (game.scene)' });

                    var staticFields = charMgrClass.add(is64Bit ? 0xB8 : 0x5C).readPointer();
                    if (staticFields.isNull()) return send({ type: 'done', error: 'staticFields is null' });

                    var charManagerInstance = staticFields.readPointer();
                    if (charManagerInstance.isNull()) return send({ type: 'done', error: 'CharManager.instance is null' });

                    var worldPtr = charManagerInstance.add(is64Bit ? 0x20 : 0x10).readPointer();
                    if (worldPtr.isNull() || parseInt(worldPtr.toString()) < 0x10000) return send({ type: 'done', error: 'world is null (' + worldPtr + ')' });

                    var playerMainPtr = worldPtr.add(is64Bit ? 0x40 : 0x20).readPointer();
                    if (playerMainPtr.isNull() || parseInt(playerMainPtr.toString()) < 0x10000) return send({ type: 'done', error: 'playerMain is null' });

                    var foundNpcs = [];
                    // Scan playerMainPtr for nearNpcs
                    for (var offset = (is64Bit ? 0x10 : 0x8); offset <= 0x200; offset += Process.pointerSize) {
                        try {
                            var dictPtr = playerMainPtr.add(offset).readPointer();
                            if (!dictPtr.isNull() && parseInt(dictPtr.toString()) > 0x10000) {
                                for (var arrOff of [0x10, 0x14, 0x18]) {
                                    try {
                                        var entriesArray = dictPtr.add(arrOff).readPointer();
                                        if (!entriesArray.isNull() && parseInt(entriesArray.toString()) > 0x10000) {
                                            var maxLength = entriesArray.add(is64Bit ? 0x18 : 0xC).readU32();
                                            if (maxLength > 0 && maxLength < 1000) {
                                                for (var idx = 0; idx < maxLength; idx++) {
                                                    var entryAddr = entriesArray.add((is64Bit ? 0x20 : 0x10) + idx * (is64Bit ? 24 : 16));
                                                    var keyPtr = entryAddr.add(is64Bit ? 0x8 : 0x8).readPointer();
                                                    var valuePtr = entryAddr.add(is64Bit ? 0x10 : 0xC).readPointer();
                                                    
                                                    if (!keyPtr.isNull() && parseInt(keyPtr.toString()) > 0x10000) {
                                                        var keyLen = keyPtr.add(is64Bit ? 0x10 : 0x8).readU32();
                                                        if (keyLen > 0 && keyLen < 50) {
                                                            var keyStr = keyPtr.add(is64Bit ? 0x14 : 0xC).readUtf16String(keyLen);
                                                            if (keyStr) {
                                                                var nameStr = "";
                                                                var cidStr = "";
                                                                try {
                                                                    var dataPtr = valuePtr.add(0x30).readPointer();
                                                                    if (!dataPtr.isNull() && parseInt(dataPtr.toString()) > 0x1000) {
                                                                        var namePtr = dataPtr.add(0x40).readPointer();
                                                                        var cidPtr = dataPtr.add(0x10).readPointer();
                                                                        if (!namePtr.isNull() && parseInt(namePtr.toString()) > 0x1000) {
                                                                            var nLen = namePtr.add(is64Bit ? 0x10 : 0x8).readU32();
                                                                            if (nLen > 0 && nLen < 50) nameStr = namePtr.add(is64Bit ? 0x14 : 0xC).readUtf16String(nLen);
                                                                        }
                                                                        if (!cidPtr.isNull() && parseInt(cidPtr.toString()) > 0x1000) {
                                                                            var cLen = cidPtr.add(is64Bit ? 0x10 : 0x8).readU32();
                                                                            if (cLen > 0 && cLen < 50) cidStr = cidPtr.add(is64Bit ? 0x14 : 0xC).readUtf16String(cLen);
                                                                        }
                                                                    }
                                                                }catch(e){}
                                                                
                                                                if (nameStr) {
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
                                    } catch(e) {}
                                }
                            }
                        } catch(e) {}
                    }
                    
                    send({ type: 'done', npcs: foundNpcs });
                } catch (err) {
                    send({ type: 'done', error: err.message });
                }
            }, 100);
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
        const scanResult = await scanPromise;
        await script.unload();

        if (scanResult.error) {
            console.log('❌ Quét thất bại. Lỗi:', scanResult.error);
            process.exit(1);
        }

        const npcs = scanResult.npcs || [];
        if (npcs.length === 0) {
            console.log('❌ Không tìm thấy NPC nào xung quanh. Hãy di chuyển nhân vật đến gần NPC và chạy lại lệnh.');
            process.exit(0);
        }

        console.log(`\n✅ Quét xong! Tìm thấy ${npcs.length} NPC xung quanh:`);
        let trinhSatNpc = null;
        
        npcs.forEach((npc, index) => {
            let cidText = npc.cid ? `Mã gốc: \x1b[33m${npc.cid}\x1b[0m` : `Mã gốc: Không rõ`;
            console.log(`  [${index + 1}] \x1b[36m${npc.name}\x1b[0m — ID động: ${npc.id} | ${cidText}`);
            
            if (npc.name.toLowerCase().includes('trinh sát') || npc.name.toLowerCase().includes('trinh sat')) {
                trinhSatNpc = npc;
            }
        });

        if (trinhSatNpc) {
            console.log(`\n🎯 Đã tự động tìm thấy NPC "${trinhSatNpc.name}" (ID: ${trinhSatNpc.id}).`);
            console.log(`⏳ Đang gửi lệnh gọi NPC...`);
            await session.callRpc('remoteNpcDialogue', trinhSatNpc.id);
            console.log(`✅ Đã gửi lệnh gọi! Anh hãy nhìn vào màn hình giả lập xem bảng chat có xuất hiện không nhé.\n`);
        } else {
            console.log(`\n❌ Không tìm thấy NPC Trinh Sát nào trong danh sách trên! Hãy đứng gần Trinh Sát rồi chạy lại.\n`);
        }

    } catch(e) {
        console.error(`❌ Lỗi: ${e.message}`);
    } finally {
        rl.close();
        try { await session.disconnect(); } catch(e) {}
        process.exit(0);
    }
}

main();
