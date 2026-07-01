const fs = require('fs');
const path = require('path');
const { lookupByGdpl, lookupByGdplInfo, getMagicInfo } = require('../item-db');

function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const shopCache = {}; // mapId -> { sellerId -> [items] }

function formatMoney(amount) {
  if (amount >= 10000) {
    const van = Math.floor(amount / 10000);
    const luong = amount % 10000;
    if (luong === 0) return `${van} vạn`;
    return `${van} vạn ${luong}`;
  }
  return String(amount);
}

/**
 * Scan nearby player stalls for items matching the query.
 * @param {string} deviceId 
 * @param {FridaSession} session 
 * @param {string} itemNameQuery 
 * @param {function} sendLog 
 */
async function scanDatauItems(deviceId, session, mapId, itemNameQuery, filters, event, sendLog) {
  if (!session) return { ok: false, error: 'Chưa kết nối thiết bị.' };
  
  sendLog(`[${deviceId}] Bắt đầu quét các sạp hàng xung quanh...`, 'info');
  
  try {
    const queryNormalized = itemNameQuery ? removeAccents(itemNameQuery) : '';
    const res = await session.callRpc('getNearbyShops');
    if (!res || !res.ok) {
      sendLog(`[${deviceId}] Lỗi không lấy được danh sách sạp: ${res ? res.error : 'Unknown'}`, 'error');
      return { ok: false, error: res ? res.error : 'Unknown' };
    }
    
    const shops = res.shops || [];
    sendLog(`[${deviceId}] Tìm thấy ${shops.length} sạp xung quanh.`, 'info');
    
    let foundItems = [];
    if (!shopCache[mapId]) shopCache[mapId] = {};
    
    const limit = filters.limit > 0 ? filters.limit : 9999;
    const maxShops = Math.min(shops.length, limit);
    
    if (limit < shops.length) {
       sendLog(`[${deviceId}] Giới hạn quét: Chọn ${maxShops} sạp gần nhất trong ${shops.length} sạp.`, 'info');
    }
    
    for (let i = 0; i < maxShops; i++) {
      const shop = shops[i];
      sendLog(`[${deviceId}] Đang mở sạp "${shop.name}" (${i+1}/${maxShops})...`, 'info');
      
      if (event) {
        event.sender.send('datau-progress', `Đang quét sạp của "${shop.name}" (${i+1}/${maxShops})...`);
      }
      
      const itemsRes = await session.callRpc('getShopItems', 0, shop.name, shop.namePtrStr, shop.cidPtrStr, shop.controllerPtrStr);
      
      if (itemsRes && itemsRes.ok && itemsRes.items) {
        const fullShopItems = [];
        for (const item of itemsRes.items) {
          const detail = Math.floor(item.detailAndGenre / 10000);
          const genre = item.detailAndGenre % 10000;
          const particular = Math.floor(item.particularAndLevel / 10000);
          const level = item.particularAndLevel % 10000;
          const series = item.stackAndSeries % 10000;
          
          let finalName = item.name;
          let reqLevel = level;
          let reqGender = -1;
          let reqStr = 0;
          let reqDex = 0;
          const info = lookupByGdplInfo(genre, detail, particular, level);
          if (info) {
            finalName = info.name;
            reqLevel = info.reqLevel > 0 ? info.reqLevel : level;
            reqGender = info.gender;
            reqStr = info.reqStr || 0;
            reqDex = info.reqDex || 0;
          }
          
          const itemNameNorm = removeAccents(finalName);
          let magicDescs = [];
          if (item.magics && item.magics.length > 0) {
            for (let m = 0; m < item.magics.length; m++) {
              const magicInt = item.magics[m];
              if (magicInt !== 0) {
                const magicId = Math.abs(magicInt % 1000);
                const magicVal = Math.trunc(magicInt / 1000);
                const minfo = getMagicInfo(magicId);
                let displayVal = magicVal > 0 ? `+${magicVal}` : `${magicVal}`;
                let magicName = minfo.desc || minfo.name;
                
                // Match various placeholders like {value}, {-.value.1}, {+.value.1}
                if (magicName.includes('{value}')) {
                  magicDescs.push(magicName.replace('{value}', displayVal));
                } else if (magicName.match(/\{\-\.value\.\d+\}/)) {
                  // If it's a negative placeholder, we display a minus sign
                  const formattedVal = `-${Math.abs(magicVal)}`;
                  magicDescs.push(magicName.replace(/\{\-\.value\.\d+\}/g, formattedVal));
                } else if (magicName.match(/\{\+?\.value\.\d+\}/)) {
                  // If it's a positive placeholder, we display a plus sign
                  const formattedVal = `+${Math.abs(magicVal)}`;
                  magicDescs.push(magicName.replace(/\{\+?\.value\.\d+\}/g, formattedVal));
                } else {
                  magicDescs.push(`${magicName}: ${displayVal}`);
                }
              }
            }
          }
          
          const itemData = {
            idx: item.idx,
            shopName: shop.name,
            sellerId: shop.cid,
            name: itemNameNorm,
            realName: finalName || itemNameNorm,
            genre: genre,
            series: series,
            level: level,
            reqLevel: reqLevel,
            reqStr: reqStr,
            reqDex: reqDex,
            gender: reqGender !== undefined ? reqGender : -1,
            money: item.money,
            knb: item.knb,
            magics: magicDescs
          };
          fullShopItems.push(itemData);
          
          let isMatch = true;
          if (queryNormalized && !itemNameNorm.includes(queryNormalized)) isMatch = false;
          if (filters.gender === 'nam' && !itemNameNorm.includes('(nam)')) isMatch = false;
          if (filters.gender === 'nu' && !itemNameNorm.includes('(nữ)')) isMatch = false;
          if (filters.series !== -1 && series !== filters.series) isMatch = false;
          if (filters.level !== -1 && level !== filters.level) isMatch = false;
          if (filters.itemType !== -1) {
            if (filters.itemType === 0 && genre !== 0 && genre !== 1) isMatch = false;
            else if (filters.itemType === 1 && (genre !== 2 || detail !== 0)) isMatch = false;
            else if (filters.itemType === 2 && (genre !== 2 || detail !== 1)) isMatch = false;
            else if (filters.itemType === 3 && (genre !== 2 || detail !== 2)) isMatch = false;
            else if (filters.itemType === 4 && (genre !== 2 || detail !== 3)) isMatch = false;
            else if (filters.itemType === 5 && (genre !== 2 || detail !== 4)) isMatch = false;
            else if (filters.itemType === 6 && (genre !== 3 || detail !== 0)) isMatch = false;
            else if (filters.itemType === 7 && (genre !== 3 || detail !== 1)) isMatch = false;
            else if (filters.itemType === 8 && (genre !== 3 || detail !== 2)) isMatch = false;
          }
          
          if (isMatch) foundItems.push(itemData);
        }
        shopCache[mapId][shop.cid] = {
          shopName: shop.name,
          location: `${shop.x}, ${shop.y}`,
          items: fullShopItems
        };
      } else {
        sendLog(`[${deviceId}] Bỏ qua sạp "${shop.name}": Không đọc được vật phẩm.`, 'warn');
      }
      
      await session.callRpc('closeDialogPopups').catch(() => {});
      await new Promise(r => setTimeout(r, 600));
    }
    
    // Save cache to disk
    try {
      const today = new Date().toISOString().split('T')[0];
      const cachePath = path.join(__dirname, '..', '..', 'data', 'output', `shops_cache_${mapId}_${today}.json`);
      fs.writeFileSync(cachePath, JSON.stringify(shopCache[mapId], null, 2), 'utf-8');
    } catch(e) {
      console.error('Failed to save shop cache:', e);
    }
    
    sendLog(`[${deviceId}] Quét hoàn tất. Tìm thấy ${foundItems.length} vật phẩm phù hợp.`, 'success');
    return { ok: true, items: foundItems };
    
  } catch (err) {
    sendLog(`[${deviceId}] Lỗi ngoại lệ khi quét Dã Tẩu: ${err.message}`, 'error');
    return { ok: false, error: err.message };
  }
}

