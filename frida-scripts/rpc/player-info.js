// frida-scripts/rpc/player-info.js -- Player info RPC exports (sect, skills, position)

function getIl2CppBase() {
    var base = null;
    var lines = File.readAllText('/proc/self/maps').split('\n');
    // Find the EXECUTABLE (r-xp) mapping — code lives here, not in r--p
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) {
            var parts = line.trim().split(/\s+/);
            // permissions format: r-xp or r-x
            if (parts[1] && parts[1].indexOf('r-x') !== -1) {
                base = ptr('0x' + parts[0].split('-')[0]);
                break;
            }
        }
    }
    // Fallback: any mapping with offset 00000000
    if (!base) {
        for (var j = 0; j < lines.length; j++) {
            var line2 = lines[j];
            if (line2.indexOf('libil2cpp.so') !== -1 || line2.indexOf('libil4i3n.so') !== -1) {
                var parts2 = line2.trim().split(/\s+/);
                if (parts2[2] === '00000000') {
                    base = ptr('0x' + parts2[0].split('-')[0]);
                    break;
                }
            }
        }
    }
    return base;
}

function findElfExport(base, targetName) {
    if (!base || base.isNull()) return ptr(0);
    
    // Always use manual ELF parsing — more reliable than Frida's Module resolver
    // which may return addresses from a different mapping
    
    var magic = base.readByteArray(4);
    var u8 = new Uint8Array(magic);
    if (u8[0] !== 0x7f || u8[1] !== 0x45 || u8[2] !== 0x4c || u8[3] !== 0x46) {
        return ptr(0);
    }
    
    // Read class: 1 = 32-bit, 2 = 64-bit
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

rpc.exports.getMySect = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    var res = { ok: true };
    return Il2Cpp.perform(function () {
        try {
            var img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
            var pmClass = img.class("PlayerMain");
            var inst = pmClass.field("instance").value;
            if (!inst || inst.isNull()) return { ok: false, error: 'no PlayerMain.instance' };

            var npc = null;
            try { npc = inst.field("npcontroller").value; } catch (e) {
                try { npc = inst.field("m_npcontroller").value; } catch (e2) {}
            }
            if (!npc || npc.isNull()) return { ok: false, error: 'no controller' };

            var data = null;
            try { data = npc.field("data").value; } catch (e) {
                try { data = npc.field("m_data").value; } catch (e2) {}
            }
            if (!data || data.isNull()) return { ok: false, error: 'no data' };

            // Read basic fields
            try { res.series = data.field('series').value; } catch (e) { res.series = null; }
            try {
                var nv = data.field('name').value;
                if (nv) {
                    if (typeof nv.content !== 'undefined' && nv.content !== null) {
                        res.name = nv.content;
                    } else {
                        var ptr = nv.handle ? nv.handle : new NativePointer(nv);
                        if (!ptr.isNull()) {
                            var len = ptr.add(0x10).readS32();
                            if (len > 0 && len < 100) res.name = ptr.add(0x14).readUtf16String(len);
                        }
                    }
                }
            } catch (e) {}
            try { res.level = data.field('level').value; } catch (e) {}

            // Read faction via Controller
            var ctrl = new Il2Cpp.Object(npc.handle);
            try { res.faction = ctrl.method('GetFaction').invoke(); }
            catch (e1) {
                try {
                    var CtrlCls = img.class('game.resource.settings.npcres.Controller');
                    res.faction = CtrlCls.method('GetFaction').bind(ctrl).invoke();
                } catch (e2) { res.factionErr = '' + e2; }
            }

            // Read identify fields
            try {
                var idn = ctrl.field('identify').value;
                if (idn && !idn.isNull()) {
                    try { res.campValue = idn.field('campValue').value; } catch (e) {}
                    try { res.seriesValue = idn.field('seriesValue').value; } catch (e) {}
                    try { res.hp = idn.field('healthCurrent').value; } catch (e) {}
                    try { res.hpMax = idn.field('healthMax').value; } catch (e) {}

                    var mc = ['manaCurrent', 'mpCurrent', 'powerCurrent', 'internalCurrent'];
                    var mm = ['manaMax', 'mpMax', 'powerMax', 'internalMax'];
                    for (var mi = 0; mi < mc.length; mi++) {
                        try { var mv = idn.field(mc[mi]).value; if (mv !== null && mv !== undefined) { res.mp = mv; res.mpField = mc[mi]; break; } } catch (e) {}
                    }
                    for (var mj = 0; mj < mm.length; mj++) {
                        try { var mx = idn.field(mm[mj]).value; if (mx !== null && mx !== undefined) { res.mpMax = mx; break; } } catch (e) {}
                    }
                }
            } catch (e) { res.idErr = '' + e; }

            // Safe static mapping of Sect names and camps to prevent Access Violations
            var SECT_NAMES = {
                0: "Thieu Lam",
                1: "Thien Vuong",
                2: "Duong Mon",
                3: "Ngu Doc",
                4: "Nga My",
                5: "Thuy Yen",
                6: "Cai Bang",
                7: "Thien Nhan",
                8: "Vo Dang",
                9: "Con Lon",
                10: "Minh Giao",
                11: "Doan Thi"
            };
            res.sect = (res.faction !== undefined && res.faction !== null) ? res.faction : -1;
            res.sectName = SECT_NAMES[res.sect] || "None";
        } catch (e) { return { ok: false, error: '' + e }; }
        return res;
    });
};

