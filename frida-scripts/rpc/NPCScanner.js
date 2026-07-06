// frida-scripts/rpc/npc/NPCScanner.js
// NPC (Trinh Sat, Quan Nhu) la NpcRes.Normal → khac klass voi player (NpcRes.Special)
// Tim Normal klass tu metadata, scan heap voi klass do

function __findClassFromMetadata(className) {
    try {
        var maps = File.readAllText('/proc/self/maps').split('\n');
        var metaBase = null, metaSize = 0;
        for (var i = 0; i < maps.length; i++) {
            if (maps[i].indexOf('global-metadata.dat') !== -1) {
                var parts = maps[i].split(' ')[0].split('-');
                metaBase = ptr('0x' + parts[0]);
                metaSize = parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]);
                break;
            }
        }
        if (!metaBase) return null;

        var ns = "";
        var name = className;
        var dotIdx = className.lastIndexOf('.');
        if (dotIdx !== -1) {
            ns = className.substring(0, dotIdx);
            name = className.substring(dotIdx + 1);
        }

        // Find name string in metadata
        var hexName = '';
        for (var i = 0; i < name.length; i++) hexName += ('0' + name.charCodeAt(i).toString(16)).slice(-2);
        var results = Memory.scanSync(metaBase, metaSize, hexName);
        if (results.length === 0) return null;
        
        var nameAddr = null;
        for (var r = 0; r < results.length; r++) {
            var str = results[r].address.readUtf8String();
            if (str === name) {
                nameAddr = results[r].address;
                break;
            }
        }
        if (!nameAddr) return null;

        // Find namespace string in metadata if specified
        var nsAddr = null;
        if (ns !== "") {
            var hexNs = '';
            for (var i = 0; i < ns.length; i++) hexNs += ('0' + ns.charCodeAt(i).toString(16)).slice(-2);
            var nsResults = Memory.scanSync(metaBase, metaSize, hexNs);
            for (var r = 0; r < nsResults.length; r++) {
                var str = nsResults[r].address.readUtf8String();
                if (str === ns) {
                    nsAddr = nsResults[r].address;
                    break;
                }
            }
            if (!nsAddr) return null;
        }

        // Find Il2CppClass: scan rw- for pointer to nameAddr at +0x10
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
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
                            var checkNsPtr = cand.add(0x18).readPointer();
                            if (ns === "") {
                                if (checkNsPtr.isNull() || checkNsPtr.readUtf8String() === "") {
                                    return cand;
                                }
                            } else {
                                if (!checkNsPtr.isNull() && checkNsPtr.toString() === nsAddr.toString()) {
                                    return cand;
                                }
                            }
                        }
                    } catch(e) {}
                }
            } catch(e) {}
        }
        return null;
    } catch(e) { return null; }
}

rpc.exports.getNearNpcNames = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    var mapId = 0;
    try {
        mapId = _playerMainInstance.add(0xE4).readS32();
    } catch(e) {}

    var npcMap = {};

    // Try cac class name kha thi cho NPC (quét 1 lần đầu tiên)
    var npcKlass = globalThis.cachedNpcKlass || null;
    if (!npcKlass) {
        var classNames = ['NpcRes.Normal', 'Normal', 'NpcController', 'game.resource.settings.npcres.Controller'];
        for (var ci = 0; ci < classNames.length; ci++) {
            npcKlass = __findClassFromMetadata(classNames[ci]);
            if (npcKlass) {
                console.log('[NPCScanner] Found klass for "' + classNames[ci] + '": ' + npcKlass);
                globalThis.cachedNpcKlass = npcKlass;
                break;
            }
        }
    }
    if (!npcKlass) return { ok: false, error: 'No NPC klass found in metadata', mapId: mapId };

    // Helper to read C# string from pointer
    function readIl2CppString(strPtr) {
        if (!strPtr || strPtr.isNull() || parseInt(strPtr.toString()) < 0x10000) return '';
        try {
            var len = strPtr.add(0x10).readInt();
            if (len > 0 && len < 1000) {
                return strPtr.add(0x14).readUtf16String(len);
            }
        } catch(e) {}
        return '';
    }

    // Scan heap (asynchronous, non-blocking, and optimized to skip mapped files)
    var kh = npcKlass.toString(16);
    while (kh.length < 16) kh = '0' + kh;
    var pat = [];
    for (var j = 14; j >= 0; j -= 2) pat.push(kh.substring(j, j + 2));

    return new Promise(function(resolve) {
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var filteredRanges = [];
        for (var i = 0; i < allRanges.length; i++) {
            var r = allRanges[i];
            // Skip mapped files to only scan anonymous heap memory (prevents character freezing)
            if (r.file) continue;
            if (r.size < 0x4000 || r.size > 0x05000000) continue;
            filteredRanges.push(r);
        }

        var found = 0;
        var rangeIdx = 0;

        function scanNextRange() {
            if (rangeIdx >= filteredRanges.length || found >= 200) {
                return resolve({ ok: true, npcMap: npcMap, count: found, mapId: mapId });
            }
            var range = filteredRanges[rangeIdx++];
            try {
                Memory.scan(range.base, range.size, pat.join(' '), {
                    onMatch: function(address, size) {
                        try {
                            var obj = address;
                            var npcId = readIl2CppString(obj.add(0x28).readPointer());
                            if (npcId && !npcMap[npcId]) {
                                var name = readIl2CppString(obj.add(0x30).readPointer());
                                if (name) {
                                    npcMap[npcId] = name;
                                    found++;
                                }
                            }
                        } catch(e) {}
                    },
                    onError: function(reason) {
                        scanNextRange();
                    },
                    onComplete: function() {
                        scanNextRange();
                    }
                });
            } catch(e) {
                scanNextRange();
            }
        }

        scanNextRange();
    });
};