function getShopDetails(mapId, sellerId) {
  if (shopCache[mapId] && shopCache[mapId][sellerId]) {
    return shopCache[mapId][sellerId];
  }
  return null;
}

async function buyDatauItem(deviceId, session, sellerId, itemIdx, price, sendLog) {
  if (!session) return { ok: false, error: 'Chưa kết nối thiết bị.' };
  
  sendLog(`[${deviceId}] Đang gửi yêu cầu mua vật phẩm (ID: ${itemIdx}, Giá: ${price}) từ sạp (Chủ: ${sellerId})...`, 'info');
  
  try {
    // Send buy packet using Opcode 206
    const res = await session.callRpc('buyOtherStallItem', sellerId, itemIdx, price || 0);
    
    if (res && res.ok) {
      sendLog(`[${deviceId}] Đã gửi lệnh mua hàng thành công. Vui lòng kiểm tra hành trang!`, 'success');
      return { ok: true };
    } else {
      sendLog(`[${deviceId}] Lỗi mua đồ: ${res ? res.error : 'Unknown'}`, 'error');
      return { ok: false, error: res ? res.error : 'Unknown' };
    }
  } catch (err) {
    sendLog(`[${deviceId}] Lỗi ngoại lệ khi mua đồ: ${err.message}`, 'error');
    return { ok: false, error: err.message };
  }
}

module.exports = {
  scanDatauItems,
  buyDatauItem,
  getShopDetails
};
