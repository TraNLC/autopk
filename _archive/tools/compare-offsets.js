// tools/compare-offsets.js — So sánh hardcoded offsets vs dump
const fs = require('fs');
const path = require('path');

const DUMP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'output', 'dump_fields.json'), 'utf-8'));

// Hardcoded offsets từ Frida scripts hiện tại
const HARDCODED = {
    // Từ frida-scripts/rpc/core/PlayerManager.js
    'PlayerMain.npcontroller': '0x8',
    'Controller.position': '0x10',
    'Controller.stateSettings': '0x18',
    'NpcController.identify': '0x28',
    'Identify.camp': '0x50',
    'Identify.series': '0x54',
    'Identify.hp': '0x58',
    'Identify.maxHp': '0x5C',
    'Identify.name': '0x48',
    'Position.mapPos': '0x28',
    'MapPos.x': '0x10',
    'MapPos.y': '0x14',

    // Từ frida-scripts/rpc/ui-control.js
    'closeNpcDialog': '0xE458F4',
    'closeNpcShop': '0xE4535C',
    'closeBagarate': '0xE45104',
    'closeStorageBox': '0xE44B8C',

    // Từ frida-scripts/rpc/core/PlayerManager.js (native functions)
    'getNameFn': '0xFB9004',
    'getNameFn2': '0xF8AF5C',
    'requestUseItemFn': '0xE4CEFC',
};

console.log('🔬 Comparing hardcoded offsets vs dump:\n');

let matched = 0, mismatched = 0, notFound = 0;

// Tìm field trong dump theo class.field
function findField(className, fieldName) {
    const fields = DUMP[className];
    if (!fields) return null;
    return fields.find(f => f.name === fieldName);
}

// So sánh
for (const [key, hardcoded] of Object.entries(HARDCODED)) {
    if (key.includes('.')) {
        const [cls, field] = key.split('.');
        const dumpField = findField(cls, field);
        
        if (dumpField) {
            const dumpOff = dumpField.offset.toLowerCase();
            const hardOff = hardcoded.toLowerCase();
            if (dumpOff === hardOff) {
                console.log(`  ✅ ${key}: ${hardcoded} (match)`);
                matched++;
            } else {
                console.log(`  ❌ ${key}: code=${hardcoded} dump=${dumpField.offset} (MISMATCH!)`);
                mismatched++;
            }
        } else {
            console.log(`  ⚠️  ${key}: not found in dump`);
            notFound++;
        }
    } else {
        // Method RVA - need dump_methods.json
        console.log(`  🔧 ${key}: ${hardcoded} (method - check dump_methods.json)`);
        notFound++;
    }
}

console.log(`\n📊 Matched: ${matched} | Mismatched: ${mismatched} | Not found: ${notFound}`);

// Bonus: show key fields from dump
console.log('\n📋 Key fields from dump:');
const showClass = (name) => {
    const fields = DUMP[name];
    if (!fields) { console.log(`  ${name}: NOT IN DUMP`); return; }
    console.log(`  ${name} (${fields.length} fields):`);
    for (const f of fields) console.log(`    ${f.offset} : ${f.type} ${f.name}`);
};

showClass('PlayerMain');
showClass('PlayerController');
showClass('NpcController');
showClass('Identify');
showClass('Item');
