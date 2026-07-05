// tools/test-scan-id-113.js — Scan memory tìm "113" dạng raw + trace về struct
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
 var r = {};
 // Scan "113" as raw ASCII bytes (31 31 33)
 var pattern = "31 31 33";
 var ranges = Process.enumerateRanges({protection: "rw-", coalesce: true});
 r.totalRanges = ranges.length;
 r.found = [];
 
 for (var ri = 0; ri < ranges.length && r.found.length < 30; ri++) {
  try {
   var hits = Memory.scanSync(ranges[ri].base, ranges[ri].size, pattern);
   for (var hi = 0; hi < hits.length && r.found.length < 30; hi++) {
    var addr = hits[hi].address;
    // Read surrounding bytes
    var ctx = "";
    for (var c = -4; c <= 6; c++) {
     try { ctx += ("0" + addr.add(c).readU8().toString(16)).slice(-2) + " "; } catch(e) { ctx += "?? "; }
    }
    // Try reading as C# string (length @ -4, data at this address)
    var strObj = addr.sub(4);
    var strLen = strObj.readU32();
    var isCSharpString = (strLen === 3);
    
    // Check what's before this address - maybe it's a struct field
    var backPtrs = [];
    for (var off = -32; off < 0; off += 8) {
     try {
      var ptr = addr.add(off).readPointer();
      if (ptr && !ptr.isNull() && ptr > ptr(0x100000)) {
       backPtrs.push("+" + off.toString(16) + "=" + ptr);
      }
     } catch(e) {}
    }
    
    r.found.push({
     addr: addr.toString(),
     ctx: ctx.trim(),
     isStr: isCSharpString,
     range: ri,
     ptrs: backPtrs.slice(0, 4)
    });
   }
  } catch(e) {}
 }
 r.ok = true;
 return r;
};
`;
        const scr = await session.session.createScript(src);
        await scr.load();
        
        console.log('🔍 Scanning memory for "113"...\n');
        const r = await scr.exports.scan();
        
        console.log(`Found ${r.found.length} hits in ${r.totalRanges} ranges:\n`);
        for (const f of r.found.slice(0, 20)) {
            const marker = f.isStr ? ' [C# STRING]' : '';
            console.log(`  ${f.addr}${marker}  ctx: ${f.ctx}`);
            if (f.ptrs.length > 0) console.log(`    refs: ${f.ptrs.join(' | ')}`);
        }
        
        if (r.found.length === 0) {
            console.log('  ❌ String "113" not found in rw- memory');
        }

    } catch(e) {
        console.error('Error:', e.message);
    } finally {
        await session.disconnect().catch(() => {});
        process.exit(0);
    }
}
main();
