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

/**
 * Find libil2cpp.so base address from /proc/self/maps.
 */
function getIl2CppBase() {
    var base = null;
    var lines = File.readAllText('/proc/self/maps').split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('libil2cpp.so') !== -1) {
            var parts = line.trim().split(/\s+/);
            if (parts[2] === '00000000') {
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
            var mapId = _playerMainInstance.add(0xE4).readU32();
            if (mapId > 0 && mapId < 10000000) {
                return { ok: true, playerMain: _playerMainInstance.toString(), source: 'cached' };
            }
        } catch(e) {
            _playerMainInstance = null;
        }
    }
    
    var now = Date.now();
    if (now - _lastPlayerMainScanTime < 5000) {
        return { ok: false, error: 'PlayerMain scan throttled (retry in ' + Math.ceil((5000 - (now - _lastPlayerMainScanTime)) / 1000) + 's)' };
    }
    _lastPlayerMainScanTime = now;
    
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
            // Hook World.Update at 0xF2B3B8
            Interceptor.attach(il2cppBase.add(0xF2B3B8), {
                onEnter: function(args) {
                    try {
                        var worldPtr = args[0];
                        if (worldPtr.isNull()) return;

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
            
            // Hook Controller.Update at 0xFB6994 (actual entry point)
            Interceptor.attach(il2cppBase.add(0xFB6994), {
                onEnter: function(args) {
                    try {
                        var controllerPtr = args[0];
                        if (controllerPtr.isNull()) return;
                        
                        // Controller + 0x30 points to Datafield
                        var dataPtr = controllerPtr.add(0x30).readPointer();
                        if (dataPtr.isNull()) return;
                        
                        // Datafield + 0x10 is C# String 'cid'
                        var cidStrPtr = dataPtr.add(0x10).readPointer();
                        if (cidStrPtr.isNull()) return;
                        
                        // Read C# string length and characters
                        var len = cidStrPtr.add(0x10).readU32();
                        if (len > 0 && len < 64) {
                            var chars = cidStrPtr.add(0x14).readUtf16String(len);
                            if (chars && chars.length > 0) {
                                send({ type: 'il2cpp_event', event: 'Controller found', ptr: controllerPtr.toString(), cid: chars });
                            }
                        }
                    } catch(e) {
                        // Ignore read errors
                    }
                }
            });
            send({ type: 'il2cpp_event', event: 'Hooks attached successfully!' });
        } catch (e) {
            send({ type: 'il2cpp_error', msg: 'hooks failed: ' + e.message });
        }
    } else {
        send({ type: 'il2cpp_ready', msg: 'libil2cpp.so not found in maps' });
    }
})();

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
            _recvAny++;
            _fdsSeen[this.fd] = (_fdsSeen[this.fd] || 0) + 1;
            if (opcode >= 0) {
                _lastOps.push(this.fd + ':' + opcode);
                if (_lastOps.length > 24) _lastOps.shift();
            }
            if (opcode > 0 && GS_OPCODES[opcode] && plen >= 0 && plen <= n) {
                _fdsGameOps[this.fd] = (_fdsGameOps[this.fd] || 0) + 1;
            }

