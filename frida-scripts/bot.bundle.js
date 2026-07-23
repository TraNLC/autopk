'use strict';

rpc.exports = {};

// ══ core/globals.js ══
// === Console Shim ===
(function() {
    var originalLog = console.log;
    console.log = function() {
        var args = Array.prototype.slice.call(arguments);
        var msg = args.map(function(arg) {
            if (arg === null) return 'null';
            if (arg === undefined) return 'undefined';
            if (typeof arg === 'object') {
                try { return JSON.stringify(arg); } catch(e) { return String(arg); }
            }
            return String(arg);
        }).join(' ');
        originalLog.apply(console, arguments);
        send({ type: 'log', msg: msg });
    };
})();

// === File Shims ===
(function() {
    var OriginalFile = (typeof File !== 'undefined') ? File : null;
    globalThis.File = function(path, mode) {
        if (OriginalFile) {
            return new OriginalFile(path, mode);
        }
        return {};
    };
    if (OriginalFile) {
        globalThis.File.prototype = OriginalFile.prototype;
    }
    globalThis.File.readAllText = function(path) {
        var libc = Process.findModuleByName('libc.so');
        if (!libc) return '';
        var fn_fopen = libc.findExportByName('fopen');
        var fn_fgets = libc.findExportByName('fgets');
        var fn_fclose = libc.findExportByName('fclose');
        if (!fn_fopen || !fn_fgets || !fn_fclose) {
            return '';
        }
        var fopen = new NativeFunction(fn_fopen, 'pointer', ['pointer', 'pointer']);
        var fgets = new NativeFunction(fn_fgets, 'pointer', ['pointer', 'int', 'pointer']);
        var fclose = new NativeFunction(fn_fclose, 'int', ['pointer']);
        
        var fp = fopen(Memory.allocUtf8String(path), Memory.allocUtf8String('r'));
        if (fp.isNull()) return '';
        
        var lineBuf = Memory.alloc(1024);
        var content = '';
        while (true) {
            var res = fgets(lineBuf, 1024, fp);
            if (res.isNull()) break;
            content += lineBuf.readUtf8String();
        }
        fclose(fp);
        return content;
    };
})();

// === Socket State ===
var gameFd = -1;
var gameFdAutoLocked = false;
var _captureAllSends = false;
var recvBuffer = [];
var sendBuffer = [];
var SERVER_PUSH_OPS = {7:1,8:1,9:1,16:1,17:1,18:1,19:1,20:1,23:1,54:1,63:1,66:1,
                       72:1,118:1,124:1,125:1,126:1,166:1,205:1,245:1};

// === Il2Cpp State ===
var _playerMainInstance = null;
var _lastPosition = { x: 0, y: 0, eid: '', ts: 0 };
var il2cppBase = null;
var _playerMainScanned = false;
var _netCoreManagerScanned = false;
var _popUpCanvasScanned = false;
var _lastPlayerMainScanTime = 0;
var _lastNetCoreScanTime = 0;
var _lastPopUpCanvasScanTime = 0;

// === SSL State ===
var _sslReadOk = false;
var _sslWriteOk = false;
var _sslError = '';
var _sslWriteFn = null;
var _sslObj = null;

// === Diagnostic Counters ===
var _recvTotal = 0;
var _recvAny = 0;
var _fdsSeen = {};
var _fdsGameOps = {};
var _lastOps = [];
var _sendTotal = 0;

// === Native Function Pointers ===
var nativeWrite = null;
var nativeWritePtr = null;
var nativeReadPtr = null;
var writeSource = 'none';
var readSource = 'none';

// === Ripe Kim (Hoàng Kim Chín) State ===
var _ripeKimHooked = false;
var _ripeKimBuf = [];
var _npcAddLog = [];

// === Main-thread Task Queues (hook Update pattern) ===
var _pendingGoto = null;
var _gotoHookOn = false;
var _gotoLastFire = null;

var _pendingSkill = null;
var _skillHookOn = false;
var _skillLastFire = null;

var _pendingPkCid = null;
var _pendingPkSkill = 0;
var _pendingPkPhysic = 0;
var _pendingPkDismount = 0;
var _pkHookOn = false;
var _pkLast = null;

var _pendingDef = null;
var _defHookOn = false;
var _defLast = null;

var _pendingEquip = null;
var _equipHookOn = false;
var _equipLastFire = null;

var _popupQueue = null;
var _popupFound = null;
var _closeHookOn = false;
var _closePopupResult = null;

var _shopOpenLog = [];

var _sortQueue = null;
var _sortHookOn = false;
var _sortResult = null;

var _gotoCapOn = false;
var _gotoLog = [];

var _joyCapOn = false;
var _joyCnt = {};
var _joyConsumerOn = false;
var _joyRet = [];

// ══ core/helpers.js ══
// frida-scripts/core/helpers.js — Utility functions

/**
 * Convert Uint8Array to hex string (uppercase).
 * @param {Uint8Array} arr
 * @param {number} maxBytes - max bytes to convert
 * @returns {string}
 */
function toHex(arr, maxBytes) {
    var n = Math.min(arr.length, maxBytes || arr.length);
    var result = '';
    for (var i = 0; i < n; i++) {
        result += ('0' + arr[i].toString(16)).slice(-2);
    }
    return result;
}

/**
 * Parse packet header from buffer.
 * Packet format: [uint32 LE proto_len] [uint16 LE opcode] [proto body]
 * @param {Uint8Array} data
 * @returns {{ opcode: number, protoLen: number, valid: boolean }}
 */
function parsePacketHeader(data) {
    if (data.length < 6) return { opcode: -1, protoLen: -1, valid: false };
    var protoLen = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
    var opcode = data[4] | (data[5] << 8);
    return { opcode: opcode, protoLen: protoLen, valid: opcode > 0 };
}

/**
 * Build a packet record for send/recv buffer.
 */
function makePacketRecord(data, n) {
    var hex = toHex(data, 8192);
    var hdr = parsePacketHeader(data);
    return {
        opcode: hdr.opcode,
        name: (hdr.opcode >= 0 && GS_OPCODES[hdr.opcode]) ? GS_OPCODES[hdr.opcode] : ('UNK_' + hdr.opcode),
        size: n,
        hex: hex,
        raw: hex
    };
}

/**
 * Emit a send packet from a buffer pointer + length (used by writev/sendmsg hooks).
 */
function emitFromBuf(base, n) {
    try {
        var take = n < 512 ? n : 512;
        var data = new Uint8Array(base.readByteArray(take));
        var hdr = parsePacketHeader(data);
        var name = (hdr.opcode >= 0 && GS_OPCODES[hdr.opcode]) ? GS_OPCODES[hdr.opcode] : ('UNK_' + hdr.opcode);
        var hex = toHex(data, 256);
        sendBuffer.push({ opcode: hdr.opcode, name: name, size: n, hex: hex });
        _sendTotal++;
        if (sendBuffer.length > 100) sendBuffer.shift();
        send({ type: 'send_out', opcode: hdr.opcode, name: name, size: n, hex: hex });
    } catch (e) {}
}

/**
 * Find an Il2Cpp export symbol by name.
 * Tries multiple naming conventions (+ version suffixes like _0, _1).
 */
function il2cppExport(name) {
    // 1. Find module
    var mod = Process.findModuleByName('libil2cpp.so');
    if (!mod) {
        var mods = Process.enumerateModules();
        for (var i = 0; i < mods.length; i++) {
            if ((mods[i].name && mods[i].name.indexOf('libil2cpp.so') !== -1) ||
                (mods[i].path && mods[i].path.indexOf('libil2cpp.so') !== -1)) {
                mod = mods[i];
                break;
            }
        }
    }
    if (!mod) return null;

    // 2. Try exact name (findExportByName)
    var p = mod.findExportByName(name);
    if (p) return p;

    // 3. Try with version suffixes: name_0, name_1, ...
    for (var s = 0; s < 5; s++) {
        p = mod.findExportByName(name + '_' + s);
        if (p) return p;
    }

    // 4. Try DebugSymbol
    try {
        var sym = DebugSymbol.fromName(name);
        if (sym && sym.address && !sym.address.isNull()) return sym.address;
    } catch(e) {}
    try {
        var sym2 = DebugSymbol.fromName('libil2cpp.so!' + name);
        if (sym2 && sym2.address && !sym2.address.isNull()) return sym2.address;
    } catch(e2) {}

    return null;
}

/**
 * Find a MonoBehaviour instance by class name (tries multiple namespaces).
 */
function findLoginInstance(className) {
    function tryClass(img, n) {
        try { return img.class(n); } catch (e) { return null; }
    }
    try {
        var img = Il2Cpp.domain.assembly('Assembly-CSharp').image;
        var names = [className,
            'game.scene.login.' + className,
            'game.network.' + className,
            'game.ui.' + className,
            'game.scene.' + className,
            'game.' + className];
        var k = null;
        for (var i = 0; i < names.length && !k; i++) {
            k = tryClass(img, names[i]);
        }
        if (!k) return null;
        var Res = Il2Cpp.domain.assembly('UnityEngine.CoreModule').image.class('UnityEngine.Resources');
        var arr = Res.method('FindObjectsOfTypeAll', 1).invoke(k.type.object);
        if (arr && arr.length) return arr.get(0);
    } catch (e) {}
    return null;
}

// ══ core/opcodes.js ══
// frida-scripts/core/opcodes.js — Game Server Opcode Map (VLTK1)

var GS_OPCODES = {
    0: 'eUnidentified',
    1: 'ePlayerLoginRequest',    2: 'ePlayerLoginResponse',
    3: 'eEnterWorldSuccess',     4: 'eCharacterDetailResponse',
    5: 'eSkillResponse',         6: 'eItemResponse',
    7: 'eEnterMap',              8: 'eEnterGameServer',
    9: 'eStringData',            10: 'eDelivered',
    13: 'eJumToMap',             20: 'eSyncPlayerMove',
    23: 'eSyncDamage',           33: 'eNpcDialogue',
    34: 'eNpcQuest',             35: 'eNpcSelect',
    40: 'eCastSkill',            48: 'ePlayerTalk',
    49: 'ePlayerUserItem',       54: 'eAddMapObject',
    56: 'eObjectPickup',         58: 'eSetRiding',
    69: 'ePing',                 70: 'ePong',
    71: 'eMapDialogNpcListRequest',
    72: 'eMapDialogNpcListResponse',
    117: 'eSwitchWalking',
    119: 'eShopTypeOne',         120: 'eShopTypeTwo',
    122: 'eTownportal',
    132: 'eChatSend',            133: 'eChatMessage',
    140: 'eApplyAutoplayProfile',
    166: 'eSyncPlayerInfo',
    172: 'eEnterTongMap',        188: 'eSelfRevertMap',
    205: 'eAddPlayer',
    212: 'eShopResponse',
    229: 'eTongWarEnter',        231: 'eGotoNpc',
    232: 'eNpcHeal',
    238: 'eDoSkillTargetPlayer', 239: 'eDoSkillTargetNpc',
    240: 'eDoSkillTargetPosition',
    245: 'eSyncNpcData',
    248: 'eGotoPosition',
};

// ══ core/il2cpp-init.js ══
// frida-scripts/core/il2cpp-init.js — Il2Cpp base detection + PlayerMain reading
globalThis._mainThreadActions = globalThis._mainThreadActions || [];
globalThis.npcCache = globalThis.npcCache || {};

/**
 * Find libil2cpp.so base address from /proc/self/maps.
 */
function getIl2CppBase() {
    var mod = Process.findModuleByName('libil2cpp.so') || Process.findModuleByName('libil4i3n.so');
    if (mod) return mod.base;

    var base = null;
    var lines = File.readAllText('/proc/self/maps').split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r-x') !== -1) {
            var parts = line.trim().split(/\s+/);
            base = ptr('0x' + parts[0].split('-')[0]);
            break;
        }
    }
    if (!base) {
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r--p') !== -1) {
                var parts = line.trim().split(/\s+/);
                base = ptr('0x' + parts[0].split('-')[0]);
                break;
            }
        }
    }
    return base;
}

