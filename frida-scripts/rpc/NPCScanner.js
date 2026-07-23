function getIl2CppBase() {
    var mod = Process.findModuleByName('libil2cpp.so') || Process.findModuleByName('libil4i3n.so');
    if (mod) return mod.base;

    var base = null;
    var lines = File.readAllText('/proc/self/maps').split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r-x') !== -1) {
            var parts = line.trim().split(/\s+/);
            base = ptr('0x' + parts[0].split('-')[0]);
            break;
        }
    }
    if (!base) {
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r--p') !== -1) {
                var parts = line.trim().split(/\s+/);
                base = ptr('0x' + parts[0].split('-')[0]);
                break;
            }
        }
    }
    return base;
}

function findElfExport(base, targetName) {
    if (!base || base.isNull()) return ptr(0);
    
    var magic = base.readByteArray(4);
    var u8 = new Uint8Array(magic);
    if (u8[0] !== 0x7f || u8[1] !== 0x45 || u8[2] !== 0x4c || u8[3] !== 0x46) {
        return ptr(0);
    }
    
    var elfClass = base.add(4).readU8();
    var is64 = (elfClass === 2);
    
    var e_phoff, e_phentsize, e_phnum;
    if (is64) {
        e_phoff = base.add(32).readU64().toNumber();
        e_phentsize = base.add(54).readU16();
        e_phnum = base.add(56).readU16();
    } else {
        e_phoff = base.add(28).readU32().toNumber();
        e_phentsize = base.add(42).readU16();
        e_phnum = base.add(44).readU16();
    }
    
    var dynAddr = null;
    var dynSize = 0;
    
    for (var i = 0; i < e_phnum; i++) {
        var phdrAddr = base.add(e_phoff + i * e_phentsize);
        var p_type = phdrAddr.readU32();
        if (p_type === 2) { // PT_DYNAMIC
            var p_vaddr, p_memsz;
            if (is64) {
                p_vaddr = phdrAddr.add(16).readU64().toNumber();
                p_memsz = phdrAddr.add(40).readU64().toNumber();
            } else {
                p_vaddr = phdrAddr.add(8).readU32().toNumber();
                p_memsz = phdrAddr.add(20).readU32().toNumber();
            }
            dynAddr = base.add(p_vaddr);
            dynSize = p_memsz;
            break;
        }
    }
    
    if (!dynAddr) return ptr(0);
    
    var symtab = null;
    var strtab = null;
    
    var offset = 0;
    var dynEntrySize = is64 ? 16 : 8;
    while (offset < dynSize) {
        var entryAddr = dynAddr.add(offset);
        var d_tag, d_val;
        if (is64) {
            d_tag = entryAddr.readS64().toNumber();
            d_val = entryAddr.add(8).readPointer();
        } else {
            d_tag = entryAddr.readS32();
            d_val = entryAddr.add(4).readPointer();
        }
        
        if (d_tag === 0) break; // DT_NULL
        if (d_tag === 6) symtab = d_val; // DT_SYMTAB
        if (d_tag === 5) strtab = d_val; // DT_STRTAB
        
        offset += dynEntrySize;
    }
    
    if (!symtab || !strtab) return ptr(0);
    
    if (parseInt(symtab.toString()) < parseInt(base.toString())) {
        symtab = base.add(symtab);
    }
    if (parseInt(strtab.toString()) < parseInt(base.toString())) {
        strtab = base.add(strtab);
    }

    var idx = 0;
    var symEntrySize = is64 ? 24 : 16;
    while (idx < 50000) {
        var symAddr = symtab.add(idx * symEntrySize);
        var st_name = symAddr.readU32();
        var st_value;
        if (is64) {
            st_value = symAddr.add(8).readU64();
        } else {
            st_value = symAddr.add(4).readU32();
        }
        
        if (st_name === 0 && st_value.toString() === '0' && idx > 0) {
            break;
        }
        
        try {
            var nameAddr = strtab.add(st_name);
            var name = nameAddr.readUtf8String();
            if (name === targetName) {
                return base.add(ptr(st_value.toString()));
            }
        } catch(e) {
            break;
        }
        idx++;
    }
    return ptr(0);
}

