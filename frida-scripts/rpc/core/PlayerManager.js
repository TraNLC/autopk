// frida-scripts/rpc/core/PlayerManager.js -- Player info RPC exports (sect, skills, position)

function callNativeIl2Cpp(exportName, retType, argTypes, args) {
    if (typeof il2cppBase === 'undefined' || !il2cppBase) return null;
    var exp = findElfExport(il2cppBase, exportName);
    if (!exp || exp.isNull()) return null;
    var fn = new NativeFunction(exp, retType, argTypes);
    return fn.apply(null, args);
}

rpc.exports.getMySect = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    var res = { ok: true };
    try {
        var npcontroller = _playerMainInstance.add(0x20).readPointer();
        if (!npcontroller.isNull()) {
            var idnPtr = npcontroller.add(0x28).readPointer();
            if (!idnPtr.isNull()) {
                res.series = idnPtr.add(0x54).readInt();
            }
            var dataPtr = npcontroller.add(0x30).readPointer();
            if (!dataPtr.isNull() && parseInt(dataPtr.toString()) > 0x10000) {
                var namePtr = dataPtr.add(0x40).readPointer();
                if (!namePtr.isNull() && parseInt(namePtr.toString()) > 0x10000) {
                    var strLen = namePtr.add(0x10).readU32();
                    if (strLen > 0 && strLen < 100) {
                        res.name = namePtr.add(0x14).readUtf16String(strLen);
                    }
                }
            }
            var character = npcontroller.add(0xa0).readPointer();
            if (!character.isNull() && parseInt(character.toString()) > 0x10000) {
                res.faction = character.add(0x34).readU32();
            }
        }
        var SECT_NAMES = {
            0: "Thieu Lam", 1: "Thien Vuong", 2: "Duong Mon", 3: "Ngu Doc",
            4: "Nga My", 5: "Thuy Yen", 6: "Cai Bang", 7: "Thien Nhan",
            8: "Vo Dang", 9: "Con Lon", 10: "Minh Giao", 11: "Doan Thi"
        };
        res.sect = (res.faction !== undefined && res.faction !== null) ? res.faction : -1;
        res.sectName = SECT_NAMES[res.sect] || "None";
    } catch (e) { return { ok: false, error: '' + e }; }
    return res;
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
        
        return { ok: true, npcs: npcs };
    } catch (e) {
        return { ok: false, error: e.message };
    }
};

rpc.exports.getMySkills = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    
    var out = [];
    try {
        console.log("[getMySkills] playerMainInstance=" + _playerMainInstance);
        var getSkillIdAddr = null;
        try {
            var domain = callNativeIl2Cpp('il2cpp_domain_get', 'pointer', [], []);
            console.log("[getMySkills] domain=" + domain);
            if (domain && !domain.isNull()) {
                var assembly = callNativeIl2Cpp('il2cpp_domain_assembly_open', 'pointer', ['pointer', 'pointer'], [domain, Memory.allocUtf8String("Assembly-CSharp")]);
                console.log("[getMySkills] assembly=" + assembly);
                var image = callNativeIl2Cpp('il2cpp_assembly_get_image', 'pointer', ['pointer'], [assembly]);
                console.log("[getMySkills] image=" + image);
                var klass = callNativeIl2Cpp('il2cpp_class_from_name', 'pointer', ['pointer', 'pointer', 'pointer'], [image, Memory.allocUtf8String(""), Memory.allocUtf8String("PlayerMain")]);
                console.log("[getMySkills] klass=" + klass);
                var method = callNativeIl2Cpp('il2cpp_class_get_method_from_name', 'pointer', ['pointer', 'pointer', 'int'], [klass, Memory.allocUtf8String("GetSkillId"), 1]);
                console.log("[getMySkills] method=" + method);
                if (method && !method.isNull()) {
                    getSkillIdAddr = method.readPointer();
                    console.log("[getMySkills] resolved methodPointer=" + getSkillIdAddr);
                }
            }
        } catch(e) {
            console.log("[getMySkills] dynamic resolve err: " + e.message);
        }
        
        if (!getSkillIdAddr && typeof il2cppBase !== 'undefined' && il2cppBase) {
            // Fallback hardcoded RVA if symbols failed to load
            getSkillIdAddr = il2cppBase.add(0xE48560);
            console.log("[getMySkills] fallback getSkillIdAddr=" + getSkillIdAddr);
        }
        
        if (getSkillIdAddr) {
            var getSkillIdFn = new NativeFunction(getSkillIdAddr, 'int', ['pointer', 'int']);
            for (var i = 0; i < 25; i++) {
                try {
                    var sid = getSkillIdFn(_playerMainInstance, i);
                    if (sid && sid > 0) {
                        out.push({ idx: i, skillId: sid });
                    }
                } catch(e) {
                    // console.log("[getMySkills] invoke err at " + i + ": " + e.message);
                }
            }
            console.log("[getMySkills] scanned count=" + out.length);
        } else {
            console.log("[getMySkills] No address found for GetSkillId!");
        }
    } catch(e) {
        console.log("[getMySkills] outer err: " + e.message);
        return { ok: false, error: '' + e };
    }
    return { ok: true, skills: out };
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

                // Read HP/MP/Camp using raw memory offsets (fully bridge-free!)
                var idnPtr = npcontroller.add(0x28).readPointer();
                if (!idnPtr.isNull() && parseInt(idnPtr.toString()) > 0x10000) {
                    res.campValue = idnPtr.add(0x50).readInt();
                    res.seriesValue = idnPtr.add(0x54).readInt();
                    res.hp = idnPtr.add(0x58).readInt();
                    res.maxHp = idnPtr.add(0x5C).readInt();
                    res.mp = idnPtr.add(0x60).readInt();
                    res.maxMp = idnPtr.add(0x64).readInt();
                }
                
                // Read riding state (fully bridge-free native check)
                try {
                    var isRidingFn = new NativeFunction(il2cppBase.add(0xFB7568), 'bool', ['pointer']);
                    res.riding = isRidingFn(npcontroller);
                } catch(e) {
                    res.riding = false;
                }
            }
        } catch (e) {
            res.error = "Error reading fields: " + e.message;
        }
    }
    return res;
};