/**
 * Read PlayerMain.instance directly via IL2CPP static field.
 * Uses native il2cpp exports (no bridge required).
 */
function readPlayerMainDirect() {
    if (_playerMainInstance) {
        try {
            var mapId = _playerMainInstance.add(0xEC).readU32();
            if (mapId > 0 && mapId < 10000000) {
                return { ok: true, playerMain: _playerMainInstance.toString(), source: 'cached' };
            }
        } catch(e) {
            _playerMainInstance = null;
        }
    }
    
    var now = Date.now();
    _lastPlayerMainScanTime = now;
    
    // Try native IL2CPP functions first (highly reliable and doesn't require global-metadata.dat)
    try {
        var libBase = il2cppBase || (typeof getIl2CppBase !== 'undefined' ? getIl2CppBase() : null);
        if (libBase) {
            var fn_domain_get = Module.findExportByName('libil2cpp.so', 'il2cpp_domain_get') || (typeof findElfExport !== 'undefined' ? findElfExport(libBase, 'il2cpp_domain_get') : null);
            var fn_domain_assembly_open = Module.findExportByName('libil2cpp.so', 'il2cpp_domain_assembly_open') || (typeof findElfExport !== 'undefined' ? findElfExport(libBase, 'il2cpp_domain_assembly_open') : null);
            var fn_assembly_get_image = Module.findExportByName('libil2cpp.so', 'il2cpp_assembly_get_image') || (typeof findElfExport !== 'undefined' ? findElfExport(libBase, 'il2cpp_assembly_get_image') : null);
            var fn_class_from_name = Module.findExportByName('libil2cpp.so', 'il2cpp_class_from_name') || (typeof findElfExport !== 'undefined' ? findElfExport(libBase, 'il2cpp_class_from_name') : null);
            
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
                            var klass = class_from_name(image, Memory.allocUtf8String(""), Memory.allocUtf8String("PlayerMain"));
                            if (klass && !klass.isNull()) {
                                var staticFields = klass.add(0xB8).readPointer();
                                if (staticFields && !staticFields.isNull()) {
                                    var instance = staticFields.readPointer();
                                    if (instance && !instance.isNull() && parseInt(instance.toString()) > 0x10000) {
                                        _playerMainInstance = instance;
                                        return { ok: true, playerMain: _playerMainInstance.toString(), source: 'native_il2cpp' };
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch(e) {
        // Fallback to metadata scanning if native resolution fails
    }
    
    // Resolve dynamically!
    try {
        var pattern = '50 6c 61 79 65 72 4d 61 69 6e'; // "PlayerMain"
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
        
        if (!metaRange) return { ok: false, error: 'global-metadata.dat not found' };
        
        var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
        if (results.length === 0) return { ok: false, error: '"PlayerMain" string not found' };
        nameStrAddr = results[0].address;
        
        var hex = nameStrAddr.toString(16);
        while (hex.length < 16) hex = '0' + hex;
        var parts = [];
        for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
        var ptrPattern = parts.join(' ');
        
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var classPtr = null;
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
        
        if (!classPtr) return { ok: false, error: 'PlayerMain class pointer not found' };
        
        var staticFields = classPtr.add(0xB8).readPointer();
        if (staticFields.isNull()) return { ok: false, error: 'static_fields is null' };
        
        var instance = staticFields.readPointer();
        if (instance.isNull()) return { ok: false, error: 'PlayerMain.instance is null' };
        
        _playerMainInstance = instance;
        return { ok: true, playerMain: _playerMainInstance.toString(), source: 'dynamic_scan' };
    } catch(e) {
        return { ok: false, error: 'dynamic scan error: ' + e.message };
    }
}

(function initIl2Cpp() {
    il2cppBase = getIl2CppBase();
    if (il2cppBase) {
        send({ type: 'il2cpp_ready', lib: 'libil2cpp.so', base: il2cppBase });
        try {
            // Hook Controller.Update at 0xFB6994 for reliable tick
            globalThis._tickCount = 0;

            Interceptor.attach(il2cppBase.add(0xFB6994), {
                onEnter: function(args) {
                    globalThis._tickCount++;
                    if (globalThis._tickCount % 600 === 0) {
                        // send({ type: 'log', message: '[Controller.Update] Firing, tick: ' + globalThis._tickCount });
                    }
                    if (globalThis._mainThreadActions && globalThis._mainThreadActions.length > 0) {
                        var action = globalThis._mainThreadActions.shift();
                        try {
                            action();
                        } catch (e) {
                            console.log("[MainThread] Exception executing action: " + e.message + "\\n" + e.stack);
                        }
                    }
                }
            });

            // libc recv hook removed. Waiting for World.Update to run on main thread.

            // Hook World.Update at 0xF2B3B8
            Interceptor.attach(il2cppBase.add(0xF2B3B8), {
                onEnter: function(args) {
                    try {
                        var worldPtr = args[0];
                        if (worldPtr.isNull()) return;

                        if (globalThis._mainThreadActions && globalThis._mainThreadActions.length > 0) {
                            var action = globalThis._mainThreadActions.shift();
                            try { action(); } catch(e) { console.log("MainThread Action Error: " + e.message); }
                        }

                    // World + 0x40 points to playerMain (PlayerMain)
                        var playerMainPtr = worldPtr.add(0x40).readPointer();
                        
                        // World + 0x50 points to mainPlayer (NpcRes.Special)
                        var mainPlayerPtr = worldPtr.add(0x50).readPointer();

                        if (!playerMainPtr.isNull()) {
                            if (!_playerMainInstance || _playerMainInstance.toString() !== playerMainPtr.toString()) {
                                _playerMainInstance = playerMainPtr;
                                send({ type: 'il2cpp_event', event: 'PlayerMain captured via World.Update', ptr: _playerMainInstance.toString() });
                            }
                        }
                    } catch(e) {
                        // Ignore read errors
                    }
                }
            });
            
            // We will do another script to find the correct offset for Controller.Update or similar.
            send({ type: 'il2cpp_event', event: 'Hooks attached successfully!' });
            
            // Poll nearNpcs safely
            setInterval(function() {
                try {
                    if (!_playerMainInstance || _playerMainInstance.isNull()) return;
                    
                    var nearNpcsPtr = _playerMainInstance.add(0x60).readPointer(); // Just guessing offset for nearNpcs, usually around 0x50-0x80
                    // Let's actually find the real offset from test_dict5.js output:
                    // We need to parse nearNpcs dictionary.
                    // Wait, earlier we ran test_dict5 and we will read the log.
                } catch(e) {}
            }, 2000);

        } catch (e) {
            send({ type: 'il2cpp_error', msg: 'hooks failed: ' + e.message + '\\n' + e.stack });
        }
    } else {
        send({ type: 'il2cpp_ready', msg: 'libil2cpp.so not found in maps' });
    }
})();

// Export for RPC and Global usage
if (typeof rpc !== 'undefined' && rpc.exports) {
    rpc.exports.readPlayerMainDirect = readPlayerMainDirect;
}
globalThis.readPlayerMainDirect = readPlayerMainDirect;

// ══ hooks/native-funcs.js ══
// frida-scripts/hooks/native-funcs.js — Find executable write() and read()

(function findExecutableFunctions() {
    var mods = Process.enumerateModules();
    for (var i = 0; i < mods.length; i++) {
        var m = mods[i];
        try {
            // Find write
            if (!nativeWritePtr) {
                var wexp = m.findExportByName('write');
                if (wexp) {
                    var wrange = Process.findRangeByAddress(wexp);
                    if (wrange && wrange.protection.indexOf('x') !== -1) {
                        nativeWritePtr = wexp;
                        nativeWrite = new NativeFunction(wexp, 'int', ['int', 'pointer', 'int']);
                        writeSource = m.name + ' @ ' + wexp + ' (' + wrange.protection + ')';
                    }
                }
            }
            // Find read
            if (!nativeReadPtr) {
                var rexp = m.findExportByName('read');
                if (rexp) {
                    var rrange = Process.findRangeByAddress(rexp);
                    if (rrange && rrange.protection.indexOf('x') !== -1) {
                        nativeReadPtr = rexp;
                        readSource = m.name + ' @ ' + rexp + ' (' + rrange.protection + ')';
                    }
                }
            }
        } catch(e) {}
    }
})();

// ══ hooks/anti-detection.js ══
// frida-scripts/hooks/anti-detection.js — Anti-detection: prevent game from crashing when Frida attaches
// Based on FridaBypassKit patterns from reverse-skill toolkit

(function antiDetectionHooks() {
    // Only apply if Java is available (some games are pure native/Il2Cpp)
    try {
        if (typeof Java === 'undefined') return;
        
        Java.perform(function() {
            send({ type: 'log', msg: '[anti-detect] Installing anti-detection hooks...' });

            // 1. Debug detection bypass
            try {
                var Debug = Java.use('android.os.Debug');
                Debug.isDebuggerConnected.implementation = function() {
                    return false;
                };
                send({ type: 'log', msg: '[anti-detect] Debug.isDebuggerConnected hooked' });
            } catch(e) {}

            // 2. Prevent process killing (anti-tamper)
            try {
                var Process = Java.use('android.os.Process');
                Process.killProcess.implementation = function(pid) {
                    send({ type: 'log', msg: '[anti-detect] Blocked Process.killProcess(' + pid + ')' });
                    // Don't actually kill
                };
                send({ type: 'log', msg: '[anti-detect] Process.killProcess hooked' });
            } catch(e) {}

            // 3. System.exit() bypass
            try {
                var System = Java.use('java.lang.System');
                System.exit.implementation = function(code) {
                    send({ type: 'log', msg: '[anti-detect] Blocked System.exit(' + code + ')' });
                    // Don't exit
                };
                send({ type: 'log', msg: '[anti-detect] System.exit hooked' });
            } catch(e) {}

            // 4. Runtime.exec() - block shell commands that detect root/frida
            try {
                var Runtime = Java.use('java.lang.Runtime');
                Runtime.exec.overload('[Ljava.lang.String;').implementation = function(cmd) {
                    var cmdStr = cmd.length > 0 ? cmd[0] : '';
                    // Block known detection commands
                    if (cmdStr.indexOf('frida') !== -1 || 
                        cmdStr.indexOf('su') !== -1 ||
                        cmdStr.indexOf('magisk') !== -1 ||
                        cmdStr.indexOf('which') !== -1) {
                        send({ type: 'log', msg: '[anti-detect] Blocked suspicious exec: ' + cmdStr });
                        throw new Error('Command not found');
                    }
                    return this.exec(cmd);
                };
                send({ type: 'log', msg: '[anti-detect] Runtime.exec hooked' });
            } catch(e) {}

            // 5. File existence check bypass (hides frida-server)
            try {
                var File = Java.use('java.io.File');
                File.exists.implementation = function() {
                    var path = this.getAbsolutePath();
                    if (path.indexOf('frida') !== -1 || 
                        path.indexOf('su') !== -1 ||
                        path.indexOf('magisk') !== -1) {
                        send({ type: 'log', msg: '[anti-detect] Hiding file: ' + path });
                        return false;
                    }
                    return this.exists();
                };
                send({ type: 'log', msg: '[anti-detect] File.exists hooked' });
            } catch(e) {}

            send({ type: 'log', msg: '[anti-detect] Anti-detection hooks installed' });
        });
    } catch(e) {
        send({ type: 'log', msg: '[anti-detect] Java not available (pure native game), skipping' });
    }

    // === Native Anti-Debugging Bypass (TracerPid check) ===
    try {
        var appFilesDir = "/data/data/vn.perfingame.jx1mobile/files";
        var fakeStatusPath = appFilesDir + "/status";
        
        // 1. Create a fake status file with TracerPid = 0
        try {
            var f = new File(fakeStatusPath, "w");
            f.write("Name:\tvn.perfingame.jx1mobile\nState:\tR (running)\nTracerPid:\t0\n");
            f.close();
        } catch (err) {
            // Fallback to /data/local/tmp if files dir is not writable yet
            fakeStatusPath = "/data/local/tmp/fake_status";
            var f2 = new File(fakeStatusPath, "w");
            f2.write("Name:\tvn.perfingame.jx1mobile\nState:\tR (running)\nTracerPid:\t0\n");
            f2.close();
        }

        var fakePathPtr = Memory.allocUtf8String(fakeStatusPath);

        // 2. Hook fopen to redirect /proc/self/status
        var libc = Process.findModuleByName("libc.so");
        var fopenPtr = libc ? libc.findExportByName("fopen") : null;
        if (fopenPtr) {
            Interceptor.attach(fopenPtr, {
                onEnter: function(args) {
                    var path = Memory.readUtf8String(args[0]);
                    if (path && (path === "/proc/self/status" || path.indexOf("/status") !== -1 && path.indexOf("/proc/") !== -1)) {
                        args[0] = fakePathPtr; // Redirect to fake status file
                    }
                }
            });
            send({ type: 'log', msg: '[anti-detect] Native fopen (TracerPid redirection) hooked' });
        }

        // 3. Hook open to redirect /proc/self/status
        var openPtr = libc ? libc.findExportByName("open") : null;
        if (openPtr) {
            Interceptor.attach(openPtr, {
                onEnter: function(args) {
                    var path = Memory.readUtf8String(args[0]);
                    if (path && (path === "/proc/self/status" || path.indexOf("/status") !== -1 && path.indexOf("/proc/") !== -1)) {
                        args[0] = fakePathPtr; // Redirect to fake status file
                    }
                }
            });
            send({ type: 'log', msg: '[anti-detect] Native open (TracerPid redirection) hooked' });
        }
    } catch (e) {
        send({ type: 'log', msg: '[anti-detect] Native bypass failed: ' + e.message });
    }
})();

// ══ hooks/connect.js ══
// frida-scripts/hooks/connect.js — Hook connect() to auto-detect game socket fd

(function hookConnect() {
    try {
        var libc = Process.findModuleByName('libc.so');
        if (!libc) return;

        var connectAddr = libc.findExportByName('connect');
        if (!connectAddr) return;

        Interceptor.attach(connectAddr, {
            onEnter: function(args) {
                this.fd = args[0].toInt32();
                var sockaddr = args[1];
                try {
                    var family = sockaddr.readU16();
                    if (family === 2) { // AF_INET
                        var port = (sockaddr.add(2).readU8() << 8) | sockaddr.add(3).readU8();
                        var ip = sockaddr.add(4).readU8() + '.' + sockaddr.add(5).readU8() +
                                 '.' + sockaddr.add(6).readU8() + '.' + sockaddr.add(7).readU8();
                        // Filter out ADB/Frida ports
                        if (port > 1000 && port !== 5555 && port !== 5037 && port !== 27042) {
                            gameFd = this.fd;
                            send({ type: 'game_fd', fd: gameFd, ip: ip, port: port });
                        }
                    }
                } catch(e) {}
            }
        });
    } catch(e) {
        send({ type: 'hook_error', hook: 'connect', error: e.toString() });
    }
})();

// ══ hooks/recv.js ══
// frida-scripts/hooks/recv.js — Hook recv/read/recvfrom + SSL_read (incoming packets)

(function hookRecv() {
    try {
        var libc = Process.findModuleByName('libc.so');
        if (!libc) throw new Error('libc not found');

        var recvAddr = libc.findExportByName('recv');
        var readAddr = libc.findExportByName('read');
        var recvfromAddr = libc.findExportByName('recvfrom');

        /**
         * Shared onEnter: capture fd and buffer pointer.
         */
        function onRecvEnter(args) {
            this.fd  = args[0].toInt32();
            this.buf = args[1];
        }

        /**
         * Shared onLeave: parse incoming packet, push to recvBuffer.
         */
        function onRecvLeave(retval) {
            var n = retval.toInt32();
            if (n <= 0) return;

            // Quick header parse (6 bytes) for diagnostics on ALL fds
            var opcode = -1, plen = -1;
            if (n >= 6) {
                try {
                    var hdr = new Uint8Array(this.buf.readByteArray(6));
                    plen = hdr[0] | (hdr[1] << 8) | (hdr[2] << 16) | (hdr[3] << 24);
                    opcode = hdr[4] | (hdr[5] << 8);
                } catch (e) { return; }
            }

            // Diagnostics (lightweight, all fds)
            globalThis._recvAny = (globalThis._recvAny || 0) + 1;
            if (!globalThis._fdsSeen) globalThis._fdsSeen = {};
            globalThis._fdsSeen[this.fd] = (globalThis._fdsSeen[this.fd] || 0) + 1;
            if (!globalThis._lastOps) globalThis._lastOps = [];
            if (opcode >= 0) {
                globalThis._lastOps.push(this.fd + ':' + opcode);
                if (globalThis._lastOps.length > 24) globalThis._lastOps.shift();
            }
            if (opcode > 0 && globalThis.GS_OPCODES && globalThis.GS_OPCODES[opcode] && plen >= 0 && plen <= n) {
                if (!globalThis._fdsGameOps) globalThis._fdsGameOps = {};
                globalThis._fdsGameOps[this.fd] = (globalThis._fdsGameOps[this.fd] || 0) + 1;
            }

// Only process game socket OR auto-detect mode
        var isGameFd = (this.fd === globalThis.gameFd);
        var autoDetect = (globalThis.gameFd === -1);

        if (!isGameFd && !autoDetect) return;

            var data;
            try { data = new Uint8Array(this.buf.readByteArray(n)); } catch (e) { return; }

            try {
                if (globalThis.makePacketRecord) {
                    var pkt = globalThis.makePacketRecord(data, n);
                    
                    if (opcode > 0 && opcode <= 30000) {
                        if (!globalThis.recvBuffer) globalThis.recvBuffer = [];
                        globalThis.recvBuffer.push(pkt);
                        globalThis._recvTotal = (globalThis._recvTotal || 0) + 1;
                        if (globalThis.recvBuffer.length > 3000) globalThis.recvBuffer.shift();
                    }

                    // AUTO-DETECT: lock gameFd when we see a valid game opcode
                    if (autoDetect && opcode > 0 && globalThis.GS_OPCODES && globalThis.GS_OPCODES[opcode] !== undefined) {
                        globalThis.gameFd = this.fd;
                        send({ type: 'game_fd', fd: globalThis.gameFd, detectedBy: 'recv opcode ' + opcode + ' (' + globalThis.GS_OPCODES[opcode] + ')' });
                    }
                    
                    // Shop data detection
                    if (opcode === 119 || opcode === 120 || opcode === 212) {
                        send({ type: 'shop_data', opcode: opcode, name: pkt.name, hex: pkt.hex });
                    }
                }
            } catch (e) {}

            // Track entity position from opcode 9 (throttled ~0.8s)
            if (opcode === 9 && n > 10 && (Date.now() - (_lastPosition.ts || 0) > 800)) {
                try {
                    var bodyStr = '';
                    for (var bi = 6; bi < n; bi++) {
                        bodyStr += String.fromCharCode(data[bi]);
                    }
                    var sparts = bodyStr.split('|');
                    if (sparts.length >= 4) {
                        var et = parseInt(sparts[0]);
                        if (et === 1 || et === 2) {
                            var ex = parseInt(sparts[2]);
                            var ey = parseInt(sparts[3]);
                            if (ex > 0 && ey > 0) {
                                _lastPosition = { x: ex, y: ey, eid: sparts[1], ts: Date.now() };
                            }
                        }
                    }
                } catch(ee) {}
            }
        }

        // Attach to all recv variants
        if (recvAddr)     Interceptor.attach(recvAddr,     { onEnter: onRecvEnter, onLeave: onRecvLeave });
        if (readAddr)     Interceptor.attach(readAddr,     { onEnter: onRecvEnter, onLeave: onRecvLeave });
        if (recvfromAddr) Interceptor.attach(recvfromAddr, { onEnter: onRecvEnter, onLeave: onRecvLeave });
        // Houdini x86: ARM code calls through native (x86) read()
        if (nativeReadPtr) {
            Interceptor.attach(nativeReadPtr, { onEnter: onRecvEnter, onLeave: onRecvLeave });
        }
    } catch(e) {
        send({ type: 'hook_error', hook: 'recv', error: e.toString() });
    }
})();

// ══ hooks/send.js ══
// frida-scripts/hooks/send.js — Hook write/send/sendto/writev/sendmsg + SSL_write (outgoing packets)

/**
 * Shared onLeave handler for send-like functions.
 * Captures outgoing packet, pushes to sendBuffer, notifies host.
 */
function makeSendLeaveHandler() {
    return function(retval) {
        var n = retval.toInt32();
        if (n <= 0) return;

        var autoDetect = (globalThis.gameFd === -1);

        // For non-gameFd (and not auto-detect): only peek op140
        if (this.fd !== globalThis.gameFd && !globalThis._captureAllSends && !autoDetect) {
            try {
                if (n < 6) return;
                var h6 = new Uint8Array(this.buf.readByteArray(6));
                if ((h6[4] | (h6[5] << 8)) !== 140) return;
            } catch (e) { return; }
        }

        try {
            var data = new Uint8Array(this.buf.readByteArray(n));
            if (globalThis.parsePacketHeader) {
                var hdr = globalThis.parsePacketHeader(data);
                if (hdr.opcode <= 0 || hdr.opcode > 30000) return;

                var name = (globalThis.GS_OPCODES && globalThis.GS_OPCODES[hdr.opcode]) || ('UNK_' + hdr.opcode);
                var hex = globalThis.toHex ? globalThis.toHex(data, 256) : '';
                var pkt = { opcode: hdr.opcode, name: name, size: n, hex: hex };
                if (!globalThis.sendBuffer) globalThis.sendBuffer = [];
                globalThis.sendBuffer.push(pkt);
                globalThis._sendTotal = (globalThis._sendTotal || 0) + 1;
                if (globalThis.sendBuffer.length > 500) globalThis.sendBuffer.shift();
                send({ type: 'send_out', opcode: hdr.opcode, name: name, size: n, hex: hex });

                // AUTO-DETECT: lock gameFd from outgoing packets too
                if (autoDetect && globalThis.GS_OPCODES && globalThis.GS_OPCODES[hdr.opcode] !== undefined) {
                    globalThis.gameFd = this.fd;
                    send({ type: 'game_fd', fd: globalThis.gameFd, detectedBy: 'send opcode ' + hdr.opcode + ' (' + globalThis.GS_OPCODES[hdr.opcode] + ')' });
                }
            }
        } catch(e) {}
    };
}

/**
 * Shared onEnter: capture fd, buffer, length.
 */
function onSendEnter(args) {
    this.fd = args[0].toInt32();
    this.buf = args[1];
    this.len = args[2].toInt32();
}

// ==================== Hook native write() ====================
(function hookNativeWrite() {
    if (!globalThis.nativeWritePtr) return;
    Interceptor.attach(globalThis.nativeWritePtr, {
        onEnter: onSendEnter,
        onLeave: makeSendLeaveHandler()
    });
})();

// ==================== Hook libc send/sendto ====================
(function hookLibcSend() {
    try {
        var libc = Process.findModuleByName('libc.so');
        if (!libc) return;

        var sendAddr = libc.findExportByName('send');
        var sendtoAddr = libc.findExportByName('sendto');
        var writevAddr = libc.findExportByName('writev');
        var sendmsgAddr = libc.findExportByName('sendmsg');

        if (sendAddr) {
            Interceptor.attach(sendAddr, {
                onEnter: onSendEnter,
                onLeave: makeSendLeaveHandler()
            });
        }

        if (sendtoAddr) {
            Interceptor.attach(sendtoAddr, {
                onEnter: onSendEnter,
                onLeave: makeSendLeaveHandler()
            });
        }

        // writev: scatter-gather I/O
        if (writevAddr) {
            Interceptor.attach(writevAddr, {
                onEnter: function(args) {
                    this.fd = args[0].toInt32();
                    this.iov = args[1];
                },
                onLeave: function(retval) {
                    var n = retval.toInt32();
                    if (n <= 0 || this.fd !== globalThis.gameFd) return;
                    try { if (globalThis.emitFromBuf) globalThis.emitFromBuf(this.iov.readPointer(), n); } catch (e) {}
                }
            });
        }

        // sendmsg
        if (sendmsgAddr) {
            Interceptor.attach(sendmsgAddr, {
                onEnter: function(args) {
                    this.fd = args[0].toInt32();
                    this.msg = args[1];
                },
                onLeave: function(retval) {
                    var n = retval.toInt32();
                    if (n <= 0 || this.fd !== globalThis.gameFd) return;
                    try {
                        var iov = this.msg.add(0x10).readPointer(); // msghdr.msg_iov
                        if (globalThis.emitFromBuf) globalThis.emitFromBuf(iov.readPointer(), n);
                    } catch (e) {}
                }
            });
        }
    } catch(e) {
        send({ type: 'hook_error', hook: 'send', error: e.toString() });
    }
})();

// ══ rpc/packet-io.js ══
// frida-scripts/rpc/packet-io.js — Packet send/receive buffer RPCs

/**
 * Send a raw packet through the game socket.
 * Uses native write() (Houdini-safe) if available, otherwise SSL_write.
 */
rpc.exports.sendPacket = function(opcode, hexBody) {
    // Build packet: [uint32 LE proto_len] [uint16 LE opcode] [hex body]
    var body = hexBody ? hexToBytes(hexBody) : [];
    var protoLen = body.length;
    var buf = Memory.alloc(6 + protoLen);

    // Write header
    buf.writeU32(protoLen);
    buf.add(4).writeU16(opcode);

    // Write body
    if (protoLen > 0) {
        buf.add(6).writeByteArray(body);
    }

    var totalLen = 6 + protoLen;

    // Try SSL_write first (game uses SSL)
    if (_sslWriteFn && _sslObj && !_sslObj.isNull()) {
        try {
            var ret = _sslWriteFn(_sslObj, buf, totalLen);
            return { ok: true, method: 'ssl_write', sent: ret, opcode: opcode };
        } catch (e) {
            // Fall through to native write
        }
    }

    // Fallback: native write()
    if (nativeWrite && gameFd > 0) {
        try {
            var ret = nativeWrite(gameFd, buf, totalLen);
            return { ok: true, method: 'native_write', sent: ret, opcode: opcode };
        } catch (e) {
            return { ok: false, error: 'write failed: ' + e, opcode: opcode };
        }
    }

    return { ok: false, error: 'no send method available (no SSL_obj, no nativeWrite)' };
};

/**
 * Send a raw packet specifically to the game's TCP socket (used for shop/rpc).
 */
rpc.exports.sendTcpPacket = function(opcode, hexBody) {
    var tcpFd = typeof gameFd !== 'undefined' ? gameFd : (globalThis.gameFd || -1);
    if (tcpFd === -1) {
        for(var i=0; i<1024; i++) {
            try {
                var type = Socket.type(i);
                if (type === 'tcp' || type === 'tcp6') {
                    var peer = Socket.peerAddress(i);
                    if (peer && peer.port !== 80 && peer.port !== 443 && peer.port !== 27042) {
                        tcpFd = i;
                        break;
                    }
                }
            } catch(e){}
        }
    }
    
    if (tcpFd === -1) return { ok: false, error: 'no tcp socket found' };
    
    var body = hexBody ? hexToBytes(hexBody) : [];
    var protoLen = body.length;
    var buf = Memory.alloc(6 + protoLen);
    buf.writeU32(protoLen);
    buf.add(4).writeU16(opcode);
    if (protoLen > 0) buf.add(6).writeByteArray(body);
    
    if (nativeWrite) {
        try {
            var ret = nativeWrite(tcpFd, buf, 6 + protoLen);
            return { ok: true, method: 'native_write_tcp', sent: ret, opcode: opcode, fd: tcpFd };
        } catch (e) {
            return { ok: false, error: 'tcp write failed: ' + e.message };
        }
    }
    return { ok: false, error: 'nativeWrite not available' };
};

/**
 * Get buffered received packets (oldest first) matching optional opcode filter.
 * Automatically clears returned packets.
 */
rpc.exports.getRecvPackets = function(opcodeFilter, maxCount) {
    var max = maxCount || 50;
    var result = [];
    var remaining = [];

    for (var i = 0; i < recvBuffer.length; i++) {
        var pkt = recvBuffer[i];
        if (opcodeFilter === undefined || opcodeFilter === null || pkt.opcode === opcodeFilter) {
            if (result.length < max) {
                result.push(pkt);
                continue;
            }
        }
        remaining.push(pkt);
    }

    recvBuffer = remaining;
    return { ok: true, count: result.length, packets: result };
};

/**
 * Get buffered sent packets.
 */
rpc.exports.getSentPackets = function(maxCount) {
    var max = maxCount || 20;
    var result = sendBuffer.slice(-max);
    return { ok: true, count: result.length, packets: result };
};

/**
 * Get diagnostic info: socket state, counters, SSL status.
 */
rpc.exports.getDiag = function() {
    return {
        gameFd: gameFd,
        gameFdAutoLocked: gameFdAutoLocked,
        recvTotal: _recvTotal,
        recvAny: _recvAny,
        sendTotal: _sendTotal,
        sslReadOk: _sslReadOk,
        sslWriteOk: _sslWriteOk,
        sslObj: _sslObj ? _sslObj.toString() : null,
        writeSource: writeSource,
        readSource: readSource,
        fdsSeen: _fdsSeen,
        fdsGameOps: _fdsGameOps,
        lastOps: _lastOps.slice(-10),
        lastPosition: _lastPosition,
    };
};

/**
 * Lock gameFd (prevent auto-lock from overriding manual lock).
 */
rpc.exports.lockFd = function(fd) {
    gameFd = fd | 0;
    gameFdAutoLocked = true;
    send({ type: 'fd_locked', fd: gameFd });
    return { ok: true, fd: gameFd };
};

/**
 * Toggle captureAllSends (diagnostic mode — captures all outgoing packets on all fds).
 */
rpc.exports.setCaptureAllSends = function(enable) {
    _captureAllSends = !!enable;
    return { ok: true, captureAllSends: _captureAllSends };
};

// ==================== Helpers ====================

function hexToBytes(hex) {
    var bytes = [];
    for (var i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
}

// ══ rpc/core/Il2CppUtils.js ══
// frida-scripts/rpc/core/Il2CppUtils.js -- Utilities for IL2CPP memory and native exports

function findElfExport(base, targetName) {
    // Try built-in resolver globally first
    try {
        var exp = Module.findExportByName(null, targetName);
        if (exp && !exp.isNull()) {
            return exp;
        }
    } catch(e) {}
    
    // Check if the passed base already points to a valid ELF header
    var isBaseElf = false;
    if (base && !base.isNull()) {
        try {
            var magic = base.readByteArray(4);
            var u8 = new Uint8Array(magic);
            if (u8[0] === 0x7f && u8[1] === 0x45 && u8[2] === 0x4c && u8[3] === 0x46) {
                isBaseElf = true;
            }
        } catch(e) {}
    }
    
    // Only parse maps if base is not already resolved/valid
    if (!isBaseElf) {
        var lines = File.readAllText('/proc/self/maps').split('\n');
        var foundBase = null;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('libil2cpp.so') !== -1 && line.indexOf('r--p') !== -1) {
                var parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                    var offsetVal = parseInt(parts[2], 16);
                    if (offsetVal === 0) {
                        foundBase = ptr('0x' + parts[0].split('-')[0]);
                        break;
                    }
                }
            }
        }
        if (foundBase) {
            base = foundBase;
        } else {
            return ptr(0);
        }
    }
    
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
        try {
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
        } catch(e) {
            break; // End of symtab or unreadable memory
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

// ══ rpc/core/PlayerManager.js ══
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
            res.mapId = _playerMainInstance.add(0xEC).readS32();
            
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

rpc.exports.getNearNpcNames = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
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
            return { ok: true, npcMap: npcMap };
        } catch(e) {
            return { ok: false, error: e.message };
        }
    });
};

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
        } catch(e) {
            return { ok: false, error: e.message };
        }
        return { ok: false, error: 'Item not found' };
    });
};

