# VLTK1 Mobile — Cơ chế Focus / Target

> Phân tích từ data dump `System.Runtime.CompilerServices.cs` + `game.manager.cs`
> Date: 2026-07-07

---

## 1. Cấu trúc `Target` (game.manager.Target)

Là **class** (reference type), không phải struct. PlayerMain giữ **pointer** tới Target object.

```
PlayerMain (NpcRes.Special)
  +0x20: Controller* npcontroller
  +0xA0: Target* target            ← pointer tới Target object trên heap
  +0x100: string runFollowTargetCid ← CID đang đuổi theo
  +0x108: long runFollowTargetNextFrame
  +0x128: List<PathFinding.Node> findingPathVector
  +0x130: PathFinding.Node findingPathTarget
  +0x138: bool findingPathIsNewTargeted
  +0x140: long findingPathLastSendMessageFrame
  +0x148: Action<int> findingPathOnVector
  +0x150: Action findingPathOnFinish
  +0x158: bool findingPathIsRunning
  +0x159: bool findingPathUpdate
```

### Target object layout (khi dereference 0xA0)

| Offset | Field | Type |
|--------|-------|------|
| +0x10 | controller | Controller* |
| +0x18 | positionBySkillDirection | Position |
| +0x20 | main | PlayerMain* |
| +0x28 | missile | Map |
| +0x30 | timestamp | long |
| +0x38 | manualExisting | bool |
| +0x40 | enemyDistance | List<KeyValuePair<double, Controller>> |
| +0x48 | skillDirectionTargetSemiAutoSelected | string |
| +0x50 | skillDirectionControllerExistingMapping | Dictionary<Controller, bool> |

### Target methods

| Method | RVA | Mô tả |
|--------|-----|-------|
| `Clear()` | **0xF20280** | Xóa controller + UI circle — đây là hàm chính thức |
| `SetTarget(Controller, Color)` | 0xF2017C | Gán target mới |
| `ManualPick(Controller)` | 0xF20344 | Pick target thủ công |
| `SystemPickNpc(string, Color)` | 0xF20290 | Hệ thống pick NPC |
| `GetCid()` | 0xF20110 | Lấy CID của target |
| `Compare(Controller)` | 0xF200CC | So sánh controller |
| `UnSelectId(string)` | 0xF20124 | Bỏ chọn ID |
| `SetPosition(int, int)` | 0xF2063C | Đặt vị trí |
| `ByDirectionProperties(...)` | 0xF23168 | Tìm target theo hướng skill |

---

## 2. PlayerMain methods liên quan

| Method | RVA | Mô tả |
|--------|-----|-------|
| `DoSkill(int id)` | 0xE4969C | Cast skill — đọc target từ Target.controller |
| `ClearRun()` | 0xE42A48 | Dừng chạy |
| `GotoFindingPathStop()` | 0xE4B76C | Dừng pathfinding |
| `GotoFindingPathUpdate()` | 0xE43094 | Update pathfinding mỗi frame |
| `KillTargetBySkillResetWeaponType()` | 0xE4A5CC | Reset target + vũ khí |
| `KillTargetBySkillUpdate()` | 0xE42E78 | Update kill target (frame loop) |
| `RunFollowTargetUpdate()` | 0xE42C64 | Update đuổi theo target |
| `SendDoSkillTargetPlayer(int, string, int)` | 0xE4A0E8 | Gửi gói cast skill vào player |
| `SendDoSkillTargetPosition(int, int, int, int)` | 0xE4A350 | Gửi gói cast skill vào vị trí |
| `PrivateFightTarget(PrivateFightTarget)` | 0xE472CC | Server gửi target PK |
| `SelfForceMoveStop()` | 0xE48224 | Dừng force move từ server |
| `SelfForceMoveTarget()` | 0xE484B8 | Force move tới target từ server |

---

## 3. Flow tấn công + đuổi target

```
1. sendDoSkillTargetPlayer(skillId, cid)
   → gửi opcode 238 lên server

2. Server xử lý → gửi response xuống client
   → PrivateFightTarget(message) @ 0xE472CC
   → SetTarget(controller) @ 0xF2017C
   → Target.controller = enemy

3. DoSkill(id) @ 0xE4969C
   → đọc this.target.controller
   → cast skill vào controller đó

4. RunFollowTargetUpdate() @ 0xE42C64 (gọi mỗi frame trong Update)
   → kiểm tra runFollowTargetCid @ 0x100
   → nếu có → GotoFindingPath() @ 0xE4A620
   → bắt đầu pathfinding tới target

5. GotoFindingPathUpdate() @ 0xE43094 (mỗi frame)
   → đọc findingPathVector @ 0x128
   → di chuyển nhân vật từng node

6. Khi target chết hoặc mất dấu:
   → KillTargetBySkillUpdate() @ 0xE42E78
   → KillTargetBySkillResetWeaponType() @ 0xE4A5CC
   → Target.Clear() @ 0xF20280
```

---

## 4. Cách clearFocus hoạt động

```javascript
// Thứ tự đúng để clear focus:

// 1. Dừng movement
ClearRun(playerMain)                 // 0xE42A48
GotoFindingPathStop(playerMain)      // 0xE4B76C

// 2. Gọi Target.Clear() trên Target object
targetObj = playerMain[0xA0]         // đọc pointer
Target.Clear(targetObj)              // 0xF20280 → xóa controller + UI

// 3. Xóa tham chiếu
playerMain[0xA0] = null

// 4. Reset pathfinding state
KillTargetBySkillResetWeaponType(playerMain)  // 0xE4A5CC
playerMain[0x100] = null  // runFollowTargetCid
playerMain[0x128] = null  // findingPathVector
playerMain[0x158] = 0     // findingPathIsRunning
playerMain[0x159] = 0     // findingPathUpdate
```

---

## 5. Vấn đề đã biết

- **Tất cả hàm phải chạy trên MAIN THREAD** — dùng `_mainThreadActions` queue, xử lý trong `Controller.Update` (0xFB6994) hoặc `World.Update` (0xF2B3B8)
- **Mỗi frame chỉ xử lý 1 action** → clearFocus có thể mất vài frame để hoàn tất
- **`Target.Clear()` cần Target object còn tồn tại** — nếu đã zero 0xA0 trước thì không gọi được
- **Server có thể gửi lại target** — nếu server vẫn nghĩ mình đang đánh ai đó, nó sẽ gửi `PrivateFightTarget` để set lại

---

## 6. Skill-based reset (fallback)

Cast skill tự thân (TargetSelf=1, TargetEnemy=0) → game engine tự clear target:

| ID | Tên | Phái | LV |
|----|-----|------|----|
| 109 | Tuyết ảnh | Thúy Yên | 50 |
| 269 | Băng Tâm Trái ảnh | Thúy Yên | 20 |
| 100 | Hộ Thể Hàn Băng | Thúy Yên | 40 |
| 157 | Tọa Vọng Vô Ngã | Chung | 50 |
| 33 | Tĩnh Tâm Quyết | Chung | 20 |
