# Hướng dẫn Kỹ thuật: Cơ chế Quét NPC Xung quanh (NPCScanner Heap Scan)

Tài liệu này mô tả chi tiết cơ chế quét thông tin NPC xung quanh (đối chiếu tên tìm "Trình Sát" và "Quân Nhu") bằng cách quét bộ nhớ thô (Heap Scan) độc lập với Bridge (Bridge-Free) nhằm đảm bảo an toàn tuyệt đối và tránh game crash trên các môi trường giả lập sử dụng Houdini (dịch mã ARM).

---

## 1. Bối cảnh & Thử thách kỹ thuật

### Môi trường dịch mã ARM (Houdini)
Khi chạy game VLTK1 Mobile (phiên bản kiến trúc ARM64) trên các phần mềm giả lập PC (như MEmu, LDPlayer, MuMu), hệ thống sử dụng một lớp giả lập tập lệnh là **Houdini** để biên dịch động mã máy ARM thành x86_64. 
- Do đó, việc gọi trực tiếp các API Native của IL2CPP thông qua `NativeFunction` của Frida (như `il2cpp_domain_get`, `il2cpp_class_from_name`) từ luồng Frida (x86_64) vào không gian mã nguồn ARM của game sẽ gây lỗi **Access Violation (Vi phạm bộ nhớ)** ngay lập tức.
- Giải pháp ổn định duy nhất là đọc dữ liệu thô từ RAM và quét heap tìm các thực thể mà không can thiệp vào luồng thực thi của game.

### Cấu trúc lớp `NpcController` trong game
Theo tệp C# đã dịch ngược (`data/dump/System.Runtime.CompilerServices.cs`), cấu trúc lớp điều khiển NPC như sau:
```csharp
public class NpcController : MonoBehaviour, IPointerDownHandler, IEventSystemHandler
{
    public NpcRes.Normal npcController; // Offset 0x20 (Con trỏ tới dữ liệu Normal NPC)
    public string cid;                  // Offset 0x28 (ID chuỗi của NPC)
    public string npcName;              // Offset 0x30 (Tên hiển thị của NPC)
    public GameObject selectGameObject; // Offset 0x38
    ...
}
```

---

## 2. Giải pháp Quét Động & Phân tích Class (Namespace-Aware Class Resolution)

