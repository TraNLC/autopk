// tools/test-find-id-mem.js — Scan memory tìm NPC ID "113" để biết nó nằm ở struct nào
const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    try {
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));

        const src = `
rpc.exports.scan113 = function() {
 var r = { hits: [] };
 var pat = "31 31 33"; // "113" as ASCII
 var ranges = Process.enumerateRanges({protection: "rw-", coalesce: true});
 r.totalRanges = ranges.length;
 
 for (var ri = 0; ri < ranges.length && r.hits.length < 30; ri++) {
  try {
   var results = Memory.scanSync(ranges[ri].base, ranges[ri].size, pat);
   for (var hi = 0; hi < results.length && r.hits.length < 30; hi++) {
    var addr = results[hi].address;
    // Check if this is a C# string (length prefix at -4 should be 3)
    var maybeLen = 0;
    try { maybeLen = addr.sub(4).readU32(); } catch(e) {}
    
    // Read context bytes: 4 before + "113" + 4 after
    var ctx = "";
    for (var c = -4; c <= 6; c++) {
     try {
      var b = addr.add(c).readU8();
      ctx += (b >= 32 && b < 127) ? String.fromCharCode(b) : ".";
     } catch(e) { ctx += "?"; }
    }
    
    // Look for nearby pointers (struct references)
    var ptrs = [];
    for (var off = -64; off < 0; off += 8) {
     try {
      var p = addr.add(off).readPointer();
      if (p && !p.isNull()) ptrs.push("+" + off.toString(16) + "=" + p);
     } catch(e) {}
    }
    
    r.hits.push({
     addr: addr.toString(),
     len: maybeLen,
     ctx: ctx,
     ptrs: ptrs.slice(0, 3)
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
        
        console.log('Scanning memory for "113"...\n');
        const r = await scr.exports.scan113();
        
        if (!r.hits || r.hits.length === 0) {
            console.log('❌ Not found in rw- memory!\n');
            console.log('→ ID có thể là int (0x71) hoặc nằm trong file .data');
            
            // Try scanning for int value 113
            console.log('\n🔍 Trying int 113 (0x71 00 00 00)...\n');
            const src2 = `
rpc.exports.scanInt = function() {
 var r = { hits: [] };
 var pat = "71 00 00 00";
 var ranges = Process.enumerateRanges({protection: "rw-", coalesce: true});
 r.total = ranges.length;
 var found = 0;
 for (var ri = 0; ri < ranges.length && found < 10; ri++) {
  try {
   var results = Memory.scanSync(ranges[ri].base, ranges[ri].size, pat);
   for (var hi = 0; hi < results.length && found < 10; hi++) {
    var addr = results[hi].address;
    // Read as int32
    var val = addr.readU32();
    if (val !== 113) continue;
    found++;
    var ctx = "";
    for (var c = 0; c < 16; c++) {
     try { ctx += ("0" + addr.add(c).readU8().toString(16)).slice(-2) + " "; } catch(e) { ctx += "?? "; }
    }
    r.hits.push({ addr: addr.toString(), ctx: ctx.trim() });
   }
  } catch(e) {}
 }
 r.ok = true;
 return r;
};
`;
            const scr2 = await session.session.createScript(src2);
            await scr2.load();
            const r2 = await scr2.exports.scanInt();
            console.log(JSON.stringify(r2, null, 2));
        } else {
            console.log(`Found ${r.hits.length} hits:\n`);
            for (const h of r.hits) {
                const isStr = h.len === 3 ? ' [C# STRING]' : '';
                console.log(`  ${h.addr}${isStr}  "${h.ctx}"`);
                if (h.ptrs.length > 0) console.log(`    → struct refs: ${h.ptrs.join(' | ')}`);
            }
        }

    } catch(e) {
        console.error('Error:', e.message);
    } finally {
        await session.disconnect().catch(() => {});
        console.log('\nDone');
        process.exit(0);
    }
}
main();