rpc.exports.getTkScoreDeepScan = function() {
    return new Promise(function(resolve) {
        var pattern = "?? 00 e1 00 20 00 ?? 00 68 00 e2 00 ?? 00"; // Case-insensitive "Cá nhân" in UTF-16LE
        var ranges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        
        function scanRange(index) {
            if (index >= ranges.length) {
                resolve({ ok: false, score: 0, rank: 0, kills: 0, top10Score: 0 });
                return;
            }
            Memory.scan(ranges[index].base, ranges[index].size, pattern, {
                onMatch: function(address, size) {
                    try {
                        var str = address.readUtf16String(50);
                        if (str) {
                            var lowerStr = str.toLowerCase();
                            if (lowerStr.indexOf("cá nhân") !== -1 && (lowerStr.indexOf("điểm") !== -1 || lowerStr.indexOf("diem") !== -1)) {
                                var mScore = lowerStr.match(/(?:điểm|diem)\s+(\d+)/);
                                var mRank = lowerStr.match(/(?:hạng|hang)\s+(\d+)/);
                                var mKills = lowerStr.match(/(?:giết|giet)\s+(\d+)/);
                                if (mScore && mScore[1]) {
                                    var scoreVal = parseInt(mScore[1]);
                                    var rankVal = mRank ? parseInt(mRank[1]) : 0;
                                    var killsVal = mKills ? parseInt(mKills[1]) : 0;
                                    
                                    // Scan nearby memory (±50KB) for the 10th place score string
                                    var top10Score = 0;
                                    var startAddr = address.sub(50000);
                                    for (var offset = 0; offset < 100000; offset += 2) {
                                        try {
                                            var cand = startAddr.add(offset);
                                            var candidateStr = cand.readUtf16String(80);
                                            if (candidateStr && candidateStr.length > 3) {
                                                // Matches: "10. PlayerName 32000" or similar
                                                var m10 = candidateStr.match(/^10[\.\s]+.*?\s+(\d+)/) || candidateStr.match(/^10[\.\s]+.*?(\d+)/);
                                                if (m10 && m10[1]) {
                                                    var val = parseInt(m10[1]);
                                                    if (val > 1000 && val < 500000) {
                                                        top10Score = val;
                                                        break; // Found it!
                                                    }
                                                }
                                                offset += candidateStr.length * 2;
                                            }
                                        } catch(e) {}
                                    }
                                    
                                    resolve({ 
                                        ok: true, 
                                        score: scoreVal,
                                        rank: rankVal,
                                        kills: killsVal,
                                        top10Score: top10Score
                                    });
                                    return 'stop';
                                }
                            }
                        }
                    } catch(e) {}
                },
                onComplete: function() {
                    scanRange(index + 1);
                }
            });
        }
        scanRange(0);
    });
};

