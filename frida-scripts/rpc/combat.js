// frida-scripts/rpc/combat.js — Combat RPC exports (bridge-free)

// ── PrivateFightTarget blocker ──
// Khi bật, chặn server set target PK → client không nhận target mới
globalThis._blockPrivateFightTarget = false;

// Hook PrivateFightTarget @ 0xE472CC — cài 1 lần khi il2cppBase có
function ensurePrivateFightHook() {
    if (!il2cppBase) return;
    if (globalThis._privateFightHooked) return;
    globalThis._privateFightHooked = true;

    try {
        Interceptor.attach(il2cppBase.add(0xE472CC), {
            onEnter: function(args) {
                if (globalThis._blockPrivateFightTarget) {
                    // Bỏ qua: không cho server set target
                    this.skip = true;
                }
            }
        });
        console.log("[PrivateFightTarget] Hook installed @ 0xE472CC");
    } catch(e) {
        console.log("[PrivateFightTarget] Hook failed: " + e);
        globalThis._privateFightHooked = false;
    }
}

rpc.exports.blockPrivateFightTarget = function(block) {
    ensurePrivateFightHook();
    globalThis._blockPrivateFightTarget = !!block;
    return { ok: true, blocked: globalThis._blockPrivateFightTarget };
};

rpc.exports.doSkillHooked = function(skillId) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };

    try {
        var doSkillFn = new NativeFunction(il2cppBase.add(0xE4969C), 'bool', ['pointer', 'int']);
        globalThis._skillLastFire = 'queued';

        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                var r = doSkillFn(_playerMainInstance, skillId | 0);
                globalThis._skillLastFire = 'ok DoSkill(' + skillId + ')=' + r;
            } catch (e) {
                globalThis._skillLastFire = 'err ' + e;
            }
        });
        return { ok: true, queued: true };
    } catch (e) {
        return { ok: false, error: '' + e };
    }
};

rpc.exports.skillLastFire = function() {
    return { fire: globalThis._skillLastFire || '(chua ban)' };
};

rpc.exports.doSkillDefaultHooked = function(skillId) {
    // Basic attack is mapped to DoSkill(skillId) natively
    return rpc.exports.doSkillHooked(skillId || 1);
};

rpc.exports.defLast = function() {
    return { last: globalThis._skillLastFire || '(chua)' };
};

rpc.exports.attackPlayerHooked = function(cid, skillId, isPhysic, dismount) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };

    try {
        // Switch horse if dismount is requested
        if (dismount) {
            var isHorseEquippedFn = new NativeFunction(il2cppBase.add(0xE46220), 'bool', ['pointer']);
            var playerSwitchHorseFn = new NativeFunction(il2cppBase.add(0xE493F4), 'void', ['pointer']);
            if (isHorseEquippedFn(_playerMainInstance)) {
                playerSwitchHorseFn(_playerMainInstance);
            }
        }
        
        // Execute skill targeting active opponent
        return rpc.exports.doSkillHooked(skillId);
    } catch (e) {
        return { ok: false, error: 'Attack player failed: ' + e };
    }
};

rpc.exports.pkLast = function() {
    return { last: globalThis._skillLastFire || '(chua)' };
};

// --- Clear Focus ---
// Target.Clear() @ 0xF20280 KHÔNG hoạt động (tested).
// Dùng direct memory write thay vì gọi game engine function.
rpc.exports.clearFocus = function() {
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };
    if (!_playerMainInstance || _playerMainInstance.isNull()) {
        return { ok: false, error: 'no PlayerMain instance' };
    }

    try {
        var clearRunFn = new NativeFunction(il2cppBase.add(0xE42A48), 'void', ['pointer']);
        var stopPathFn = new NativeFunction(il2cppBase.add(0xE4B76C), 'void', ['pointer']);

        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                if (!_playerMainInstance || _playerMainInstance.isNull()) return;
                var pm = _playerMainInstance;

                // 1. Dừng movement
                clearRunFn(pm);
                stopPathFn(pm);

                // 2. Xóa Target reference khỏi PlayerMain
                pm.add(0xA0).writePointer(ptr(0));

                // 3. Xóa runFollowTargetCid
                pm.add(0x100).writePointer(ptr(0));

                // 4. Xóa pathfinding state
                pm.add(0x128).writePointer(ptr(0));
                pm.add(0x158).writeU8(0);
                pm.add(0x159).writeU8(0);

                console.log("[clearFocus] OK - direct memory write");
            } catch (e) {
                console.log("[clearFocus] Error: " + e);
            }
        });
        return { ok: true, queued: true };
    } catch (e) {
        return { ok: false, error: '' + e };
    }
};

