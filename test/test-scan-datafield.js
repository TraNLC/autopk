// tools/test-scan-datafield.js — Đọc NPC ID/Name từ Controller.data (Datafield)
const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    try {
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));

        const src = `
rpc.exports.scan = function() {
 var r = [];
 // 1. Find NpcController class in global-metadata.dat (same as ShopScanner)
 var maps = File.readAllText("/proc/self/maps").split("\\n");
 var metaRange = null;
 for (var i = 0; i < maps.length; i++) {
  if (maps[i].indexOf("global-metadata.dat") !== -1) {
   var parts = maps[i].split(" ")[0].split("-");
   metaRange = { base: ptr("0x" + parts[0]), size: parseInt("0x" + parts[1]) - parseInt("0x" + parts[0]) };
   break;
  }
 }
 if (!metaRange) return { error: "global-metadata.dat not found" };
 
 var pat = "4e 70 63 43 6f 6e 74 72 6f 6c 6c 65 72";
 var ms = Memory.scanSync(metaRange.base, metaRange.size, pat);
 var nameAddr = null;
 for (var j = 0; j < ms.length; j++) {
  try { if (ms[j].address.readUtf8String() === "NpcController") { nameAddr = ms[j].address; break; } } catch(e) {}
 }
 if (!nameAddr) return { error: "NpcController string not found" };
 
 // Find class pointer in rw- memory
 var ar = Process.enumerateRanges({protection: "rw-", coalesce: true});
 var h = nameAddr.toString(16); while (h.length < 16) h = "0" + h;
 var pp = []; for (var k = 14; k >= 0; k -= 2) pp.push(h.substring(k, k + 2));
 var nc = null;
 
 for (var i = 0; i < ar.length && !nc; i++) {
  try {
   var ms2 = Memory.scanSync(ar[i].base, ar[i].size, pp.join(" "));
   for (var j = 0; j < ms2.length; j++) {
    var c = ms2[j].address.sub(0x10);
    try { if (c.add(0x10).readPointer().toString() === nameAddr.toString()) { nc = c; break; } } catch(e) {}
   }
  } catch(e) {}
 }
 if (!nc) return { error: "NpcController class not found in rw-" };
 r.push({ step: "class", addr: nc.toString() });
 
 // 2. Scan for instances + dump raw first 3
 var hp = nc.toString(16); while (hp.length < 16) hp = "0" + hp;
 var cpp = []; for (var j = 14; j >= 0; j -= 2) cpp.push(hp.substring(j, j + 2));
 
 var found = 0, rawSamples = [];
 for (var i = 0; i < ar.length && found < 50; i++) {
  if (ar[i].size < 0x1000) continue;
  try {
   var ms3 = Memory.scanSync(ar[i].base, ar[i].size, cpp.join(" "));
   for (var j = 0; j < ms3.length && found < 50; j++) {
    var obj = ms3[j].address;
    try { if (!obj.readPointer().equals(nc)) continue; } catch(e) { continue; }
    
    var os = obj.toString(16);
    if (os.indexOf("7c9d60") === 0 || os.indexOf("7141e0") === 0) continue;
    
    // Dump raw fields for first 3 instances
    if (rawSamples.length < 3) {
     var dump = { addr: os, fields: {} };
     for (var f = 0; f < 0x60; f += 8) {
      try { var v = obj.add(f).readPointer(); dump.fields["+" + f.toString(16)] = v.toString(); } catch(e) {}
     }
     // Also try reading strings at each pointer
     dump.strings = {};
     for (var f = 0; f < 0x60; f += 8) {
      try {
       var sp = obj.add(f).readPointer();
       if (sp && !sp.isNull()) {
        var sl = sp.add(0x10).readU32();
        if (sl > 0 && sl < 128) { var ss = sp.add(0x14).readUtf16String(sl); dump.strings["+" + f.toString(16)] = ss; }
       }
      } catch(e) {}
     }
     rawSamples.push(dump);
    }
    
    // Try reading cid/name at various offsets
    var cidA = "", nameA = "";
    try {
     var cpA = obj.add(0x38).readPointer();
     if (cpA && !cpA.isNull()) { var cl = cpA.add(0x10).readU32(); if (cl > 0 && cl < 32) cidA = cpA.add(0x14).readUtf16String(cl); }
     var npA = obj.add(0x40).readPointer();
     if (npA && !npA.isNull()) { var nl = npA.add(0x10).readU32(); if (nl > 0 && nl < 128) nameA = npA.add(0x14).readUtf16String(nl); }
    } catch(e) {}
    
    if (cidA || nameA) {
     r.push({ addr: os, cid: cidA, name: nameA });
     found++;
    }
   }
  } catch(e) {}
 }
 
 r.push({ total: found, rawSamples: rawSamples });
 return { ok: true, results: r };
};
`;
        const scr = await session.session.createScript(src);
        await scr.load();
        
        console.log('Scanning NpcController instances...\n');
        const r = await scr.exports.scan();
        console.log(JSON.stringify(r, null, 2));

    } catch(e) {
        console.error(e);
    } finally {
        await session.disconnect().catch(() => {});
        process.exit(0);
    }
}
main();
