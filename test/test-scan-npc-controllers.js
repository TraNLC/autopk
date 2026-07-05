// tools/test-scan-npc-controllers.js — Tìm NpcController instances qua memory scan
const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    try {
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));

        const src = `
rpc.exports.scanNpcControllers = function() {
    var r = {};

    // Step 1: Find NpcController class in global-metadata
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
    
    // Find "NpcController" string
    var pattern = '4e 70 63 43 6f 6e 74 72 6f 6c 6c 65 72'; // "NpcController"
    var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
    r.stringHits = results.length;
    
    var nameAddr = null;
    for (var ri = 0; ri < results.length; ri++) {
        try {
            var s = results[ri].address.readUtf8String();
            if (s === "NpcController") { nameAddr = results[ri].address; break; }
        } catch(e) {}
    }
    if (!nameAddr) return { error: 'NpcController string not found' };
    r.nameAddr = nameAddr.toString();
    
    // Find class pointer
    var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
    var hex = nameAddr.toString(16);
    while (hex.length < 16) hex = '0' + hex;
    var parts = [];
    for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
    var ptrPattern = parts.join(' ');
    
    var npcClass = null;
    for (var k = 0; k < allRanges.length && !npcClass; k++) {
        try {
            var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
            for (var m = 0; m < matches.length; m++) {
                var cand = matches[m].address.sub(0x10);
                try {
                    var checkPtr = cand.add(0x10).readPointer();
                    if (checkPtr.toString() === nameAddr.toString()) {
                        npcClass = cand;
                        break;
                    }
                } catch(e) {}
            }
        } catch(e) {}
    }
    if (!npcClass) return { error: 'NpcController class not found' };
    r.npcClass = npcClass.toString();
    
    // Step 2: Scan for IL2CPP objects whose klass field (+0x00) == npcClass
    // IL2CPP object layout: +0x00=klass, +0x08=monitor, fields start at +0x10
    // NpcController.cid @0x28 → actual +0x38
    // NpcController.npcName @0x30 → actual +0x40
    
    var hexClass = npcClass.toString(16);
    while (hexClass.length < 16) hexClass = '0' + hexClass;
    var classParts = [];
    for (var cj = 14; cj >= 0; cj -= 2) classParts.push(hexClass.substring(cj, cj + 2));
    var classPattern = classParts.join(' ');
    
    r.classPattern = classPattern;
    r.foundInstances = [];
    
    var heapRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
    var scanned = 0;
    
    for (var h = 0; h < heapRanges.length && r.foundInstances.length < 100; h++) {
        var range = heapRanges[h];
        if (range.size < 0x1000) continue;
        scanned++;
        
        try {
            var instMatches = Memory.scanSync(range.base, range.size, classPattern);
            for (var im = 0; im < instMatches.length && r.foundInstances.length < 100; im++) {
                var objAddr = instMatches[im].address; // klass is at +0x00
                
                // Verify: klass should be npcClass
                try {
                    var klass = objAddr.readPointer();
                    if (!klass.equals(npcClass)) continue;
                } catch(e) { continue; }
                
                // Read cid @+0x38 (header 0x10 + field 0x28) and npcName @+0x40 (0x10+0x30)
                var cid = '';
                var npcName = '';
                try {
                    var cidPtr = objAddr.add(0x38).readPointer();
                    if (cidPtr && !cidPtr.isNull()) {
                        var cidLen = cidPtr.add(0x10).readU32();
                        if (cidLen > 0 && cidLen < 32) cid = cidPtr.add(0x14).readUtf16String(cidLen);
                    }
                    
                    var namePtr = objAddr.add(0x40).readPointer();
                    if (namePtr && !namePtr.isNull()) {
                        var nameLen = namePtr.add(0x10).readU32();
                        if (nameLen > 0 && nameLen < 256) npcName = namePtr.add(0x14).readUtf16String(nameLen);
                    }
                } catch(e) {}
                
                r.foundInstances.push({
                    addr: objAddr.toString(),
                    cid: cid,
                    npcName: npcName
                });
            }
        } catch(e) {}
    }
    
    r.scannedRanges = scanned;
    r.ok = true;
    return r;
};
`;
        const scr = await session.session.createScript(src);
        await scr.load();

        console.log('🔍 Scanning for NpcController instances...\n');
        const r = await scr.exports.scanNpcControllers();
        console.log(JSON.stringify(r, null, 2));

    } catch(e) {
        console.error('Error:', e.message);
    } finally {
        await session.disconnect().catch(() => {});
        process.exit(0);
    }
}
main();
