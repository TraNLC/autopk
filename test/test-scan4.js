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
      rpc.exports.testDumpList = function() {
          try {
              var base = Module.findBaseAddress("libil2cpp.so");
              var getCurrentMapDialogNpcList = new NativeFunction(base.add(0x700B4C), 'pointer', ['pointer']);
              
              if (typeof globalThis._playerMainInstance === 'undefined' || !globalThis._playerMainInstance) {
                  return "PlayerMain not found!";
              }

              var listResp = getCurrentMapDialogNpcList(globalThis._playerMainInstance);
              if (listResp.isNull()) return "MapDialogNpcListResponse is null";
              
              var result = "MapDialogNpcListResponse ptr: " + listResp + "\\n";
              
              // Dump pointers inside MapDialogNpcListResponse
              for (var i = 0x10; i < 0x50; i += 8) {
                  var ptr = listResp.add(i).readPointer();
                  result += "0x" + i.toString(16) + ": " + ptr + "\\n";
                  
                  // If it's a RepeatedField, it will have a pointer to an array at 0x18
                  if (!ptr.isNull() && parseInt(ptr.toString()) > 0x10000) {
                      try {
                          var arr = ptr.add(0x18).readPointer();
                          if (!arr.isNull() && parseInt(arr.toString()) > 0x10000) {
                              var count = arr.add(0x18).readInt();
                              if (count > 0 && count < 100) {
                                  result += "  -> Array Count: " + count + "\\n";
                                  for (var j = 0; j < Math.min(count, 5); j++) {
                                      var item = arr.add(0x20 + j * 8).readPointer();
                                      result += "    Item " + j + ": " + item + "\\n";
                                  }
                              }
                          }
                      } catch(e) {}
                  }
              }
              return result;
          } catch(e) {
              return "Error: " + e.message;
          }
      };
  `;

  fs = require('fs');
  fs.writeFileSync('test-scan-script2.js', scriptCode);
  
  const bundlePath = path.join(process.cwd(), 'frida-scripts', 'bot.bundle.js');
  await session.loadScript(bundlePath);
  
  await session.loadScript('test-scan-script2.js');
  await new Promise(r => setTimeout(r, 2000));
  
  const result = await session.callRpc('testDumpList');
  console.log("Dump:\\n" + result);
  
  process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
