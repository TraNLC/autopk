// Lưu trữ cấu hình NPC Tống Kim theo Map ID
// Mỗi map có 2 phe (Tống/Kim), mỗi phe có 2 NPC (Quân Nhu + Trinh Sát) = 4 ID
// ⚠️ NPC ID ĐỔI MỖI TRẬN — file chỉ lưu ID trận GẦN NHẤT làm fallback.
//    Cơ chế CHÍNH: name-match (getNearNpcNames) tự động học ID tươi mỗi trận.
//    updateNpcId() sẽ ghi đè file với ID mới → lần sau vào map có sẵn fallback.
// File lưu tại: data/output/npc_db.json

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', '..', 'data', 'output', 'npc_db.json');

// Dữ liệu mặc định (sẽ bị ghi đè bởi file nếu có)
const DEFAULT_DATA = {
    382: { song: { quanNhu: "2599", trinhSat: "2611" }, kim: { quanNhu: null, trinhSat: null } },
    323: { song: { quanNhu: null, trinhSat: null }, kim: { quanNhu: null, trinhSat: null } },
    324: { song: { quanNhu: null, trinhSat: null }, kim: { quanNhu: null, trinhSat: null } },
    325: { song: { quanNhu: null, trinhSat: null }, kim: { quanNhu: null, trinhSat: null } },
    379: { song: { quanNhu: null, trinhSat: null }, kim: { quanNhu: null, trinhSat: null } },
    972: { song: { quanNhu: null, trinhSat: null }, kim: { quanNhu: null, trinhSat: null } }
};

// Load từ file nếu có, nếu không dùng default
let TongKimMapData = {};

function loadFromFile() {
    try {
        // Bắt đầu với default
        TongKimMapData = JSON.parse(JSON.stringify(DEFAULT_DATA)); // deep clone
        
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            // Deep merge: ghi đè từng map, từng phe, từng role (không mất data lồng)
            for (const mapId of Object.keys(parsed)) {
                if (!TongKimMapData[mapId]) {
                    TongKimMapData[mapId] = { song: { quanNhu: null, trinhSat: null }, kim: { quanNhu: null, trinhSat: null } };
                }
                for (const faction of ['song', 'kim']) {
                    if (parsed[mapId][faction]) {
                        if (!TongKimMapData[mapId][faction]) {
                            TongKimMapData[mapId][faction] = { quanNhu: null, trinhSat: null };
                        }
                        if (parsed[mapId][faction].quanNhu) TongKimMapData[mapId][faction].quanNhu = parsed[mapId][faction].quanNhu;
                        if (parsed[mapId][faction].trinhSat) TongKimMapData[mapId][faction].trinhSat = parsed[mapId][faction].trinhSat;
                    }
                }
            }
            console.log(`[NPC-DB] Đã load ${Object.keys(parsed).length} map từ ${DB_FILE}`);
        } else {
            saveToFile(); // Tạo file lần đầu từ default
        }
    } catch (e) {
        console.warn(`[NPC-DB] Lỗi load file: ${e.message}. Dùng default.`);
        TongKimMapData = JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
}

function saveToFile() {
    try {
        const dir = path.dirname(DB_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DB_FILE, JSON.stringify(TongKimMapData, null, 2), 'utf-8');
    } catch (e) {
        console.warn(`[NPC-DB] Lỗi save file: ${e.message}`);
    }
}

// Load ngay khi module được require
loadFromFile();

/**
 * Lấy cặp ID NPC (Quân Nhu, Trinh Sát) cho map + phe
 * @param {number} mapId 
 * @param {number} campValue - 1=Tống, 2=Kim
 * @returns {{ quanNhu: string|null, trinhSat: string|null }|null}
 */
function getNpcPair(mapId, campValue) {
    const mapData = TongKimMapData[mapId];
    if (!mapData) return null;
    
    const faction = campValue === 2 ? 'kim' : 'song';
    const pair = mapData[faction];
    
    // Chỉ return nếu có ít nhất 1 ID (không null hết)
    if (pair && (pair.quanNhu || pair.trinhSat)) {
        return pair;
    }
    return null;
}

/**
 * Cập nhật ID NPC cho map + phe (học từ name-match)
 * @param {number} mapId 
 * @param {number} campValue 
 * @param {'quanNhu'|'trinhSat'} role 
 * @param {string} npcId 
 */
function updateNpcId(mapId, campValue, role, npcId) {
    if (!TongKimMapData[mapId]) {
        TongKimMapData[mapId] = { song: { quanNhu: null, trinhSat: null }, kim: { quanNhu: null, trinhSat: null } };
    }
    const faction = campValue === 2 ? 'kim' : 'song';
    const old = TongKimMapData[mapId][faction][role];
    TongKimMapData[mapId][faction][role] = npcId;
    // Chỉ save nếu ID thực sự thay đổi
    if (old !== npcId) {
        saveToFile();
        console.log(`[NPC-DB] 💾 Đã lưu: map=${mapId} phe=${faction} ${role}=${npcId}`);
    }
}

module.exports = {
    TongKimMapData,
    getNpcPair,
    updateNpcId
};
