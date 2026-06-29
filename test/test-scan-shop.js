// test/test-scan-shop.js -- Test scanning items of the nearest player shop
// Chay bang lenh: node test/test-scan-shop.js

const { FridaSession } = require('../src/frida-session');
const { lookupByGdpl, getGenreName, getSeriesName, getMagicInfo } = require('../src/item-db');
const config = require('../config');
const path = require('path');

async function main() {
  console.log('=======================================');
  console.log('  TEST SCAN NEAREST SHOP ITEMS');
  console.log('=======================================\n');

  const frida = new FridaSession(null, config.GAME_PACKAGE);
  
  frida.onMessage((payload) => {
    const prefix = payload.type === 'error' ? '❌' : payload.type === 'warn' ? '⚠️' : '💬';
    console.log(`[Frida Script] ${prefix} [${payload.type}] ${payload.msg || payload.event || JSON.stringify(payload)}`);
  });
  
  try {
    console.log('Connecting to device...');
    await frida.connect();
    console.log('✅ Connected successfully!\n');

    console.log('Loading bot.bundle.js...');
    const bundlePath = path.join(__dirname, '..', 'frida-scripts', 'bot.bundle.js');
    await frida.loadScript(bundlePath);
    console.log('✅ Script loaded successfully!\n');

    console.log('Waiting 1.5s for IL2CPP initialization...');
    await new Promise(r => setTimeout(r, 1500));

    console.log('Querying nearby player shops...');
    const shopsRes = await frida.callRpc('getNearbyShops');
    if (!shopsRes.ok) {
      console.error('❌ Failed to get nearby shops:', shopsRes.error);
      await frida.disconnect();
      return;
    }

    const shops = shopsRes.shops || [];
    console.log(`✅ Found ${shops.length} player shops nearby. Details of first 5:`);
    shops.slice(0, 5).forEach((sh, i) => {
      console.log(`  [Shop #${i+1}] Name: "${sh.name}" | CID: ${sh.cid} | Dist: ${sh.distance.toFixed(1)} | Pos: (${sh.x}, ${sh.y})`);
    });
    if (shops.length === 0) {
      console.log('⚠️ No shops nearby to test! Make sure you are standing near player stalls.');
      await frida.disconnect();
      return;
    }

    // Pick the first shop
    const targetShop = shops[0];
    console.log(`\n=======================================`);
    console.log(`Target Shop: "${targetShop.name}"`);
    console.log(`CID: ${targetShop.cid}`);
    console.log(`Level: ${targetShop.level}`);
    console.log(`=======================================\n`);

    const parts = targetShop.cid.split('.');
    const stallIndex = parts[1];
    if (!stallIndex) {
      console.error('❌ Invalid stall index from CID:', targetShop.cid);
      await frida.disconnect();
      return;
    }

    console.log(`Querying items inside shop (Stall Index: ${stallIndex})...`);
    const itemsRes = await frida.callRpc('getShopItems', stallIndex);
    
    if (!itemsRes.ok) {
      console.error('❌ Failed to query shop items:', itemsRes.error);
    } else {
      console.log(`✅ Successfully queried shop!`);
      console.log(`Shop Title: "${itemsRes.title}"`);
      const items = itemsRes.items || [];
      console.log(`Items count: ${items.length}\n`);

      items.forEach((item, idx) => {
        let priceText = 'Mien phi';
        if (item.money > 0) {
          priceText = `${item.money.toLocaleString()} luong`;
        } else if (item.knb > 0) {
          priceText = `${item.knb.toLocaleString()} KNB`;
        }

        // Resolve item name from DB if needed
        let itemName = item.name || '';
        if (!itemName || (itemName.startsWith('G') && itemName.includes('D'))) {
          const dbName = lookupByGdpl(item.genre, item.detail, item.particular, item.level);
          if (dbName) itemName = dbName;
        }
        if (!itemName) itemName = '#' + (idx + 1);

        console.log(`[Item #${idx + 1}]`);
        console.log(`  Name: ${itemName}`);
        console.log(`  Price: ${priceText}`);
        console.log(`  Genre: ${item.genre} (${getGenreName(item.genre)}) | Detail: ${item.detail} | Particular: ${item.particular} | Level: ${item.level}`);
        console.log(`  Series: ${item.series} (${getSeriesName(item.series)})`);
        
        // Print Magics/Options with name lookup
        if (item.magics && item.magics.length > 0) {
          console.log(`  Attributes (${Math.floor(item.magics.length / 2)}):`);
          for (let m = 0; m + 1 < item.magics.length; m += 2) {
            const magicId = item.magics[m];
            const magicVal = item.magics[m + 1];
            if (magicId > 0) {
              const info = getMagicInfo(magicId);
              console.log(`    - [ID ${magicId}] ${info.name} +${magicVal} | ${info.desc} (Lv.${info.level})`);
            }
          }
          // Handle odd count (unpaired IDs)
          if (item.magics.length % 2 !== 0) {
            const lastId = item.magics[item.magics.length - 1];
            const info = getMagicInfo(lastId);
            console.log(`    - [ID ${lastId}] ${info.name} (no value) | ${info.desc}`);
          }
        } else {
          console.log(`  Attributes: None`);
        }
        console.log('---------------------------------------');
      });
    }

  } catch (err) {
    console.error('❌ Error during execution:', err.stack || err.message);
  } finally {
    console.log('Disconnecting...');
    await frida.disconnect();
    console.log('Done.');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
});
