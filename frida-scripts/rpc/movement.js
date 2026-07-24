// frida-scripts/rpc/movement.js — Movement RPC exports (bridge-free)

rpc.exports.gotoFindingPath = function(x, y, approach) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'PlayerMain not found' };
    if (!il2cppBase) return { ok: false, error: 'il2cppBase not found' };

    try {
        var gotoFindingPathFn = new NativeFunction(il2cppBase.add(0xE4A620).add(1), 'void', ['pointer', 'int', 'int', 'int', 'pointer', 'pointer', 'pointer']);
        
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                gotoFindingPathFn(_playerMainInstance, x | 0, y | 0, (approach | 0) || 20, ptr(0), ptr(0), ptr(0));
            } catch(e) {
                console.log('GotoFindingPath main thread error: ' + e);
            }
        });
        return { ok: true, x: x, y: y, method: 'direct_native_queued' };
    } catch (e) {
        return { ok: false, error: 'GotoFindingPath exception: ' + e };
    }
};

rpc.exports.gotoHooked = function(x, y, approach) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'PlayerMain not found' };
    if (!il2cppBase) return { ok: false, error: 'il2cppBase not found' };

    globalThis._pendingGoto = { x: x | 0, y: y | 0, ap: (approach | 0) || 20 };
    if (globalThis._gotoHookOn) return { ok: true, queued: true };

    try {
        var playerMainUpdate = il2cppBase.add(0xE42B4C);
        var gotoFindingPathFn = new NativeFunction(il2cppBase.add(0xE4A620), 'void', ['pointer', 'int', 'int', 'int', 'pointer', 'pointer', 'pointer']);

        Interceptor.attach(playerMainUpdate, {
            onEnter: function() {
                var g = globalThis._pendingGoto;
                if (!g) return;
                globalThis._pendingGoto = null;
                try {
                    gotoFindingPathFn(_playerMainInstance, g.x, g.y, g.ap, ptr(0), ptr(0), ptr(0));
                    globalThis._gotoLastFire = 'ok ' + g.x + ',' + g.y;
                } catch (e) {
                    globalThis._gotoLastFire = 'err ' + e;
                }
            }
        });
        globalThis._gotoHookOn = true;
        return { ok: true, hooked: true };
    } catch (e) {
        return { ok: false, error: '' + e };
    }
};

rpc.exports.gotoLastFire = function() {
    return { fire: globalThis._gotoLastFire || '(chua ban)' };
};

rpc.exports.findJoysticks = function() {
    return { ok: false, error: 'Joystick query needs bridge (disabled for stability)' };
};

rpc.exports.joystickSet = function(idx, dx, dy) {
    return { ok: false, error: 'Joystick control needs bridge (disabled for stability)' };
};

rpc.exports.teleportSynchronous = function(x, y) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'PlayerMain not found' };
    if (!il2cppBase) return { ok: false, error: 'il2cppBase not found' };

    try {
        var tpFn = new NativeFunction(il2cppBase.add(0xE4BB60).add(1), 'void', ['pointer', 'int', 'int']);
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                tpFn(_playerMainInstance, y | 0, x | 0);
            } catch(e) {
                console.log('Teleport error: ' + e);
            }
        });
        return { ok: true, method: 'teleportSynchronous' };
    } catch (e) {
        return { ok: false, error: 'Exception: ' + e };
    }
};

rpc.exports.selfForceMoveTarget = function(x, y) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'PlayerMain not found' };
    if (!il2cppBase) return { ok: false, error: 'il2cppBase not found' };

    try {
        // Need to create a string array... this is too complex in pure C API.
        // Let's use the TeleportSynchronous instead!
        return { ok: false, error: 'not implemented' };
    } catch (e) {
        return { ok: false, error: 'Exception: ' + e };
    }
};


rpc.exports.hookMovement = function() {
    var gotoFindingPathFn = il2cppBase.add(0xE4A620);
    Interceptor.attach(gotoFindingPathFn, {
        onEnter: function(args) {
            var tx = args[1].toInt32();
            var ty = args[2].toInt32();
            var approach = args[3].toInt32();
            console.log('[HOOK] GotoFindingPath(targetX=' + tx + ', targetY=' + ty + ', approach=' + approach + ')');
        }
    });
    return { ok: true };
};

rpc.exports.writePositionMemory = function(x, y) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    try {
        var npcontroller = _playerMainInstance.add(0x20).readPointer();
        if (!npcontroller.isNull()) {
            var pos = npcontroller.add(0x10).readPointer();
            if (!pos.isNull()) {
                pos.add(0x30).writeFloat(x);
                pos.add(0x34).writeFloat(y);
                return { ok: true };
            }
        }
        return { ok: false, error: 'Cannot find pos pointer' };
    } catch(e) {
        return { ok: false, error: e.toString() };
    }
};
