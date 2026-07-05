// src/shop-radar.js — Auto-scan all nearby shops, export items to JSON
// Usage: node src/shop-radar.js     (one-shot scan)
//        node src/shop-radar.js --watch 300  (scan every 300 seconds)

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { FridaSession } = require('./frida-session');
const { MemoryReader } = require('./memory-reader');
const { lookupByGdpl, getGenreName, getSeriesName, getMagicInfo } = require('./item-db');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'output', 'json');

// Map ID → name
const MAP_NAMES = {
  37: 'ChienTruongTongKim', 1000: 'LamAn', 1001: 'PhuongTuong', 1002: 'BienKinh',
  1003: 'TuongDuong', 1004: 'DuongChau', 1005: 'DaiLy', 1006: 'ThanhDo'
};

function buildFilename(mapId) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '-'); // HH-MM-SS
  const mapName = MAP_NAMES[mapId] || `Map${mapId || 'Unknown'}`;
  return `shops_${mapName}_${date}_${time}.json`;
}

// Item type lookup (genre → category name)
const GENRE_NAMES = { 0: 'Vũ Khí', 1: 'Ám Khí', 2: 'Áo', 3: 'Nhẫn', 4: 'Dây Chuyền', 5: 'Giày', 6: 'Thắt Lưng', 7: 'Mũ', 8: 'Bao Tay', 9: 'Ngọc Bội' };
const SERIES_NAMES = { 0: 'Kim', 1: 'Mộc', 2: 'Thủy', 3: 'Hỏa', 4: 'Thổ' };

async function scanAllShops() {
  const frida = new FridaSession(null, config.GAME_PACKAGE);
  const memory = new MemoryReader(frida);

  try {
    console.log('[Radar] Connecting...');
    await frida.connect();

    const bundlePath = path.join(__dirname, '..', 'frida-scripts', 'bot.bundle.js');
    await frida.loadScript(bundlePath);

    await new Promise(r => setTimeout(r, 2000));
    console.log('[Radar] Connected, scanning shops...');

    // Get player info for map name
    let mapId = 0;
    try {
      const info = await memory.getPlayerInfo();
      mapId = info.mapId || 0;
      const mapName = MAP_NAMES[mapId] || `Map${mapId}`;
      console.log(`[Radar] Player at: ${mapName} (mapId=${mapId})`);
    } catch(e) { console.log('[Radar] Could not detect map'); }

    const shops = await memory.getNearbyShops();
    console.log(`[Radar] Found ${shops.length} shops. Scanning each...`);

    const results = [];
    let scanned = 0, failed = 0;

    for (const shop of shops) {
      const parts = shop.cid.split('.');
      const stallIndex = parts[1];
      if (!stallIndex) continue;

      try {
        const data = await memory.getShopItems(stallIndex);
        if (data.items && data.items.length > 0) {
          results.push({
            shopName: shop.name,
            shopCid: shop.cid,
            shopLevel: shop.level,
            distance: Math.round(shop.distance),
            pos: { x: shop.x, y: shop.y },
            title: data.title || '',
            itemCount: data.items.length,
            items: data.items.map((it, idx) => {
              // Resolve item name from DB if Frida side returned empty/encoded name
              let itemName = it.name || '';
              if (!itemName || itemName.startsWith('G') && itemName.includes('D') && itemName.includes('P')) {
                // Encoded fallback name like "G0D1P2L3" — try DB lookup
                if (it.genre !== undefined && it.detail !== undefined && it.particular !== undefined && it.level !== undefined) {
                  const dbName = lookupByGdpl(it.genre, it.detail, it.particular, it.level);
                  if (dbName) itemName = dbName;
                }
              }
              if (!itemName) itemName = '#' + (idx + 1);
              
              // Build magic attribute descriptions (id,value pairs)
              let magicDescs = [];
              if (it.magics && it.magics.length > 0) {
                for (let m = 0; m + 1 < it.magics.length; m += 2) {
                  const magicId = it.magics[m];
                  const magicVal = it.magics[m + 1];
                  if (magicId > 0) {
                    const info = getMagicInfo(magicId);
                    magicDescs.push({
                      id: magicId,
                      value: magicVal,
                      name: info.name,
                      desc: info.desc,
                      level: info.level
                    });
                  }
                }
              }
              
              return {
                name: itemName,
                genre: it.genre,
                genreName: getGenreName(it.genre),
                detail: it.detail,
                particular: it.particular,
                level: it.level,
                series: it.series,
                seriesName: getSeriesName(it.series),
                money: it.money || 0,
                knb: it.knb || 0,
                magics: magicDescs,
                magicsRaw: it.magics || []
              };
            })
          });
          scanned++;
          console.log(`  [Thành Công] [${scanned}/${shops.length}] ${shop.name}: ${data.items.length} items`);
        } else {
          failed++;
        }
      } catch (e) {
        failed++;
        console.log(`  [Cảnh Báo]  [${scanned + failed}/${shops.length}] ${shop.name}: ${e.message}`);
      }

      // Small delay between shops
      await new Promise(r => setTimeout(r, 200));
    }

    // Build export object
    const exportData = {
      timestamp: new Date().toISOString(),
      totalShops: shops.length,
      scannedShops: scanned,
      failedShops: failed,
      totalItems: results.reduce((sum, r) => sum + r.itemCount, 0),
      shops: results
    };

    // Save JSON with map name + timestamp
    const filename = buildFilename(mapId);
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const filePath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
    console.log(`\n[Radar] [Thành Công] Saved to ${filePath}`);
    console.log(`[Radar] Shops: ${scanned} scanned, ${failed} failed, ${exportData.totalItems} total items`);

    return exportData;
  } finally {
    await frida.disconnect();
  }
}

// Watch mode
async function watch(intervalSec) {
  console.log(`[Radar] Watch mode: scanning every ${intervalSec}s. Press Ctrl+C to stop.\n`);
  while (true) {
    try {
      await scanAllShops();
    } catch (e) {
      console.error(`[Radar] Scan error: ${e.message}`);
    }
    console.log(`\n[Radar] Next scan in ${intervalSec}s...\n`);
    await new Promise(r => setTimeout(r, intervalSec * 1000));
  }
}

// CLI entry
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--watch') {
    const interval = parseInt(args[1]) || 300;
    watch(interval).catch(err => { console.error('Fatal:', err); process.exit(1); });
  } else {
    scanAllShops().catch(err => { console.error('Fatal:', err); process.exit(1); });
  }
}

module.exports = { scanAllShops };