rpc.exports.getMySkills = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    return Il2Cpp.perform(function () {
        var out = [];
        try {
            var pm = new Il2Cpp.Object(_playerMainInstance);
            var m = pm.method("GetSkillId", 1);
            for (var i = 0; i < 25; i++) {
                try {
                    var sid = m.invoke(i);
                    if (sid && sid > 0) out.push({ idx: i, skillId: sid });
                } catch (e) {}
            }
        } catch (e) { return { ok: false, error: '' + e }; }
        return { ok: true, skills: out };
    });
};

rpc.exports.getPlayerInfo = function() {
    var pmRes = readPlayerMainDirect();
    var pos = typeof _lastPosition !== 'undefined' ? _lastPosition : { x: 0, y: 0, eid: 0, ts: Date.now() };
    var res = {
        ok: pmRes.ok,
        playerMain: pmRes.playerMain || null,
        source: pmRes.source || null,
        error: pmRes.error || null,
        x: pos.x || 0,
        y: pos.y || 0,
        position: { x: pos.x || 0, y: pos.y || 0, eid: pos.eid || '', age: Date.now() - (pos.ts || 0) },
        recvTotal: _recvTotal,
        sendTotal: _sendTotal,
        gameFd: gameFd,
    };

    if (pmRes.ok && _playerMainInstance) {
        try {
            res.mapId = _playerMainInstance.add(0xEC).readS32();

            // ── Đọc x, y từ npcontroller chain (đáng tin cậy hơn _lastPosition) ──
            try {
                var npctrl = _playerMainInstance.add(0x20).readPointer();
                if (npctrl && !npctrl.isNull()) {
                    var posPtr = npctrl.add(0x10).readPointer();
                    if (posPtr && !posPtr.isNull()) {
                        var mapPos = posPtr.add(0x28).readPointer();
                        if (mapPos && !mapPos.isNull()) {
                            res.x = mapPos.add(0x10).readInt();
                            res.y = mapPos.add(0x14).readInt();
                            res.position = { x: res.x, y: res.y, eid: pos.eid || '', age: 0 };
                        }
                    }
                }
            } catch(e) {}
            
            var npcontroller = _playerMainInstance.add(0x20).readPointer();
            if (!npcontroller.isNull()) {
                var dataPtr = npcontroller.add(0x30).readPointer();
                if (!dataPtr.isNull() && parseInt(dataPtr.toString()) > 0x10000) {
                    // Read cid
                    var cidPtr = dataPtr.add(0x10).readPointer();
                    if (!cidPtr.isNull() && parseInt(cidPtr.toString()) > 0x10000) {
                        var cidLen = cidPtr.add(0x10).readInt();
                        if (cidLen > 0 && cidLen < 100) {
                            res.cid = cidPtr.add(0x14).readUtf16String(cidLen);
                        }
                    }
                    
                    // Read name
                    var namePtr = dataPtr.add(0x40).readPointer();
                    if (!namePtr.isNull() && parseInt(namePtr.toString()) > 0x10000) {
                        var strLen = namePtr.add(0x10).readU32();
                        if (strLen > 0 && strLen < 100) {
                            res.name = namePtr.add(0x14).readUtf16String(strLen);
                        }
                    }
                    res.level = dataPtr.add(0x54).readU32();
                }
                
                var character = npcontroller.add(0xa0).readPointer();
                if (!character.isNull() && parseInt(character.toString()) > 0x10000) {
                    res.money = character.add(0x48).readS64().toString();
                    res.sect = character.add(0x34).readU32();
                    res.level = character.add(0x58).readU32();
                    res.storageMoney = character.add(0x110).readS64().toString();
                }

                // Read HP/MP using Il2Cpp if available
                if (typeof Il2Cpp !== 'undefined') {
                    Il2Cpp.perform(function() {
                        try {
                            var ctrl = new Il2Cpp.Object(npcontroller);
                            
                            // Get Faction
                            try {
                                res.sect = ctrl.method('GetFaction').invoke();
                            } catch(e) {
                                try {
                                    var img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
                                    var CtrlCls = img.class('game.resource.settings.npcres.Controller');
                                    res.sect = CtrlCls.method('GetFaction').bind(ctrl).invoke();
                                } catch (e2) {}
                            }
                            var SECT_NAMES = {
                                0: "Thieu Lam", 1: "Thien Vuong", 2: "Duong Mon", 3: "Ngu Doc",
                                4: "Nga My", 5: "Thuy Yen", 6: "Cai Bang", 7: "Thien Nhan",
                                8: "Vo Dang", 9: "Con Lon", 10: "Minh Giao", 11: "Doan Thi"
                            };
                            if (res.sect !== undefined && res.sect !== null) {
                                res.sectName = SECT_NAMES[res.sect] || "None";
                            }
                            
                            // Get Name and Level
                            var data = null;
                            try { data = ctrl.field('data').value; } catch(e) {
                                try { data = ctrl.field('m_data').value; } catch(e2) {}
                            }
                            if (data && !data.isNull()) {
                                try {
                                    var nv = data.field('name').value;
                                    if (nv) {
                                        if (typeof nv.content !== 'undefined' && nv.content !== null) {
                                            res.name = nv.content;
                                        } else {
                                            var ptr = nv.handle ? nv.handle : new NativePointer(nv);
                                            if (!ptr.isNull()) {
                                                var len = ptr.add(0x10).readS32();
                                                if (len > 0 && len < 100) res.name = ptr.add(0x14).readUtf16String(len);
                                            }
                                        }
                                    }
                                } catch(e) {}
                                try { res.level = data.field('level').value; } catch(e) {}
                            }

                            var idn = ctrl.field('identify').value;
                            if (idn && !idn.isNull()) {
                                res.hp = idn.field('healthCurrent').value;
                                res.maxHp = idn.field('healthMax').value;
                                
                                var mc = ['manaCurrent', 'mpCurrent', 'powerCurrent', 'internalCurrent'];
                                var mm = ['manaMax', 'mpMax', 'powerMax', 'internalMax'];
                                for (var mi = 0; mi < mc.length; mi++) {
                                    try { 
                                        var mv = idn.field(mc[mi]).value; 
                                        if (mv !== null && mv !== undefined) { 
                                            res.mp = mv; 
                                            break; 
                                        } 
                                    } catch (e) {}
                                }
                                for (var mj = 0; mj < mm.length; mj++) {
                                    try { 
                                        var mx = idn.field(mm[mj]).value; 
                                        if (mx !== null && mx !== undefined) { 
                                            res.maxMp = mx; 
                                            break; 
                                        } 
                                    } catch (e) {}
                                }
                            }
                        } catch(e) {}
                    });
                }
            }
        } catch (e) {
            res.error = "Error reading fields: " + e.message;
        }
    }
    return res;
};