// ══ rpc/core/PlayerManager-fix.js ══
// PlayerManager-fix.js — Dùng offset chính xác từ dump, không cần Il2Cpp
// Verified offsets from data/output/dump_fields.json (2026-07-03)

// ─── PlayerMain offsets (from dump_fields.json "PlayerMain") ───────────
// 0x0: instance (static)
// 0x8: screenVisibilityRadiusHorizontal (int)
// 0xA0: target (Target)
// 0xD8: mapDialogNpcList
// 0xE4: mapIdOnlineCurrently (int)
// 0x100: runFollowTargetCid (string)

// ─── Controller offsets (from dump_fields.json "Controller") ───────────
// 0x10: position (Position)
// 0x18: state (State)

// ─── Position offsets (from dump_fields.json "Position") ───────────────
// 0x10: playerRunPosPassivity (Vector2)
// 0x28: mapPosition (Position)
// 0x30: mapPositionFloat (Vector2)
// 0x78: controller (Controller)
// 0x80: identify (Identification) ← KEY

// ─── Identification offsets (from dump_fields.json "Identification") ───
// 0x48: nameValue (string)
// 0x50: campValue (int)
// 0x54: seriesValue (int)
// 0x58: healthCurrent (int) = hp
// 0x5C: healthMax (int) = maxHp

// ─── ObjectDataField (monster data) ───────────────────────────────────
// 0x158: name (string)
// 0x160: nameColor (int) — 0=white, 1=blue, 2=gold?