// Only process game socket OR auto-detect mode
        var isGameFd = (this.fd === gameFd);
        var autoDetect = (gameFd === -1);

        if (!isGameFd && !autoDetect) return;

            var data;
            try { data = new Uint8Array(this.buf.readByteArray(n)); } catch (e) { return; }

            try {
                var pkt = makePacketRecord(data, n);
                recvBuffer.push(pkt);
                _recvTotal++;
                if (recvBuffer.length > 3000) recvBuffer.shift();

                // AUTO-DETECT: lock gameFd when we see a valid game opcode
                if (autoDetect && opcode >= 0 && GS_OPCODES[opcode] !== undefined) {
                    gameFd = this.fd;
                    send({ type: 'game_fd', fd: gameFd, detectedBy: 'recv opcode ' + opcode + ' (' + GS_OPCODES[opcode] + ')' });
                }
            } catch (e) {}

            // Shop data detection (also capture opcode 205 = EPlayerStallOpenResponse)
            if (opcode === 119 || opcode === 120 || opcode === 205 || opcode === 212) {
                send({ type: 'shop_data', opcode: opcode, name: pkt.name, hex: pkt.hex });
            }

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

        var autoDetect = (gameFd === -1);

        // For non-gameFd (and not auto-detect): only peek op140
        if (this.fd !== gameFd && !_captureAllSends && !autoDetect) {
            try {
                if (n < 6) return;
                var h6 = new Uint8Array(this.buf.readByteArray(6));
                if ((h6[4] | (h6[5] << 8)) !== 140) return;
            } catch (e) { return; }
        }

        try {
            var data = new Uint8Array(this.buf.readByteArray(n));
            var hdr = parsePacketHeader(data);
            var name = GS_OPCODES[hdr.opcode] || ('UNK_' + hdr.opcode);
            var hex = toHex(data, 256);
            var pkt = { opcode: hdr.opcode, name: name, size: n, hex: hex };
            sendBuffer.push(pkt);
            _sendTotal++;
            if (sendBuffer.length > 100) sendBuffer.shift();
            send({ type: 'send_out', opcode: hdr.opcode, name: name, size: n, hex: hex });

            // AUTO-DETECT: lock gameFd from outgoing packets too
            if (autoDetect && hdr.opcode >= 0 && GS_OPCODES[hdr.opcode] !== undefined) {
                gameFd = this.fd;
                send({ type: 'game_fd', fd: gameFd, detectedBy: 'send opcode ' + hdr.opcode + ' (' + GS_OPCODES[hdr.opcode] + ')' });
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
    if (!nativeWritePtr) return;
    Interceptor.attach(nativeWritePtr, {
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
                    if (n <= 0 || this.fd !== gameFd) return;
                    try { emitFromBuf(this.iov.readPointer(), n); } catch (e) {}
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
                    if (n <= 0 || this.fd !== gameFd) return;
                    try {
                        var iov = this.msg.add(0x10).readPointer(); // msghdr.msg_iov
                        emitFromBuf(iov.readPointer(), n);
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

// ══ rpc/player-info.js ══
// frida-scripts/rpc/player-info.js -- Player info RPC exports (sect, skills, position)

function getIl2CppBase() {
    var base = null;
    var lines = File.readAllText('/proc/self/maps').split('\n');
    // Find the EXECUTABLE (r-xp) mapping — code lives here, not in r--p
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('libil2cpp.so') !== -1) {
            var parts = line.trim().split(/\s+/);
            // permissions format: r-xp or r-x
            if (parts[1] && parts[1].indexOf('r-x') !== -1) {
                base = ptr('0x' + parts[0].split('-')[0]);
                break;
            }
        }
    }
    // Fallback: any mapping with offset 00000000
    if (!base) {
        for (var j = 0; j < lines.length; j++) {
            var line2 = lines[j];
            if (line2.indexOf('libil2cpp.so') !== -1) {
                var parts2 = line2.trim().split(/\s+/);
                if (parts2[2] === '00000000') {
                    base = ptr('0x' + parts2[0].split('-')[0]);
                    break;
                }
            }
        }
    }
    return base;
}

function findElfExport(base, targetName) {
    if (!base || base.isNull()) return ptr(0);
    
    // Always use manual ELF parsing — more reliable than Frida's Module resolver
    // which may return addresses from a different mapping
    
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
    var pos = _lastPosition;
    var res = {
        ok: pmRes.ok,
        playerMain: pmRes.playerMain || null,
        source: pmRes.source || null,
        error: pmRes.error || null,
        position: { x: pos.x, y: pos.y, eid: pos.eid, age: Date.now() - pos.ts },
        recvTotal: _recvTotal,
        sendTotal: _sendTotal,
        gameFd: gameFd,
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

rpc.exports.remoteNpcDialogue = function(npcId) {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    
    return Il2Cpp.perform(function () {
        try {
            var talkFnAddr = il2cppBase.add(0xE45040);
            var talkFn = new NativeFunction(talkFnAddr, 'void', ['pointer', 'pointer']);
            
            var fn_string_new = findElfExport(il2cppBase, 'il2cpp_string_new');
            if (fn_string_new.isNull()) {
                return { ok: false, error: 'il2cpp_string_new not found' };
            }
            var il2cpp_string_new = new NativeFunction(fn_string_new, 'pointer', ['pointer']);
            var utf8NpcId = Memory.allocUtf8String(npcId);
            var csNpcId = il2cpp_string_new(utf8NpcId);
            
            talkFn(_playerMainInstance, csNpcId);
            return { ok: true };
        } catch(e) {
            return { ok: false, error: 'Talk failed: ' + e.message };
        }
    });
};

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
                            
                            // Query shop position: NpcRes.Special (valuePtr) -> position (0x10) -> mapPosition (0x28) -> top/left (0x10/0x14)
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
                                cid: cid,
                                level: level,
                                isSalesman: isSalesman,
                                x: x,
                                y: y,
                                distance: dist
                            });
                        }
                    }
                }
            }
        }
        
        // Sort nearest shops first
        shops.sort(function(a, b) {
            return a.distance - b.distance;
        });
        
        return { ok: true, shops: shops };
    } catch (e) {
        return { ok: false, error: e.message };
    }
};