rpc.exports.remoteNpcDialogue = function(npcId) {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    
    return Il2Cpp.perform(function () {
        try {
            var talkFnAddr = il2cppBase.add(0xE45040);
            var talkFn = new NativeFunction(talkFnAddr, 'void', ['pointer', 'pointer']);
            
            var fn_string_new = findElfExport(il2cppBase, 'il2cpp_string_new');
            if (fn_string_new.isNull()) {
                return { ok: false, error: 'il2cpp_string_new not found' };
            }
            var il2cpp_string_new = new NativeFunction(fn_string_new, 'pointer', ['pointer']);
            var utf8NpcId = Memory.allocUtf8String(npcId);
            var csNpcId = il2cpp_string_new(utf8NpcId);
            
            talkFn(_playerMainInstance, csNpcId);
            return { ok: true };
        } catch(e) {
            return { ok: false, error: 'Talk failed: ' + e.message };
        }
    });
};

var _charManagerClass = null;
var _lastCharManagerScanTime = 0;

rpc.exports.getNearbyShops = function() {
    try {
        if (!_charManagerClass) {
            var now = Date.now();
            if (now - _lastCharManagerScanTime < 5000) {
                return { ok: false, error: 'CharManager scan throttled (Please log into character first!)' };
            }
            _lastCharManagerScanTime = now;
            var pattern = '43 68 61 72 4d 61 6e 61 67 65 72'; // "CharManager"
            var maps = File.readAllText('/proc/self/maps').split('\n');
            var metaRange = null;
            for (var i = 0; i < maps.length; i++) {
                var line = maps[i];
                if (line.indexOf('global-metadata.dat') !== -1) {
                    var parts = line.split(' ')[0].split('-');
                    metaRange = {
                        base: ptr('0x' + parts[0]),
                        size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0])
                    };
                    break;
                }
            }
            
            if (!metaRange) return { ok: false, error: 'global-metadata.dat not found' };
            
            var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
            if (results.length === 0) return { ok: false, error: '"CharManager" string not found' };
            
            var nameStrAddr = null;
            for (var rIdx = 0; rIdx < results.length; rIdx++) {
                if (results[rIdx].address.readUtf8String() === "CharManager") {
                    nameStrAddr = results[rIdx].address;
                    break;
                }
            }
            if (!nameStrAddr) return { ok: false, error: 'Exact "CharManager" string not found' };
            
            var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
            var hex = nameStrAddr.toString(16);
            while (hex.length < 16) hex = '0' + hex;
            var parts = [];
            for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
            var ptrPattern = parts.join(' ');
            
            for (var k = 0; k < allRanges.length; k++) {
                try {
                    var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                    if (matches.length > 0) {
                        for (var m = 0; m < matches.length; m++) {
                            var cand = matches[m].address.sub(0x10);
                            try {
                                var nsPtr = cand.add(0x18).readPointer();
                                var nsName = nsPtr.isNull() ? '' : nsPtr.readUtf8String();
                                var checkNamePtr = cand.add(0x10).readPointer();
                                if (checkNamePtr.toString() === nameStrAddr.toString()) {
                                    _charManagerClass = cand;
                                    break;
                                }
                            } catch(e) {}
                        }
                    }
                } catch(e) {}
                if (_charManagerClass) break;
            }
        }
        
        if (!_charManagerClass) return { ok: false, error: 'CharManager class not found' };
        
        var staticFields = _charManagerClass.add(0xB8).readPointer();
        if (staticFields.isNull()) return { ok: false, error: 'CharManager static_fields is null' };
        
        var charManagerInstance = staticFields.readPointer();
        if (charManagerInstance.isNull()) return { ok: false, error: 'CharManager.instance is null' };
        
        var myX = 0, myY = 0;
        try {
            var worldPtr = charManagerInstance.add(0x20).readPointer();
            if (!worldPtr.isNull() && parseInt(worldPtr.toString()) > 0x10000) {
                var playerMainPtr = worldPtr.add(0x40).readPointer();
                if (!playerMainPtr.isNull() && parseInt(playerMainPtr.toString()) > 0x10000) {
                    var npcontroller = playerMainPtr.add(0x20).readPointer();
                    if (!npcontroller.isNull() && parseInt(npcontroller.toString()) > 0x10000) {
                        var positionPtr = npcontroller.add(0x10).readPointer();
                        if (!positionPtr.isNull() && parseInt(positionPtr.toString()) > 0x10000) {
                            var mapPosPtr = positionPtr.add(0x28).readPointer();
                            if (!mapPosPtr.isNull() && parseInt(mapPosPtr.toString()) > 0x10000) {
                                myX = mapPosPtr.add(0x10).readInt();
                                myY = mapPosPtr.add(0x14).readInt();
                                console.log("[Shop] Player coords from npcontroller: " + myX + ", " + myY);
                            }
                        }
                    }
                }
            }
        } catch(e) {
            console.log("[Shop] Error resolving player coords: " + e.message);
        }
        if (myX === 0 && myY === 0 && typeof _lastPosition !== 'undefined' && _lastPosition) {
            myX = _lastPosition.x || 0;
            myY = _lastPosition.y || 0;
        }
        
        var salesmansDict = charManagerInstance.add(0x58).readPointer();
        var shops = [];
        
        if (!salesmansDict.isNull()) {
            var entriesArray = salesmansDict.add(0x18).readPointer();
            if (!entriesArray.isNull()) {
                var maxLength = entriesArray.add(0x18).readU32();
                for (var idx = 0; idx < maxLength; idx++) {
                    var entryAddr = entriesArray.add(0x20).add(idx * 24);
                    var valuePtr = entryAddr.add(16).readPointer();
                    
                    if (!valuePtr.isNull() && parseInt(valuePtr.toString()) > 0x10000) {
                        var dataPtr = valuePtr.add(0x30).readPointer();
                        if (!dataPtr.isNull() && parseInt(dataPtr.toString()) > 0x10000) {
                            var name = '';
                            var namePtr = dataPtr.add(0x40).readPointer();
                            if (!namePtr.isNull() && parseInt(namePtr.toString()) > 0x10000) {
                                var strLen = namePtr.add(0x10).readU32();
                                if (strLen > 0 && strLen < 100) {
                                    name = namePtr.add(0x14).readUtf16String(strLen);
                                }
                            }
                            
                            var cid = '';
                            var cidPtr = dataPtr.add(0x10).readPointer();
                            if (!cidPtr.isNull() && parseInt(cidPtr.toString()) > 0x10000) {
                                var cidLen = cidPtr.add(0x10).readInt();
                                if (cidLen > 0 && cidLen < 100) {
                                    cid = cidPtr.add(0x14).readUtf16String(cidLen);
                                }
                            }
                            
                            var isSalesman = dataPtr.add(0x69).readU8();
                            var level = dataPtr.add(0x54).readU32();
                            
                            // Query shop position: NpcRes.Special (valuePtr) -> position (0x10) -> mapPosition (0x28) -> top/left (0x10/0x14)
                            var x = 0, y = 0;
                            try {
                                var positionPtr = valuePtr.add(0x10).readPointer();
                                if (!positionPtr.isNull() && parseInt(positionPtr.toString()) > 0x10000) {
                                    var mapPosPtr = positionPtr.add(0x28).readPointer();
                                    if (!mapPosPtr.isNull() && parseInt(mapPosPtr.toString()) > 0x10000) {
                                        x = mapPosPtr.add(0x10).readInt();
                                        y = mapPosPtr.add(0x14).readInt();
                                    }
                                }
                            } catch(e) {}
                            
                            var dist = 999999;
                            if (x > 0 && y > 0 && myX > 0 && myY > 0) {
                                dist = Math.sqrt((x - myX) * (x - myX) + (y - myY) * (y - myY));
                            }
                            
                            shops.push({
                                name: name,
                                cid: cid,
                                level: level,
                                isSalesman: isSalesman,
                                x: x,
                                y: y,
                                distance: dist
                            });
                        }
                    }
                }
            }
        }
        
        // Sort nearest shops first
        shops.sort(function(a, b) {
            return a.distance - b.distance;
        });
        
        return { ok: true, shops: shops };
    } catch (e) {
        return { ok: false, error: e.message };
    }
};

