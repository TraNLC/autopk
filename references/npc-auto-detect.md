# NPC Auto-Detect via NpcController Memory Scan (No Bridge)

## Overview
Tự động quét ID + Tên NPC trong game VLTK1 Mobile mà **không cần Il2Cpp bridge**, không cần click tay.

## Memory Path
```
global-metadata.dat → "NpcController" string → Il2CppClass pointer
                                                    ↓
                        Scan ALL rw- heap → objects with klass == NpcController
                                                    ↓
                        obj + 0x28 → cid (C# string: NPC ID như "113")
                        obj + 0x30 → npcName (C# string: "Tống Trinh Sát")
```

## Key Offsets (verified 2026-07-04)

| Field | Offset | Type | Example |
|-------|--------|------|---------|
| `cid` | `+0x28` | `Il2CppString*` | `"113"` |
| `npcName` | `+0x30` | `Il2CppString*` | `"Tống Trinh Sát"` |

## Il2CppString Layout
```
+0x00: vtable / type info
+0x10: length (int32)
+0x14: UTF-16 characters
```

## Step-by-Step

### 1. Find NpcController Class in global-metadata.dat
```js
var pat = "4e 70 63 43 6f 6e 74 72 6f 6c 6c 65 72"; // "NpcController"
var results = Memory.scanSync(metaRange.base, metaRange.size, pat);
// Find exact match
```

### 2. Find Class Pointer in rw- Memory
```js
// Build pointer pattern from string address
var ptrPattern = littleEndian(nameAddr);
// Scan rw- ranges
var cand = match.address.sub(0x10);
if (cand.add(0x10).readPointer().equals(nameAddr)) {
    // Found Il2CppClass for NpcController
}
```

### 3. Scan Heap for Instances
```js
var classPattern = littleEndian(classPtr);
var instances = Memory.scanSync(range, size, classPattern);
// Each hit where obj.readPointer() == classPtr is an NpcController instance
```

### 4. Read cid + npcName
```js
var cidPtr = obj.add(0x28).readPointer();
var cidLen = cidPtr.add(0x10).readU32();
var cid = cidPtr.add(0x14).readUtf16String(cidLen);

var namePtr = obj.add(0x30).readPointer();
var nameLen = namePtr.add(0x10).readU32();
var name = namePtr.add(0x14).readUtf16String(nameLen);
```

## Filter: Trinh Sát Only
```js
function removeAccents(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
if (removeAccents(name).includes('trinh sat')) {
    // Found Trinh Sát! Use `cid` to call NPC
}
```

## Usage in tongkim.js
```js
const npcRes = await session.callRpc('getNearNpcNames');
for (const [npcId, npcName] of Object.entries(npcRes.npcMap)) {
    if (removeAccents(npcName).includes('trinh sat')) {
        trinhSatId = npcId; // Auto-detected!
        break;
    }
}
// Then: remoteNpcDialogue(trinhSatId) + selectDialogOption(warOption)
```

## Files
- `frida-scripts/rpc/npc/NPCScanner.js` — No-bridge scanner implementation
- `src/features/tongkim.js` — Uses getNearNpcNames for auto-detect
- `tools/test-scan-datafield.js` — Standalone test script

## Notes
- Works on MuMu x86 emulator (Houdini) without `libil2cpp.so`
- No recv hook needed — reads directly from game memory
- NPC IDs are dynamic per session — scanning finds current IDs always
- Performance: ~2-5 seconds memory scan, runs once per staging entry
