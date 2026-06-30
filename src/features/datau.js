function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Scan nearby player stalls for items matching the query.
 * @param {string} deviceId 
 * @param {FridaSession} session 
 * @param {string} itemNameQuery 
 * @param {function} sendLog 
 */
async function scanDatauItems(deviceId, session, itemNameQuery, filters, event, sendLog) {
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
    
    for (let i = 0; i < shops.length; i++) {
      const shop = shops[i];
      // Bỏ qua điều kiện isSalesman để đảm bảo quét được tất cả các sạp!
      sendLog(`[${deviceId}] Đang mở sạp "${shop.name}" (${i+1}/${shops.length})...`, 'info');
      
      if (event) {
        event.sender.send('datau-progress', `Đang quét sạp của "${shop.name}" (${i+1}/${shops.length})...`);
      }
      
      const itemsRes = await session.callRpc('getShopItems', 0, shop.name, shop.namePtrStr, shop.cidPtrStr, shop.controllerPtrStr);
      
      if (itemsRes && itemsRes.ok && itemsRes.items) {
        console.log(`[Datau] Sạp "${shop.name}" có ${itemsRes.items.length} vật phẩm.`);
        for (const item of itemsRes.items) {
          const itemNameNorm = removeAccents(item.name);
          
          // Giải mã các thuộc tính ẩn
          const genre = item.detailAndGenre & 0xFFFF;
          const detail = (item.detailAndGenre >> 16) & 0xFFFF;
          const level = item.particularAndLevel & 0xFFFF;
          const series = item.stackAndSeries & 0xFFFF;
          
          console.log(`  -> [${shop.name}] Item: ${item.name} | Cấp: ${level} | Hệ: ${series} | Loại (Genre/Detail): ${genre}/${detail} | Giá: ${item.money} bạc`);
          
          let isMatch = true;
          
          // 1. Lọc Tên & Giới Tính (vì giới tính thường dính vào tên)
          if (queryNormalized && !itemNameNorm.includes(queryNormalized)) isMatch = false;
          if (filters.gender === 'nam' && !itemNameNorm.includes('(nam)')) isMatch = false;
          if (filters.gender === 'nu' && !itemNameNorm.includes('(nu)')) isMatch = false;
          
          // 2. Lọc Hệ
          if (filters.series !== -1 && series !== filters.series) isMatch = false;
          
          // 3. Lọc Cấp
          if (filters.level !== -1 && level !== filters.level) isMatch = false;
          
          // 4. Lọc Loại (Item Type)
          if (filters.itemType !== -1) {
            if (filters.itemType === 0 && genre !== 0 && genre !== 1) isMatch = false; // Vũ khí
            else if (filters.itemType === 1 && (genre !== 2 || detail !== 0)) isMatch = false; // Áo
            else if (filters.itemType === 2 && (genre !== 2 || detail !== 1)) isMatch = false; // Mũ
            else if (filters.itemType === 3 && (genre !== 2 || detail !== 2)) isMatch = false; // Giày
            else if (filters.itemType === 4 && (genre !== 2 || detail !== 3)) isMatch = false; // Đai
            else if (filters.itemType === 5 && (genre !== 2 || detail !== 4)) isMatch = false; // Bao Tay
            else if (filters.itemType === 6 && (genre !== 3 || detail !== 0)) isMatch = false; // Nhẫn
            else if (filters.itemType === 7 && (genre !== 3 || detail !== 1)) isMatch = false; // Dây Chuyền
            else if (filters.itemType === 8 && (genre !== 3 || detail !== 2)) isMatch = false; // Ngọc Bội
          }
          
          if (isMatch) {
            foundItems.push({
              shopName: shop.name,
              sellerId: shop.cid,
              shopLocation: `${shop.x}, ${shop.y}`,
              itemName: item.name,
              money: item.money,
              knb: item.knb,
              series: series,
              level: level,
              genre: genre,
              detail: detail
            });
          }
        }
      } else {
        sendLog(`[${deviceId}] Bỏ qua sạp "${shop.name}": Không đọc được vật phẩm.`, 'warn');
      }

      
      // Close the shop dialog to avoid getting stuck
      await session.callRpc('closeDialogPopups').catch(() => {});
      
      // Short delay before next shop to avoid overwhelming the server
      await new Promise(r => setTimeout(r, 600));
    }
    
    sendLog(`[${deviceId}] Quét hoàn tất. Tìm thấy ${foundItems.length} vật phẩm phù hợp.`, 'success');
    return { ok: true, items: foundItems };
    
  } catch (err) {
    sendLog(`[${deviceId}] Lỗi ngoại lệ khi quét Dã Tẩu: ${err.message}`, 'error');
    return { ok: false, error: err.message };
  }
}

module.exports = {
  scanDatauItems
};