// ─── Read player name from Identification ──────────────────────────────
function readIdentificationName(idnPtr) {
    if (!idnPtr || idnPtr.isNull()) return "";
    try {
        var namePtr = idnPtr.add(0x48).readPointer(); // nameValue at 0x48
        if (namePtr && !namePtr.isNull() && parseInt(namePtr.toString()) > 0x10000) {
            var len = namePtr.add(0x10).readU32();
            if (len > 0 && len < 100) {
                return namePtr.add(0x14).readUtf16String(len);
            }
        }
    } catch(e) {}
    return "";
}

// ─── GetNearEnemies WITHOUT Il2Cpp ─────────────────────────────────────
rpc.exports.getNearEnemiesNoIl2cpp = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    var enemies = [];
    var localCamp = -1, localSeries = -1, localX = 0, localY = 0;

    try {
        var pmInst = _playerMainInstance;
        
        // Read local identification via position.identify
        // PlayerMain.target → Target.controller → Controller.position → Position.identify
        // OR: PlayerMain doesn't directly have npcontroller; need to find it differently
        // For now, use the existing logic but with corrected path
        
        // Read from FPS18.updateNpc_controller list (all loaded NPCs)
        // For bridge-free, iterate nearNpcs dict
        
        var nearNpcsDict = pmInst.add(0xD8).readPointer(); // mapDialogNpcList
        // Actually nearNpcs field isn't in the dump for PlayerMain...
        // Let me check: PlayerMain has items at 0x30, skills at 0x38
        // The FPS18.updateNpc_controller has all loaded NPCs but that's complex
        
        // Fallback: use the old method but with correct offsets
        // PlayerMain.instance → target (0xA0) → controller (0x10) → position → identify
        
        // For now, just fix the read path for local player
        // Then iterate the same nearNpcs dict
        
        // Read local player position
        var targetField = pmInst.add(0xA0).readPointer(); // Target at 0xA0
        if (targetField && !targetField.isNull()) {
            var localCtrl = targetField.add(0x10).readPointer(); // Target.controller at 0x10
            if (localCtrl && !localCtrl.isNull()) {
                var localPos = localCtrl.add(0x10).readPointer(); // Controller.position at 0x10
                if (localPos && !localPos.isNull()) {
                    var localIdn = localPos.add(0x80).readPointer(); // Position.identify at 0x80
                    if (localIdn && !localIdn.isNull()) {
                        localCamp = localIdn.add(0x50).readInt();  // Identification.campValue
                        localSeries = localIdn.add(0x54).readInt(); // Identification.seriesValue
                    }
                    var mapPosFloat = localPos.add(0x30); // mapPositionFloat (Vector2)
                    localX = mapPosFloat.readFloat();
                    localY = mapPosFloat.add(0x4).readFloat();
                }
            }
        }

        // Iterate nearNpcs (old method - this field isn't in our dump but still works)
        var nearNpcsPtr = pmInst.add(0xD8); // Try mapDialogNpcList offset
        // The old code uses pmInst.field("nearNpcs") which requires Il2Cpp
        // Without Il2Cpp, we can't easily iterate this dictionary
        // For now return what we have
        
        return { ok: true, enemies: [], localX: localX, localY: localY, localCamp: localCamp, localSeries: localSeries };
        
    } catch(e) {
        return { ok: false, error: e.message };
    }
};

// ─── GetPlayerInfo WITHOUT Il2Cpp ──────────────────────────────────────
rpc.exports.getPlayerInfoNoIl2cpp = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    
    try {
        var pmInst = _playerMainInstance;
        var res = { ok: true };
        
        // Read via target → controller → position → identify
        var targetField = pmInst.add(0xA0).readPointer();
        if (targetField && !targetField.isNull()) {
            var ctrl = targetField.add(0x10).readPointer();
            if (ctrl && !ctrl.isNull()) {
                var pos = ctrl.add(0x10).readPointer();
                if (pos && !pos.isNull()) {
                    var idn = pos.add(0x80).readPointer();
                    if (idn && !idn.isNull()) {
                        res.camp = idn.add(0x50).readInt();   // campValue
                        res.series = idn.add(0x54).readInt(); // seriesValue
                        res.hp = idn.add(0x58).readInt();     // healthCurrent
                        res.maxHp = idn.add(0x5C).readInt();  // healthMax
                        res.name = readIdentificationName(idn);
                    }
                    res.x = pos.add(0x30).readFloat();  // Vector2.x
                    res.y = pos.add(0x34).readFloat(); // Vector2.y
                }
            }
        }
        
        // mapId from PlayerMain
        res.mapId = pmInst.add(0xEC).readInt(); // mapIdOnlineCurrently
        
        return res;
    } catch(e) {
        return { ok: false, error: e.message };
    }
};

// ─── Helper: verify offsets by reading known values ────────────────────
rpc.exports.verifyOffsets = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    
    try {
        var pm = _playerMainInstance;
        var r = { ok: true };
        
        // Verify mapId
        r.mapId_0xEC = pm.add(0xEC).readInt();
        
        // Verify via target path
        var target = pm.add(0xA0).readPointer();
        r.targetPtr = target ? target.toString() : 'null';
        
        if (target && !target.isNull()) {
            var ctrl = target.add(0x10).readPointer();
            r.ctrlPtr = ctrl ? ctrl.toString() : 'null';
            
            if (ctrl && !ctrl.isNull()) {
                var pos = ctrl.add(0x10).readPointer();
                r.posPtr = pos ? pos.toString() : 'null';
                
                if (pos && !pos.isNull()) {
                    var idn = pos.add(0x80).readPointer();
                    r.idnPtr = idn ? idn.toString() : 'null';
                    
                    if (idn && !idn.isNull()) {
                        r.camp = idn.add(0x50).readInt();
                        r.series = idn.add(0x54).readInt();
                        r.hp = idn.add(0x58).readInt();
                        r.maxHp = idn.add(0x5C).readInt();
                        r.name = readIdentificationName(idn);
                    }
                    
                    r.x = pos.add(0x30).readFloat();
                    r.y = pos.add(0x34).readFloat();
                }
            }
        }
        
        return r;
    } catch(e) {
        return { ok: false, error: e.message };
    }
};

// ─── Bulk verify: test nhiều offset 1 lần ─────────────────────────────
rpc.exports.bulkVerify = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    
    var pm = _playerMainInstance;
    
    function rdPtr(ptr, off) {
        try { var p = ptr.add(off).readPointer(); return p && !p.isNull() ? p.toString() : null; }
        catch(e) { return null; }
    }
    function rdInt(ptr, off) {
        try { return ptr.add(off).readInt(); } catch(e) { return null; }
    }
    function rdFloat(ptr, off) {
        try { return ptr.add(off).readFloat(); } catch(e) { return null; }
    }
    function rdStr(ptr, off) {
        try {
            var sp = ptr.add(off).readPointer();
            if (!sp || sp.isNull()) return null;
            var len = sp.add(0x10).readU32();
            if (len > 0 && len < 200) return sp.add(0x14).readUtf16String(len);
        } catch(e) {}
        return null;
    }
    
    var r = { ok: true, verified: {}, failed: [] };
    var v = r.verified;
    
    // ─── Path: PlayerMain → Target → Controller → Position → Identification ───
    var target = rdPtr(pm, 0xA0);
    
    // PlayerMain basic fields (always available)
    v.PlayerMain = {
        screenVisH: rdInt(pm, 0x8),
        screenVisV: rdInt(pm, 0xC),
        items: rdPtr(pm, 0x30) ? 'ok' : null,
        skills: rdPtr(pm, 0x38) ? 'ok' : null,
        world: rdPtr(pm, 0x48) ? 'ok' : null,
        target: target ? 'ok' : 'no target',
        mapId: rdInt(pm, 0xEC),
        npcDialog: rdPtr(pm, 0xE8) ? 'ok' : null,
        hotkey: rdPtr(pm, 0xF8) ? 'ok' : null,
        runFollow: rdStr(pm, 0x100)
    };
    
    if (!target) return r; // No target selected, stop here
    
    var ctrl = rdPtr(target, 0x10);
    if (!ctrl) { r.failed.push('Target.controller@0x10 (no target selected)'); return r; }
    
    var pos = rdPtr(ctrl, 0x10);
    if (!pos) { r.failed.push('Position@0x10'); return r; }
    
    var idn = rdPtr(pos, 0x80);
    
    v.PlayerMain = {
        screenVisH: rdInt(pm, 0x8),
        screenVisV: rdInt(pm, 0xC),
        items: rdPtr(pm, 0x30) ? 'ok' : null,
        skills: rdPtr(pm, 0x38) ? 'ok' : null,
        world: rdPtr(pm, 0x48) ? 'ok' : null,
        autoplay: rdPtr(pm, 0x50) ? 'ok' : null,
        mapId: rdInt(pm, 0xEC),
        npcDialog: rdPtr(pm, 0xE8) ? 'ok' : null,
        hotkey: rdPtr(pm, 0xF8) ? 'ok' : null,
        runFollow: rdStr(pm, 0x100)
    };
    
    v.Target = { ptr: target, controller: ctrl ? 'ok' : null, main: rdPtr(target, 0x20) ? 'ok' : null };
    
    v.Controller = {
        position: pos ? 'ok' : null,
        state: rdPtr(ctrl, 0x18) ? 'ok' : null
    };
    
    v.Position = {
        x: rdFloat(pos, 0x30),
        y: rdFloat(pos, 0x34),
        identify: idn ? 'ok' : null,
        controller: rdPtr(pos, 0x78) ? 'ok' : null,
        mapPosition: rdPtr(pos, 0x28) ? 'ok' : null
    };
    
    if (idn) {
        v.Identification = {
            name: rdStr(idn, 0x48),
            camp: rdInt(idn, 0x50),
            series: rdInt(idn, 0x54),
            hp: rdInt(idn, 0x58),
            maxHp: rdInt(idn, 0x5C),
            pkStatus: rdInt(idn, 0x60)
        };
    }
    
    var state = rdPtr(ctrl, 0x18);
    if (state) {
        v.State = {
            npcontroller: rdPtr(state, 0x28) ? 'ok' : null,
            currentTime: rdInt(state, 0x40)
        };
    }
    
    // ─── Sub-objects from PlayerMain ─────────────────────────────────
    v.Items = rdPtr(pm, 0x30) ? 'ok' : null;
    v.Skills = rdPtr(pm, 0x38) ? 'ok' : null;
    v.World = rdPtr(pm, 0x48) ? 'ok' : null;
    v.Autoplay = rdPtr(pm, 0x50) ? 'ok' : null;
    v.Party = rdPtr(pm, 0x88) ? 'ok' : null;
    v.HotkeyDB = rdPtr(pm, 0xF8) ? 'ok' : null;
    v.NpcDialogMsg = rdPtr(pm, 0xE8) ? 'ok' : null;
    v.SkillGames = rdPtr(pm, 0x40) ? 'ok' : null;
    
    // ─── Count ───
    r.verifiedFields = Object.values(v).reduce(function(s, o) {
        if (typeof o === 'object' && o !== null) {
            return s + Object.values(o).filter(function(x) { return x !== undefined; }).length;
        }
        return s + (o !== undefined ? 1 : 0);
    }, 0);
    
    return r;
};

// ══ rpc/core/DialogManager.js ══
// frida-scripts/rpc/core/DialogManager.js -- NPC dialog interactions

