// Lưu trữ các cấu hình NPC Tống Kim theo Map ID
// Giúp tách biệt dữ liệu ra khỏi logic chính của Tool
const TongKimMapData = {
    // Thâm Lâm trung cấp phe Tống
    382: {
        ids: ["2599", "2611"],
        names: {
            "2599": "Tống Quân Nhu",
            "2611": "Tống Trinh Sát"
        }
    }
    // Sau này có map mới chỉ cần thêm vào đây:
    // 383: { ids: ["xxx", "yyy"], names: { "xxx": "Kim Quân Nhu", "yyy": "Kim Trinh Sát" } }
};

// Hàm hỗ trợ lấy tên NPC (nếu có lưu)
function getNpcName(npcId) {
    for (const mapId in TongKimMapData) {
        if (TongKimMapData[mapId].names && TongKimMapData[mapId].names[npcId]) {
            return TongKimMapData[mapId].names[npcId];
        }
    }
    return "";
}

module.exports = {
    TongKimMapData,
    getNpcName
};
