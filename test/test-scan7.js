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
      rpc.exports.hookGetNearNpcs = function() {
          var base = Module.findBaseAddress("libil2cpp.so");
          var target = base.add(0x700194);
          
          var hooked = false;
          try {
              Interceptor.attach(target, {
                  onEnter: function(args) {
                      console.log("GetNearNpcs called!");
                  },
                  onLeave: function(retval) {
                      console.log("GetNearNpcs returned: " + retval);
                      if (!retval.isNull()) {
                          var count = retval.add(0x20).readInt();
                          console.log("Dict count: " + count);
                      }
                  }
              });
              hooked = true;
          } catch(e) {
              return "Failed to hook: " + e.message;
          }
          return "Hooked successfully! Please move around in game to trigger it.";
      };
  `;

  fs.writeFileSync('test-scan-script7.js', scriptCode);
  
  await session.loadScript('test-scan-script7.js');
  const result = await session.callRpc('hookGetNearNpcs');
  console.log(result);
  
  // Wait indefinitely to see logs
  await new Promise(() => {});
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