function __findClassViaIl2Cpp(namespace, className) {
    // Disabled to prevent access violations on emulator translation layers
    return null;
}

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

        var nsAddrs = [];
        if (ns !== "") {
            var hexNs = '';
            for (var i = 0; i < ns.length; i++) hexNs += ('0' + ns.charCodeAt(i).toString(16)).slice(-2);
            var nsScanRes = Memory.scanSync(metaBase, metaSize, hexNs);
            for (var r = 0; r < nsScanRes.length; r++) {
                try {
                    if (nsScanRes[r].address.readUtf8String() === ns) {
                        nsAddrs.push(nsScanRes[r].address);
                    }
                } catch(e) {}
            }
            if (nsAddrs.length === 0) return null;
        }

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
                        var cand = matches[m].address.sub(0x10); // class name string pointer is at 0x10
                        if (cand.compare(range.base) < 0) continue;
                        try {
                            if (cand.add(0x10).readPointer().toString() === nameAddr.toString()) {
                                var checkNsPtr = cand.add(0x18).readPointer(); // namespace pointer is at 0x18
                                if (ns === "") {
                                    if (checkNsPtr.isNull() || checkNsPtr.readUtf8String() === "") return cand;
                                } else {
                                    if (!checkNsPtr.isNull()) {
                                        for (var nsa = 0; nsa < nsAddrs.length; nsa++) {
                                            if (checkNsPtr.toString() === nsAddrs[nsa].toString()) return cand;
                                        }
                                    }
                                }
                            }
                        } catch(e) {}
                    }
                } catch(e) {}
            }
        }
        return null;
    } catch(e) { return null; }
}

function __findClassDirect(className) {
    var ns = "";
    var name = className;
    var dotIdx = className.lastIndexOf('.');
    if (dotIdx !== -1) {
        ns = className.substring(0, dotIdx);
        name = className.substring(dotIdx + 1);
    }
    return __findClassViaIl2Cpp(ns, name) || __findClassFromMetadata(className);
}

rpc.exports.getNearNpcNames = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    var mapId = 0;
    try {
        mapId = _playerMainInstance.add(0xEC).readS32();
    } catch(e) {}

    var npcMap = {};

    // Try cac class name kha thi cho NPC (quét 1 lần đầu tiên)
    var npcKlass = globalThis.cachedNpcKlass || null;
    if (!npcKlass) {
        var classNames = [
            'game.resource.settings.npcres.Datafield',
            'NpcRes.Normal',
            'Normal',
            'NpcController',
            'game.resource.settings.npcres.Controller'
        ];
        for (var ci = 0; ci < classNames.length; ci++) {
            npcKlass = __findClassDirect(classNames[ci]);
            if (npcKlass) {
                console.log('[NPCScanner] Found klass for "' + classNames[ci] + '": ' + npcKlass);
                globalThis.cachedNpcKlass = npcKlass;
                globalThis.cachedNpcKlassName = classNames[ci];
                break;
            }
        }
    }
    if (!npcKlass) return { ok: false, error: 'No NPC klass found in metadata', mapId: mapId };

    // Set dynamic offsets based on which class was resolved
    var idOffset = 0x28;
    var nameOffset = 0x30;
    var matchedKlassName = globalThis.cachedNpcKlassName || '';
    if (matchedKlassName.indexOf('Datafield') !== -1) {
        idOffset = 0x10;
        nameOffset = 0x40;
    }

    // Helper to read C# string from pointer
    function readIl2CppString(strPtr) {
        if (!strPtr || strPtr.isNull() || parseInt(strPtr.toString()) < 0x10000) return null;
        try {
            var len = strPtr.add(0x10).readInt();
            if (len > 0 && len < 100) {
                return strPtr.add(0x14).readUtf16String(len);
            }
        } catch(e) {}
        return null;
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
                            var npcId = readIl2CppString(obj.add(idOffset).readPointer());
                            if (npcId && !npcMap[npcId]) {
                                var name = readIl2CppString(obj.add(nameOffset).readPointer());
                                if (name) {
                                    var lower = name.toLowerCase();
                                    var isTongKimNpc = 
                                        lower.indexOf('quân nhu') !== -1 || lower.indexOf('quan nhu') !== -1 ||
                                        lower.indexOf('trinh') !== -1 ||
                                        lower.indexOf('chiêu binh') !== -1 || lower.indexOf('chieu binh') !== -1 ||
                                        lower.indexOf('mộ binh') !== -1 || lower.indexOf('mo binh') !== -1 ||
                                        lower.indexOf('xa phu') !== -1 ||
                                        lower.indexOf('rương') !== -1 || lower.indexOf('ruong') !== -1;
                                    
                                    if (isTongKimNpc) {
                                        npcMap[npcId] = name;
                                        found++;
                                    }
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
