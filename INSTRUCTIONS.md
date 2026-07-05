# VLTK1 Mobile — Auto Tống Kim Instructions

> **Ngày:** 2026-07-04
> **Game:** VLTK1 Mobile (`vn.perfingame.jx1mobile`)
> **Stack:** Node.js Electron + Frida (safe mode, no bridge)
> **Loop chính:** 2.5s (main.js) / 500ms (autoPK tick)

---

## 🔄 Tổng quan Flow

```
Phase 1 (Thành) → Phase 2 (Staging) → Phase 3 (Chiến Trường)
                       ↑                      │
                       └────── (chết) ─────────┘
```

| Phase | Map IDs | Logic | Loop |
|-------|---------|-------|------|
| 1 | 1, 11, 37, 78, 162, 176 | Báo danh với Chiêu Binh Quân | 2.5s |
| 2 | 323, 324, 325, 379, 382, 972 | Buff + Lắc + Gọi Trinh Sát | 2.5s |
| 3 | 44, 375, 376, 377, 580 | Auto PK đánh kẻ địch | 500ms |

---

## 🚀 Cách chạy

```bash
# Build Frida script
node frida-scripts/build.js

# Chạy GUI
npm run gui
```

## 📁 File Map

| File | Vai trò |
|------|---------|
| `src/gui/main.js` | Loop chính 2.5s, route mapId → Phase 1/2/3 |
| `src/features/tongkim.js` | Phase 1 (báo danh) + Phase 2 (buff, gọi Trinh Sát, hồi sinh) |
| `src/auto-pk.js` | Phase 3: autoPK 500ms tick, findBestTarget, 5ph tự chết |
| `src/packet-injector.js` | Gửi packet (skill, move, autoplay profile) |
| `frida-scripts/rpc/npc/NPCScanner.js` | Auto-detect NPC không cần bridge |
| `frida-scripts/rpc/core/DialogManager.js` | remoteNpcDialogue, selectDialogOption (op35) |
| `frida-scripts/rpc/ui-control.js` | closeDialogPopups, isDialogOpen |

---

## Phase 1 — Thành → Báo Danh (Thủ Công)

**File:** `src/features/tongkim.js` → `isCity` branch

**Lưu ý:** Tính năng tự động báo danh đã được loại bỏ. Bạn cần tự điều khiển nhân vật chạy đến NPC Chiêu Binh Quân và click báo danh thủ công.

Trigger khi mapId ∈ `{1, 11, 37, 78, 162, 176}`.

### Logic
- Ở trong khu vực thành, Tool sẽ không làm gì (return) để bạn tự do thao tác.
- Sau khi bạn đã báo danh và được chuyển vào khu chờ (Staging), hệ thống sẽ ngay lập tức tự động kích hoạt **Phase 2**.

---

## Phase 2 — Staging → Buff + Gọi Trinh Sát

**File:** `src/features/tongkim.js` → `isStagingArea` branch

Trigger khi mapId ∈ `{323, 324, 325, 379, 382, 972}`.

### Logic

#### Lần đầu (isRetry = false)
1. `closeDialogPopups()`
2. `sendApplyAutoplayProfile(true)` — bật auto game
3. `sendDoSkillTargetPosition(0, x, y)` — clear target
4. **Buff trấn phái** theo sect:
   ```
   {0:102, 1:111, 2:129, 3:139, 4:159, 5:109, 6:179, 7:189, 8:209, 9:219}
   ```
5. **Lắc** (tùy chọn từ GUI config `lacs`):
   - `45` → tìm "phi tốc" trong túi → useItem
   - `51` → tìm "lệnh bài" trong túi → useItem
   - `50` → tìm "chiến cổ"/"trống" trong túi → useItem
6. `cache._trinhSatRetry = true`

#### Retry (isRetry = true)
- Bỏ qua buff/lắc, gọi thẳng Trinh Sát

#### Gọi Trinh Sát
1. `remoteNpcDialogue(trinhSatId)` → wait 500ms
2. `selectDialogOption(warOption)` → wait 5000ms
   - `warOption`: Tống=0, Kim=1 (dựa trên `campValue`)
3. Loop sau detect battlefield → Phase 3

### Auto-detect Trinh Sát
- Nếu `cache.trinhSatId` chưa có: gọi `getNearNpcNames()` → quét memory tìm NpcController có tên chứa "trinh sat"
- Reset `_trinhSatRetry`: khi `lastMapId !== mapId` (tức vừa về staging từ map khác)

