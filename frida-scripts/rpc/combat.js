// frida-scripts/rpc/combat.js — Combat RPC exports (bridge-free)

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
rpc.exports.clearFocus = function() {
    var pmRes = readPlayerMainDirect();
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };

    try {
        var clearRunFn = new NativeFunction(il2cppBase.add(0xE4B928), 'void', ['pointer']);
        var stopPathFn = new NativeFunction(il2cppBase.add(0xE43094), 'void', ['pointer']);
        var killTargetFn = new NativeFunction(il2cppBase.add(0xE42E78), 'void', ['pointer']); // KillTargetBySkillResetWeaponType
        var setSelectFn = new NativeFunction(il2cppBase.add(0xE4EDB0), 'void', ['pointer', 'pointer']);
        
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                // Stop running and chasing if PlayerMain is available
                if (_playerMainInstance) {
                    clearRunFn(_playerMainInstance);
                    stopPathFn(_playerMainInstance);
                    killTargetFn(_playerMainInstance);
                    
                    // Đọc pointer của mục tiêu hiện tại trước khi xóa
                    var currentTarget = _playerMainInstance.add(0xA0).readPointer();
                    
                    // Xóa mục tiêu trong bộ nhớ
                    _playerMainInstance.add(0xA0).writePointer(ptr(0));

                    // Tắt vòng tròn chọn mục tiêu trên UI
                    if (currentTarget && !currentTarget.isNull()) {
                        try {
                            setSelectFn(currentTarget, ptr(0));
                        } catch(err) {
                            console.log("[clearFocus] setSelectFn error: " + err);
                        }
                    }
                }
            } catch (e) {
                console.log("[clearFocus] Error: " + e);
            }
        });
        return { ok: true, queued: true };
    } catch (e) {
        return { ok: false, error: '' + e };
    }
};
