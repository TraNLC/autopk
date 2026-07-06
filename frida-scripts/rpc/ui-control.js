function getPopUpCanvasInstanceLocal() {
    var pattern = '50 6f 70 55 70 43 61 6e 76 61 73'; // "PopUpCanvas"
    var maps = File.readAllText('/proc/self/maps').split('\n');
    var metaRange = null;
    for (var i = 0; i < maps.length; i++) {
        var line = maps[i];
        if (line.indexOf('global-metadata.dat') !== -1) {
            var parts = line.split(' ')[0].split('-');
            metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
            break;
        }
    }
    if (!metaRange) return null;
    var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
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
    
    var popUpCanvasClass = null;
    for (var k = 0; k < allRanges.length; k++) {
        try {
            var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
            if (matches.length > 0) {
                for (var m = 0; m < matches.length; m++) {
                    var cand = matches[m].address.sub(0x10);
                    try {
                        var checkNamePtr = cand.add(0x10).readPointer();
                        if (checkNamePtr.toString() === nameStrAddr.toString()) {
                            popUpCanvasClass = cand;
                            break;
                        }
                    } catch(e) {}
                }
            }
        } catch(e) {}
        if (popUpCanvasClass) break;
    }
    if (!popUpCanvasClass) return null;
    var staticFields = popUpCanvasClass.add(0xB8).readPointer();
    if (staticFields.isNull()) return null;
    return staticFields.readPointer();
}

rpc.exports.closeOnlyNpcDialog = function() {
    try {
        var canvas = getPopUpCanvasInstanceLocal();
        if (!canvas || canvas.isNull()) {
            // Fallback to standard native call directly if canvas scan is not ready
            globalThis._mainThreadActions = globalThis._mainThreadActions || [];
            globalThis._mainThreadActions.push(function() {
                try {
                    var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE459FC), 'void', ['pointer']);
                    if (typeof _playerMainInstance !== 'undefined' && _playerMainInstance && !_playerMainInstance.isNull()) {
                        closeNpcDialogFn(_playerMainInstance);
                    }
                } catch(e) {}
            });
            return { ok: true, fallback: true };
        }
        
        var npcDialogPc = canvas.add(0x128).readPointer();
        var npcDialog10Pc = canvas.add(0x130).readPointer();
        var npcDialogInfiPc = canvas.add(0x138).readPointer();
        
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                if (npcDialogPc && !npcDialogPc.isNull()) {
                    var closeFn = new NativeFunction(il2cppBase.add(0xE82838), 'void', ['pointer']);
                    closeFn(npcDialogPc);
                }
            } catch(e) {}
            try {
                if (npcDialog10Pc && !npcDialog10Pc.isNull()) {
                    var closeFn = new NativeFunction(il2cppBase.add(0xE80744), 'void', ['pointer']);
                    closeFn(npcDialog10Pc);
                }
            } catch(e) {}
            try {
                if (npcDialogInfiPc && !npcDialogInfiPc.isNull()) {
                    var closeFn = new NativeFunction(il2cppBase.add(0xE816A0), 'void', ['pointer']);
                    closeFn(npcDialogInfiPc);
                }
            } catch(e) {}
            
            // Also call standard CloseNpcDialog for safety
            try {
                var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE459FC), 'void', ['pointer']);
                if (typeof _playerMainInstance !== 'undefined' && _playerMainInstance && !_playerMainInstance.isNull()) {
                    closeNpcDialogFn(_playerMainInstance);
                }
            } catch(e) {}
        });
        return { ok: true, queued: true };
    } catch(e) {
        return { ok: false, error: e.message };
    }
};

rpc.exports.closeDialogPopups = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };

    try {
        var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE459FC), 'void', ['pointer']);
        var closeNpcShopFn = new NativeFunction(il2cppBase.add(0xE454A0), 'void', ['pointer']);
        var closeBagarateFn = new NativeFunction(il2cppBase.add(0xE45230), 'void', ['pointer']);
        var closeStorageBoxFn = new NativeFunction(il2cppBase.add(0xE44CCC), 'void', ['pointer']);

        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try { closeNpcDialogFn(_playerMainInstance); } catch(e){}
            try { closeNpcShopFn(_playerMainInstance); } catch(e){}
            try { closeBagarateFn(_playerMainInstance); } catch(e){}
            try { closeStorageBoxFn(_playerMainInstance); } catch(e){}
        });

        globalThis._closePopupResult = { closed: { dialog: 1, shop: 1, bag: 1, storage: 1 }, found: {}, ts: Date.now() };

        // Aggressive popup close: thử tất cả class có thể là popup "Về thành dưỡng sức"
        if (typeof Il2Cpp !== 'undefined') {
            try {
                Il2Cpp.perform(function() {
                    var assembly = Il2Cpp.domain.assembly("Assembly-CSharp").image;
                    
                    // Danh sách tất cả class có thể là popup cần đóng
                    var classNames = [
                        "PlayerDie", "PopUpCanvas", "MessageBox",
                        "ConfirmDialog", "ConfirmBox", "NoticeDialog", "NoticeBox",
                        "GameNotice", "SystemNotice", "CommonDialog", "UIDialog",
                        "PopupDialog", "DialogBase", "NpcDialog", "TipDialog",
                        "MessageDialog", "AlertDialog", "OkCancelDialog"
                    ];
                    
                    for (var ci = 0; ci < classNames.length; ci++) {
                        try {
                            var cls = assembly.class(classNames[ci]);
                            if (!cls) continue;
                            var instances = Il2Cpp.api.Object.FindObjectsOfType(cls.type, false);
                            if (!instances || instances.length === 0) continue;
                            
                            for (var j = 0; j < instances.length; j++) {
                                var obj = new Il2Cpp.Object(instances[j]);
                                if (!obj || obj.isNull()) continue;
                                
                                // Thử tất cả phương thức đóng có thể
                                try { obj.method("Close").invoke(obj); } catch(e) {}
                                try { obj.method("OnClose").invoke(obj); } catch(e) {}
                                try { obj.method("OnBtnOk").invoke(obj); } catch(e) {}
                                try { obj.method("OnBtnConfirm").invoke(obj); } catch(e) {}
                                try { obj.method("OnBtnYes").invoke(obj); } catch(e) {}
                                try { obj.method("Dispose").invoke(obj); } catch(e) {}
                                // Fallback: set inactive
                                try { obj.method("SetActive").invoke(obj, false); } catch(e) {}
                            }
                        } catch(e) {}
                    }
                });
            } catch(ex) {}
        }

        return { ok: true, closed: true };
    } catch (e) {
        return { ok: false, error: 'Close dialogs native failed: ' + e };
    }
};

rpc.exports.closePopupResult = function() {
    return { res: globalThis._closePopupResult || null, pending: 0 };
};

rpc.exports.sortBagItems = function() {
    return { ok: false, error: 'Sort bag needs bridge (disabled for stability)' };
};

rpc.exports.sortResult = function() { return { res: null }; };

rpc.exports.equipHooked = function(idx) {
    return { ok: false, error: 'Equip item needs bridge (disabled for stability)' };
};

rpc.exports.equipLastFire = function() { return { fire: '(disabled)' }; };

rpc.exports.shopOpenLog = function() { return { log: globalThis._shopOpenLog || [] }; };