rpc.exports.invalidatePlayerMain = function() {
    _playerMainInstance = null;
    _charManagerClass = null;
    _netCoreManagerClass = null;
    _popUpCanvasClass = null;
    _byteClass = null;
    _localShopHookOn = false;
    return { ok: true };
};

var _netCoreManagerClass = null;
function getNetCoreManagerInstance() {
    if (!_netCoreManagerClass) {
        var now = Date.now();
        if (now - _lastNetCoreScanTime < 5000) {
            console.log("[NetCore] Throttled return null");
            return null;
        }
        _lastNetCoreScanTime = now;
        var pattern = '4e 65 74 43 6f 72 65 4d 61 6e 61 67 65 72'; // "NetCoreManager"
        var maps = File.readAllText('/proc/self/maps').split('\n');
        var metaRange = null;
        for (var i = 0; i < maps.length; i++) {
            var line = maps[i];
            if (line.indexOf('global-metadata.dat') !== -1) {
                var parts = line.split(' ')[0].split('-');
                metaRange = {
                    base: ptr('0x' + parts[0]),
                    size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0])
                };
                break;
            }
        }
        if (!metaRange) {
            console.log("[NetCore] No global-metadata.dat range found!");
            return null;
        }
        
        var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
        if (results.length === 0) {
            console.log("[NetCore] NetCoreManager string not found in global-metadata!");
            return null;
        }
        
        var nameStrAddr = null;
        for (var rIdx = 0; rIdx < results.length; rIdx++) {
            if (results[rIdx].address.readUtf8String() === "NetCoreManager") {
                nameStrAddr = results[rIdx].address;
                break;
            }
        }
        if (!nameStrAddr) {
            console.log("[NetCore] Exact NetCoreManager string not found in global-metadata!");
            return null;
        }
        
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var hex = nameStrAddr.toString(16);
        while (hex.length < 16) hex = '0' + hex;
        var parts = [];
        for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
        var ptrPattern = parts.join(' ');
        
        for (var k = 0; k < allRanges.length; k++) {
            try {
                var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                if (matches.length > 0) {
                    for (var m = 0; m < matches.length; m++) {
                        var cand = matches[m].address.sub(0x10);
                        try {
                            var nsPtr = cand.add(0x18).readPointer();
                            var nsName = nsPtr.isNull() ? '' : nsPtr.readUtf8String();
                            var checkNamePtr = cand.add(0x10).readPointer();
                            if (checkNamePtr.toString() === nameStrAddr.toString()) {
                                _netCoreManagerClass = cand;
                                console.log("[NetCore] Found NetCoreManager class at: " + _netCoreManagerClass);
                                break;
                            }
                        } catch(e) {}
                    }
                }
            } catch(e) {}
            if (_netCoreManagerClass) break;
        }
    }
    if (!_netCoreManagerClass) {
        console.log("[NetCore] NetCoreManager class not found in memory!");
        return null;
    }
    var staticFields = _netCoreManagerClass.add(0xB8).readPointer();
    if (staticFields.isNull()) {
        console.log("[NetCore] staticFields is null!");
        return null;
    }
    var instance = staticFields.readPointer();
    if (instance.isNull()) {
        console.log("[NetCore] instance pointer in staticFields is null!");
        return null;
    }
    return instance;
}

