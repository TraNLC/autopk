// frida-scripts/rpc/npc/NPCScanner.js — No-bridge NPC scanner
// Path: CharManager → World(+0x20) → NpcManager(+0x28) → npcs dict(+0x30)
// Reads NPCController.name via: controller → identification(+0x28) → name(+0x48)
// NOTE: In bridge mode, PlayerManager.js overrides getNearNpcNames AFTER this loads.
// Only runs if Il2Cpp bridge is NOT available.

// Shared with ShopScanner — init CharManager from global-metadata.dat
var __npcCharManagerClass = null;
var __npcLastScanTime = 0;

function __npcInitCharManager() {
    if (__npcCharManagerClass) return true;
    
    // Try shared var from ShopScanner first
    try {
        if (typeof _charManagerClass !== 'undefined' && _charManagerClass && !_charManagerClass.isNull()) {
            __npcCharManagerClass = _charManagerClass;
            return true;
        }
    } catch(e) {}
    
    var now = Date.now();
    if (now - __npcLastScanTime < 5000) return false;
    __npcLastScanTime = now;
    
    try {
        // Find "CharManager" string in global-metadata.dat
        var maps = File.readAllText('/proc/self/maps').split('\n');
        var metaRange = null;
        for (var i = 0; i < maps.length; i++) {
            if (maps[i].indexOf('global-metadata.dat') !== -1) {
                var parts = maps[i].split(' ')[0].split('-');
                metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                break;
            }
        }
        if (!metaRange) return false;
        
        var pattern = '43 68 61 72 4d 61 6e 61 67 65 72'; // "CharManager"
        var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
        
        var nameStrAddr = null;
        for (var r = 0; r < results.length; r++) {
            try {
                if (results[r].address.readUtf8String() === "CharManager") {
                    nameStrAddr = results[r].address;
                    break;
                }
            } catch(e) {}
        }
        if (!nameStrAddr) return false;
        
        // Find pointer to this string in rw- memory (the class structure)
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var hex = nameStrAddr.toString(16);
        while (hex.length < 16) hex = '0' + hex;
        var parts = [];
        for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
        var ptrPattern = parts.join(' ');
        
        for (var k = 0; k < allRanges.length; k++) {
            try {
                var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                for (var m = 0; m < matches.length; m++) {
                    var cand = matches[m].address.sub(0x10);
                    try {
                        var checkNamePtr = cand.add(0x10).readPointer();
                        if (checkNamePtr.toString() === nameStrAddr.toString()) {
                            __npcCharManagerClass = cand;
                            try { _charManagerClass = cand; } catch(e) {}
                            return true;
                        }
                    } catch(e) {}
                }
            } catch(e) {}
        }
    } catch(e) {}
    
    return false;
}

// ===== NpcController memory scanner (no bridge) =====
// Scan ALL NpcController instances, read cid@+0x28 + npcName@+0x30
// Path: global-metadata → "NpcController" → class ptr → scan heap

var __npcCtrlClass = null;
var __npcCtrlLastScan = 0;
var __lastGetNearNpcNames = 0;
var __cachedNpcNames = null;

function __findNpcControllerClass() {
    if (__npcCtrlClass) return true;
    var now = Date.now();
    if (now - __npcCtrlLastScan < 5000) return false;
    __npcCtrlLastScan = now;
    
    try {
        var maps = File.readAllText('/proc/self/maps').split('\n');
        var metaRange = null;
        for (var i = 0; i < maps.length; i++) {
            if (maps[i].indexOf('global-metadata.dat') !== -1) {
                var parts = maps[i].split(' ')[0].split('-');
                metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                break;
            }
        }
        if (!metaRange) return false;
        
        var pat = '4e 70 63 43 6f 6e 74 72 6f 6c 6c 65 72';
        var results = Memory.scanSync(metaRange.base, metaRange.size, pat);
        var nameAddr = null;
        for (var j = 0; j < results.length; j++) {
            try { if (results[j].address.readUtf8String() === "NpcController") { nameAddr = results[j].address; break; } } catch(e) {}
        }
        if (!nameAddr) return false;
        
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var hex = nameAddr.toString(16); while (hex.length < 16) hex = '0' + hex;
        var parts = []; for (var k = 14; k >= 0; k -= 2) parts.push(hex.substring(k, k + 2));
        var ptrPattern = parts.join(' ');
        
        for (var l = 0; l < allRanges.length; l++) {
            try {
                var ms = Memory.scanSync(allRanges[l].base, allRanges[l].size, ptrPattern);
                for (var m = 0; m < ms.length; m++) {
                    var cand = ms[m].address.sub(0x10);
                    try {
                        if (cand.add(0x10).readPointer().toString() === nameAddr.toString()) {
                            __npcCtrlClass = cand;
                            return true;
                        }
                    } catch(e) {}
                }
            } catch(e) {}
        }
    } catch(e) {}
    return false;
}