rpc.exports.switchHorse = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };

    try {
        var playerSwitchHorseFn = new NativeFunction(il2cppBase.add(0xE493F4), 'void', ['pointer']);
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                playerSwitchHorseFn(_playerMainInstance);
            } catch(e){}
        });
        return { ok: true };
    } catch(e) {
        return { ok: false, error: '' + e };
    }
};

rpc.exports.invalidatePlayerMain = function() {
    _playerMainInstance = null;
    if (typeof _charManagerClass !== 'undefined') _charManagerClass = null;
    if (typeof _netCoreManagerClass !== 'undefined') _netCoreManagerClass = null;
    if (typeof _popUpCanvasClass !== 'undefined') _popUpCanvasClass = null;
    if (typeof _byteClass !== 'undefined') _byteClass = null;
    return { ok: true };
};

rpc.exports.getNearEnemies = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    return Il2Cpp.perform(function() {
        var enemies = [];
        try {
            var pmClass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerMain");
            var pmInst = pmClass.field("instance").value;
            if (!pmInst || pmInst.isNull()) return { ok: false, error: 'PlayerMain.instance is null' };

            var localCamp = -1;
            var localSeries = -1;
            var localX = 0;
            var localY = 0;

            var localCtrl = pmInst.field("npcontroller").value;
            if (localCtrl && !localCtrl.isNull()) {
                var localIdn = localCtrl.field("identify").value;
                if (localIdn && !localIdn.isNull()) {
                    var localIdnPtr = localIdn.handle;
                    localCamp = localIdnPtr.add(0x50).readInt();
                    localSeries = localIdnPtr.add(0x54).readInt();
                }
                var localPos = localCtrl.add(0x10).readPointer();
                if (!localPos.isNull()) {
                    var localMapPos = localPos.add(0x28).readPointer();
                    if (!localMapPos.isNull()) {
                        localX = localMapPos.add(0x10).readInt();
                        localY = localMapPos.add(0x14).readInt();
                    }
                }
            }

            var nearNpcsDict = pmInst.field("nearNpcs").value;
            if (!nearNpcsDict || nearNpcsDict.isNull()) {
                return { ok: true, enemies: [], localX: localX, localY: localY, localCamp: localCamp, localSeries: localSeries };
            }

            var count = nearNpcsDict.method("get_Count").invoke();
            if (count === 0) {
                return { ok: true, enemies: [], localX: localX, localY: localY, localCamp: localCamp, localSeries: localSeries };
            }

            var keysCollection = nearNpcsDict.method("get_Keys").invoke();
            var enumerator = keysCollection.method("GetEnumerator").invoke();
            while (enumerator.method("MoveNext").invoke()) {
                var key = enumerator.method("get_Current").invoke();
                var keyStr = key ? key.content : "";
                if (!keyStr) continue;

                var valueOut = Memory.alloc(Process.pointerSize);
                var success = nearNpcsDict.method("TryGetValue").invoke(key, valueOut);
                if (success) {
                    var controllerPtr = valueOut.readPointer();
                    if (!controllerPtr.isNull() && parseInt(controllerPtr.toString()) > 0x10000) {
                        try {
                            var idnPtr = controllerPtr.add(0x28).readPointer();
                            if (!idnPtr.isNull() && parseInt(idnPtr.toString()) > 0x10000) {
                                var campValue = idnPtr.add(0x50).readInt();
                                // Check if it's an enemy (different camp)
                                if (campValue !== localCamp) {
                                    var hp = idnPtr.add(0x58).readInt();
                                    if (hp > 0) {
                                        var maxHp = idnPtr.add(0x5C).readInt();
                                        var series = idnPtr.add(0x54).readInt();

                                        var x = 0, y = 0;
                                        var posPtr = controllerPtr.add(0x10).readPointer();
                                        if (!posPtr.isNull() && parseInt(posPtr.toString()) > 0x10000) {
                                            var mapPosPtr = posPtr.add(0x28).readPointer();
                                            if (!mapPosPtr.isNull() && parseInt(mapPosPtr.toString()) > 0x10000) {
                                                x = mapPosPtr.add(0x10).readInt();
                                                y = mapPosPtr.add(0x14).readInt();
                                            }
                                        }

                                        var name = "";
                                        var nameValPtr = idnPtr.add(0x48).readPointer();
                                        if (!nameValPtr.isNull() && parseInt(nameValPtr.toString()) > 0x10000) {
                                            var len = nameValPtr.add(0x10).readInt();
                                            if (len > 0 && len < 100) {
                                                name = nameValPtr.add(0x14).readUtf16String(len);
                                            }
                                        }

                                         // Read active states/buffs (fully bridge-free)
                                         var states = [];
                                         try {
                                             var statePtr = controllerPtr.add(0x18).readPointer();
                                             if (!statePtr.isNull() && parseInt(statePtr.toString()) > 0x10000) {
                                                 var stateSettingArray = statePtr.add(0x10).readPointer();
                                                 if (!stateSettingArray.isNull() && parseInt(stateSettingArray.toString()) > 0x10000) {
                                                     var len = stateSettingArray.add(0xc).readInt();
                                                     if (len > 0 && len < 50) {
                                                         for (var k = 0; k < len; k++) {
                                                             var settingPtr = stateSettingArray.add(0x10 + k * Process.pointerSize).readPointer();
                                                             if (!settingPtr.isNull() && parseInt(settingPtr.toString()) > 0x10000) {
                                                                 var isActive = settingPtr.add(0x1C).readU8();
                                                                 if (isActive) {
                                                                     var stateObj = settingPtr.add(0x10).readPointer();
                                                                     if (!stateObj.isNull() && parseInt(stateObj.toString()) > 0x10000) {
                                                                         var stateId = stateObj.add(0x10).readInt();
                                                                         states.push(stateId);
                                                                     }
                                                                 }
                                                             }
                                                         }
                                                     }
                                                 }
                                             }
                                         } catch(e){}

                                         enemies.push({
                                             id: keyStr,
                                             name: name,
                                             hp: hp,
                                             maxHp: maxHp,
                                             series: series,
                                             camp: campValue,
                                             x: x,
                                             y: y,
                                             states: states
                                         });
                                    }
                                }
                            }
                        } catch (innerErr) {
                            // Suppress per-entity errors to prevent breaking the loop
                        }
                    }
                }
            }
        } catch(e) {
            return { ok: false, error: e.message };
        }
        return { ok: true, enemies: enemies, localX: localX, localY: localY, localCamp: localCamp, localSeries: localSeries };
    });
};