var _popUpCanvasClass = null;
function getPopUpCanvasInstance() {
    if (!_popUpCanvasClass) {
        var now = Date.now();
        if (now - _lastPopUpCanvasScanTime < 5000) {
            return null;
        }
        _lastPopUpCanvasScanTime = now;
        var pattern = '50 6f 70 55 70 43 61 6e 76 61 73'; // "PopUpCanvas"
        var maps = File.readAllText('/proc/self/maps').split('\n');
        var metaRange = null;
        for (var i = 0; i < maps.length; i++) {
            var line = maps[i];
            if (line.indexOf('global-metadata.dat') !== -1) {
                var parts = line.split(' ')[0].split('-');
                metaRange = {
                    base: ptr('0x' + parts[0]),
                    size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0])
                };
                break;
            }
        }
        if (!metaRange) return null;
        var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
        if (results.length === 0) return null;
        
        var nameStrAddr = null;
        for (var rIdx = 0; rIdx < results.length; rIdx++) {
            if (results[rIdx].address.readUtf8String() === "PopUpCanvas") {
                nameStrAddr = results[rIdx].address;
                break;
            }
        }
        if (!nameStrAddr) return null;
        
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var hex = nameStrAddr.toString(16);
        while (hex.length < 16) hex = '0' + hex;
        var parts = [];
        for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
        var ptrPattern = parts.join(' ');
        
        for (var k = 0; k < allRanges.length; k++) {
            try {
                var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                if (matches.length > 0) {
                    for (var m = 0; m < matches.length; m++) {
                        var cand = matches[m].address.sub(0x10);
                        try {
                            var nsPtr = cand.add(0x18).readPointer();
                            var nsName = nsPtr.isNull() ? '' : nsPtr.readUtf8String();
                            var checkNamePtr = cand.add(0x10).readPointer();
                            if (checkNamePtr.toString() === nameStrAddr.toString()) {
                                _popUpCanvasClass = cand;
                                break;
                            }
                        } catch(e) {}
                    }
                }
            } catch(e) {}
            if (_popUpCanvasClass) break;
        }
    }
    if (!_popUpCanvasClass) return null;
    var staticFields = _popUpCanvasClass.add(0xB8).readPointer();
    if (staticFields.isNull()) return null;
    return staticFields.readPointer();
}

