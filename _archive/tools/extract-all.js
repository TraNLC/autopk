// tools/extract-all.js — Extract everything from dump into usable data files
const fs = require('fs');
const path = require('path');

const DUMP_DIR = path.join(__dirname, '..', 'data', 'dump');
const OUT_DIR = path.join(__dirname, '..', 'data', 'output');

// ─── Parse helpers ─────────────────────────────────────────────────
function parseAllFiles() {
    const files = fs.readdirSync(DUMP_DIR).filter(f => f.endsWith('.cs'));
    const allEnums = [];
    const allClasses = [];
    const allStaticFields = [];
    
    for (const file of files) {
        const content = fs.readFileSync(path.join(DUMP_DIR, file), 'utf-8');
        const lines = content.split('\n');
        
        let currentEnum = null;
        let currentClass = null;
        let namespace = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Namespace
            const nsMatch = line.match(/\/\/ Namespace:\s*(.+)/);
            if (nsMatch) namespace = nsMatch[1];
            
            // Enum
            const enumMatch = line.match(/public\s+enum\s+(\w+)/);
            if (enumMatch) {
                currentEnum = { name: enumMatch[1], namespace, file, values: [] };
                continue;
            }
            if (currentEnum) {
                const valMatch = line.match(/(\w+)\s*=\s*(-?\d+)/);
                const commentMatch = line.match(/\/\/\s*(.+)/);
                if (valMatch) {
                    currentEnum.values.push({ 
                        name: valMatch[1], 
                        value: parseInt(valMatch[2]),
                        comment: commentMatch ? commentMatch[1].trim() : ''
                    });
                }
                if (line === '}') {
                    if (currentEnum.values.length > 0) allEnums.push(currentEnum);
                    currentEnum = null;
                }
            }
            
            // Class
            const classMatch = line.match(/public\s+(?:static\s+)?(?:sealed\s+)?class\s+(\w+)/);
            if (classMatch && !line.includes('//')) {
                currentClass = { name: classMatch[1], namespace, file, fields: [], methods: [], isStatic: line.includes('static') };
                continue;
            }
            
            // Field
            if (currentClass) {
                const fieldMatch = line.match(/(?:public|private|protected|internal|static|readonly|\s)+(\S+(?:<[^>]+>)?)\s+(\w+);\s*\/\/\s*(0x[0-9a-fA-F]+)/);
                if (fieldMatch) {
                    currentClass.fields.push({
                        type: fieldMatch[1], name: fieldMatch[2], offset: fieldMatch[3],
                        isStatic: line.includes('static')
                    });
                    if (line.includes('static')) {
                        allStaticFields.push({
                            class: currentClass.name, namespace, file,
                            type: fieldMatch[1], name: fieldMatch[2], offset: fieldMatch[3]
                        });
                    }
                }
            }
            
            // Method RVA
            if (currentClass) {
                const methodMatch = line.match(/(?:public|private|protected|internal|static|\s)+(?:[\w.<>[\]]+\s+)?(\w+)\s*\([^)]*\)/);
                if (methodMatch && !line.includes('class ') && i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim();
                    const rvaMatch = nextLine.match(/RVA:\s*(0x[0-9A-Fa-f]+)/);
                    if (rvaMatch) {
                        currentClass.methods.push({ name: methodMatch[1], rva: rvaMatch[1] });
                    }
                }
            }
            
            // End of class
            if (currentClass && line === '}') {
                if (currentClass.fields.length > 0 || currentClass.methods.length > 0) {
                    allClasses.push(currentClass);
                }
                currentClass = null;
            }
        }
    }
    
    return { enums: allEnums, classes: allClasses, staticFields: allStaticFields };
}

// ─── Main ──────────────────────────────────────────────────────────
console.log('🔍 Extracting everything from dump...\n');

const { enums, classes, staticFields } = parseAllFiles();

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// 1. Save all enums
const keyEnums = enums.filter(e => e.values.length >= 3);
fs.writeFileSync(path.join(OUT_DIR, 'all_enums.json'), JSON.stringify(keyEnums, null, 2));
console.log(`✅ Enums: ${keyEnums.length} (${enums.length} total)`);