rpc.exports.invalidatePlayerMain = function() {
    _playerMainInstance = null;
    _charManagerClass = null;
    _netCoreManagerClass = null;
    _popUpCanvasClass = null;
    _byteClass = null;
    _localShopHookOn = false;
    return { ok: true };
};

var _netCoreManagerClass = null;
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
                metaRange = {
                    base: ptr('0x' + parts[0]),
                    size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0])
                };
                break;
            }
        }
        if (!metaRange) {
            console.log("[NetCore] No global-metadata.dat range found!");
            return null;
        }
        
        var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
        if (results.length === 0) {
            console.log("[NetCore] NetCoreManager string not found in global-metadata!");
            return null;
        }
        
        var nameStrAddr = null;
        for (var rIdx = 0; rIdx < results.length; rIdx++) {
            if (results[rIdx].address.readUtf8String() === "NetCoreManager") {
                nameStrAddr = results[rIdx].address;
                break;
            }
        }
        if (!nameStrAddr) {
            console.log("[NetCore] Exact NetCoreManager string not found in global-metadata!");
            return null;
        }
        
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
                                console.log("[NetCore] Found NetCoreManager class at: " + _netCoreManagerClass);
                                break;
                            }
                        } catch(e) {}
                    }
                }
            } catch(e) {}
            if (_netCoreManagerClass) break;
        }
    }
    if (!_netCoreManagerClass) {
        console.log("[NetCore] NetCoreManager class not found in memory!");
        return null;
    }
    var staticFields = _netCoreManagerClass.add(0xB8).readPointer();
    if (staticFields.isNull()) {
        console.log("[NetCore] staticFields is null!");
        return null;
    }
    var instance = staticFields.readPointer();
    if (instance.isNull()) {
        console.log("[NetCore] instance pointer in staticFields is null!");
        return null;
    }
    return instance;
}

var _popUpCanvasClass = null;
function getPopUpCanvasInstance() {
    if (!_popUpCanvasClass) {
        var now = Date.now();
        if (now - _lastPopUpCanvasScanTime < 5000) {
            return null;
        }
        _lastPopUpCanvasScanTime = now;
        var pattern = '50 6f 70 55 70 43 61 6e 76 61 73'; // "PopUpCanvas"
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

var _byteClass = null;
function getByteClass() {
    if (_byteClass) return _byteClass;
    try {
        var il2cppBase = getIl2CppBase();
        var fn_domain_get = findElfExport(il2cppBase, 'il2cpp_domain_get');
        var fn_domain_assembly_open = findElfExport(il2cppBase, 'il2cpp_domain_assembly_open');
        var fn_assembly_get_image = findElfExport(il2cppBase, 'il2cpp_assembly_get_image');
        var fn_class_from_name = findElfExport(il2cppBase, 'il2cpp_class_from_name');

        var domainGet = new NativeFunction(fn_domain_get, 'pointer', []);
        var domainAssemblyOpen = new NativeFunction(fn_domain_assembly_open, 'pointer', ['pointer', 'pointer']);
        var assemblyGetImage = new NativeFunction(fn_assembly_get_image, 'pointer', ['pointer']);
        var classFromName = new NativeFunction(fn_class_from_name, 'pointer', ['pointer', 'pointer', 'pointer']);
        
        var domain = domainGet();
        var mscorlib = domainAssemblyOpen(domain, Memory.allocUtf8String('mscorlib'));
        var image = assemblyGetImage(mscorlib);
        _byteClass = classFromName(image, Memory.allocUtf8String('System'), Memory.allocUtf8String('Byte'));
    } catch(e) {}
    return _byteClass;
}

function createCSharpByteArray(jsArray) {
    var il2cppBase = getIl2CppBase();
    var fn_array_new = findElfExport(il2cppBase, 'il2cpp_array_new');
    if (!fn_array_new || fn_array_new.isNull()) {
        throw new Error('il2cpp_array_new is null');
    }
    var il2cpp_array_new = new NativeFunction(fn_array_new, 'pointer', ['pointer', 'uint32']);
    var byteClass = getByteClass();
    if (!byteClass || byteClass.isNull()) {
        throw new Error('Byte class is null');
    }
    var arr = il2cpp_array_new(byteClass, jsArray.length);
    if (!arr || arr.isNull()) {
        throw new Error('il2cpp_array_new returned null');
    }
    var offset = (Process.pointerSize === 8) ? 0x20 : 0x10;
    var rawData = arr.add(offset);
    for (var i = 0; i < jsArray.length; i++) {
        rawData.add(i).writeU8(jsArray[i]);
    }
    return arr;
}

var _localShopHookOn = false;

// Protobuf helpers for packet-based shop scanning
function buildProtobufString(fieldNumber, value) {
    var tag = (fieldNumber << 3) | 2;
    var utf8Bytes = [];
    for (var i = 0; i < value.length; i++) {
        var cp = value.charCodeAt(i);
        if (cp < 0x80) { utf8Bytes.push(cp); }
        else if (cp < 0x800) { utf8Bytes.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F)); }
        else { utf8Bytes.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F)); }
    }
    var result = [tag];
    var len = utf8Bytes.length;
    while (len > 0x7F) { result.push((len & 0x7F) | 0x80); len >>= 7; }
    result.push(len);
    for (var j = 0; j < utf8Bytes.length; j++) result.push(utf8Bytes[j]);
    return result;
}

