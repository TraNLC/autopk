
    var il2cppBase = Module.findBaseAddress("libil2cpp.so");
    var globalMetadata = null;
    if (il2cppBase) {
        var ranges = Process.enumerateModules();
        for (var i = 0; i < ranges.length; i++) {
            if (ranges[i].name === "global-metadata.dat") {
                globalMetadata = ranges[i];
                break;
            }
        }
    }
    
    function __findClassFromMetadata(className) {
        if (!il2cppBase) return null;
        var ns = "";
        var name = className;
        var dotIdx = className.lastIndexOf('.');
        if (dotIdx !== -1) {
            ns = className.substring(0, dotIdx);
            name = className.substring(dotIdx + 1);
        }

        var pattern = "";
        for (var i = 0; i < name.length; i++) pattern += name.charCodeAt(i).toString(16).padStart(2, '0') + " ";
        pattern = pattern.trim();

        var allRanges = [];
        if (globalMetadata) {
            allRanges.push({ base: globalMetadata.base, size: globalMetadata.size });
        } else {
            var ranges = Process.enumerateRanges('r--');
            for (var i = 0; i < ranges.length; i++) {
                if (ranges[i].size > 0x100000 && ranges[i].file && ranges[i].file.path.indexOf('global-metadata') !== -1) {
                    allRanges.push({ base: ranges[i].base, size: ranges[i].size });
                }
            }
        }

        if (allRanges.length === 0) return null;

        for (var i = 0; i < allRanges.length; i++) {
            var range = allRanges[i];
            var matches = Memory.scanSync(range.base, range.size, pattern);
            for (var m = 0; m < matches.length; m++) {
                var nameAddr = matches[m].address;
                var ptrPattern = "";
                var pBytes = ptr(nameAddr).toBytes();
                for (var b = 0; b < Process.pointerSize; b++) {
                    ptrPattern += pBytes[b].toString(16).padStart(2, '0') + " ";
                }
                ptrPattern = ptrPattern.trim();
                
                var dataRanges = Process.enumerateRanges('rw-');
                for (var r = 0; r < dataRanges.length; r++) {
                    var drange = dataRanges[r];
                    if (drange.size < 0x1000) continue;
                    var ptrMatches = Memory.scanSync(drange.base, drange.size, ptrPattern);
                    for (var pm = 0; pm < ptrMatches.length; pm++) {
                        var cand = ptrMatches[pm].address.sub(0x10);
                        return cand.toString();
                    }
                }
            }
        }
        return null;
    }

    rpc.exports.testClass = function() {
        var names = [
            'NpcController',
            'game.logic.npc.NpcController',
            'game.logic.NpcController',
            'game.resource.settings.npcres.Datafield',
            'NpcRes.Normal'
        ];
        var res = {};
        for(var i=0; i<names.length; i++) {
            res[names[i]] = __findClassFromMetadata(names[i]);
        }
        return res;
    };
  