var _byteClass = null;
function getByteClass() {
    if (_byteClass) return _byteClass;
    try {
        var il2cppBase = getIl2CppBase();
        var fn_domain_get = findElfExport(il2cppBase, 'il2cpp_domain_get');
        var fn_domain_assembly_open = findElfExport(il2cppBase, 'il2cpp_domain_assembly_open');
        var fn_assembly_get_image = findElfExport(il2cppBase, 'il2cpp_assembly_get_image');
        var fn_class_from_name = findElfExport(il2cppBase, 'il2cpp_class_from_name');

        var domainGet = new NativeFunction(fn_domain_get, 'pointer', []);
        var domainAssemblyOpen = new NativeFunction(fn_domain_assembly_open, 'pointer', ['pointer', 'pointer']);
        var assemblyGetImage = new NativeFunction(fn_assembly_get_image, 'pointer', ['pointer']);
        var classFromName = new NativeFunction(fn_class_from_name, 'pointer', ['pointer', 'pointer', 'pointer']);
        
        var domain = domainGet();
        var mscorlib = domainAssemblyOpen(domain, Memory.allocUtf8String('mscorlib'));
        var image = assemblyGetImage(mscorlib);
        _byteClass = classFromName(image, Memory.allocUtf8String('System'), Memory.allocUtf8String('Byte'));
    } catch(e) {}
    return _byteClass;
}

function createCSharpByteArray(jsArray) {
    var il2cppBase = getIl2CppBase();
    var fn_array_new = findElfExport(il2cppBase, 'il2cpp_array_new');
    if (!fn_array_new || fn_array_new.isNull()) {
        throw new Error('il2cpp_array_new is null');
    }
    var il2cpp_array_new = new NativeFunction(fn_array_new, 'pointer', ['pointer', 'uint32']);
    var byteClass = getByteClass();
    if (!byteClass || byteClass.isNull()) {
        throw new Error('Byte class is null');
    }
    var arr = il2cpp_array_new(byteClass, jsArray.length);
    if (!arr || arr.isNull()) {
        throw new Error('il2cpp_array_new returned null');
    }
    var offset = (Process.pointerSize === 8) ? 0x20 : 0x10;
    var rawData = arr.add(offset);
    for (var i = 0; i < jsArray.length; i++) {
        rawData.add(i).writeU8(jsArray[i]);
    }
    return arr;
}

var _localShopHookOn = false;

// Protobuf helpers for packet-based shop scanning
function buildProtobufString(fieldNumber, value) {
    var tag = (fieldNumber << 3) | 2;
    var utf8Bytes = [];
    for (var i = 0; i < value.length; i++) {
        var cp = value.charCodeAt(i);
        if (cp < 0x80) { utf8Bytes.push(cp); }
        else if (cp < 0x800) { utf8Bytes.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F)); }
        else { utf8Bytes.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F)); }
    }
    var result = [tag];
    var len = utf8Bytes.length;
    while (len > 0x7F) { result.push((len & 0x7F) | 0x80); len >>= 7; }
    result.push(len);
    for (var j = 0; j < utf8Bytes.length; j++) result.push(utf8Bytes[j]);
    return result;
}

function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
        var h = bytes[i].toString(16);
        if (h.length === 1) h = '0' + h;
        hex += h;
    }
    return hex;
}