function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
        var h = bytes[i].toString(16);
        if (h.length === 1) h = '0' + h;
        hex += h;
    }
    return hex;
}

rpc.exports.getShopItems = function(stallIndex) {
    return new Promise(function(resolve, reject) {
        try {
            console.log("[Shop] Bat dau getShopItems voi stallIndex: " + stallIndex);
            
            // === ONE-TIME AddItem hook (intercepts runtime Item data) ===
            if (!globalThis._addItemHooked) {
                try {
                    var il2cppBase = getIl2CppBase();
                    var addItemAddr = il2cppBase.add(0xE9039C); // PlayerOtherStall.AddItem
                    Interceptor.attach(addItemAddr, {
                        onEnter: function(args) {
                            var itemPtr = args[1];
                            var money = args[2].toInt32();
                            var knb = args[3].toInt32();
                            try {
                                var g = itemPtr.add(0x44).readU32();
                                var d = itemPtr.add(0x48).readU32();
                                var p = itemPtr.add(0x4C).readU32();
                                var l = itemPtr.add(0x50).readU32();
                                var s = itemPtr.add(0x54).readU32();
                                var name = '?';
                                try {
                                    var eq = itemPtr.add(0x20).readPointer();
                                    if (!eq.isNull()) {
                                        var nm = eq.add(0x18).readPointer();
                                        if (!nm.isNull()) {
                                            var nl = nm.add(0x10).readU32();
                                            if (nl > 0 && nl < 200) name = nm.add(0x14).readUtf16String(nl);
                                        }
                                    }
                                } catch(e) {}
                                var magics = [];
                                try {
                                    var ml = itemPtr.add(0x38).readPointer();
                                    if (!ml.isNull()) {
                                        var ma = ml.add(0x10).readPointer();
                                        var mc = ml.add(0x18).readU32();
                                        if (!ma.isNull() && mc > 0 && mc < 50)
                                            for (var m = 0; m < mc; m++) {
                                                magics.push(ma.add(m * 8 + 0x10).readS32());
                                                magics.push(ma.add(m * 8 + 0x14).readS32());
                                            }
                                    }
                                } catch(e) {}
                                var entry = { name: name, money: money, knb: knb, genre: g, detail: d, particular: p, level: l, series: s, magics: magics };
                                if (!globalThis._shopAddItems) globalThis._shopAddItems = [];
                                globalThis._shopAddItems.push(entry);
                                console.log("[AddItem] " + name + " G=" + g + " D=" + d + " $" + money + " KNB=" + knb);
                            } catch(e3) {}
                        }
                    });
                    globalThis._addItemHooked = true;
                    console.log("[Shop] AddItem hook installed");
                } catch(e) { console.log("[Shop] AddItem hook failed: " + e.message); }
            }
            globalThis._shopAddItems = [];
            
            // === Read shop data ===
            var popUpCanvasInstance = getPopUpCanvasInstance();
            if (!popUpCanvasInstance || popUpCanvasInstance.isNull()) {
                resolve({ ok: false, error: 'PopUpCanvas instance is null' }); return;
            }
            var playerOtherStall = popUpCanvasInstance.add(0xA8).readPointer();
            if (playerOtherStall.isNull()) {
                resolve({ ok: false, error: 'playerOtherStall is null' }); return;
            }
            var initialStall = playerOtherStall.add(0xA0).readPointer();
            console.log("[Shop] initialStall: " + initialStall);
            
            var initialStall = playerOtherStall.add(0xA0).readPointer();
            console.log("[Shop] initialStall: " + initialStall);
            
            // Always send opcode 204 — server will respond and trigger AddItem
            // even if stall was already loaded
            var stallKey = "salesman." + stallIndex + ".0";
            var protoBody = buildProtobufString(1, stallKey);
            rpc.exports.sendPacket(204, bytesToHex(protoBody));
            console.log("[Shop] Sent opcode 204 for stall: " + stallKey);
            
            var attempts = 200;
            function checkResponse() {
                try {
                    // Priority 1: AddItem hook captured data
                    if (globalThis._shopAddItems && globalThis._shopAddItems.length > 0) {
                        var items = globalThis._shopAddItems;
                        globalThis._shopAddItems = [];
                        var title = stallKey;
                        try {
                            var cs = playerOtherStall.add(0xA0).readPointer();
                            if (!cs.isNull()) {
                                var tp = cs.add(0x18).readPointer();
                                if (!tp.isNull()) {
                                    var tLen = tp.add(0x10).readU32();
                                    if (tLen > 0 && tLen < 200) title = tp.add(0x14).readUtf16String(tLen);
                                }
                            }
                        } catch(e) {}
                        console.log("[Shop] Got " + items.length + " items from AddItem hook!");
                        resolve({ ok: true, title: title, items: items });
                        return;
                    }
                    // Priority 2: Stall appeared in memory (fallback)
                    var cs = playerOtherStall.add(0xA0).readPointer();
                    if (!cs.isNull() && cs.toString() !== initialStall.toString()) {
                        console.log("[Shop] Stall loaded, reading from memory fallback...");
                        readStallFromMemory(cs, resolve); return;
                    }
                    if (attempts > 0) { attempts--; setTimeout(checkResponse, 50); }
                    else { 
                        // Last resort: try memory read on whatever is there
                        var cs2 = playerOtherStall.add(0xA0).readPointer();
                        if (!cs2.isNull()) {
                            console.log("[Shop] Timeout but stall exists, trying memory read...");
                            readStallFromMemory(cs2, resolve);
                        } else {
                            resolve({ ok: false, error: 'Timeout waiting for shop data (no AddItem, no stall)' }); 
                        }
                    }
                } catch(e) { resolve({ ok: false, error: e.message }); }
            }
            setTimeout(checkResponse, 100);
            
            // === Memory-based reader: LinkedList<KeyValuePair<int,SalesmanItem>> ===
            function readStallFromMemory(currentStall, resolve) {
                try {
                    var titlePtr = currentStall.add(0x18).readPointer();
                    var title = '';
                    try {
                        if (!titlePtr.isNull()) {
                            var tLen = titlePtr.add(0x10).readU32();
                            if (tLen > 0 && tLen < 200) title = titlePtr.add(0x14).readUtf16String(tLen);
                        }
                    } catch(e) {}
                    
                    var items = [];
                    
                    // MapField<int,SalesmanItem> at currentStall+0x28
                    // MapField layout: map(Dictionary)@0x10, list(LinkedList)@0x18
                    var mapField = currentStall.add(0x28).readPointer();
                    console.log("[Shop] mapField(items_) = " + mapField);
                    
                    if (!mapField.isNull()) {
                        // LinkedList<KeyValuePair<int,SalesmanItem>> at mapField+0x18
                        var linkedList = mapField.add(0x18).readPointer();
                        console.log("[Shop] linkedList = " + linkedList);
                        
                        if (!linkedList.isNull()) {
                            // LinkedList layout: head@0x10, count@0x18, version@0x1C
                            var head = linkedList.add(0x10).readPointer();
                            var count = linkedList.add(0x18).readU32();
                            console.log("[Shop] LinkedList head=" + head + " count=" + count);
                            
                            if (!head.isNull() && count > 0 && count < 200) {
                                // LinkedListNode<KeyValuePair<int,SalesmanItem>>:
                                //   list@0x10, next@0x18, prev@0x20, item@0x28
                                // KeyValuePair<int,SalesmanItem> (struct inline at node+0x28):
                                //   key:int@0x00, value:ptr@0x08
                                var node = head;
                                var idx = 0;
                                while (!node.isNull() && idx < count) {
                                    try {
                                        // KeyValuePair is inline struct at node+0x28
                                        var kvpAddr = node.add(0x28);
                                        var key = kvpAddr.add(0x00).readS32();
                                        var smPtr = kvpAddr.add(0x08).readPointer();
                                        
                                        if (!smPtr.isNull() && parseInt(smPtr.toString()) > 0x10000) {
                                            // SalesmanItem: _unknownFields@0x10, item_@0x18, money_@0x20, knb_@0x24
                                            var itemPtr = smPtr.add(0x18).readPointer();
                                            var money = smPtr.add(0x20).readS32() || 0;
                                            var knb = smPtr.add(0x24).readS32() || 0;
                                            
                                            var genre = 0, detail = 0, particular = 0, level = 0, series = 0;
                                            var name = '';
                                            var magics = [];
                                            
                                            if (!itemPtr.isNull() && parseInt(itemPtr.toString()) > 0x10000) {
                                                // App.Item protobuf:
                                                //   _unknownFields@0x10, identify_@0x18, rowIndexAndType_@0x1C
                                                //   detailAndGenre_@0x20, particularAndLevel_@0x24
                                                //   stackAndSeries_@0x28, durabilityAndLockState_@0x2C
                                                //   createTimestampSeconds_@0x30, sourceCid_@0x38, sourceName_@0x40
                                                //   state_:RepeatedField<long>@0x48, magic_:RepeatedField<int>@0x50
                                                
                                                var detailAndGenre = itemPtr.add(0x20).readS32();
                                                genre = detailAndGenre & 0xFFFF;
                                                detail = (detailAndGenre >> 16) & 0xFFFF;
                                                
                                                var particularAndLevel = itemPtr.add(0x24).readS32();
                                                level = particularAndLevel & 0xFFFF;
                                                particular = (particularAndLevel >> 16) & 0xFFFF;
                                                
                                                var stackAndSeries = itemPtr.add(0x28).readS32();
                                                series = stackAndSeries & 0xFFFF;
                                                
                                                // Try to read magic_
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
                                                
                                                name = 'G' + genre + 'D' + detail + 'P' + particular + 'L' + level;
                                            }
                                            
                                            items.push({
                                                name: name,
                                                genre: genre, detail: detail,
                                                particular: particular, level: level, series: series,
                                                money: money, knb: knb, magics: magics, idx: key
                                            });
                                        }
                                    } catch(e2) {}
                                    
                                    // Move to next node
                                    node = node.add(0x18).readPointer();
                                    idx++;
                                }
                                console.log("[Shop] LinkedList read: " + items.length + " items from " + count + " nodes");
                            }
                        }
                    }
                    resolve({ ok: true, title: title, items: items });
                } catch(err) {
                    console.log("[Shop] readStallFromMemory error: " + err.message);
                    resolve({ ok: false, error: 'Memory read error: ' + err.message });
                }
            }
        } catch(e) {
            resolve({ ok: false, error: e.message });
        }
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

rpc.exports.doSkillHooked = function(skillId) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };

    globalThis._pendingSkill = skillId | 0;
    if (globalThis._skillHookOn) return { ok: true, queued: skillId | 0 };

    try {
        var playerMainUpdate = il2cppBase.add(0xE42B4C);
        var doSkillFn = new NativeFunction(il2cppBase.add(0xE4969C), 'bool', ['pointer', 'int']);

        Interceptor.attach(playerMainUpdate, {
            onEnter: function() {
                var sid = globalThis._pendingSkill;
                if (sid === null || sid === undefined) return;
                globalThis._pendingSkill = null;
                try {
                    var r = doSkillFn(_playerMainInstance, sid);
                    globalThis._skillLastFire = 'ok DoSkill(' + sid + ')=' + r;
                } catch (e) {
                    globalThis._skillLastFire = 'err ' + e;
                }
            }
        });
        globalThis._skillHookOn = true;
        return { ok: true, hooked: true };
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

// ══ rpc/ui-control.js ══
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