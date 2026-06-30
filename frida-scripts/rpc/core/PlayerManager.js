// frida-scripts/rpc/core/PlayerManager.js -- Player info RPC exports (sect, skills, position)

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

rpc.exports.getNearNpcsDetail = function() {
    try {
        var npcs = [];
        
        // 1. Try to read from global npcCache if we hooked it
        if (typeof globalThis.npcCache !== 'undefined' && globalThis.npcCache) {
            for (var cid in globalThis.npcCache) {
                npcs.push({ id: cid, name: globalThis.npcCache[cid], source: 'hook_cache' });
            }
            if (npcs.length > 0) return { ok: true, npcs: npcs };
        }
        
        // 2. Không quét Memory hay Il2Cpp nữa để đảm bảo 100% không đơ game.
        // Chỉ dựa vào việc HỌC ID bằng cách bắt gói tin.
        return { ok: true, npcs: npcs };
        
        // 2. Try to read from CharManager.NpcRes (Memory Scan)
        if (!_charManagerClass) {
            // Read CharManager class like in getNearbyShops
            var maps = File.readAllText('/proc/self/maps').split('\n');
            var metaRange = null;
            for (var i = 0; i < maps.length; i++) {
                if (maps[i].indexOf('global-metadata.dat') !== -1) {
                    var parts = maps[i].split(' ')[0].split('-');
                    metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                    break;
                }
            }
            if (metaRange) {
                var pattern = '43 68 61 72 4d 61 6e 61 67 65 72'; // "CharManager"
                var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
                var nameStrAddr = null;
                for (var rIdx = 0; rIdx < results.length; rIdx++) {
                    if (results[rIdx].address.readUtf8String() === "CharManager") {
                        nameStrAddr = results[rIdx].address;
                        break;
                    }
                }
                
                if (nameStrAddr) {
                    var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
                    var ptrSize = Process.pointerSize;
                    var hex = nameStrAddr.toString(16);
                    var padLen = (ptrSize === 8) ? 16 : 8;
                    while (hex.length < padLen) hex = '0' + hex;
                    var parts = [];
                    for (var j = padLen - 2; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
                    var ptrPattern = parts.join(' ');
                    
                    for (var k = 0; k < allRanges.length; k++) {
                        try {
                            var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                            if (matches.length > 0) {
                                for (var m = 0; m < matches.length; m++) {
                                    var cand = matches[m].address.sub(0x10);
                                    var checkNamePtr = cand.add(0x10).readPointer();
                                    if (checkNamePtr.toString() === nameStrAddr.toString()) {
                                        _charManagerClass = cand;
                                        break;
                                    }
                                }
                            }
                        } catch(e) {}
                        if (_charManagerClass) break;
                    }
                }
            }
        }
        if (!_charManagerClass) {
            send({ type: 'log', message: 'ERROR: _charManagerClass is null after scanning! metaRange: ' + JSON.stringify(metaRange) });
        }
        
        if (_charManagerClass) {
            send({ type: 'log', message: 'Using CharManager class: ' + _charManagerClass });
            var staticFields = _charManagerClass.add(0xB8).readPointer();
            if (!staticFields.isNull()) {
                var charManagerInstance = staticFields.readPointer();
                if (!charManagerInstance.isNull()) {
                    send({ type: 'log', message: 'Found CharManager instance: ' + charManagerInstance });
                    var ptrSize = Process.pointerSize;
                    var entriesOffset = (ptrSize === 8) ? 0x18 : 0x0C;
                    var countOffset = (ptrSize === 8) ? 0x20 : 0x10;
                    
                    // Dynamically scan for valid dictionaries
                    for (var offset = 0x20; offset < 0xa0; offset += ptrSize) {
                        try {
                            var dict = charManagerInstance.add(offset).readPointer();
                            if (dict.isNull() || parseInt(dict.toString()) < 0x1000) continue;
                            
                            var entriesArray = dict.add(entriesOffset).readPointer();
                            if (entriesArray.isNull() || parseInt(entriesArray.toString()) < 0x1000) continue;
                            
                            var count = dict.add(countOffset).readU32();
                            var arrayLenOffset = (ptrSize === 8) ? 0x18 : 0x0C;
                            var maxLength = entriesArray.add(arrayLenOffset).readU32();
                            send({ type: 'log', message: 'Offset 0x' + offset.toString(16) + ' | dict=' + dict + ' | entries=' + entriesArray + ' | count=' + count + ' | max=' + maxLength });
                            if (count > 0 && count < 5000) {
                                if (maxLength >= count && maxLength < 5000) {
                                    send({ type: 'log', message: 'Scanning dict at offset 0x' + offset.toString(16) + ' with ' + count + ' items' });
                                    var dictNpcs = [];
                            for (var idx = 0; idx < maxLength; idx++) {
                                try {
                                    var arrayStartOffset = (ptrSize === 8) ? 0x20 : 0x10;
                                    var entrySize = (ptrSize === 8) ? 24 : 16;
                                    var entryAddr = entriesArray.add(arrayStartOffset).add(idx * entrySize);
                                    var key = entryAddr.add(8).readU32(); // The runtime ID is the dictionary key!
                                    var valueOffset = (ptrSize === 8) ? 16 : 12;
                                    var valuePtr = entryAddr.add(valueOffset).readPointer();
                                    if (!valuePtr.isNull() && parseInt(valuePtr.toString()) > 0x1000) {
                                        var dataOffset = (ptrSize === 8) ? 0x30 : 0x18; // NpcRes.Special->data? Let's check pointer
                                        var dataPtr = valuePtr.add(dataOffset).readPointer();
                                        if (dataPtr.isNull() || parseInt(dataPtr.toString()) < 0x1000) {
                                            // Fallback for 32-bit offset 0x1C maybe?
                                            dataOffset = (ptrSize === 8) ? 0x30 : 0x1C;
                                            dataPtr = valuePtr.add(dataOffset).readPointer();
                                        }
                                        if (!dataPtr.isNull() && parseInt(dataPtr.toString()) > 0x1000) {
                                            var name = '';
                                            var nameOffset = (ptrSize === 8) ? 0x40 : 0x28; // NpcData->name pointer
                                            var namePtr = dataPtr.add(nameOffset).readPointer();
                                            if (namePtr.isNull() || parseInt(namePtr.toString()) < 0x1000) {
                                                // Fallback 
                                                nameOffset = (ptrSize === 8) ? 0x40 : 0x24;
                                                namePtr = dataPtr.add(nameOffset).readPointer();
                                            }
                                            if (!namePtr.isNull() && parseInt(namePtr.toString()) > 0x1000) {
                                                var strLenOffset = (ptrSize === 8) ? 0x10 : 0x08;
                                                var strLen = namePtr.add(strLenOffset).readU32();
                                                var strCharsOffset = (ptrSize === 8) ? 0x14 : 0x0C;
                                                if (strLen > 0 && strLen < 100) name = namePtr.add(strCharsOffset).readUtf16String(strLen);
                                            }
                                            
                                            if (key > 0 && name) {
                                                npcs.push({ id: key.toString(), name: name, source: 'memory_scan' });
                                            }
                                        }
                                    }
                                        } catch (e) {
                                            // Skip invalid entry
                                        }
                                    }
                                }
                            }
                        } catch (e) {}
                    }
                }
            }
        }

        if (npcs.length === 0) {
            send({ type: 'log', message: 'CharManager dict empty. Using Direct String Memory Scan fallback...' });
            var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
            var targets = [
                { name: "Quân Nhu", pattern: '51 00 75 00 e2 00 6e 00 20 00 4e 00 68 00 75 00' },
                { name: "Trinh Sát", pattern: '54 00 72 00 69 00 6e 00 68 00 20 00 53 00' },
                { name: "Mã binh quan", pattern: '4d 00 e3 00 20 00 62 00 69 00 6e 00 68 00' },
                { name: "Chiêu Binh Quân", pattern: '43 00 68 00 69 00 ea 00 75 00 20 00 42 00 69 00' }
            ];
            
            for (var t = 0; t < targets.length; t++) {
                var target = targets[t];
                var foundId = null;
                for (var i = 0; i < allRanges.length && !foundId; i++) {
                    try {
                        var matches = Memory.scanSync(allRanges[i].base, allRanges[i].size, target.pattern);
                        for (var m = 0; m < matches.length && !foundId; m++) {
                            var strAddr = matches[m].address;
                            var strObj = strAddr.sub(0x14); 
                            
                            var hex = strObj.toString(16);
                            while(hex.length < 16) hex = '0' + hex;
                            var parts = [];
                            for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
                            var ptrPattern = parts.join(' ');
                            
                            for (var k = 0; k < allRanges.length && !foundId; k++) {
                                try {
                                    var ptrMatches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                                    for (var pm = 0; pm < ptrMatches.length && !foundId; pm++) {
                                        var objAddr = ptrMatches[pm].address;
                                        try {
                                            for(var offset = -0x50; offset <= -0x10; offset += 4) {
                                                var val = objAddr.add(offset).readU32();
                                                if (val > 10000 && val < 90000) {
                                                    // This is a high probability runtime ID
                                                    var checkNext = objAddr.add(offset - 4).readU32();
                                                    var checkPrev = objAddr.add(offset + 4).readU32();
                                                    // In our dump, we saw multiple IDs clumped. 
                                                    foundId = val.toString();
                                                    npcs.push({ id: foundId, name: "Tống Kim " + target.name, source: 'deep_scan' });
                                                    send({ type: 'log', message: 'Deep Scan found ' + target.name + ' -> ID: ' + foundId });
                                                    break;
                                                }
                                            }
                                        } catch(e){}
                                    }
                                } catch(e) {}
                            }
                        }
                    } catch(e) {}
                }
            }
        }

        return { ok: true, npcs: npcs };
    } catch (e) {
        return { ok: false, error: e.message };
    }
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
        position: { x: pos.x, y: pos.y, eid: pos.eid, age: Date.now() - pos.ts },
        recvTotal: typeof _recvTotal !== 'undefined' ? _recvTotal : 0,
        sendTotal: typeof _sendTotal !== 'undefined' ? _sendTotal : 0,
        gameFd: typeof gameFd !== 'undefined' ? gameFd : -1,
    };

    if (pmRes.ok && _playerMainInstance) {
        try {
            res.mapId = _playerMainInstance.add(0xE4).readS32();
            
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
                    var SECT_NAMES = {
                        0: "Thiếu Lâm", 1: "Thiên Vương", 2: "Đường Môn", 3: "Ngũ Độc",
                        4: "Nga Mi", 5: "Thúy Yên", 6: "Cái Bang", 7: "Thiên Nhẫn",
                        8: "Võ Đang", 9: "Côn Lôn", 10: "Minh Giáo", 11: "Đoàn Thị"
                    };
                    res.sectName = SECT_NAMES[res.sect] || "Chưa rõ";
                    res.level = character.add(0x58).readU32();
                    res.storageMoney = character.add(0x110).readS64().toString();
                }

                // Read HP/MP using Il2Cpp if available
                if (typeof Il2Cpp !== 'undefined') {
                    Il2Cpp.perform(function() {
                        try {
                            var ctrl = new Il2Cpp.Object(npcontroller);
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

rpc.exports.invalidatePlayerMain = function() {
    _playerMainInstance = null;
    if (typeof _charManagerClass !== 'undefined') _charManagerClass = null;
    if (typeof _netCoreManagerClass !== 'undefined') _netCoreManagerClass = null;
    if (typeof _popUpCanvasClass !== 'undefined') _popUpCanvasClass = null;
    if (typeof _byteClass !== 'undefined') _byteClass = null;
    return { ok: true };
};
