const { FridaSession } = require('./src/frida-session');
const { scanDevices } = require('./src/gui/adb-helper');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);

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
              if (len > 0 && len < 100) {
                  return strPtr.add(0x14).readUtf16String(len);
              }
          } catch(e) {}
          return null;
      }

      rpc.exports.testDump = function() {
          var base = Module.findBaseAddress("libil2cpp.so");
          var getNearNpcs = new NativeFunction(base.add(0x700194), 'pointer', ['pointer']);
          
          if (typeof globalThis._playerMainInstance === 'undefined' || !globalThis._playerMainInstance) {
              return "PlayerMain not found!";
          }

          var dict = getNearNpcs(globalThis._playerMainInstance);
          if (dict.isNull()) return "Dict is null";
          
          var count = dict.add(0x20).readInt(); // ConcurrentDictionary count offset (usually)
          var result = "Dict ptr: " + dict + ", Count: " + count + "\\n";
          
          var tables = dict.add(0x10).readPointer(); // tables
          if (!tables.isNull()) {
              var buckets = tables.add(0x10).readPointer(); // buckets (array)
              var bucketsLen = buckets.add(0x18).readInt();
              result += "Buckets len: " + bucketsLen + "\\n";
              
              var foundNodes = 0;
              for (var i = 0; i < bucketsLen; i++) {
                  var node = buckets.add(0x20 + i * 8).readPointer();
                  while (!node.isNull() && foundNodes < 5) {
                      var keyPtr = node.add(0x10).readPointer();
                      var valuePtr = node.add(0x18).readPointer(); // NpcRes.Normal
                      var nextNode = node.add(0x20).readPointer();
                      
                      var key = readIl2CppString(keyPtr) || keyPtr.toString();
                      result += "Key: " + key + " -> ValuePtr: " + valuePtr + "\\n";
                      
                      if (!valuePtr.isNull()) {
                          // Try to read common string offsets
                          var f10 = valuePtr.add(0x10).readPointer();
                          var f20 = valuePtr.add(0x20).readPointer();
                          var str10 = readIl2CppString(f10);
                          var str20 = readIl2CppString(f20);
                          result += "  0x10: " + (str10 ? str10 : f10) + "\\n";
                          result += "  0x20: " + (str20 ? str20 : f20) + "\\n";
                          
                          // Try to read floats
                          var f30 = valuePtr.add(0x30).readFloat();
                          var f34 = valuePtr.add(0x34).readFloat();
                          result += "  0x30 float: " + f30 + ", 0x34 float: " + f34 + "\\n";
                      }
                      
                      node = nextNode;
                      foundNodes++;
                  }
              }
          }
          return result;
      };
  `;

  // First we need to inject bot.bundle.js to get _playerMainInstance setup!
  const bundlePath = path.join(process.cwd(), 'frida-scripts', 'bot.bundle.js');
  await session.loadScript(bundlePath);
  
  const fs = require('fs');
  fs.writeFileSync('test-scan-script.js', scriptCode);
  await session.loadScript('test-scan-script.js');
  
  // Need to wait a bit for bot to init
  await new Promise(r => setTimeout(r, 2000));
  
  const result = await session.callRpc('testDump');
  console.log("Dump:\\n" + result);
  
  process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