rpc.exports.getNearNpcNames = function() {
    // Throttle: cache result for 10 seconds to avoid heavy repeated scans
    var now = Date.now();
    if (__cachedNpcNames && (now - __lastGetNearNpcNames < 10000)) {
        return __cachedNpcNames;
    }
    
    var result = { ok: false, npcMap: {}, source: 'NpcController.cid', found: 0 };
    try {
        if (!__findNpcControllerClass()) {
            result.error = 'NpcController class not found';
            return result;
        }
        
        var hp = __npcCtrlClass.toString(16); while (hp.length < 16) hp = '0' + hp;
        var cpp = []; for (var j = 14; j >= 0; j -= 2) cpp.push(hp.substring(j, j + 2));
        var classPattern = cpp.join(' ');
        
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        
        for (var i = 0; i < allRanges.length && result.found < 50; i++) {
            if (allRanges[i].size < 0x1000) continue;
            try {
                var ms = Memory.scanSync(allRanges[i].base, allRanges[i].size, classPattern);
                for (var j = 0; j < ms.length && result.found < 50; j++) {
                    var obj = ms[j].address;
                    try { if (!obj.readPointer().equals(__npcCtrlClass)) continue; } catch(e) { continue; }
                    
                    // Skip class metadata instances
                    var os = obj.toString(16).substring(0, 6);
                    
                    // Read cid@+0x28, npcName@+0x30
                    var cid = '', name = '';
                    try {
                        var cp = obj.add(0x28).readPointer();
                        if (cp && !cp.isNull()) { var cl = cp.add(0x10).readU32(); if (cl > 0 && cl < 32) cid = cp.add(0x14).readUtf16String(cl); }
                        var np = obj.add(0x30).readPointer();
                        if (np && !np.isNull()) { var nl = np.add(0x10).readU32(); if (nl > 0 && nl < 128) name = np.add(0x14).readUtf16String(nl); }
                    } catch(e) {}
                    
                    if (cid && name) {
                        result.npcMap[cid] = name;
                        result.found++;
                    }
                }
            } catch(e) {}
        }
        
        result.ok = true;
        if (result.found === 0) result.error = 'no NPCs found';
        // Cache result
        __cachedNpcNames = result;
        __lastGetNearNpcNames = Date.now();
    } catch(e) {
        result.error = e.message;
    }
    return result;
};