// --- Debug: Read current target state ---
rpc.exports.debugReadTarget = function() {
    if (!_playerMainInstance || _playerMainInstance.isNull()) {
        return { ok: false, error: 'no PlayerMain' };
    }
    try {
        var targetPtr = _playerMainInstance.add(0xA0).readPointer();
        var result = {
            ok: true,
            target: targetPtr.isNull() ? 'NULL' : targetPtr.toString(),
        };

        // Đọc sâu vào Target object
        if (!targetPtr.isNull()) {
            var ctrl = targetPtr.add(0x10).readPointer();
            result.targetController = ctrl.isNull() ? 'NULL' : ctrl.toString();

            // Đọc tên từ Controller → Character → name
            if (!ctrl.isNull()) {
                try {
                    var charPtr = ctrl.add(0xA0).readPointer();
                    if (charPtr && !charPtr.isNull()) {
                        var namePtr = charPtr.add(0x18).readPointer();
                        if (namePtr && !namePtr.isNull()) {
                            var nameLen = namePtr.add(0x10).readInt();
                            if (nameLen > 0 && nameLen < 256) {
                                result.targetName = namePtr.add(0x14).readUtf16String(nameLen);
                            }
                        }
                    }
                } catch(e) {}
            }
        }

        // Follow CID
        var cidPtr = _playerMainInstance.add(0x100).readPointer();
        if (cidPtr && !cidPtr.isNull()) {
            try {
                var len = cidPtr.add(0x10).readInt();
                if (len > 0 && len < 256) {
                    result.runFollowTargetCid = cidPtr.add(0x14).readUtf8String(len);
                }
            } catch(e) { result.runFollowTargetCid = cidPtr.toString(); }
        } else {
            result.runFollowTargetCid = '(null)';
        }

        result.findingPathIsRunning = _playerMainInstance.add(0x158).readU8();
        result.findingPathUpdate = _playerMainInstance.add(0x159).readU8();
        return result;
    } catch(e) {
        return { ok: false, error: '' + e };
    }
};

// --- Test: Gọi Target.Clear() trực tiếp ---
rpc.exports.testTargetClear = function() {
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };
    if (!_playerMainInstance || _playerMainInstance.isNull()) {
        return { ok: false, error: 'no PlayerMain' };
    }
    try {
        var targetObj = _playerMainInstance.add(0xA0).readPointer();
        if (!targetObj || targetObj.isNull()) {
            return { ok: false, error: 'target already NULL' };
        }

        // Đọc controller trước khi clear để report
        var controllerPtr = targetObj.add(0x10).readPointer();
        var cidBefore = '(unknown)';
        if (controllerPtr && !controllerPtr.isNull()) {
            try {
                var charPtr = controllerPtr.add(0xA0).readPointer();
                if (charPtr && !charPtr.isNull()) {
                    var namePtr = charPtr.add(0x18).readPointer();
                    if (namePtr && !namePtr.isNull()) {
                        var nameLen = namePtr.add(0x10).readInt();
                        if (nameLen > 0 && nameLen < 256) {
                            cidBefore = namePtr.add(0x14).readUtf8String(nameLen);
                        }
                    }
                }
            } catch(e) { cidBefore = controllerPtr.toString(); }
        }

        var targetClearFn = new NativeFunction(il2cppBase.add(0xF20280), 'void', ['pointer']);

        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                var tObj = _playerMainInstance.add(0xA0).readPointer();
                if (tObj && !tObj.isNull()) {
                    targetClearFn(tObj);
                    console.log("[testTargetClear] Target.Clear() called OK");
                }
            } catch(e) {
                console.log("[testTargetClear] Error: " + e);
            }
        });

        return {
            ok: true,
            queued: true,
            targetBefore: targetObj.toString(),
            controllerBefore: controllerPtr.isNull() ? 'NULL' : controllerPtr.toString(),
            cidBefore: cidBefore
        };
    } catch(e) {
        return { ok: false, error: '' + e };
    }
};
