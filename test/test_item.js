const { lookupByGdplInfo, loadItems } = require('../src/item-db');

loadItems();

console.log("\n--- Testing Detail 7, Genre 0, Particular 0, Level 8 ---");
console.log(lookupByGdplInfo(0, 7, 0, 8));

console.log("\n--- Testing Detail 1, Genre 0, Particular 0, Level 8 (Item_4464_1_0??) ---");
console.log(lookupByGdplInfo(0, 1, 0, 8));

console.log("\n--- Testing Detail 3, Genre 0, Particular 0, Level 9 ---");
console.log(lookupByGdplInfo(0, 3, 0, 9));