// getNearNpcNames: ưu tiên bridge (Il2Cpp), fallback NPCScanner no-bridge
if (typeof Il2Cpp !== 'undefined') {
rpc.exports.getNearNpcNames = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    return Il2Cpp.perform(function() {
        var npcMap = {};
        try {
            var pmClass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerMain");
            var pmInst = pmClass.field("instance").value;
            if (pmInst && !pmInst.isNull()) {
                var nearNpcsDict = pmInst.field("nearNpcs").value;
                if (nearNpcsDict && !nearNpcsDict.isNull()) {
                    var keysCollection = nearNpcsDict.method("get_Keys").invoke();
                    var enumerator = keysCollection.method("GetEnumerator").invoke();
                    var getNameFn = new NativeFunction(il2cppBase.add(0xFB9004), 'pointer', ['pointer']);
                    
                    while (enumerator.method("MoveNext").invoke()) {
                        var key = enumerator.method("get_Current").invoke();
                        var keyStr = key ? key.content : "";
                        if (!keyStr) continue;

                        var valueOut = Memory.alloc(Process.pointerSize);
                        var success = nearNpcsDict.method("TryGetValue").invoke(key, valueOut);
                        if (success) {
                            var controllerPtr = valueOut.readPointer();
                            if (!controllerPtr.isNull() && parseInt(controllerPtr.toString()) > 0x10000) {
                                var namePtr = getNameFn(controllerPtr);
                                if (!namePtr.isNull()) {
                                    var nameStr = namePtr.add(0x14).readUtf16String();
                                    npcMap[keyStr] = nameStr;
                                }
                            }
                        }
                    }
                }
            }
            return { ok: true, npcMap: npcMap, source: 'bridge:nearNpcs' };
        } catch(e) {
            return { ok: false, error: e.message };
        }
    });
};
}
// else: NPCScanner.js (loaded before) provides the no-bridge version