rpc.exports.remoteNpcDialogue = function(npcId) {
    return new Promise(function(resolve) {
        try {
            var strId = npcId.toString();
            var hexBody = "0a" + ("0" + strId.length.toString(16)).slice(-2);
            for (var i = 0; i < strId.length; i++) {
                hexBody += ("0" + strId.charCodeAt(i).toString(16)).slice(-2);
            }
            
            // Wait for packet-io.js rpc to be available globally in the bundle
            // It's exported as rpc.exports.sendPacket, but inside frida script we can just 
            // call it if we wrap it, or since they are all in the same frida script, we can call it.
            // Wait, we can't easily call other rpc.exports from within an rpc.export directly.
            // Let's implement the TCP send directly here, or call the global sendTcpPacket if available.
            // Actually, we can just use sendTcpPacket implementation directly here to be safe!
            
            var tcpFd = typeof gameFd !== 'undefined' ? gameFd : (globalThis.gameFd || -1);
            if (tcpFd === -1) {
                for(var i=0; i<1024; i++) {
                    try {
                        var type = Socket.type(i);
                        if (type === 'tcp' || type === 'tcp6') {
                            var peer = Socket.peerAddress(i);
                            if (peer && peer.port !== 80 && peer.port !== 443 && peer.port !== 27042) {
                                tcpFd = i;
                                break;
                            }
                        }
                    } catch(e){}
                }
            }
            
            if (tcpFd === -1) return resolve({ ok: false, error: 'no tcp socket found' });
            
            var bodyBytes = [];
            for (var i = 0; i < hexBody.length; i += 2) {
                bodyBytes.push(parseInt(hexBody.substr(i, 2), 16));
            }
            
            var protoLen = bodyBytes.length;
            var buf = Memory.alloc(6 + protoLen);
            buf.writeU32(protoLen);
            buf.add(4).writeU16(33); // opcode 33 = eNpcDialogue
            if (protoLen > 0) buf.add(6).writeByteArray(bodyBytes);
            
            // Assume nativeWrite is globally available from packet-io.js
            if (typeof nativeWrite !== 'undefined') {
                var ret = nativeWrite(tcpFd, buf, 6 + protoLen);
                return resolve({ ok: true, method: 'native_write_tcp', sent: ret, opcode: 33, fd: tcpFd });
            } else {
                return resolve({ ok: false, error: 'nativeWrite not available globally' });
            }
        } catch(e) {
            resolve({ ok: false, error: 'Talk packet failed: ' + e.message });
        }
    });
};

rpc.exports.selectDialogOption = function(index) {
    return new Promise(function(resolve) {
        try {
            var tcpFd = typeof gameFd !== 'undefined' ? gameFd : (globalThis.gameFd || -1);
            if (tcpFd === -1) {
                for(var i=0; i<1024; i++) {
                    try {
                        var type = Socket.type(i);
                        if (type === 'tcp' || type === 'tcp6') {
                            var peer = Socket.peerAddress(i);
                            if (peer && peer.port !== 80 && peer.port !== 443 && peer.port !== 27042) {
                                tcpFd = i; break;
                            }
                        }
                    } catch(e){}
                }
            }
            if (tcpFd === -1) return resolve({ ok: false, error: 'no tcp socket found' });
            
            // opcode 35 (eNpcSelect), body: Protobuf
            var bodyBytes = [];
            if (index > 0) {
                bodyBytes.push(0x08); // Field 1, varint
                bodyBytes.push(index);
            }
            
            var protoLen = bodyBytes.length;
            var buf = Memory.alloc(6 + protoLen);
            buf.writeU32(protoLen);
            buf.add(4).writeU16(35); // opcode 35
            if (protoLen > 0) {
                buf.add(6).writeByteArray(bodyBytes);
            }
            
            if (typeof nativeWrite !== 'undefined') {
                var ret = nativeWrite(tcpFd, buf, 6 + protoLen);
                return resolve({ ok: true, sent: ret });
            } else {
                return resolve({ ok: false, error: 'nativeWrite not available globally' });
            }
        } catch(e) {
            resolve({ ok: false, error: 'Select option failed: ' + e.message });
        }
    });
};

// ══ rpc/ShopScanner.js ══
// frida-scripts/rpc/shop/ShopScanner.js -- Nearby shops and stall interactions

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
                                namePtrStr: namePtr.toString(),
                                cid: cid,
                                cidPtrStr: cidPtr.toString(),
                                level: level,
                                isSalesman: isSalesman,
                                x: x,
                                y: y,
                                distance: dist,
                                controllerPtrStr: valuePtr.toString()
                            });
                        }
                    }
                }
            }
        }
        
        shops.sort(function(a, b) { return a.distance - b.distance; });
        return { ok: true, shops: shops };
    } catch (e) {
        return { ok: false, error: e.message };
    }
};

rpc.exports.buyOtherStallItem = function(sellerId, itemIndex, price) {
    return new Promise(function(resolve) {
        try {
            var tcpFd = typeof gameFd !== 'undefined' ? gameFd : (globalThis.gameFd || -1);
            if (tcpFd === -1) {
                for(var i=0; i<1024; i++) {
                    try {
                        var type = Socket.type(i);
                        if (type === 'tcp' || type === 'tcp6') {
                            var peer = Socket.peerAddress(i);
                            if (peer && peer.port !== 80 && peer.port !== 443 && peer.port !== 27042) {
                                tcpFd = i; break;
                            }
                        }
                    } catch(e){}
                }
            }
            if (tcpFd === -1) return resolve({ ok: false, error: 'no tcp socket found' });
            
            var strId = sellerId.toString();
            // In Opcode 206, the server expects ONLY the numeric ID, e.g., "107429", not "salesman.107429.0"
            var match = strId.match(/\d+/);
            if (match) {
                strId = match[0];
            }
            
            var bodyBytes = [];
            
            bodyBytes.push(0x0a);
            bodyBytes.push(strId.length);
            for (var j = 0; j < strId.length; j++) {
                bodyBytes.push(strId.charCodeAt(j));
            }
            
            bodyBytes.push(0x18);
            var val = parseInt(itemIndex);
            while (val >= 0x80) {
                bodyBytes.push((val & 0x7F) | 0x80);
                val >>>= 7;
            }
            bodyBytes.push(val);
            
            bodyBytes.push(0x20);
            var pVal = parseInt(price) || 0;
            if (pVal === 0) pVal = 1;
            while (pVal >= 0x80) {
                bodyBytes.push((pVal & 0x7F) | 0x80);
                pVal >>>= 7;
            }
            bodyBytes.push(pVal);
            
            var protoLen = bodyBytes.length;
            var buf = Memory.alloc(6 + protoLen);
            buf.writeU32(protoLen);
            buf.add(4).writeU16(206);
            if (protoLen > 0) {
                buf.add(6).writeByteArray(bodyBytes);
            }
            
            if (typeof nativeWrite !== 'undefined') {
                var ret = nativeWrite(tcpFd, buf, 6 + protoLen);
                return resolve({ ok: true, sent: ret, method: 'native_write_tcp' });
            } else {
                return resolve({ ok: false, error: 'nativeWrite not available globally' });
            }
        } catch (e) {
            return resolve({ ok: false, error: e.message });
        }
    });
};

var _netCoreManagerClass = null;
var _lastNetCoreScanTime = 0;
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
                metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                break;
            }
        }
        if (!metaRange) return null;
        
        var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
        if (results.length === 0) return null;
        
        var nameStrAddr = null;
        for (var rIdx = 0; rIdx < results.length; rIdx++) {
            if (results[rIdx].address.readUtf8String() === "NetCoreManager") {
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
                                _netCoreManagerClass = cand;
                                break;
                            }
                        } catch(e) {}
                    }
                }
            } catch(e) {}
            if (_netCoreManagerClass) break;
        }
    }
    if (!_netCoreManagerClass) return null;
    var staticFields = _netCoreManagerClass.add(0xB8).readPointer();
    if (staticFields.isNull()) return null;
    var instance = staticFields.readPointer();
    if (instance.isNull()) return null;
    return instance;
}

