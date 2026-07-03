// tools/parse-dump.js — Parse il2cpp dump thành dữ liệu dùng được
// Output: data/output/dump_fields.json, data/output/dump_methods.json

const fs = require('fs');
const path = require('path');

const DUMP_DIR = path.join(__dirname, '..', 'data', 'dump');
const OUT_DIR = path.join(__dirname, '..', 'data', 'output');

const FOCUS_FILES = fs.readdirSync(DUMP_DIR).filter(f => f.endsWith('.cs') && !f.startsWith('_'));

function parseClassField(line) {
    // VD: public static PlayerMain instance; // 0x0
    // VD: public int level; // 0x10
    // VD: private string name; // 0x18
    const m = line.match(/(?:public|private|protected|internal|static|readonly|\s)+(\S+)\s+(\S+);\s*\/\/\s*(0x[0-9a-fA-F]+)/);
    if (m) return { type: m[1], name: m[2], offset: m[3] };
    return null;
}

function parseMethod(line) {
    // VD: // RVA: 0xFE82C0 Offset: 0xFE42C0 VA: 0xFE82C0
    const m = line.match(/\/\/\s*RVA:\s*(0x[0-9a-fA-F]+)\s+Offset:\s*(0x[0-9a-fA-F]+)/);
    if (m) return { rva: m[1], offset: m[2] };
    return null;
}

function parseFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const classes = [];
    let currentClass = null;
    let currentMethod = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Class declaration
        const classMatch = line.match(/public\s+(?:static\s+)?class\s+(\S+)\s*(?::|{|\/\/)/);
        if (classMatch) {
            if (currentClass) classes.push(currentClass);
            currentClass = { name: classMatch[1], fields: [], methods: [], typedef: null };
            continue;
        }

        // TypeDefIndex
        const tdMatch = line.match(/TypeDefIndex:\s*(\d+)/);
        if (tdMatch && currentClass) {
            currentClass.typedef = parseInt(tdMatch[1]);
        }

        // Field
        if (currentClass) {
            const field = parseClassField(line);
            if (field) {
                currentClass.fields.push(field);
                continue;
            }
        }

        // Method signature
        if (currentClass) {
            const methodMatch = line.match(/(?:public|private|protected|internal|static|\s)+(?:[\w.<>[\]]+\s+)?(\w+)\s*\([^)]*\)\s*(?:{|;)/);
            if (methodMatch && !line.includes('class ') && !line.includes('//')) {
                currentMethod = { name: methodMatch[1], signature: line };
                continue;
            }
        }

        // Method RVA
        if (currentMethod) {
            const rva = parseMethod(line);
            if (rva) {
                currentMethod.rva = rva.rva;
                currentMethod.offset = rva.offset;
                if (currentClass) currentClass.methods.push(currentMethod);
                currentMethod = null;
                continue;
            }
        }
    }
    if (currentClass) classes.push(currentClass);
    return classes;
}

// ─── Main ──────────────────────────────────────────────────────
console.log('🔍 Parsing il2cpp dump...\n');

const allFields = {};
const allMethods = {};
const allConstants = {};

for (const file of FOCUS_FILES) {
    const filePath = path.join(DUMP_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    const classes = parseFile(filePath);
    for (const cls of classes) {
        const key = cls.name;
        if (cls.fields.length > 0) {
            allFields[key] = cls.fields.map(f => ({ name: f.name, type: f.type, offset: f.offset }));
        }
        if (cls.methods.length > 0) {
            allMethods[key] = cls.methods.map(m => ({ name: m.name, rva: m.rva, offset: m.offset }));
        }
    }
    console.log(`  ${file}: ${classes.length} classes (${classes.reduce((s,c) => s + c.fields.length, 0)} fields, ${classes.reduce((s,c) => s + c.methods.length, 0)} methods)`);
}

// Save
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'dump_fields.json'), JSON.stringify(allFields, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'dump_methods.json'), JSON.stringify(allMethods, null, 2));

const totalFields = Object.values(allFields).reduce((s, f) => s + f.length, 0);
const totalMethods = Object.values(allMethods).reduce((s, m) => s + m.length, 0);

console.log(`\n✅ Done! ${totalFields} fields, ${totalMethods} methods across ${Object.keys(allFields).length} classes`);
console.log(`   → data/output/dump_fields.json`);
console.log(`   → data/output/dump_methods.json`);

// Highlight key classes
const KEY = ['PlayerMain', 'PlayerController', 'NpcController', 'Identify', 'Item', 'Skill', 'MapInfo', 'NetCoreManager'];
console.log('\n🔑 Key classes found:');
for (const k of KEY) {
    console.log(`   ${allFields[k] ? '✅' : '❌'} ${k}: ${allFields[k] ? allFields[k].length + ' fields' : 'NOT FOUND'}`);
}
