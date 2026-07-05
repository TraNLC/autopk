// tools/test-dump-charmanager.js — Dump CharManager instance tìm dict NPC
const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    try {
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        await session.callRpc('getNearbyShops'); // init CharManager

        const src = `
rpc.exports.dumpCM = function() {
 var r = {};
 try {
  var cmInst = _charManagerClass.add(0xB8).readPointer().readPointer();
  r.cmInst = cmInst.toString();
  
  // Dump all pointer fields 0x00 to 0x100
  r.fields = [];
  for (var i = 0; i < 0x100; i += 8) {
   try {
    var v = cmInst.add(i).readPointer();
    var s = v.toString();
    // Check if it looks like a dict (vtable-like start)
    var isDict = false;
    try {
     var maybeVt = v.add(0x0).readPointer();
     // C# Dictionary has a type info pointer at +0x0
     if (maybeVt && !maybeVt.isNull()) {
      var count = v.add(0x20).readU32();
      if (count > 0 && count < 5000) isDict = true;
     }
    } catch(e) {}
    r.fields.push({ off: '0x'+i.toString(16), val: s, dict: isDict });
   } catch(e) {
    r.fields.push({ off: '0x'+i.toString(16), err: e.message });
   }
  }
  r.ok = true;
 } catch(e) { r.error = e.message; }
 return r;
};
`;
        const scr = await session.session.createScript(src);
        await scr.load();
        const r = await scr.exports.dumpCM();
        console.log(JSON.stringify(r, null, 2));
        
    } catch(e) {
        console.error(e);
    } finally {
        await session.disconnect().catch(() => {});
        process.exit(0);
    }
}
main();