Hàm `__findClassFromMetadata(className)` thực hiện tìm con trỏ lớp (`Il2CppClass*`) của một class bất kỳ trong RAM thông qua dữ liệu tệp ánh xạ siêu dữ liệu `global-metadata.dat`:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Đọc /proc/self/maps tìm dải nhớ chứa global-metadata.dat │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Quét bộ nhớ dải này tìm chuỗi Tên lớp & Namespace        │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Lấy ra địa chỉ của chuỗi Tên (nameAddr) và Chuỗi         │
│    Namespace (nsAddr) trong bộ nhớ metadata                │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Quét các phân vùng đọc/ghi (rw-) của RAM để tìm cấu trúc │
│    Il2CppClass:                                            │
│    - Con trỏ tại [ClassPointer + 0x10] == nameAddr          │
│    - Con trỏ tại [ClassPointer + 0x18] == nsAddr           │
└─────────────────────────────────────────────────────────────┘
```

### Cơ chế chia nhỏ Namespace & Class Name
Đối với các lớp nằm trong một Namespace cụ thể (ví dụ: `NpcRes.Normal`), hàm sẽ tự động cắt phần chuỗi trước dấu chấm làm Namespace (`NpcRes`) và phần sau làm Tên lớp (`Normal`). Sau đó đối chiếu chính xác cả hai con trỏ chuỗi trong cấu trúc lớp IL2CPP tại offset `+0x10` (tên) và `+0x18` (namespace).

---

## 3. Định dạng chuỗi System.String trong IL2CPP

Một trường dữ liệu kiểu `string` trong C# / IL2CPP thực chất là một con trỏ tới đối tượng `System.String` trong heap:
- **`Offset 0x0`**: Con trỏ tới lớp (`klass`)
- **`Offset 0x8`**: Con trỏ quản lý giám sát (`monitor`)
- **`Offset 0x10`**: Độ dài chuỗi (kiểu Số nguyên 32-bit)
- **`Offset 0x14`**: Bắt đầu vùng nhớ đệm chứa các ký tự UTF-16 (Unicode) của chuỗi.

Hàm đọc chuỗi an toàn được triển khai như sau:
```javascript
function readIl2CppString(strPtr) {
    if (!strPtr || strPtr.isNull() || parseInt(strPtr.toString()) < 0x10000) return '';
    try {
        var len = strPtr.add(0x10).readInt(); // Đọc độ dài chuỗi tại offset 0x10
        if (len > 0 && len < 1000) {
            return strPtr.add(0x14).readUtf16String(len); // Đọc chuỗi UTF-16 tại offset 0x14
        }
    } catch(e) {}
    return '';
}
```

---

## 4. Cơ chế Quét Heap NPC cụ thể (`NPCScanner.js`)

Khi Node.js gọi RPC `getNearNpcNames`, Frida sẽ thực thi quy trình sau:
1. Sử dụng bộ phân tích siêu dữ liệu tìm địa chỉ của lớp `NpcController` trong RAM.
2. Lấy địa chỉ lớp đó làm mẫu quét, định dạng thành mẫu nhị phân Little Endian 64-bit (`pat`).
3. Quét toàn bộ vùng nhớ đọc/ghi (heap) của game tìm các đối tượng bắt đầu bằng con trỏ lớp của `NpcController` (tức là offset `0x0` của đối tượng trỏ đến địa chỉ của `NpcController`).
4. Với mỗi địa chỉ khớp:
   - Đọc con trỏ chuỗi `cid` ở offset `+0x28` của đối tượng rồi chuyển thành dạng string làm **`npcId`**.
   - Đọc con trỏ chuỗi `npcName` ở offset `+0x30` của đối tượng rồi chuyển thành dạng string làm **`npcName`**.
   - Lưu trữ cặp `[npcId] -> npcName` vào bản đồ trả về.

### Mã nguồn quét Heap chỉnh sửa
```javascript
// NpcController has class pointer (offset 0x0)
var matches = Memory.scanSync(range.base, range.size, pat.join(' '));
for (var m = 0; m < matches.length && found < 200; m++) {
    try {
        var obj = matches[m].address;
        
        // Đọc trường cid (string) tại offset 0x28
        var npcId = readIl2CppString(obj.add(0x28).readPointer());
        if (!npcId || npcMap[npcId]) continue;
        
        // Đọc trường npcName (string) tại offset 0x30
        var name = readIl2CppString(obj.add(0x30).readPointer());
        if (name) {
            npcMap[npcId] = name;
            found++;
        }
    } catch(e) {}
}
```

---

## 5. Tối ưu hóa: Quét class 1 lần duy nhất & Phát hiện Map ID

Để tối ưu hóa hiệu suất và giảm thời gian quét, hệ thống được nâng cấp 2 điểm cải tiến lớn:

### A. Cơ chế Caching Class Metadata
Thay vì thực hiện quét toàn bộ metadata dải nhớ `rw-` trên mỗi lần chạy `getNearNpcNames` (mất khoảng 10-15s), lớp `NPCScanner.js` lưu trữ con trỏ `npcKlass` thông qua biến toàn cục `cachedNpcKlass`.
- Lần chạy đầu tiên: Tiến hành quét thô để định vị class và lưu lại cache.
- Các lần tiếp theo: Lấy trực tiếp từ cache giúp tốc độ phản hồi giảm xuống dưới **1ms**.

### B. Tự động phát hiện Map ID hiện tại
Trong đối tượng trả về từ RPC `getNearNpcNames`, trường `mapId` được đọc trực tiếp từ con trỏ thực thể người chơi chính `_playerMainInstance` ở offset `0xE4`:
```javascript
var mapId = 0;
try {
    mapId = _playerMainInstance.add(0xE4).readS32();
} catch(e) {}
```

---

## 6. Tích hợp trong Core Auto Tống Kim (`src/features/tongkim.js`)

Khi vào khu vực phòng chờ Staging Area (các bản đồ `323, 324, 325, 379, 382, 972`), hệ thống sẽ gọi chu kỳ quét:
```javascript
const npcNames = await session.callRpc('getNearNpcNames');
if (npcNames && npcNames.ok && npcNames.npcMap) {
  for (const [npcId, npcName] of Object.entries(npcNames.npcMap)) {
    const lower = String(npcName).toLowerCase();
    
    // Đối chiếu tên Trình Sát để học ID tự động
    if (lower.includes('trinh')) {
      trinhSatId = npcId;
      cache.trinhSatId = npcId;
      sendLog(`[${deviceId}] Auto-found Trinh Sat: ID=${npcId} (${npcName})`, 'success');
      break;
    }
  }
}
```
Nhờ cơ chế này, auto có thể tự động vượt rào nhận diện ID biến đổi của Trình Sát mỗi trận mà hoàn toàn không cần click chuột thủ công hoặc lo ngại vấn đề crash game do không gian tập lệnh dịch mã của giả lập.