---

## Phase 3 — Chiến Trường → Auto PK

**File:** `src/auto-pk.js`

Trigger khi mapId ∈ `{44, 375, 376, 377, 580}`.

### Khởi động
1. `autoPK.start()` → load profile GUID → `sendApplyAutoplayProfile(true, profileGuid)`
2. Loop 500ms: `tick()`

### tick() Logic (mỗi 500ms)

```
1. HP <= 0? → return (để main.js loop 2.5s gọi hồi sinh → Phase 2)
2. 5 phút trôi qua? → đứng im 5s → chết → return
3. Đang cưỡi ngựa? → switchHorse() → wait 300ms → return
4. getNearEnemies() → có enemy?
5. findBestTarget(player, enemies) → cast skill
6. Không có enemy → sync vị trí mỗi 15s
```

### findBestTarget()

#### Cấu hình
| Param | Default | Ý nghĩa |
|-------|---------|---------|
| `priorityRange` | 400 | Phạm vi ưu tiên (khắc hệ) |
| `extendedRange` | 800 | Phạm vi mở rộng tối đa |
| `skillRange` | 512 | Tầm đánh skill |
| `outerRange` | 700 | Tầm đánh xa (cast vào tọa độ) |
| `usePriorityRange` | true | Bật ưu tiên khắc hệ |
| `useOuterRange` | true | Bật đánh ngoài tầm chiêu |
| `ignoreInvulnerable` | true | Bỏ qua state 2, 52 |

#### Ngũ Hành
```
0=Kim, 1=Mộc, 2=Thủy, 3=Hỏa, 4=Thổ
Khắc: Kim→Mộc, Mộc→Thổ, Thổ→Thủy, Thủy→Hỏa, Hỏa→Kim
```

#### Thuật toán
- `usePriorityRange=true`: Trong phạm vi ưu tiên → ưu tiên khắc hệ; ngoài → gần nhất
- `usePriorityRange=false`: Toàn bộ → gần nhất thuần
- Filter: `dist <= outerRange` + bỏ qua invulnerable (state 2, 52)
- Cast: trong tầm → `sendDoSkillTargetPlayer(id)`; ngoài tầm → `sendDoSkillTargetPosition(x,y)`

### 5 Phút Tự Chết
- `_lastSelfDieTime` tracked trong AutoPK instance
- Mỗi 5 phút (300000ms): đứng im 5s không đánh → bị địch giết → HP=0
- Loop 2.5s phát hiện HP=0 → hồi sinh (op232) → về Staging → Phase 2

---

## Hồi Sinh (mọi map)

**File:** `src/features/tongkim.js` → HP check đầu tiên

1. `closeDialogPopups()`
2. `sendPacket(232, '')` — opcode hồi sinh
3. `closeDialogPopups()`
4. return → chờ loop sau

---

## NPC Auto-Detect (Memory Scan)

**File:** `frida-scripts/rpc/npc/NPCScanner.js`

Không cần Il2Cpp bridge. Tự động tìm NPC trong bộ nhớ:

1. `__findNpcControllerClass()`: Quét `global-metadata.dat` → tìm string "NpcController" → lấy Il2CppClass pointer
2. `getNearNpcNames()`: Duyệt toàn bộ heap rw- → tìm object có `klass == NpcController` → đọc:
   - `cid@+0x28` (config ID)
   - `npcName@+0x30` (tên UTF-8)
3. Trả về: `{ ok: true, npcMap: { "113": "Tống Trinh Sát", "101": "Tống Quân Nhu", ... } }`

---

## Chú Ý

- **KHÔNG sửa logic Phase 1 và Phase 2** — 2 phase này riêng biệt, không đụng chạm
- **KHÔNG thêm auto-game commands sau selectDialogOption** — để game tự chạy
- **Delay sau selectDialogOption = 5s** — đủ thời gian load map chiến trường
- **AutoPK tick = 500ms**, không phải 2.5s
- **Main loop = 2.5s** (setInterval trong main.js)
- **Frida safe mode**: không dùng Il2Cpp bridge, toàn bộ memory scan bằng NativePointer + Memory.scanSync
- **MuMu x86**: game chạy qua Houdini ARM translation, không có `libil2cpp.so`