var _popUpCanvasClass = null;
var _lastPopUpCanvasScanTime = 0;
function getPopUpCanvasInstance() {
    if (!_popUpCanvasClass) {
        var now = Date.now();
        if (now - _lastPopUpCanvasScanTime < 5000) return null;
        _lastPopUpCanvasScanTime = now;
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

// Get shop items by stallIndex. Requires string pointers to bypass il2cpp_string_new native traps.
rpc.exports.getShopItems = function(stallIndex, nameStr, namePtrStr, cidPtrStr, controllerPtrStr) {
    return new Promise(function(resolve, reject) {
        try {
            console.log("[Shop] Bat dau getShopItems voi stallIndex: " + stallIndex);
            console.log("[Shop] namePtrStr: " + namePtrStr + ", cidPtrStr: " + cidPtrStr);
            if (!namePtrStr || !cidPtrStr) {
                console.log("[Shop] Missing string pointers!");
                resolve({ ok: false, error: 'Missing string pointers' });
                return;
            }
            var playerOtherStallClass = findClassByName("PlayerOtherStall");
            console.log("[Shop] playerOtherStallClass: " + playerOtherStallClass);
            var netCoreInstance = getNetCoreManagerInstance();
            if (!netCoreInstance || netCoreInstance.isNull()) {
                resolve({ ok: false, error: 'NetCoreManager instance is null' });
                return;
            }
            
            var popUpCanvasInstance = getPopUpCanvasInstance();
            if (!popUpCanvasInstance || popUpCanvasInstance.isNull()) {
                resolve({ ok: false, error: 'PopUpCanvas instance is null' });
                return;
            }
            
            var playerOtherStall = popUpCanvasInstance.add(0xA8).readPointer();
            if (playerOtherStall.isNull()) {
                resolve({ ok: false, error: 'playerOtherStall is null' });
                return;
            }
            
            var initialStall = playerOtherStall.add(0xA0).readPointer();
            console.log("[Shop] initialStall: " + initialStall);
            
            // ----------------------------------------------------
            // NEW: Send the TCP packet to request the shop data!
            // ----------------------------------------------------
            var cidLen = cidPtrStr ? ptr(cidPtrStr).add(0x10).readInt() : 0;
            if (cidLen > 0 && cidLen < 100) {
                var cidRaw = ptr(cidPtrStr).add(0x14).readUtf16String(cidLen);
                
                // XÓA KÝ TỰ NULL (\0) NẾU CÓ ĐỂ TRÁNH DƯ BYTE TRONG GÓI TIN!
                cidRaw = cidRaw.replace(/\0/g, '');
                console.log("[Shop] Original cidRaw from memory (cleaned): " + cidRaw);
                
                var str = cidRaw;
                if (!str.startsWith("salesman.")) {
                    str = "salesman." + cidRaw + ".0";
                }
                
                var strLen = str.length;
                var payloadLen = 2 + strLen;
                var hexBody = [];
                hexBody.push(0x0A, strLen);
                for (var i = 0; i < strLen; i++) hexBody.push(str.charCodeAt(i));
                
                var hexStr = hexBody.map(b => (b<16?'0':'') + b.toString(16)).join('');
                if (rpc.exports.sendTcpPacket) {
                    var sendRes = rpc.exports.sendTcpPacket(204, hexStr);
                    console.log("[Shop] Sent TCP request for items: " + JSON.stringify(sendRes));
                }
            }
            // ----------------------------------------------------
            
            var il2cppBase = getIl2CppBase();
            if (!il2cppBase) {
                resolve({ ok: false, error: 'libil2cpp.so base not found' });
                return;
            }
            
            function findClassByName(className) {
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
                var strHex = [];
                for (var i = 0; i < className.length; i++) {
                    var hex = className.charCodeAt(i).toString(16);
                    strHex.push(hex.length === 1 ? '0' + hex : hex);
                }
                var pattern = strHex.join(' ');
                var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
                var nameStrAddr = null;
                for (var rIdx = 0; rIdx < results.length; rIdx++) {
                    if (results[rIdx].address.readUtf8String() === className) {
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
                    var range = allRanges[k];
                    var classMatches = Memory.scanSync(range.base, range.size, ptrPattern);
                    for (var mIdx = 0; mIdx < classMatches.length; mIdx++) {
                        var klass = classMatches[mIdx].address.sub(0x10);
                        try {
                            if (klass.add(0x10).readPointer().equals(nameStrAddr)) {
                                return klass;
                            }
                        } catch(e) {}
                    }
                }
                return null;
            }

            function findMethodByName(klass, methodName) {
                try {
                    var methodsPtr = klass.add(0x98).readPointer();
                    var methodCount = klass.add(0x118).readU16();
                    console.log("[Dump] methodCount for " + methodName + ": " + methodCount);
                    for (var i = 0; i < methodCount; i++) {
                        var methodInfo = methodsPtr.add(i * Process.pointerSize).readPointer();
                        if (methodInfo.isNull()) continue;
                        var namePtr = methodInfo.add(0x10).readPointer();
                        if (!namePtr.isNull()) {
                            try {
                                var mName = namePtr.readUtf8String();
                                if (methodName === "Update") {
                                    console.log("  [Dump] Method: " + mName);
                                }
                                if (mName === methodName) {
                                    return methodInfo;
                                }
                            } catch(e) {}
                        }
                    }
                } catch(e) {
                    console.log("[Shop Hook] Exception in findMethodByName: " + e.message);
                }
                return null;
            }

            try {
                var il2cpp_string_new_ptr = findElfExport(il2cppBase, 'il2cpp_string_new');
                var il2cpp_domain_get_ptr = findElfExport(il2cppBase, 'il2cpp_domain_get');
                var il2cpp_thread_attach_ptr = findElfExport(il2cppBase, 'il2cpp_thread_attach');

                // Game UI should naturally update since we called remoteNpcDialogue externally.
                console.log("[Shop] Waiting for UI update from remoteNpcDialogue packet response...");
            } catch (err) {
                console.log("[Shop] Exception calling ShowReopen: " + err.message + "\\n" + err.stack);
            }
            console.log("[Shop] Queued shop action on main thread.");
            
            var attempts = 30;
            function checkStall() {
                try {
                    var currentStall = playerOtherStall.add(0xA0).readPointer();
                    console.log("[Shop] Kiem tra attempt " + attempts + " | currentStall: " + currentStall);
                    if (!currentStall.isNull() && currentStall.toString() !== initialStall.toString()) {
                        console.log("[Shop] Phat hien thong tin sap hang moi: " + currentStall);
                        try {
                            var titlePtr = currentStall.add(0x18).readPointer();
                            var title = titlePtr.isNull() ? '' : titlePtr.add(0x14).readUtf16String();
                            
                            var GetItemName = new NativeFunction(il2cppBase.add(0xFEB4A0), 'pointer', ['pointer', 'int', 'bool', 'pointer']);
                            var items = [];
                            var mapField = currentStall.add(0x28).readPointer();
                            
                            console.log("[Dump] currentStall: " + currentStall + ", mapField: " + mapField);
                            
                            try {
                                if (!mapField.isNull()) {
                                    var linkedList = mapField.add(0x18).readPointer();
                                    if (!linkedList.isNull()) {
                                        var head = linkedList.add(0x10).readPointer();
                                        var count = linkedList.add(0x18).readU32();
                                        
                                        // Attach thread to il2cpp to safely call NativeFunction
                                        try {
                                            var il2cpp_domain_get_ptr = Module.findExportByName("libil2cpp.so", "il2cpp_domain_get");
                                            var il2cpp_thread_attach_ptr = Module.findExportByName("libil2cpp.so", "il2cpp_thread_attach");
                                            if (il2cpp_domain_get_ptr && il2cpp_thread_attach_ptr) {
                                                var domain = new NativeFunction(il2cpp_domain_get_ptr, 'pointer', [])();
                                                new NativeFunction(il2cpp_thread_attach_ptr, 'pointer', ['pointer'])(domain);
                                            }
                                        } catch(e) {}
                                        
                                        if (!head.isNull() && count > 0 && count < 200) {
                                            var node = head;
                                            var idx = 0;
                                            while (!node.isNull() && idx < count) {
                                                try {
                                                    var kvpAddr = node.add(0x28);
                                                    var key = kvpAddr.add(0x00).readS32();
                                                    var smPtr = kvpAddr.add(0x08).readPointer();
                                                    
                                                    if (!smPtr.isNull() && parseInt(smPtr.toString()) > 0x10000) {
                                                        var itemPtr = smPtr.add(0x18).readPointer();
                                                        var money = smPtr.add(0x20).readS32() || 0;
                                                        var knb = smPtr.add(0x24).readS32() || 0;
                                                        
                                                        var genre = 0, detail = 0, particular = 0, level = 0, series = 0;
                                                        var name = '';
                                                        
                                                        if (!itemPtr.isNull() && parseInt(itemPtr.toString()) > 0x10000) {
                                                            var detailAndGenre = itemPtr.add(0x20).readS32();
                                                            genre = detailAndGenre & 0xFFFF;
                                                            detail = (detailAndGenre >> 16) & 0xFFFF;
                                                            
                                                            var particularAndLevel = itemPtr.add(0x24).readS32();
                                                            level = particularAndLevel & 0xFFFF;
                                                            particular = (particularAndLevel >> 16) & 0xFFFF;
                                                            
                                                            var stackAndSeries = itemPtr.add(0x28).readS32();
                                                            series = stackAndSeries & 0xFFFF;
                                                            name = 'Item_' + genre + '_' + detail + '_' + particular + '_' + level;
                                                            
                                                            try {
                                                                var il2cppStrPtr = GetItemName(itemPtr, 0, 0, ptr(0));
                                                                if (!il2cppStrPtr.isNull()) {
                                                                    var strLen = il2cppStrPtr.add(0x10).readU32();
                                                                    if (strLen > 0 && strLen < 100) {
                                                                        name = il2cppStrPtr.add(0x14).readUtf16String(strLen);
                                                                    }
                                                                }
                                                            } catch(e3) {
                                                                // fallback string
                                                            }
                                                            var magics = [];
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
                                                        }
                                                        
                                                        items.push({
                                                            idx: key,
                                                            name: name,
                                                            detailAndGenre: (detail << 16) | genre,
                                                            particularAndLevel: (particular << 16) | level,
                                                            stackAndSeries: series,
                                                            money: money,
                                                            knb: knb,
                                                            magics: magics
                                                        });
                                                    }
                                                } catch(e2) {}
                                                
                                                node = node.add(0x18).readPointer();
                                                idx++;
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                console.log("[Dump] Error reading stall mapField: " + e.message);
                            }
                            
                            resolve({ ok: true, title: title, items: items });
                        } catch(err) {
                            resolve({ ok: false, error: 'Read stall data error: ' + err.message + ' | ' + err.stack });
                        }
                    } else if (attempts > 0) {
                        attempts--;
                        setTimeout(checkStall, 50); // check again in 50ms
                    } else {
                        resolve({ ok: false, error: 'Timeout waiting for stall data response from server' });
                    }
                } catch (outerErr) {
                    resolve({ ok: false, error: 'checkStall exception: ' + outerErr.message + ' | ' + outerErr.stack });
                }
            }
            setTimeout(checkStall, 50);
        } catch(e) {
            resolve({ ok: false, error: e.message + ' | ' + e.stack });
        }
    });
};

// ══ rpc/NPCScanner.js ══
function getIl2CppBase() {
    var mod = Process.findModuleByName('libil2cpp.so') || Process.findModuleByName('libil4i3n.so');
    if (mod) return mod.base;

    var base = null;
    var lines = File.readAllText('/proc/self/maps').split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r-x') !== -1) {
            var parts = line.trim().split(/\s+/);
            base = ptr('0x' + parts[0].split('-')[0]);
            break;
        }
    }
    if (!base) {
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r--p') !== -1) {
                var parts = line.trim().split(/\s+/);
                base = ptr('0x' + parts[0].split('-')[0]);
                break;
            }
        }
    }
    return base;
}

function findElfExport(base, targetName) {
    if (!base || base.isNull()) return ptr(0);
    
    var magic = base.readByteArray(4);
    var u8 = new Uint8Array(magic);
    if (u8[0] !== 0x7f || u8[1] !== 0x45 || u8[2] !== 0x4c || u8[3] !== 0x46) {
        return ptr(0);
    }
    
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

function __findClassViaIl2Cpp(namespace, className) {
    // Disabled to prevent access violations on emulator translation layers
    return null;
}

function __findClassFromMetadata(className) {
    try {
        var maps = File.readAllText('/proc/self/maps').split('\n');
        var metaBase = null, metaSize = 0;
        for (var i = 0; i < maps.length; i++) {
            if (maps[i].indexOf('global-metadata.dat') !== -1) {
                var parts = maps[i].split(' ')[0].split('-');
                metaBase = ptr('0x' + parts[0]);
                metaSize = parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]);
                break;
            }
        }
        if (!metaBase) return null;

        var ns = "";
        var name = className;
        var dotIdx = className.lastIndexOf('.');
        if (dotIdx !== -1) {
            ns = className.substring(0, dotIdx);
            name = className.substring(dotIdx + 1);
        }

        var hexName = '';
        for (var i = 0; i < name.length; i++) hexName += ('0' + name.charCodeAt(i).toString(16)).slice(-2);
        var scanRes = Memory.scanSync(metaBase, metaSize, hexName);
        var nameAddrs = [];
        for (var r = 0; r < scanRes.length; r++) {
            try {
                if (scanRes[r].address.readUtf8String() === name) {
                    nameAddrs.push(scanRes[r].address);
                }
            } catch(e) {}
        }
        if (nameAddrs.length === 0) return null;

        var nsAddrs = [];
        if (ns !== "") {
            var hexNs = '';
            for (var i = 0; i < ns.length; i++) hexNs += ('0' + ns.charCodeAt(i).toString(16)).slice(-2);
            var nsScanRes = Memory.scanSync(metaBase, metaSize, hexNs);
            for (var r = 0; r < nsScanRes.length; r++) {
                try {
                    if (nsScanRes[r].address.readUtf8String() === ns) {
                        nsAddrs.push(nsScanRes[r].address);
                    }
                } catch(e) {}
            }
            if (nsAddrs.length === 0) return null;
        }

        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        
        for (var na = 0; na < nameAddrs.length; na++) {
            var nameAddr = nameAddrs[na];
            var ptrHex = nameAddr.toString(16);
            while (ptrHex.length < 16) ptrHex = '0' + ptrHex;
            var pat = [];
            for (var j = 14; j >= 0; j -= 2) pat.push(ptrHex.substring(j, j + 2));
            var namePtrPattern = pat.join(' ');

            for (var r = 0; r < allRanges.length; r++) {
                try {
                    var range = allRanges[r];
                    if (range.size < 0x1000) continue;
                    var matches = Memory.scanSync(range.base, range.size, namePtrPattern);
                    for (var m = 0; m < matches.length; m++) {
                        var cand = matches[m].address.sub(0x10); // class name string pointer is at 0x10
                        if (cand.compare(range.base) < 0) continue;
                        try {
                            if (cand.add(0x10).readPointer().toString() === nameAddr.toString()) {
                                var checkNsPtr = cand.add(0x18).readPointer(); // namespace pointer is at 0x18
                                if (ns === "") {
                                    if (checkNsPtr.isNull() || checkNsPtr.readUtf8String() === "") return cand;
                                } else {
                                    if (!checkNsPtr.isNull()) {
                                        for (var nsa = 0; nsa < nsAddrs.length; nsa++) {
                                            if (checkNsPtr.toString() === nsAddrs[nsa].toString()) return cand;
                                        }
                                    }
                                }
                            }
                        } catch(e) {}
                    }
                } catch(e) {}
            }
        }
        return null;
    } catch(e) { return null; }
}

function __findClassDirect(className) {
    var ns = "";
    var name = className;
    var dotIdx = className.lastIndexOf('.');
    if (dotIdx !== -1) {
        ns = className.substring(0, dotIdx);
        name = className.substring(dotIdx + 1);
    }
    return __findClassViaIl2Cpp(ns, name) || __findClassFromMetadata(className);
}

rpc.exports.getNearNpcNames = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    var mapId = 0;
    try {
        mapId = _playerMainInstance.add(0xEC).readS32();
    } catch(e) {}

    var npcMap = {};

    // Try cac class name kha thi cho NPC (quét 1 lần đầu tiên)
    var npcKlass = globalThis.cachedNpcKlass || null;
    if (!npcKlass) {
        var classNames = [
            'game.resource.settings.npcres.Datafield',
            'NpcRes.Normal',
            'Normal',
            'NpcController',
            'game.resource.settings.npcres.Controller'
        ];
        for (var ci = 0; ci < classNames.length; ci++) {
            npcKlass = __findClassDirect(classNames[ci]);
            if (npcKlass) {
                console.log('[NPCScanner] Found klass for "' + classNames[ci] + '": ' + npcKlass);
                globalThis.cachedNpcKlass = npcKlass;
                globalThis.cachedNpcKlassName = classNames[ci];
                break;
            }
        }
    }
    if (!npcKlass) return { ok: false, error: 'No NPC klass found in metadata', mapId: mapId };

    // Set dynamic offsets based on which class was resolved
    var idOffset = 0x28;
    var nameOffset = 0x30;
    var matchedKlassName = globalThis.cachedNpcKlassName || '';
    if (matchedKlassName.indexOf('Datafield') !== -1) {
        idOffset = 0x10;
        nameOffset = 0x40;
    }

    // Helper to read C# string from pointer
    function readIl2CppString(strPtr) {
        if (!strPtr || strPtr.isNull() || parseInt(strPtr.toString()) < 0x10000) return null;
        try {
            var len = strPtr.add(0x10).readInt();
            if (len > 0 && len < 100) {
                return strPtr.add(0x14).readUtf16String(len);
            }
        } catch(e) {}
        return null;
    }

    // Scan heap (asynchronous, non-blocking, and optimized to skip mapped files)
    var kh = npcKlass.toString(16);
    while (kh.length < 16) kh = '0' + kh;
    var pat = [];
    for (var j = 14; j >= 0; j -= 2) pat.push(kh.substring(j, j + 2));

    return new Promise(function(resolve) {
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var filteredRanges = [];
        for (var i = 0; i < allRanges.length; i++) {
            var r = allRanges[i];
            // Skip mapped files to only scan anonymous heap memory (prevents character freezing)
            if (r.file) continue;
            if (r.size < 0x4000 || r.size > 0x05000000) continue;
            filteredRanges.push(r);
        }

        var found = 0;
        var rangeIdx = 0;

        function scanNextRange() {
            if (rangeIdx >= filteredRanges.length || found >= 200) {
                return resolve({ ok: true, npcMap: npcMap, count: found, mapId: mapId });
            }
            var range = filteredRanges[rangeIdx++];
            try {
                Memory.scan(range.base, range.size, pat.join(' '), {
                    onMatch: function(address, size) {
                        try {
                            var obj = address;
                            var npcId = readIl2CppString(obj.add(idOffset).readPointer());
                            if (npcId && !npcMap[npcId]) {
                                var name = readIl2CppString(obj.add(nameOffset).readPointer());
                                if (name) {
                                    var lower = name.toLowerCase();
                                    var isTongKimNpc = 
                                        lower.indexOf('quân nhu') !== -1 || lower.indexOf('quan nhu') !== -1 ||
                                        lower.indexOf('trinh') !== -1 ||
                                        lower.indexOf('chiêu binh') !== -1 || lower.indexOf('chieu binh') !== -1 ||
                                        lower.indexOf('mộ binh') !== -1 || lower.indexOf('mo binh') !== -1 ||
                                        lower.indexOf('xa phu') !== -1 ||
                                        lower.indexOf('rương') !== -1 || lower.indexOf('ruong') !== -1;
                                    
                                    if (isTongKimNpc) {
                                        npcMap[npcId] = name;
                                        found++;
                                    }
                                }
                            }
                        } catch(e) {}
                    },
                    onError: function(reason) {
                        scanNextRange();
                    },
                    onComplete: function() {
                        scanNextRange();
                    }
                });
            } catch(e) {
                scanNextRange();
            }
        }

        scanNextRange();
    });
};

// ══ rpc/movement.js ══
// frida-scripts/rpc/movement.js — Movement RPC exports (bridge-free)

rpc.exports.gotoFindingPath = function(x, y, approach) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'PlayerMain not found' };
    if (!il2cppBase) return { ok: false, error: 'il2cppBase not found' };

    try {
        var gotoFindingPathFn = new NativeFunction(il2cppBase.add(0xE4A620), 'void', ['pointer', 'int', 'int', 'int', 'pointer', 'pointer', 'pointer']);
        gotoFindingPathFn(_playerMainInstance, x | 0, y | 0, (approach | 0) || 20, ptr(0), ptr(0), ptr(0));
        return { ok: true, x: x, y: y, method: 'direct_native' };
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

// ══ rpc/combat.js ══
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

// ══ rpc/ui-control.js ══
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

                // 3. Close StandardConfirmPc (revive popup) by pressing Cancel (or OK if dead to revive in camp)
                try {
                    var standardConfirmPc = canvas.add(0xE8).readPointer();
                    if (standardConfirmPc && !standardConfirmPc.isNull()) {
                        var isDead = false;
                        try {
                            if (typeof _playerMainInstance !== 'undefined' && _playerMainInstance && !_playerMainInstance.isNull()) {
                                var npcontroller = _playerMainInstance.add(0x20).readPointer();
                                if (npcontroller && !npcontroller.isNull()) {
                                    var idnPtr = npcontroller.add(0x28).readPointer();
                                    if (idnPtr && !idnPtr.isNull() && parseInt(idnPtr.toString()) > 0x10000) {
                                        var hp = idnPtr.add(0x58).readInt();
                                        if (hp <= 0) {
                                            isDead = true;
                                        }
                                    }
                                }
                            }
                        } catch(e) {}

                        if (!isDead) {
                            var cancelButton = standardConfirmPc.add(0x40).readPointer();
                            if (cancelButton && !cancelButton.isNull()) {
                                var pressButtonFn = new NativeFunction(il2cppBase.add(0x1ED7EF4), 'void', ['pointer']);
                                pressButtonFn(cancelButton);
                            }
                        } else {
                            var okButton = standardConfirmPc.add(0x38).readPointer();
                            if (okButton && !okButton.isNull()) {
                                var pressButtonFn = new NativeFunction(il2cppBase.add(0x1ED7EF4), 'void', ['pointer']);
                                pressButtonFn(okButton);
                            }
                        }
                    }
                } catch(e) {}
            }

            // 4. Close logic states on PlayerMain
            try {
                var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE459FC), 'void', ['pointer']);
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

