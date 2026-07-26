const { FridaSession } = require('./src/frida-session');
const { scanDevices } = require('./src/gui/adb-helper');
const path = require('path');
const util = require('util');
const fs = require('fs');
const execAsync = util.promisify(require('child_process').exec);

async function main() {
  const adbPath = path.join(process.cwd(), 'tools', 'adb.exe');
  const res = await scanDevices(adbPath, execAsync, console.log);
  if (!res.ok || res.devices.length === 0) return;
  
  const device = res.devices[0];
  const session = new FridaSession(device.id, 'vn.perfingame.jx1mobile');
  await session.connect();

  const code = `
    // Dummy il2cpp metadata scanner functions from NPCScanner.js
    var il2cppBase = Module.findBaseAddress("libil2cpp.so");
    var globalMetadata = null;
    if (il2cppBase) {
        var ranges = Process.enumerateModules();
        for (var i = 0; i < ranges.length; i++) {
            if (ranges[i].name === "global-metadata.dat") {
                globalMetadata = ranges[i];
                break;
            }
        }
    }
    
    function readIl2CppString(ptr) {
        if (!ptr || ptr.isNull()) return "";
        try {
            var len = ptr.add(0x10).readU32();
            if (len > 0 && len < 200) {
                return ptr.add(0x14).readUtf16String(len);
            }
        } catch(e) {}
        return "";
    }

    function __findClassFromMetadata(className) {
        if (!il2cppBase) return null;
        var ns = "";
        var name = className;
        var dotIdx = className.lastIndexOf('.');
        if (dotIdx !== -1) {
            ns = className.substring(0, dotIdx);
            name = className.substring(dotIdx + 1);
        }

        var pattern = "";
        for (var i = 0; i < name.length; i++) {
            pattern += name.charCodeAt(i).toString(16).padStart(2, '0') + " ";
        }
        pattern = pattern.trim();

        var ranges = Process.enumerateRanges('r--');
        var allRanges = [];
        if (globalMetadata) {
            allRanges.push({ base: globalMetadata.base, size: globalMetadata.size });
        } else {
            for (var i = 0; i < ranges.length; i++) {
                if (ranges[i].size > 0x100000 && ranges[i].file && ranges[i].file.path.indexOf('global-metadata') !== -1) {
                    allRanges.push({ base: ranges[i].base, size: ranges[i].size });
                }
            }
        }

        if (allRanges.length === 0) return null;

        for (var i = 0; i < allRanges.length; i++) {
            var range = allRanges[i];
            var matches = Memory.scanSync(range.base, range.size, pattern);
            for (var m = 0; m < matches.length; m++) {
                var nameAddr = matches[m].address;
                var ptrPattern = "";
                var pBytes = ptr(nameAddr).toBytes();
                for (var b = 0; b < Process.pointerSize; b++) {
                    ptrPattern += pBytes[b].toString(16).padStart(2, '0') + " ";
                }
                ptrPattern = ptrPattern.trim();
                
                var dataRanges = Process.enumerateRanges('rw-');
                for (var r = 0; r < dataRanges.length; r++) {
                    var drange = dataRanges[r];
                    if (drange.size < 0x1000) continue;
                    var ptrMatches = Memory.scanSync(drange.base, drange.size, ptrPattern);
                    for (var pm = 0; pm < ptrMatches.length; pm++) {
                        var cand = ptrMatches[pm].address.sub(0x10);
                        return cand; // Just return first match
                    }
                }
            }
        }
        return null;
    }

    rpc.exports.testNpcClass = function() {
        var k = __findClassFromMetadata('NpcController');
        if (k) return 'Found NpcController at: ' + k;
        
        var k2 = __findClassFromMetadata('game.logic.npc.NpcController');
        if (k2) return 'Found game.logic.npc.NpcController at: ' + k2;
        
        return 'Not found';
    };
  `;
  fs.writeFileSync('test-npc-script.js', code);
  await session.loadScript(path.join(process.cwd(), 'test-npc-script.js'));
  const result = await session.callRpc('testNpcClass');
  console.log('Result:', result);
  process.exit(0);
}
main();
