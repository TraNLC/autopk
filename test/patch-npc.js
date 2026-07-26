const fs = require('fs');

function patchFile(filepath) {
    let code = fs.readFileSync(filepath, 'utf8');
    
    // Replace classNames array
    const classRegex = /var classNames = \[\s*'game\.resource\.settings\.npcres\.Datafield',\s*'NpcRes\.Normal',\s*'Normal',\s*'NpcController',\s*\];/g;
    code = code.replace(classRegex, "var classNames = [ 'NpcController', 'game.logic.npc.NpcController' ];");

    if (code.indexOf("'NpcController'") === -1) {
        code = code.replace(/var classNames = \[[\s\S]*?\];/, "var classNames = [ 'NpcController', 'game.logic.npc.NpcController' ];");
    }

    // Replace the onMatch callback in Memory.scan using regex
    const onMatchRegex = /onMatch:\s*function\(\s*address,\s*size\s*\)\s*\{[\s\S]*?\},(\s*)onError:/;
    
    const replacementStr = `onMatch: function(address, size) {
                        try {
                            var obj = address;
                            var pos = obj.add(0x10).readPointer();
                            if (pos && !pos.isNull() && parseInt(pos.toString()) > 0x10000) {
                                var idn = pos.add(0x80).readPointer();
                                if (idn && !idn.isNull() && parseInt(idn.toString()) > 0x10000) {
                                    var namePtr = idn.add(0x48).readPointer();
                                    if (namePtr && !namePtr.isNull() && parseInt(namePtr.toString()) > 0x10000) {
                                        var len = namePtr.add(0x10).readU32();
                                        if (len > 0 && len < 100) {
                                            var name = namePtr.add(0x14).readUtf16String(len);
                                            if (name) {
                                                var npcId = obj.toString();
                                                if (!npcMap[npcId]) {
                                                    npcMap[npcId] = name;
                                                    
                                                    var rx = pos.add(0x30).readFloat();
                                                    var ry = pos.add(0x34).readFloat();
                                                    
                                                    if (rx > 40000 && rx < 500000 && ry > 40000 && ry < 500000) {
                                                        if (!npcCoords) npcCoords = {};
                                                        npcCoords[npcId] = { x: Math.round(rx), y: Math.round(ry) };
                                                        found++;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } catch(e) {}
                    },$1onError:`;

    code = code.replace(onMatchRegex, replacementStr);
    
    fs.writeFileSync(filepath, code);
}

patchFile('frida-scripts/bot.bundle.js');
patchFile('frida-scripts/rpc/NPCScanner.js');
console.log('Patched correctly with Regex!');