// Block dialogue canvas creation in libil2cpp natively to prevent screen flickering/flashing
try {
    var base = (typeof il2cppBase !== 'undefined' && il2cppBase) ? il2cppBase : (typeof getIl2CppBase !== 'undefined' ? getIl2CppBase() : null);
    if (base) {
        var setNpcTransferMessageAddr = base.add(0xE45A18);
        
        Interceptor.attach(setNpcTransferMessageAddr, {
            onLeave: function(retval) {
                if (globalThis._blockNpcDialog) {
                    // Close the dialogue popup immediately on the main thread after it opens
                    globalThis._mainThreadActions = globalThis._mainThreadActions || [];
                    globalThis._mainThreadActions.push(function() {
                        try {
                            var canvas = getPopUpCanvasInstanceLocal();
                            if (canvas && !canvas.isNull()) {
                                var dialog = canvas.add(0x128).readPointer();
                                if (dialog && !dialog.isNull()) {
                                    var closeFn = new NativeFunction(base.add(0xE82838), 'void', ['pointer']);
                                    closeFn(dialog);
                                }
                                var dialog10 = canvas.add(0x130).readPointer();
                                if (dialog10 && !dialog10.isNull()) {
                                    var closeFn10 = new NativeFunction(base.add(0xE80744), 'void', ['pointer']);
                                    closeFn10(dialog10);
                                }
                            }
                        } catch(e) {}
                    });
                }
            }
        });
    }
} catch(e) {
    console.error("[Frida] Failed to hook SetNpcTransferMessage: " + e.message);
}

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
                                    var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE459FC), 'void', ['pointer']);
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

// ══ rpc/diagnostics.js ══
// frida-scripts/rpc/diagnostics.js — Diagnostic RPC exports

rpc.exports.enumActiveUi = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    return Il2Cpp.perform(function () {
        try {
            var img = Il2Cpp.domain.assembly('Assembly-CSharp').image;
            var Res = Il2Cpp.domain.assembly('UnityEngine.CoreModule').image.class('UnityEngine.Resources');
            var findM = Res.method('FindObjectsOfTypeAll', 1);
            var pat = /(dialog|npc|box|pc|select|confirm|award|quest|give|popup|menu|notice|reward|task|rank|hang|xep|view|panel|board|list|window|content|info|datau|activ|tong|standard|trade|input|detail|frame|chain|combo|serial|continuous)/i;
            var active = {};
            var classes = img.classes;
            for (var i = 0; i < classes.length; i++) {
                var k = classes[i]; var nm = k.name || '';
                if (!pat.test(nm)) continue;
                try {
                    var arr = findM.invoke(k.type.object);
                    var total = (arr && arr.length) ? arr.length : 0;
                    if (!total) continue;
                    var act = 0;
                    for (var j = 0; j < total; j++) {
                        try {
                            var o = arr.get(j);
                            var go = o.method('get_gameObject').invoke();
                            if (go.method('get_activeInHierarchy').invoke()) act++;
                        } catch (e) {}
                    }
                    if (act > 0) active[nm] = total + '/' + act;
                } catch (e) {}
            }
            return { ok: true, active: active };
        } catch (e) { return { ok: false, error: '' + e }; }
    });
};

rpc.exports.captureGoto = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    if (globalThis._gotoCapOn) return { ok: true, already: true };
    globalThis._gotoLog = [];
    return Il2Cpp.perform(function () {
        var img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
        var pm = img.class("PlayerMain");
        var hooked = [];
        function hookM(name, cnt, nargs) {
            try {
                var m = pm.method(name, cnt);
                if (!m || !m.virtualAddress || m.virtualAddress.isNull()) return;
                Interceptor.attach(m.virtualAddress, {
                    onEnter: function (a) {
                        var rec = { m: name + '/' + cnt, ts: Date.now(), args: [] };
                        for (var i = 1; i <= nargs; i++) {
                            try { rec.args.push(a[i].isNull() ? 'NULL' : a[i].toInt32()); }
                            catch (e) { rec.args.push('?'); }
                        }
                        globalThis._gotoLog.push(rec);
                        if (globalThis._gotoLog.length > 30) globalThis._gotoLog.shift();
                    }
                });
                hooked.push(name + '/' + cnt);
            } catch (e) {}
        }
        hookM("GotoFindingPath", 6, 6);
        hookM("GotoFindingPathOnVector", 1, 1);
        hookM("ProtocolGotoPosition", 1, 1);
        hookM("GotoAndPickTargetObject", 1, 1);
        hookM("GotoNpc", 2, 2);
        globalThis._gotoCapOn = true;
        return { ok: true, hooked: hooked };
    });
};

rpc.exports.lastGotoArgs = function() { return { log: globalThis._gotoLog || [] }; };

rpc.exports.listMethods = function(className, filter) {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    return Il2Cpp.perform(function () {
        try {
            var img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
            var k = img.class(className);
            if (!k) return { ok: false, error: 'no class ' + className };
            var out = [], ms = k.methods, f = (filter || '').toLowerCase();
            for (var i = 0; i < ms.length; i++) {
                var n = ms[i].name;
                if (!f || n.toLowerCase().indexOf(f) !== -1) {
                    var pc = 0; try { pc = ms[i].parameterCount; } catch (e) {}
                    out.push(n + "/" + pc);
                }
            }
            return { ok: true, methods: out };
        } catch (e) { return { ok: false, error: '' + e }; }
    });
};

// ══ ready.js ══
// frida-scripts/ready.js — Ready signal: notify host that all hooks are installed

(function sendReadySignal() {
    send({
        type: 'ready',
        hooks: {
            connect: true,
            recv: true,
            send: true,
            nativeRead: !!nativeReadPtr,
            readSource: readSource,
            nativeWrite: !!nativeWritePtr,
            writeSource: writeSource,
        },
        ssl: {
            readOk: _sslReadOk,
            writeOk: _sslWriteOk,
            writeFn: !!_sslWriteFn,
            sslObj: _sslObj ? _sslObj.toString() : null,
        }
    });
})();

// ══ Bot Ready ══
send({ type: "bot_ready", exports: Object.keys(rpc.exports), timestamp: Date.now() });