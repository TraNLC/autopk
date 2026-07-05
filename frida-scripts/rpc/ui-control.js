// frida-scripts/rpc/ui-control.js — UI control RPCs (bridge-free)

// Check if NPC dialog is currently open
rpc.exports.isDialogOpen = function() {
    try {
        // Init if needed (readPlayerMainDirect sets il2cppBase + _playerMainInstance)
        if (!_playerMainInstance) {
            var pmRes = readPlayerMainDirect();
            if (!pmRes.ok || !_playerMainInstance) return { ok: false, open: false, error: 'no PlayerMain' };
        }
        if (!il2cppBase) return { ok: false, open: false, error: 'no il2cppBase' };
        
        // PlayerMain.npcDialogMessage @0xE8 — non-null when dialog is open
        var dialogMsg = _playerMainInstance.add(0xE8).readPointer();
        return { ok: true, open: !dialogMsg.isNull(), ptr: dialogMsg.toString() };
    } catch(e) {
        return { ok: false, open: false, error: e.message };
    }
};

rpc.exports.closeDialogPopups = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };

    try {
        var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE458F4), 'void', ['pointer']);
        var closeNpcShopFn = new NativeFunction(il2cppBase.add(0xE4535C), 'void', ['pointer']);
        var closeBagarateFn = new NativeFunction(il2cppBase.add(0xE45104), 'void', ['pointer']);
        var closeStorageBoxFn = new NativeFunction(il2cppBase.add(0xE44B8C), 'void', ['pointer']);

        closeNpcDialogFn(_playerMainInstance);
        closeNpcShopFn(_playerMainInstance);
        closeBagarateFn(_playerMainInstance);
        closeStorageBoxFn(_playerMainInstance);

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
