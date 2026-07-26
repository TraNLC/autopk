const { FridaSession } = require('./src/frida-session');
const { scanDevices } = require('./src/gui/adb-helper');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);
const fs = require('fs');

async function main() {
  const adbPath = path.join(process.cwd(), 'tools', 'adb.exe');
  const res = await scanDevices(adbPath, execAsync, console.log);
  if (!res.ok || res.devices.length === 0) { return; }

  const device = res.devices[0];
  const session = new FridaSession(device.id, 'vn.perfingame.jx1mobile');
  await session.connect();

  const scriptCode = `
      function readIl2CppString(strPtr) {
          if (!strPtr || strPtr.isNull() || parseInt(strPtr.toString()) < 0x10000) return null;
          try {
              var len = strPtr.add(0x10).readInt();
              if (len > 0 && len < 100) return strPtr.add(0x14).readUtf16String(len);
          } catch(e) {}
          return null;
      }

      rpc.exports.dumpSceneNpcs = function() {
          var dump = "=== Scene NPCs ===\\n";
          var base = Module.findBaseAddress("libil2cpp.so");
          
          // Need to call UnityEngine.Object.FindObjectsOfType
          // But maybe simpler: we know PlayerMain exists. 
          // Does PlayerMain have a list of active NPCs?
          
          if (!globalThis._playerMainInstance) return "No PlayerMain";
          
          var pmInst = globalThis._playerMainInstance;
          
          // Let's try to get near npcs dictionary again, but handle it as a dict
          var getNearNpcsFn = new NativeFunction(base.add(0x700194), 'pointer', ['pointer']);
          var dict = null;
          try {
              dict = getNearNpcsFn(pmInst);
          } catch(e) {
              return "Failed to call GetNearNpcs: " + e.message;
          }
          
          if (!dict || dict.isNull()) return "Dict is null";
          dump += "Dict Ptr: " + dict + "\\n";
          
          // Now we dump the dict. Let's do it carefully.
          var entries = dict.add(0x10).readPointer(); // tables
          if (entries.isNull()) return dump + "Tables is null";
          
          var buckets = entries.add(0x10).readPointer();
          if (buckets.isNull()) return dump + "Buckets is null";
          
          var len = buckets.add(0x18).readInt();
          dump += "Buckets length: " + len + "\\n";
          
          for (var i = 0; i < len; i++) {
              var node = buckets.add(0x20 + i * 8).readPointer();
              while (!node.isNull()) {
                  var keyPtr = node.add(0x10).readPointer();
                  var valPtr = node.add(0x18).readPointer(); // NpcRes.Normal
                  var nextNode = node.add(0x20).readPointer();
                  
                  var key = readIl2CppString(keyPtr);
                  dump += "NPC Key: " + key + "\\n";
                  
                  if (!valPtr.isNull()) {
                      // Dump NpcRes.Normal string fields to find the name
                      var namePtr = valPtr.add(0x20).readPointer(); 
                      var name = readIl2CppString(namePtr);
                      
                      var str10Ptr = valPtr.add(0x10).readPointer();
                      var str10 = readIl2CppString(str10Ptr);
                      
                      dump += "  Name (0x20): " + name + "\\n";
                      dump += "  Field (0x10): " + str10 + "\\n";
                      
                      // Dump floats (Coordinates?)
                      var f30 = valPtr.add(0x30).readFloat();
                      var f34 = valPtr.add(0x34).readFloat();
                      var f38 = valPtr.add(0x38).readFloat();
                      var f3c = valPtr.add(0x3C).readFloat();
                      dump += "  Floats 0x30-0x3C: " + f30 + ", " + f34 + ", " + f38 + ", " + f3c + "\\n";
                  }
                  
                  node = nextNode;
              }
          }
          return dump;
      };
  `;

  fs.writeFileSync('test-scan-script6.js', scriptCode);
  const bundlePath = path.join(process.cwd(), 'frida-scripts', 'bot.bundle.js');
  await session.loadScript(bundlePath);
  await session.loadScript('test-scan-script6.js');
  
  await new Promise(r => setTimeout(r, 2000));
  
  const result = await session.callRpc('dumpSceneNpcs');
  console.log(result);
  
  process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
