function getPopUpCanvasInstanceLocal() {
    try {
        if (globalThis._popUpCanvasInstance && !globalThis._popUpCanvasInstance.isNull()) {
            return globalThis._popUpCanvasInstance;
        }
    } catch(e) {
        globalThis._popUpCanvasInstance = null;
    }

    // 1. Sử dụng static fields pointer đã được cache để đọc trực tiếp (tối ưu hóa tối đa, tránh quét lại)
    if (globalThis._popUpCanvasStaticFieldsPtr && !globalThis._popUpCanvasStaticFieldsPtr.isNull()) {
        try {
            var inst = globalThis._popUpCanvasStaticFieldsPtr.readPointer();
            if (inst && !inst.isNull() && parseInt(inst.toString()) > 0x10000) {
                globalThis._popUpCanvasInstance = inst;
                return inst;
            }
        } catch(e) {}
    }

    // 2. Chỉ thực hiện quét dò tìm class tối đa 1 lần mỗi 5 giây (tránh spam CPU/Disk I/O khi game đang tải)
    var now = Date.now();
    if (globalThis._lastCanvasResolveTime && (now - globalThis._lastCanvasResolveTime) < 5000) {
        return null;
    }
    globalThis._lastCanvasResolveTime = now;

    console.log("[PopUpCanvas] Resolving PopUpCanvas instance...");
    try {
        var fn_domain_get = Module.findExportByName('libil2cpp.so', 'il2cpp_domain_get');
        var fn_domain_assembly_open = Module.findExportByName('libil2cpp.so', 'il2cpp_domain_assembly_open');
        var fn_assembly_get_image = Module.findExportByName('libil2cpp.so', 'il2cpp_assembly_get_image');
        var fn_class_from_name = Module.findExportByName('libil2cpp.so', 'il2cpp_class_from_name');
        
        if (fn_domain_get && fn_domain_assembly_open && fn_assembly_get_image && fn_class_from_name) {
            var get_domain = new NativeFunction(fn_domain_get, 'pointer', []);
            var assembly_open = new NativeFunction(fn_domain_assembly_open, 'pointer', ['pointer', 'pointer']);
            var get_image = new NativeFunction(fn_assembly_get_image, 'pointer', ['pointer']);
            var class_from_name = new NativeFunction(fn_class_from_name, 'pointer', ['pointer', 'pointer', 'pointer']);
            
            var domain = get_domain();
            if (domain && !domain.isNull()) {
                var assembly = assembly_open(domain, Memory.allocUtf8String("Assembly-CSharp"));
                if (assembly && !assembly.isNull()) {
                    var image = get_image(assembly);
                    if (image && !image.isNull()) {
                        var klass = class_from_name(image, Memory.allocUtf8String(""), Memory.allocUtf8String("PopUpCanvas"));
                        if (klass && !klass.isNull()) {
                            var staticFields = klass.add(0xB8).readPointer();
                            if (staticFields && !staticFields.isNull()) {
                                globalThis._popUpCanvasStaticFieldsPtr = staticFields; // Cache static fields pointer
                                var inst = staticFields.readPointer();
                                if (inst && !inst.isNull() && parseInt(inst.toString()) > 0x10000) {
                                    globalThis._popUpCanvasInstance = inst;
                                    console.log("[PopUpCanvas] Found via Native IL2CPP: " + inst);
                                    return globalThis._popUpCanvasInstance;
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch(e) {
        console.log("[PopUpCanvas] Native IL2CPP resolution error: " + e);
    }

    // Fallback: Dynamic metadata scan (chạy thưa thớt 5s/lần)
    console.log("[PopUpCanvas] Native lookup failed, attempting dynamic metadata scan...");
    try {
        var pattern = '50 6f 70 55 70 43 61 6e 76 61 73'; // "PopUpCanvas"
        var nameStrAddr = null;
        
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
        
        if (metaRange) {
            console.log("[PopUpCanvas] Scanning global-metadata.dat at base: " + metaRange.base + ", size: " + metaRange.size);
            var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
            if (results.length > 0) {
                nameStrAddr = results[0].address;
                console.log("[PopUpCanvas] Found class name string at: " + nameStrAddr);
                var hex = nameStrAddr.toString(16);
                while (hex.length < 16) hex = '0' + hex;
                var parts = [];
                for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
                var ptrPattern = parts.join(' ');
                
                var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
                var classPtr = null;
                console.log("[PopUpCanvas] Scanning rw- memory ranges for pointer to class name...");
                for (var k = 0; k < allRanges.length; k++) {
                    try {
                        var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                        if (matches.length > 0) {
                            for (var m = 0; m < matches.length; m++) {
                                var cand = matches[m].address.sub(0x10);
                                var nsPtr = cand.add(0x18).readPointer();
                                var nsName = nsPtr.isNull() ? '' : nsPtr.readUtf8String();
                                var checkNamePtr = cand.add(0x10).readPointer();
                                if (checkNamePtr.toString() === nameStrAddr.toString() && nsName === '') {
                                    classPtr = cand;
                                    break;
                                }
                            }
                        }
                    } catch(e) {}
                    if (classPtr) break;
                }
                
                if (classPtr) {
                    console.log("[PopUpCanvas] Found class pointer: " + classPtr);
                    var staticFields = classPtr.add(0xB8).readPointer();
                    if (staticFields && !staticFields.isNull()) {
                        globalThis._popUpCanvasStaticFieldsPtr = staticFields; // Cache static fields pointer
                        var inst = staticFields.readPointer();
                        if (inst && !inst.isNull() && parseInt(inst.toString()) > 0x10000) {
                            globalThis._popUpCanvasInstance = inst;
                            console.log("[PopUpCanvas] Dynamic scan success! PopUpCanvas.instance: " + inst);
                            return globalThis._popUpCanvasInstance;
                        }
                    }
                } else {
                    console.log("[PopUpCanvas] Class pointer search failed.");
                }
            } else {
                console.log("[PopUpCanvas] Class name pattern not found in global-metadata.dat.");
            }
        } else {
            console.log("[PopUpCanvas] global-metadata.dat not found in maps.");
        }
    } catch(e) {
        console.log("[PopUpCanvas] Dynamic scan error: " + e);
    }
    
    console.log("[PopUpCanvas] Failed to resolve PopUpCanvas instance.");
    return null;
}

rpc.exports.closeOnlyNpcDialog = function() {
    try {
        var canvas = getPopUpCanvasInstanceLocal();
        if (!canvas || canvas.isNull()) {
            // Fallback to standard native call directly if canvas scan is not ready
            globalThis._mainThreadActions = globalThis._mainThreadActions || [];
            globalThis._mainThreadActions.push(function() {
                try {
                    var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE458F4), 'void', ['pointer']);
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
                var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE458F4), 'void', ['pointer']);
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
        var canvas = getPopUpCanvasInstanceLocal();
        
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            // 1. Close UI dialogs visually if canvas is resolved
            if (canvas && !canvas.isNull()) {
                try {
                    var npcDialogPc = canvas.add(0x128).readPointer();
                    if (npcDialogPc && !npcDialogPc.isNull()) {
                        var closeFn = new NativeFunction(il2cppBase.add(0xE82838), 'void', ['pointer']);
                        closeFn(npcDialogPc);
                    }
                } catch(e) {}
                try {
                    var npcDialog10Pc = canvas.add(0x130).readPointer();
                    if (npcDialog10Pc && !npcDialog10Pc.isNull()) {
                        var closeFn = new NativeFunction(il2cppBase.add(0xE80744), 'void', ['pointer']);
                        closeFn(npcDialog10Pc);
                    }
                } catch(e) {}
                try {
                    var npcDialogInfiPc = canvas.add(0x138).readPointer();
                    if (npcDialogInfiPc && !npcDialogInfiPc.isNull()) {
                        var closeFn = new NativeFunction(il2cppBase.add(0xE816A0), 'void', ['pointer']);
                        closeFn(npcDialogInfiPc);
                    }
                } catch(e) {}
                
                // 2. Close UI shops visually
                try {
                    var npcPointShop = canvas.add(0x148).readPointer();
                    if (npcPointShop && !npcPointShop.isNull()) {
                        var showOffFn = new NativeFunction(il2cppBase.add(0xE88694), 'void', ['pointer']);
                        showOffFn(npcPointShop);
                    }
                } catch(e) {}
                try {
                    var npcMoneyShop = canvas.add(0xC0).readPointer();
                    if (npcMoneyShop && !npcMoneyShop.isNull()) {
                        var showOffFn = new NativeFunction(il2cppBase.add(0xE86CF4), 'void', ['pointer']);
                        showOffFn(npcMoneyShop);
                    }
                } catch(e) {}
                try {
                    var npcKnbShop = canvas.add(0xC8).readPointer();
                    if (npcKnbShop && !npcKnbShop.isNull()) {
                        var showOffFn = new NativeFunction(il2cppBase.add(0xE8448C), 'void', ['pointer']);
                        showOffFn(npcKnbShop);
                    }
                } catch(e) {}

                // 3. Close StandardConfirmPc (revive popup) by pressing Cancel
                try {
                    var standardConfirmPc = canvas.add(0xE8).readPointer();
                    if (standardConfirmPc && !standardConfirmPc.isNull()) {
                        var cancelButton = standardConfirmPc.add(0x40).readPointer();
                        if (cancelButton && !cancelButton.isNull()) {
                            var pressButtonFn = new NativeFunction(il2cppBase.add(0x1ED7EF4), 'void', ['pointer']);
                            pressButtonFn(cancelButton);
                        }
                    }
                } catch(e) {}
            }

            // 4. Close logic states on PlayerMain
            try {
                var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE458F4), 'void', ['pointer']);
                closeNpcDialogFn(_playerMainInstance);
            } catch(e){}
            try {
                var closeNpcShopFn = new NativeFunction(il2cppBase.add(0xE4535C), 'void', ['pointer']);
                closeNpcShopFn(_playerMainInstance);
            } catch(e){}
            try {
                var closeBagarateFn = new NativeFunction(il2cppBase.add(0xE45104), 'void', ['pointer']);
                closeBagarateFn(_playerMainInstance);
            } catch(e){}
            try {
                var closeStorageBoxFn = new NativeFunction(il2cppBase.add(0xE44B8C), 'void', ['pointer']);
                closeStorageBoxFn(_playerMainInstance);
            } catch(e){}
        });

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

rpc.exports.clickFirstShopItem = function() {
    return new Promise(function(resolve) {
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                var canvas = getPopUpCanvasInstanceLocal();
                if (!canvas || canvas.isNull()) return;
                var shop = canvas.add(0x148).readPointer(); // npcPointShop
                if (!shop || shop.isNull()) return;
                var cellListing = shop.add(0x80).readPointer();
                if (!cellListing || cellListing.isNull()) return;
                var size = cellListing.add(0x18).readInt();
                if (size > 0) {
                    var itemsArr = cellListing.add(0x10).readPointer();
                    if (itemsArr && !itemsArr.isNull()) {
                        var cell = itemsArr.add(0x20).readPointer();
                        if (cell && !cell.isNull()) {
                            var button = cell.add(0x50).readPointer();
                            if (button && !button.isNull()) {
                                var pressButtonFn = new NativeFunction(il2cppBase.add(0x1ED7EF4), 'void', ['pointer']);
                                pressButtonFn(button);
                            }
                        }
                    }
                }
            } catch(e) {}
        });
        resolve({ ok: true });
    });
};

rpc.exports.buyActiveShopItem = function(qty) {
    return new Promise(function(resolve) {
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                var canvas = getPopUpCanvasInstanceLocal();
                if (!canvas || canvas.isNull()) return;
                var itemDetailPc = canvas.add(0xB8).readPointer();
                if (!itemDetailPc || itemDetailPc.isNull()) return;
                var buyDetails = itemDetailPc.add(0x40).readPointer();
                if (!buyDetails || buyDetails.isNull()) return;
                
                var sendBuyItemFn = new NativeFunction(il2cppBase.add(0xE74BF8), 'void', ['pointer', 'int']);
                sendBuyItemFn(buyDetails, qty);
            } catch(e) {}
        });
        resolve({ ok: true });
    });
};

