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
      rpc.exports.testScan = function() {
          var metaBase = Module.findBaseAddress('global-metadata.dat');
          if (!metaBase) return "No metadata";
          var metaSize = Module.findExportByName('global-metadata.dat', null) ? 0 : 0x2000000;
          
          function findClass(name) {
              var hexName = '';
              for (var i = 0; i < name.length; i++) hexName += ('0' + name.charCodeAt(i).toString(16)).slice(-2);
              var scanRes = Memory.scanSync(metaBase, metaSize, hexName);
              var nameAddrs = [];
              for (var r = 0; r < scanRes.length; r++) {
                  try {
                      if (scanRes[r].address.readUtf8String() === name) {
                          nameAddrs.push(scanRes[r].address);
                      }
                  } catch(e) {}
              }
              if (nameAddrs.length === 0) return null;
              
              var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
              for (var na = 0; na < nameAddrs.length; na++) {
                  var nameAddr = nameAddrs[na];
                  var ptrHex = nameAddr.toString(16);
                  while (ptrHex.length < 16) ptrHex = '0' + ptrHex;
                  var pat = [];
                  for (var j = 14; j >= 0; j -= 2) pat.push(ptrHex.substring(j, j + 2));
                  var namePtrPattern = pat.join(' ');

                  for (var r = 0; r < allRanges.length; r++) {
                      try {
                          var range = allRanges[r];
                          if (range.size < 0x1000) continue;
                          var matches = Memory.scanSync(range.base, range.size, namePtrPattern);
                          for (var m = 0; m < matches.length; m++) {
                              var cand = matches[m].address.sub(0x10);
                              if (cand.compare(range.base) < 0) continue;
                              try {
                                  if (cand.add(0x10).readPointer().toString() === nameAddr.toString()) {
                                      return cand;
                                  }
                              } catch(e) {}
                          }
                      } catch(e) {}
                  }
              }
              return null;
          }
          
          var klassNormal = findClass('Normal');
          var klassSpecial = findClass('Special');
          var klassNpcRes = findClass('NpcRes');
          return "Normal: " + klassNormal + " | Special: " + klassSpecial + " | NpcRes: " + klassNpcRes;
      };
  `;

  await session.loadScriptCode(scriptCode);
  const result = await session.callRpc('testScan');
  console.log("Class scan result: " + result);
  
  process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