// 2. Show key enums
for (const e of keyEnums) {
    if (e.values.length > 5) {
        console.log(`   ${e.name}: ${e.values.length} values [${e.namespace}]`);
    }
}

// 3. Find opcode enum
const opcodeEnum = enums.find(e => e.name === 'Id' && e.values.length > 100);
if (opcodeEnum) {
    const opcodeMap = {};
    opcodeEnum.values.forEach(v => { opcodeMap[v.value] = v.name; });
    fs.writeFileSync(path.join(OUT_DIR, 'opcodes_from_dump.json'), JSON.stringify(opcodeMap, null, 2));
    console.log(`\n✅ Opcodes: ${opcodeEnum.values.length} mapped`);
    
    // Generate YAML for opcode_db
    let yaml = '# Auto-generated from il2cpp dump\n# ' + new Date().toISOString() + '\n\n';
    opcodeEnum.values.forEach(v => {
        yaml += `${v.value}: "${v.name}"  # ${v.comment || ''}\n`;
    });
    fs.writeFileSync(path.join(OUT_DIR, 'opcodes_dump.yaml'), yaml);
    console.log(`✅ Opcode YAML saved`);
    
    // Print first 30 for preview
    console.log('\n📋 Sample opcodes:');
    opcodeEnum.values.slice(0, 30).forEach(v => {
        console.log(`   ${v.value} = ${v.name}`);
    });
    console.log(`   ... +${opcodeEnum.values.length - 30} more`);
}

// 4. Handler class → opcode mapping
const handlerClasses = classes.filter(c => 
    c.file === 'NetCore.Handlers.GS.cs' || 
    c.name.includes('Package') || 
    c.name.includes('Process')
);
fs.writeFileSync(path.join(OUT_DIR, 'handlers.json'), JSON.stringify(handlerClasses, null, 2));
console.log(`\n✅ Handlers: ${handlerClasses.length} classes`);

// 5. Static singletons (useful for finding global instances)
const singletons = staticFields.filter(f => f.name === 'instance');
fs.writeFileSync(path.join(OUT_DIR, 'singletons.json'), JSON.stringify(singletons, null, 2));
console.log(`✅ Singletons: ${singletons.length} static instances found`);
singletons.slice(0, 15).forEach(s => {
    console.log(`   ${s.class}.${s.name} @ ${s.offset} (${s.namespace})`);
});

// 6. Game-specific classes summary
const gameClasses = classes.filter(c => 
    c.file.startsWith('game.') && c.fields.length > 0
);
fs.writeFileSync(path.join(OUT_DIR, 'game_classes.json'), JSON.stringify(gameClasses, null, 2));
console.log(`\n✅ Game classes: ${gameClasses.length} with fields`);
console.log(`   Total fields: ${gameClasses.reduce((s,c) => s + c.fields.length, 0)}`);

// 7. Comprehensive stats
const stats = {
    totalFiles: fs.readdirSync(DUMP_DIR).filter(f => f.endsWith('.cs')).length,
    totalEnums: enums.length,
    totalClasses: classes.length,
    totalFields: classes.reduce((s,c) => s + c.fields.length, 0),
    totalMethods: classes.reduce((s,c) => s + c.methods.length, 0),
    opcodes: opcodeEnum ? opcodeEnum.values.length : 0,
    singletons: singletons.length,
    handlers: handlerClasses.length,
    gameClasses: gameClasses.length
};
fs.writeFileSync(path.join(OUT_DIR, 'dump_stats.json'), JSON.stringify(stats, null, 2));

console.log('\n═══════════════════════════════════');
console.log('📊 EXTRACTION COMPLETE');
console.log('═══════════════════════════════════');
console.log(`   all_enums.json       — ${keyEnums.length} enums`);
console.log(`   opcodes_from_dump.json — ${opcodeEnum ? opcodeEnum.values.length : 0} opcodes`);
console.log(`   opcodes_dump.yaml    — YAML format`);
console.log(`   handlers.json        — ${handlerClasses.length} handler classes`);
console.log(`   singletons.json      — ${singletons.length} singletons`);
console.log(`   game_classes.json    — ${gameClasses.length} game classes`);
console.log(`   dump_stats.json      — Summary stats`);