globalThis._blockNpcDialog = false;

rpc.exports.setBlockNpcDialog = function(block) {
    globalThis._blockNpcDialog = !!block;
    return { ok: true, blocked: globalThis._blockNpcDialog };
};

// Vòng lặp quét đóng các bảng hội thoại siêu nhẹ (200ms) chạy trực tiếp trong Frida
setInterval(function() {
    if (globalThis._blockNpcDialog && typeof il2cppBase !== 'undefined' && il2cppBase) {
        try {
            var canvas = getPopUpCanvasInstanceLocal();
            if (canvas && !canvas.isNull()) {
                var dialog = canvas.add(0x128).readPointer();
                var dialog10 = canvas.add(0x130).readPointer();
                var dialogInfi = canvas.add(0x138).readPointer();

                // Kiểm tra trạng thái hoạt động (isStarted) trực tiếp trên bộ nhớ RAM
                var isDialogActive = dialog && !dialog.isNull() && dialog.add(0xA0).readU8() === 1;
                var isDialog10Active = dialog10 && !dialog10.isNull() && dialog10.add(0x78).readU8() === 1;
                var isDialogInfiActive = dialogInfi && !dialogInfi.isNull() && dialogInfi.add(0x88).readU8() === 1;

                if (isDialogActive || isDialog10Active || isDialogInfiActive) {
                    globalThis._mainThreadActions = globalThis._mainThreadActions || [];
                    if (globalThis._mainThreadActions.length === 0) {
                        globalThis._mainThreadActions.push(function() {
                            try {
                                if (canvas && !canvas.isNull()) {
                                    if (isDialogActive) {
                                        var d = canvas.add(0x128).readPointer();
                                        if (d && !d.isNull() && d.add(0xA0).readU8() === 1) {
                                            var closeFn = new NativeFunction(il2cppBase.add(0xE82838), 'void', ['pointer']);
                                            closeFn(d);
                                        }
                                    }
                                    if (isDialog10Active) {
                                        var d10 = canvas.add(0x130).readPointer();
                                        if (d10 && !d10.isNull() && d10.add(0x78).readU8() === 1) {
                                            var closeFn = new NativeFunction(il2cppBase.add(0xE80744), 'void', ['pointer']);
                                            closeFn(d10);
                                        }
                                    }
                                    if (isDialogInfiActive) {
                                        var dInfi = canvas.add(0x138).readPointer();
                                        if (dInfi && !dInfi.isNull() && dInfi.add(0x88).readU8() === 1) {
                                            var closeFn = new NativeFunction(il2cppBase.add(0xE816A0), 'void', ['pointer']);
                                            closeFn(dInfi);
                                        }
                                    }
                                }
                                // Tự động đóng logic state hội thoại của PlayerMain
                                if (typeof _playerMainInstance !== 'undefined' && _playerMainInstance && !_playerMainInstance.isNull()) {
                                    var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE458F4), 'void', ['pointer']);
                                    closeNpcDialogFn(_playerMainInstance);
                                    var closeNpcShopFn = new NativeFunction(il2cppBase.add(0xE4535C), 'void', ['pointer']);
                                    closeNpcShopFn(_playerMainInstance);
                                }
                            } catch(e) {}
                        });
                    }
                }
            }
        } catch(e) {}
    }
}, 200);