rpc.exports.getShopItems = function(stallIndex) {
    return new Promise(function(resolve, reject) {
        try {
            console.log("[Shop] Bat dau getShopItems voi stallIndex: " + stallIndex);
            
            // === ONE-TIME AddItem hook (intercepts runtime Item data) ===
            if (!globalThis._addItemHooked) {
                try {
                    var il2cppBase = getIl2CppBase();
                    var addItemAddr = il2cppBase.add(0xE9039C); // PlayerOtherStall.AddItem
                    Interceptor.attach(addItemAddr, {
                        onEnter: function(args) {
                            var itemPtr = args[1];
                            var money = args[2].toInt32();
                            var knb = args[3].toInt32();
                            try {
                                var g = itemPtr.add(0x44).readU32();
                                var d = itemPtr.add(0x48).readU32();
                                var p = itemPtr.add(0x4C).readU32();
                                var l = itemPtr.add(0x50).readU32();
                                var s = itemPtr.add(0x54).readU32();
                                var name = '?';
                                try {
                                    var eq = itemPtr.add(0x20).readPointer();
                                    if (!eq.isNull()) {
                                        var nm = eq.add(0x18).readPointer();
                                        if (!nm.isNull()) {
                                            var nl = nm.add(0x10).readU32();
                                            if (nl > 0 && nl < 200) name = nm.add(0x14).readUtf16String(nl);
                                        }
                                    }
                                } catch(e) {}
                                var magics = [];
                                try {
                                    var ml = itemPtr.add(0x38).readPointer();
                                    if (!ml.isNull()) {
                                        var ma = ml.add(0x10).readPointer();
                                        var mc = ml.add(0x18).readU32();
                                        if (!ma.isNull() && mc > 0 && mc < 50)
                                            for (var m = 0; m < mc; m++) {
                                                magics.push(ma.add(m * 8 + 0x10).readS32());
                                                magics.push(ma.add(m * 8 + 0x14).readS32());
                                            }
                                    }
                                } catch(e) {}
                                var entry = { name: name, money: money, knb: knb, genre: g, detail: d, particular: p, level: l, series: s, magics: magics };
                                if (!globalThis._shopAddItems) globalThis._shopAddItems = [];
                                globalThis._shopAddItems.push(entry);
                                console.log("[AddItem] " + name + " G=" + g + " D=" + d + " $" + money + " KNB=" + knb);
                            } catch(e3) {}
                        }
                    });
                    globalThis._addItemHooked = true;
                    console.log("[Shop] AddItem hook installed");
                } catch(e) { console.log("[Shop] AddItem hook failed: " + e.message); }
            }
            globalThis._shopAddItems = [];
            
            // === Read shop data ===
            var popUpCanvasInstance = getPopUpCanvasInstance();
            if (!popUpCanvasInstance || popUpCanvasInstance.isNull()) {
                resolve({ ok: false, error: 'PopUpCanvas instance is null' }); return;
            }
            var playerOtherStall = popUpCanvasInstance.add(0xA8).readPointer();
            if (playerOtherStall.isNull()) {
                resolve({ ok: false, error: 'playerOtherStall is null' }); return;
            }
            var initialStall = playerOtherStall.add(0xA0).readPointer();
            console.log("[Shop] initialStall: " + initialStall);
            
            var initialStall = playerOtherStall.add(0xA0).readPointer();
            console.log("[Shop] initialStall: " + initialStall);
            
            // Always send opcode 204 — server will respond and trigger AddItem
            // even if stall was already loaded
            var stallKey = "salesman." + stallIndex + ".0";
            var protoBody = buildProtobufString(1, stallKey);
            rpc.exports.sendPacket(204, bytesToHex(protoBody));
            console.log("[Shop] Sent opcode 204 for stall: " + stallKey);
            
            var attempts = 200;
            function checkResponse() {
                try {
                    // Priority 1: AddItem hook captured data
                    if (globalThis._shopAddItems && globalThis._shopAddItems.length > 0) {
                        var items = globalThis._shopAddItems;
                        globalThis._shopAddItems = [];
                        var title = stallKey;
                        try {
                            var cs = playerOtherStall.add(0xA0).readPointer();
                            if (!cs.isNull()) {
                                var tp = cs.add(0x18).readPointer();
                                if (!tp.isNull()) {
                                    var tLen = tp.add(0x10).readU32();
                                    if (tLen > 0 && tLen < 200) title = tp.add(0x14).readUtf16String(tLen);
                                }
                            }
                        } catch(e) {}
                        console.log("[Shop] Got " + items.length + " items from AddItem hook!");
                        resolve({ ok: true, title: title, items: items });
                        return;
                    }
                    // Priority 2: Stall appeared in memory (fallback)
                    var cs = playerOtherStall.add(0xA0).readPointer();
                    if (!cs.isNull() && cs.toString() !== initialStall.toString()) {
                        console.log("[Shop] Stall loaded, reading from memory fallback...");
                        readStallFromMemory(cs, resolve); return;
                    }
                    if (attempts > 0) { attempts--; setTimeout(checkResponse, 50); }
                    else { 
                        // Last resort: try memory read on whatever is there
                        var cs2 = playerOtherStall.add(0xA0).readPointer();
                        if (!cs2.isNull()) {
                            console.log("[Shop] Timeout but stall exists, trying memory read...");
                            readStallFromMemory(cs2, resolve);
                        } else {
                            resolve({ ok: false, error: 'Timeout waiting for shop data (no AddItem, no stall)' }); 
                        }
                    }
                } catch(e) { resolve({ ok: false, error: e.message }); }
            }
            setTimeout(checkResponse, 100);
            
            // === Memory-based reader: LinkedList<KeyValuePair<int,SalesmanItem>> ===
            function readStallFromMemory(currentStall, resolve) {
                try {
                    var titlePtr = currentStall.add(0x18).readPointer();
                    var title = '';
                    try {
                        if (!titlePtr.isNull()) {
                            var tLen = titlePtr.add(0x10).readU32();
                            if (tLen > 0 && tLen < 200) title = titlePtr.add(0x14).readUtf16String(tLen);
                        }
                    } catch(e) {}
                    
                    var items = [];
                    
                    // MapField<int,SalesmanItem> at currentStall+0x28
                    // MapField layout: map(Dictionary)@0x10, list(LinkedList)@0x18
                    var mapField = currentStall.add(0x28).readPointer();
                    console.log("[Shop] mapField(items_) = " + mapField);
                    
                    if (!mapField.isNull()) {
                        // LinkedList<KeyValuePair<int,SalesmanItem>> at mapField+0x18
                        var linkedList = mapField.add(0x18).readPointer();
                        console.log("[Shop] linkedList = " + linkedList);
                        
                        if (!linkedList.isNull()) {
                            // LinkedList layout: head@0x10, count@0x18, version@0x1C
                            var head = linkedList.add(0x10).readPointer();
                            var count = linkedList.add(0x18).readU32();
                            console.log("[Shop] LinkedList head=" + head + " count=" + count);
                            
                            if (!head.isNull() && count > 0 && count < 200) {
                                // LinkedListNode<KeyValuePair<int,SalesmanItem>>:
                                //   list@0x10, next@0x18, prev@0x20, item@0x28
                                // KeyValuePair<int,SalesmanItem> (struct inline at node+0x28):
                                //   key:int@0x00, value:ptr@0x08
                                var node = head;
                                var idx = 0;
                                while (!node.isNull() && idx < count) {
                                    try {
                                        // KeyValuePair is inline struct at node+0x28
                                        var kvpAddr = node.add(0x28);
                                        var key = kvpAddr.add(0x00).readS32();
                                        var smPtr = kvpAddr.add(0x08).readPointer();
                                        
                                        if (!smPtr.isNull() && parseInt(smPtr.toString()) > 0x10000) {
                                            // SalesmanItem: _unknownFields@0x10, item_@0x18, money_@0x20, knb_@0x24
                                            var itemPtr = smPtr.add(0x18).readPointer();
                                            var money = smPtr.add(0x20).readS32() || 0;
                                            var knb = smPtr.add(0x24).readS32() || 0;
                                            
                                            var genre = 0, detail = 0, particular = 0, level = 0, series = 0;
                                            var name = '';
                                            var magics = [];
                                            
                                            if (!itemPtr.isNull() && parseInt(itemPtr.toString()) > 0x10000) {
                                                // App.Item protobuf:
                                                //   _unknownFields@0x10, identify_@0x18, rowIndexAndType_@0x1C
                                                //   detailAndGenre_@0x20, particularAndLevel_@0x24
                                                //   stackAndSeries_@0x28, durabilityAndLockState_@0x2C
                                                //   createTimestampSeconds_@0x30, sourceCid_@0x38, sourceName_@0x40
                                                //   state_:RepeatedField<long>@0x48, magic_:RepeatedField<int>@0x50
                                                
                                                var detailAndGenre = itemPtr.add(0x20).readS32();
                                                genre = detailAndGenre & 0xFFFF;
                                                detail = (detailAndGenre >> 16) & 0xFFFF;
                                                
                                                var particularAndLevel = itemPtr.add(0x24).readS32();
                                                level = particularAndLevel & 0xFFFF;
                                                particular = (particularAndLevel >> 16) & 0xFFFF;
                                                
                                                var stackAndSeries = itemPtr.add(0x28).readS32();
                                                series = stackAndSeries & 0xFFFF;
                                                
                                                // Try to read magic_
                                                try {
                                                    var magicField = itemPtr.add(0x50).readPointer();
                                                    if (!magicField.isNull()) {
                                                        var magicItems = magicField.add(0x10).readPointer();
                                                        var magicCount = magicField.add(0x18).readU32();
                                                        if (!magicItems.isNull() && magicCount > 0 && magicCount < 50) {
                                                            for (var mi = 0; mi < magicCount; mi++) {
                                                                magics.push(magicItems.add(0x20 + mi * 4).readS32());
                                                            }
                                                        }
                                                    }
                                                } catch(e) {}
                                                
                                                name = 'G' + genre + 'D' + detail + 'P' + particular + 'L' + level;
                                            }
                                            
                                            items.push({
                                                name: name,
                                                genre: genre, detail: detail,
                                                particular: particular, level: level, series: series,
                                                money: money, knb: knb, magics: magics, idx: key
                                            });
                                        }
                                    } catch(e2) {}
                                    
                                    // Move to next node
                                    node = node.add(0x18).readPointer();
                                    idx++;
                                }
                                console.log("[Shop] LinkedList read: " + items.length + " items from " + count + " nodes");
                            }
                        }
                    }
                    resolve({ ok: true, title: title, items: items });
                } catch(err) {
                    console.log("[Shop] readStallFromMemory error: " + err.message);
                    resolve({ ok: false, error: 'Memory read error: ' + err.message });
                }
            }
        } catch(e) {
            resolve({ ok: false, error: e.message });
        }
    });
};

