# DUMP MAPPING TODO — 2026-07-03
# Auto-generated from tools/parse-dump.js + tools/bulk-verify.js

## ✅ VERIFIED (merged into core)
- PlayerMain: items@0x30, skills@0x38, world@0x48, target@0xA0, mapId@0xE4, hotkey@0xF8
- Controller: position@0x10, state@0x18
- Position: mapPositionFloat@0x30 (Vector2 float), identify@0x80, controller@0x78
- Identification: name@0x48, camp@0x50, series@0x54, hp@0x58, maxHp@0x5C
- Path: PlayerMain→Target(0xA0)→Controller(0x10)→Position(0x10)→Identification(0x80) ✅

## ⚠️ TODO
- [ ] PlayerMain.npcontroller offset: old code dùng 0x20 nhưng dump không có → cần tìm đúng offset
- [ ] PlayerMain.items iteration: cần Il2Cpp để enum Dictionary
- [ ] getPlayerInfo: path cũ dùng npcontroller@0x20 (có thể sai) → cần migrate sang path mới
- [ ] getNearEnemies: cần Il2Cpp để enum nearNpcs dict
- [ ] getNameFn offset: 0xFB9004 (chưa verify)
- [ ] closeNpcDialog: 0xE458F4 (chưa verify)
- [ ] ObjectDataField.nameColor@0x160: dùng lọc quái xanh

## 📊 Progress
- Verified: 6 classes, ~35 fields
- Total dump: 1281 classes, 21295 fields
- Mapped: ~1.6%
- Target: 50% các class quan trọng (EquipBase, Item, Skill.Data, MagicScriptBase, Suite...)