rpc.exports.autoLoginTick = function(username, password) {
    if (typeof Il2Cpp === 'undefined') return { state: 'ERROR', error: 'no il2cpp' };
    return Il2Cpp.perform(function () {
        try {
            var Res = Il2Cpp.domain.assembly('UnityEngine.CoreModule').image.class('UnityEngine.Resources');
            var findM = Res.method('FindObjectsOfTypeAll', 1);

            // 1. Check if already in game
            var PlayerMainClass = Il2Cpp.domain.assembly('Assembly-CSharp').image.class('PlayerMain');
            if (PlayerMainClass) {
                var players = findM.invoke(PlayerMainClass.type.object);
                for (var p = 0; p < players.length; p++) {
                    var pGo = players.get(p).method('get_gameObject').invoke();
                    if (pGo.method('get_activeInHierarchy').invoke()) {
                        return { state: 'STATE_IN_GAME', msg: 'Đã vào game thành công!' };
                    }
                }
            }

            var checkTextAndClick = function(textKeyword1, textKeyword2) {
                var invokeClick = function(inst) {
                    var btnKlass = Il2Cpp.domain.assembly('UnityEngine.UI').image.class('UnityEngine.UI.Button');
                    var btn = inst.method('GetComponentInParent', 1).invoke(btnKlass.type.object);
                    if (btn) {
                        try { btn.method('onClick').invoke().method('Invoke').invoke(); } catch(e){}
                        return true;
                    }
                    return false;
                };

                // Check TMPro
                try {
                    var tmproKlass = Il2Cpp.domain.assembly('Unity.TextMeshPro').image.class('TMPro.TextMeshProUGUI');
                    if (tmproKlass) {
                        var arr = findM.invoke(tmproKlass.type.object);
                        for (var i = 0; i < arr.length; i++) {
                            var inst = arr.get(i);
                            var go = inst.method('get_gameObject').invoke();
                            if (go.method('get_activeInHierarchy').invoke()) {
                                var t = inst.method('get_text').invoke().toString().toLowerCase();
                                if (t.indexOf(textKeyword1) !== -1 || (textKeyword2 && t.indexOf(textKeyword2) !== -1)) {
                                    if (invokeClick(inst)) return true;
                                }
                            }
                        }
                    }
                } catch(e){}

                // Check UnityEngine.UI.Text
                try {
                    var txtKlass = Il2Cpp.domain.assembly('UnityEngine.UI').image.class('UnityEngine.UI.Text');
                    if (txtKlass) {
                        var arr = findM.invoke(txtKlass.type.object);
                        for (var i = 0; i < arr.length; i++) {
                            var inst = arr.get(i);
                            var go = inst.method('get_gameObject').invoke();
                            if (go.method('get_activeInHierarchy').invoke()) {
                                var t = inst.method('get_text').invoke().toString().toLowerCase();
                                if (t.indexOf(textKeyword1) !== -1 || (textKeyword2 && t.indexOf(textKeyword2) !== -1)) {
                                    if (invokeClick(inst)) return true;
                                }
                            }
                        }
                    }
                } catch(e){}

                // Check button names
                try {
                    var btnClass = Il2Cpp.domain.assembly('UnityEngine.UI').image.class('UnityEngine.UI.Button');
                    if (btnClass) {
                        var btnArr = findM.invoke(btnClass.type.object);
                        for (var k = 0; k < btnArr.length; k++) {
                            var btn = btnArr.get(k);
                            var btnGo = btn.method('get_gameObject').invoke();
                            if (btnGo.method('get_activeInHierarchy').invoke()) {
                                var name = btnGo.method('get_name').invoke().toString().toLowerCase();
                                if (name.indexOf(textKeyword1) !== -1 || (textKeyword2 && name.indexOf(textKeyword2) !== -1)) {
                                    btn.method('onClick').invoke().method('Invoke').invoke();
                                    return true;
                                }
                            }
                        }
                    }
                } catch(e){}
                return false;
            };

            // 2. Check for InputFields
            var inputs = [];
            var getInputs = function(klassName, asmName) {
                try {
                    var klass = Il2Cpp.domain.assembly(asmName).image.class(klassName);
                    if (klass) {
                        var arr = findM.invoke(klass.type.object);
                        for (var i = 0; i < arr.length; i++) {
                            var inst = arr.get(i);
                            var go = inst.method('get_gameObject').invoke();
                            if (go.method('get_activeInHierarchy').invoke()) inputs.push(inst);
                        }
                    }
                } catch(e){}
            };
            getInputs('UnityEngine.UI.InputField', 'UnityEngine.UI');
            getInputs('TMPro.TMP_InputField', 'Unity.TextMeshPro');

            if (inputs.length >= 2 && username && password) {
                var userField = inputs[0], passField = inputs[1];
                try { userField.method('set_text').invoke(Il2Cpp.string(username)); } 
                catch(e) { try { userField.field('m_Text').set(Il2Cpp.string(username)); } catch(e2){} }
                try { passField.method('set_text').invoke(Il2Cpp.string(password)); } 
                catch(e) { try { passField.field('m_Text').set(Il2Cpp.string(password)); } catch(e2){} }
                
                checkTextAndClick('đăng nhập', 'login');
                return { state: 'STATE_FILLED_LOGIN', msg: 'Đã điền thông tin và bấm Đăng Nhập.' };
            }

            // 3. Popup Đăng Nhập / Tạo Tài Khoản
            // We click Đăng Nhập here if found
            // But wait, "đăng nhập" could match both popup and main form. That's fine.
            if (checkTextAndClick('đăng nhập', 'đăng nhập')) {
                return { state: 'STATE_CLICKED_LOGIN_POPUP', msg: 'Đã mở bảng Đăng Nhập.' };
            }

            // 4. Vào trò chơi
            if (checkTextAndClick('vào trò chơi', 'enter')) {
                return { state: 'STATE_ENTERED_GAME', msg: 'Đang kết nối vào game...' };
            }

            // 5. Nút Tài khoản ở góc
            if (checkTextAndClick('tài khoản', 'account')) {
                return { state: 'STATE_CLICKED_ACCOUNT_ICON', msg: 'Đang mở menu Tài khoản...' };
            }

            return { state: 'STATE_UNKNOWN', msg: 'Đang chờ load màn hình hoặc không nhận diện được giao diện...' };
        } catch(e) {
            return { state: 'ERROR', error: e.message || String(e) };
        }
    });
};

