// tools/test-find-npc-memory.js — Tìm NPC ID "113" trong memory → trace về NPCController
const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    try {
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));

        const src = `
rpc.exports.findNpcId = function(targetId) {
    var r = { targetId: targetId, found: [] };
    
    // Strategy: scan ALL rw- memory for the ID string
    // C# string layout: +0x10 = length (int32), +0x14 = UTF-16 chars
    // We need to find string objects containing "113"
    
    var targetHex = '';
    for (var i = 0; i < targetId.length; i++) {
        var code = targetId.charCodeAt(i).toString(16);
        while (code.length < 4) code = '0' + code;
        targetHex += code;
    }
    
    // Scan for the UTF-16 string in memory
    var ranges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
    r.totalRanges = ranges.length;
    
    var found = 0;
    for (var ri = 0; ri < ranges.length && found < 20; ri++) {
        try {
            var results = Memory.scanSync(ranges[ri].base, ranges[ri].size, targetHex);
            for (var mi = 0; mi < results.length && found < 20; mi++) {
                var strAddr = results[mi].address;
                // The string data is at +0x14 inside a C# string object
                // So the string object is at strAddr - 0x14
                var strObj = strAddr.sub(0x14);
                
                // Verify: read length at +0x10, should match targetId.length
                try {
                    var strLen = strObj.add(0x10).readU32();
                    if (strLen !== targetId.length) continue; // Not our string
                } catch(e) { continue; }
                
                found++;
                
                // Now find what references this string object
                // The string is a dictionary KEY in nearNpcs or npcs
                // Look backwards in nearby memory for pointers to this string
                var referrers = [];
                for (var off = -128; off < 0; off += 8) {
                    try {
                        var ptr = strObj.add(off).readPointer();
                        if (ptr.equals(strObj)) {
                            referrers.push({ offset: off, type: 'self-ref', addr: strObj.add(off).toString() });
                        }
                    } catch(e) {}
                }
                
                r.found.push({
                    strObj: strObj.toString(),
                    strAddr: strAddr.toString(),
                    strLen: strLen,
                    rangeIdx: ri,
                    referrers: referrers.slice(0, 5)
                });
            }
        } catch(e) {}
    }
    
    r.ok = true;
    r.totalFound = found;
    return r;
};

// Phase 2: find PlayerMain.nearNpcs dictionary
rpc.exports.findNearNpcs = function() {
    var r = {};
    try {
        // Init CharManager first (reuse existing code)
        if (typeof _charManagerClass === 'undefined' || !_charManagerClass || _charManagerClass.isNull()) {
            // Try to init via getNearbyShops
            try { rpc.exports.getNearbyShops(); } catch(e) {}
        }
        
        // Scan for "PlayerMain" class same way as CharManager
        var maps = File.readAllText('/proc/self/maps').split('\\n');
        var metaRange = null;
        for (var i = 0; i < maps.length; i++) {
            if (maps[i].indexOf('global-metadata.dat') !== -1) {
                var parts = maps[i].split(' ')[0].split('-');
                metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                break;
            }
        }
        if (!metaRange) return { error: 'no metadata' };
        
        var pattern = '50 6c 61 79 65 72 4d 61 69 6e'; // "PlayerMain"
        var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
        r.pmStringHits = results.length;
        
        var nameStrAddr = null;
        for (var ri = 0; ri < results.length; ri++) {
            try {
                if (results[ri].address.readUtf8String() === "PlayerMain") {
                    nameStrAddr = results[ri].address;
                    break;
                }
            } catch(e) {}
        }
        if (!nameStrAddr) return { error: 'PlayerMain string not found' };
        r.nameStrAddr = nameStrAddr.toString();
        
        // Find class pointer in rw- memory
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var hex = nameStrAddr.toString(16);
        while (hex.length < 16) hex = '0' + hex;
        var parts = [];
        for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
        var ptrPattern = parts.join(' ');
        
        r.scanPattern = ptrPattern;
        
        for (var k = 0; k < allRanges.length; k++) {
            try {
                var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                for (var m = 0; m < matches.length; m++) {
                    var cand = matches[m].address.sub(0x10);
                    try {
                        var checkPtr = cand.add(0x10).readPointer();
                        if (checkPtr.toString() === nameStrAddr.toString()) {
                            r.pmClass = cand.toString();
                            
                            // Read static fields at +0xB8
                            var staticFields = cand.add(0xB8).readPointer();
                            r.staticFields = staticFields.toString();
                            
                            // Read instance pointer
                            var pmInst = staticFields.readPointer();
                            r.pmInstance = pmInst.toString();
                            
                            if (!pmInst.isNull()) {
                                // Dump PlayerMain fields
                                r.pmFields = [];
                                for (var f = 0; f < 0x80; f += 8) {
                                    try {
                                        var v = pmInst.add(f).readPointer();
                                        r.pmFields.push('+0x'+f.toString(16)+'='+v);
                                    } catch(e) {
                                        r.pmFields.push('+0x'+f.toString(16)+'=ERR');
                                    }
                                }
                            }
                            
                            r.ok = true;
                            return r;
                        }
                    } catch(e) {}
                }
            } catch(e) {}
        }
        r.error = 'PlayerMain class not found in rw-';
    } catch(e) {
        r.error = e.message;
    }
    return r;
};
`;
        const scr = await session.session.createScript(src);
        await scr.load();

        // Phase 1: Find "113" string in memory
        console.log('🔍 Phase 1: Tìm string "113" trong memory...\n');
        const r1 = await scr.exports.findNpcId('113');
        console.log(JSON.stringify(r1, null, 2));

        // Phase 2: Find PlayerMain.nearNpcs
        console.log('\n🔍 Phase 2: Tìm PlayerMain class...\n');
        const r2 = await scr.exports.findNearNpcs();
        console.log(JSON.stringify(r2, null, 2));

    } catch(e) {
        console.error('Error:', e.message);
    } finally {
        await session.disconnect().catch(() => {});
        console.log('\n👋 Done');
        process.exit(0);
    }
}
main();