// Debug RPC — dump NpcManager raw để tìm đúng offset
rpc.exports.debugNpcManager = function() {
    var r = {};
    try {
        if (!__npcInitCharManager()) return { error: 'CharManager init failed' };
        
        var cmInst = __npcCharManagerClass.add(0xB8).readPointer().readPointer();
        r.cmInst = cmInst.toString();
        
        var world = cmInst.add(0x20).readPointer();
        r.world = world.toString();
        if (world.isNull()) return { error: 'world null', ...r };
        
        var npcMgr = world.add(0x28).readPointer();
        r.npcMgr = npcMgr.toString();
        if (npcMgr.isNull()) return { error: 'npcMgr null', ...r };
        
        // Dump NpcManager first 0x50 bytes
        r.npcMgrFields = [];
        for (var i = 0; i < 0x50; i += 8) {
            try {
                var v = npcMgr.add(i).readPointer();
                r.npcMgrFields.push('+0x'+i.toString(16)+'='+v);
            } catch(e) {
                r.npcMgrFields.push('+0x'+i.toString(16)+'=ERR:'+e.message);
            }
        }
        
        // Dump npcs dict @0x30
        var npcsDict = npcMgr.add(0x30).readPointer();
        if (!npcsDict.isNull()) {
            r.npcsDict = npcsDict.toString();
            r.dictHeader = [];
            for (var j = 0; j < 0x30; j += 4) {
                try {
                    r.dictHeader.push('+0x'+j.toString(16)+'=0x'+npcsDict.add(j).readU32().toString(16));
                } catch(e) {}
            }
            // entries @0x18, count @0x20
            var entries = npcsDict.add(0x18).readPointer();
            var count = npcsDict.add(0x20).readU32();
            r.entriesPtr = entries.toString();
            r.count = count;
            
            if (count > 0 && count < 500 && !entries.isNull()) {
                r.samples = [];
                for (var s = 0; s < Math.min(count, 5); s++) {
                    var ea = entries.add(s * 24);
                    var kp = ea.readPointer();
                    var vp = ea.add(8).readPointer();
                    var kstr = '';
                    try {
                        var kl = kp.add(0x10).readU32();
                        if (kl > 0 && kl < 64) kstr = kp.add(0x14).readUtf16String(kl);
                    } catch(e2) {}
                    r.samples.push({ idx: s, keyPtr: kp.toString(), valPtr: vp.toString(), key: kstr });
                }
            }
        } else {
            r.error = 'npcsDict @0x30 is null';
        }
        
        // Also dump dict @0x38
        var d38 = npcMgr.add(0x38).readPointer();
        if (!d38.isNull()) {
            r.dict38 = d38.toString();
            r.d38header = [];
            for (var j = 0; j < 0x30; j += 4) {
                try { r.d38header.push('+0x'+j.toString(16)+'=0x'+d38.add(j).readU32().toString(16)); } catch(e) {}
            }
            var e38 = d38.add(0x18).readPointer();
            var c38 = d38.add(0x20).readU32();
            r.d38entries = e38.toString();
            r.d38count = c38;
            
            if (c38 > 0 && c38 < 500 && !e38.isNull()) {
                r.d38samples = [];
                for (var s = 0; s < Math.min(c38, 15); s++) {
                    var ea = e38.add(s * 24);
                    var kp = ea.readPointer();
                    var vp = ea.add(8).readPointer();
                    var kstr = '';
                    try { var kl = kp.add(0x10).readU32(); if (kl > 0 && kl < 64) kstr = kp.add(0x14).readUtf16String(kl); } catch(e2) {}
                    // Read NPC name from value pointer
                    var vname = '';
                    if (vp && !vp.isNull()) {
                        try {
                            var ident = vp.add(0x28).readPointer();
                            if (ident && !ident.isNull()) {
                                var np = ident.add(0x48).readPointer();
                                if (np && !np.isNull()) {
                                    var nl = np.add(0x10).readU32();
                                    if (nl > 0 && nl < 256) vname = np.add(0x14).readUtf16String(nl);
                                }
                            }
                        } catch(e2) {}
                    }
                    r.d38samples.push({ idx: s, kp: kp.toString(), vp: vp.toString(), key: kstr, name: vname });
                }
            }
        }
        
        r.ok = true;
    } catch(e) {
        r.error = e.message;
    }
    return r;
};

// Dump ALL CharManager instance pointer fields - tìm dict chứa NPC
rpc.exports.dumpCharManager = function() {
    var r = { fields: [] };
    try {
        if (!__npcInitCharManager()) return { error: 'CharManager init failed' };
        var cmInst = __npcCharManagerClass.add(0xB8).readPointer().readPointer();
        r.cmInst = cmInst.toString();
        
        for (var i = 0; i < 0x100; i += 8) {
            try {
                var v = cmInst.add(i).readPointer();
                var s = v.toString();
                // Check if it looks like a dictionary
                var isDict = false;
                var dictCount = 0;
                try {
                    var vt = v.add(0x0).readPointer();
                    if (vt && !vt.isNull()) {
                        dictCount = v.add(0x20).readU32();
                        if (dictCount > 0 && dictCount < 10000) isDict = true;
                    }
                } catch(e) {}
                var label = '0x' + i.toString(16);
                if (isDict) label += ' [DICT count=' + dictCount + ']';
                // Also try reading as string
                var asStr = '';
                if (!isDict && !v.isNull()) {
                    try {
                        var sl = v.add(0x10).readU32();
                        if (sl > 0 && sl < 256) asStr = v.add(0x14).readUtf16String(Math.min(sl, 100));
                    } catch(e) {}
                }
                r.fields.push({ off: label, ptr: s, str: asStr });
            } catch(e) {
                r.fields.push({ off: '0x' + i.toString(16), err: e.message });
            }
        }
        r.ok = true;
    } catch(e) { r.error = e.message; }
    return r;
};
