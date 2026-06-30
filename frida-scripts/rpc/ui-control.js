// frida-scripts/rpc/ui-control.js — UI control RPCs (bridge-free)

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

        // Attempt to close PlayerDie (Về thành dưỡng sức) via Il2Cpp
        if (typeof Il2Cpp !== 'undefined') {
            try {
                Il2Cpp.perform(function() {
                    var playerDieClass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerDie");
                    if (playerDieClass) {
                        var instances = Il2Cpp.api.Object.FindObjectsOfType(playerDieClass.type, false);
                        if (instances && instances.length > 0) {
                            var closeMethod = playerDieClass.method("Close");
                            for (var i = 0; i < instances.length; i++) {
                                var pd = new Il2Cpp.Object(instances[i]);
                                if (pd && !pd.isNull()) {
                                    closeMethod.invoke(pd);
                                }
                            }
                        }
                    }
                });
            } catch(ex) {
                // Ignore Il2Cpp errors
            }
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
