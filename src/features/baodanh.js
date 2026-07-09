const { PacketInjector } = require('../packet-injector');

// Flag to keep track of successful registration in the current session window
const registrationAttempts = new Map(); // deviceId -> lastAttemptHourMinute (string "HH:MM")

/**
 * Checks if the current time is within the registration window
 */
function isRegistrationTime() {
    const now = new Date();
    const hour = now.getHours();
    const min = now.getMinutes();

    const targetHours = [13, 15, 20, 23];
    if (targetHours.includes(hour) && min >= 0 && min < 10) {
        return `${hour}:${min}`; 
    }
    return null;
}

/**
 * Logic báo danh vào staging area từ map 324
 */
async function checkAndBaoDanhStaging(deviceId, session, info, sideConfig, sendLog) {
    if (!session || !info) return false;
    
    const mapId = info.mapId;
    if (mapId !== 324) {
        return false;
    }

    const regTimeKey = isRegistrationTime();
    if (!regTimeKey) {
        return false; 
    }

    // Tránh spam nếu đã báo danh cho khung giờ này rồi
    const hourMinute = regTimeKey.split(':')[0] + ':' + (Math.floor(parseInt(regTimeKey.split(':')[1]) / 10) * 10);
    const lastAttempt = registrationAttempts.get(deviceId);
    if (lastAttempt === hourMinute) {
        return true; 
    }

    // 1. Quét danh sách NPC xung quanh trước để kiểm tra xem có NPC báo danh không
    let npcMap = {};
    try {
        const res = await session.callRpc('getNearNpcNames');
        if (res && res.ok && res.npcMap) {
            npcMap = res.npcMap;
        }
    } catch(e) {
        sendLog(`[${deviceId}] [Bao Danh] Khong the quet danh sach NPC: ${e.message}`, 'error');
        return false;
    }

    const campValue = info.campValue || 1; // 1 = Tống, 2 = Kim
    let targetSide = 'song';
    if (sideConfig === 'jin') {
        targetSide = 'kim';
    } else if (sideConfig === 'song') {
        targetSide = 'song';
    } else {
        targetSide = (campValue === 2) ? 'kim' : 'song';
    }

    let npcId = null;
    let npcName = "";

    if (targetSide === 'kim') {
        npcId = "23"; // Kim quốc chiêu binh quan
        npcName = "Kim quốc chiêu binh quan";
    } else {
        npcId = "28"; // Mộ binh quan (Tống)
        npcName = "Mộ binh quan";
    }

    // Nếu không thấy NPC báo danh tương ứng ở gần, tức là nhân vật đã vào khu chuẩn bị (staging room thực tế)
    // hoặc NPC chưa xuất hiện -> Bỏ qua không gọi
    if (!npcMap[npcId]) {
        return false; 
    }

    sendLog(`[${deviceId}] [Bao Danh] Den gio bao danh (${hourMinute}). Phat hien NPC ${npcName} (ID: ${npcId}). Dang tien hanh bao danh...`, 'warn');
    
    const injector = new PacketInjector(session);
    try {
        try { await session.callRpc('closeDialogPopups'); } catch(e) {}
        await new Promise(r => setTimeout(r, 400));

        await injector.sendNpcDialogue(npcId);
        await new Promise(r => setTimeout(r, 800));

        await injector.sendNpcSelect(0);
        await new Promise(r => setTimeout(r, 800));

        try { await session.callRpc('closeDialogPopups'); } catch(e) {}

        sendLog(`[${deviceId}] [Bao Danh] Da gui lenh bao danh thanh cong.`, 'success');
        registrationAttempts.set(deviceId, hourMinute);
        return true;
    } catch(e) {
        sendLog(`[${deviceId}] [Bao Danh] Loi tuong tac NPC bao danh: ${e.message}`, 'error');
        return false;
    }
}

module.exports = {
    checkAndBaoDanhStaging,
    isRegistrationTime
};
