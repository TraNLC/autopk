// tools/decode-protocol.js — Extract opcode & message mappings from dump
const fs = require('fs');
const path = require('path');

const DUMP_DIR = path.join(__dirname, '..', 'data', 'dump');

// Đọc file protocol & handlers
const protoFile = path.join(DUMP_DIR, 'GameServer.Network.Protocol.cs');
const handlerFile = path.join(DUMP_DIR, 'NetCore.Handlers.GS.cs');

function extractEnums(content) {
    const enums = [];
    const lines = content.split('\n');
    let currentEnum = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const enumMatch = line.match(/public\s+enum\s+(\w+)/);
        if (enumMatch) {
            currentEnum = { name: enumMatch[1], values: [] };
            continue;
        }
        if (currentEnum) {
            const valMatch = line.match(/(\w+)\s*=\s*(\d+)/);
            if (valMatch) {
                currentEnum.values.push({ name: valMatch[1], value: parseInt(valMatch[2]) });
            }
            if (line === '}' && currentEnum.values.length > 0) {
                enums.push(currentEnum);
                currentEnum = null;
            }
        }
    }
    return enums;
}

function extractMethods(content) {
    const methods = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const rvaMatch = line.match(/RVA:\s*(0x[0-9A-Fa-f]+)/);
        if (rvaMatch) {
            // Look back for method signature
            for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
                const prevLine = lines[j].trim();
                const sigMatch = prevLine.match(/(\w+)\s*\(/);
                if (sigMatch && !prevLine.includes('//')) {
                    methods.push({ name: sigMatch[1], rva: rvaMatch[1], class: '' });
                    break;
                }
            }
        }
    }
    return methods;
}

console.log('🔍 Decoding protocol...\n');

// Parse protocol file
const protoContent = fs.readFileSync(protoFile, 'utf-8');
const enums = extractEnums(protoContent);

// Show key enums
for (const e of enums) {
    if (e.values.length > 3) {
        console.log(`📋 ${e.name} (${e.values.length} values):`);
        e.values.slice(0, 10).forEach(v => console.log(`   ${v.name} = ${v.value}`));
        if (e.values.length > 10) console.log(`   ... +${e.values.length - 10} more`);
        console.log();
    }
}

// Parse handler methods
const handlerContent = fs.readFileSync(handlerFile, 'utf-8');
const handlerLines = handlerContent.split('\n');
const handlerClasses = [];

let currentHandler = null;
for (const line of handlerLines) {
    const classMatch = line.match(/public\s+class\s+(\w+)\s*:/);
    if (classMatch && line.includes('GsMessageHandlers')) {
        if (currentHandler) handlerClasses.push(currentHandler);
        currentHandler = { name: classMatch[1], methods: [] };
    }
    if (currentHandler) {
        const rva = line.match(/RVA:\s*(0x[0-9A-Fa-f]+)/);
        if (rva) {
            currentHandler.methods.push(rva[1]);
        }
    }
}
if (currentHandler) handlerClasses.push(currentHandler);

console.log(`📡 GS Handlers: ${handlerClasses.length} classes`);
handlerClasses.forEach(h => {
    console.log(`   ${h.name}: ${h.methods.length} methods`);
});

const totalHandlerMethods = handlerClasses.reduce((s, h) => s + h.methods.length, 0);
console.log(`\n📊 Total handler methods: ${totalHandlerMethods}`);
console.log(`   → Each method handles 1 opcode`);
console.log(`   → Potential opcode mapping: ${totalHandlerMethods} opcodes`);