rpc.exports.getInventoryItems = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    return Il2Cpp.perform(function() {
        var items = [];
        try {
            var pmClass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerMain");
            var pmInst = pmClass.field("instance").value;
            if (pmInst && !pmInst.isNull()) {
                var itemsDict = pmInst.field("items").value;
                if (itemsDict && !itemsDict.isNull()) {
                    var keysCollection = itemsDict.method("get_Keys").invoke();
                    var enumerator = keysCollection.method("GetEnumerator").invoke();
                    var getNameFn = new NativeFunction(il2cppBase.add(0xF8AF5C), 'pointer', ['pointer']);
                    
                    while (enumerator.method("MoveNext").invoke()) {
                        var key = enumerator.method("get_Current").invoke();
                        var itemIdx = parseInt(key.toString());

                        var valueOut = Memory.alloc(Process.pointerSize);
                        var success = itemsDict.method("TryGetValue").invoke(key, valueOut);
                        if (success) {
                            var itemPtr = valueOut.readPointer();
                            if (!itemPtr.isNull() && parseInt(itemPtr.toString()) > 0x10000) {
                                var location = itemPtr.add(0x60).readInt();
                                if (location === 2) { // 2 = bagarate (in inventory bag)
                                    var particular = itemPtr.add(0x4C).readInt();
                                    var genre = itemPtr.add(0x44).readInt();
                                    var detail = itemPtr.add(0x48).readInt();
                                    var count = itemPtr.add(0x58).readInt();
                                    
                                    var nameStr = "";
                                    try {
                                        var namePtr = getNameFn(itemPtr);
                                        if (!namePtr.isNull()) {
                                            nameStr = namePtr.add(0x14).readUtf16String();
                                        }
                                    } catch(e){}

                                    items.push({
                                        index: itemIdx,
                                        particular: particular,
                                        genre: genre,
                                        detail: detail,
                                        count: count,
                                        name: nameStr
                                    });
                                }
                            }
                        }
                    }
                }
            }
            return { ok: true, items: items };
        } catch(e) {
            return { ok: false, error: e.message };
        }
    });
};

rpc.exports.useItem = function(itemIdx) {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    return Il2Cpp.perform(function() {
        try {
            var pmClass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerMain");
            var pmInst = pmClass.field("instance").value;
            if (pmInst && !pmInst.isNull()) {
                var itemsDict = pmInst.field("items").value;
                if (itemsDict && !itemsDict.isNull()) {
                    var valueOut = Memory.alloc(Process.pointerSize);
                    var success = itemsDict.method("TryGetValue").invoke(itemIdx, valueOut);
                    if (success) {
                        var itemPtr = valueOut.readPointer();
                        if (!itemPtr.isNull() && parseInt(itemPtr.toString()) > 0x10000) {
                            var requestUseItemFn = new NativeFunction(il2cppBase.add(0xE4CEFC), 'void', ['pointer', 'pointer']);
                            globalThis._mainThreadActions = globalThis._mainThreadActions || [];
                            globalThis._mainThreadActions.push(function() {
                                try {
                                    requestUseItemFn(pmInst.handle, itemPtr);
                                } catch(e){}
                            });
                            return { ok: true };
                        }
                    }
                }
            }
            return { ok: false, error: 'Item not found' };
        } catch(e) {
            return { ok: false, error: e.message };
        }
    });
};

