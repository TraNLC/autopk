// tools/test-debug-npc.js — Debug NpcManager.npcs dictionary trực tiếp
const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    try {
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Connected\n');

        // Inject debug script
        const debugSrc = `
rpc.exports.debugNpcManager = function() {
    var r = { steps: [] };
    try {
        // Step 1: CharManager
        if (typeof _charManagerClass === 'undefined' || !_charManagerClass || _charManagerClass.isNull()) {
            return { error: 'no _charManagerClass — call getNearbyShops first' };
        }
        var cm = _charManagerClass;
        r.cmClass = cm.toString();
        
        var staticFields = cm.add(0xB8).readPointer();
        r.staticFields = staticFields.toString();
        
        var cmInst = staticFields.readPointer();
        r.cmInst = cmInst.toString();
        if (cmInst.isNull()) return { error: 'cmInst null', steps: r.steps };
        
        // Step 2: World
        var world = cmInst.add(0x20).readPointer();
        r.world = world.toString();
        if (world.isNull()) return { error: 'world null @0x20', steps: r.steps };
        
        // Step 3: NpcManager
        var npcMgr = world.add(0x28).readPointer();
        r.npcMgr = npcMgr.toString();
        if (npcMgr.isNull()) return { error: 'npcMgr null @0x28', steps: r.steps };
        
        // Dump NpcManager first 0x40 bytes
        r.npcMgrDump = [];
        for (var i = 0; i < 0x40; i += 8) {
            try {
                var v = npcMgr.add(i).readPointer();
                r.npcMgrDump.push({ off: '0x'+i.toString(16), ptr: v.toString() });
            } catch(e) {
                r.npcMgrDump.push({ off: '0x'+i.toString(16), err: e.message });
            }
        }
        
        // Step 4: npcs dict @0x30
        var npcsDict = npcMgr.add(0x30).readPointer();
        r.npcsDict = npcsDict.toString();
        if (npcsDict.isNull()) return { error: 'npcsDict null', steps: r.steps };
        
        // Dump dict header
        r.dictHeader = [];
        for (var j = 0; j < 0x30; j += 4) {
            try {
                r.dictHeader.push({ off: '0x'+j.toString(16), val: npcsDict.add(j).readU32().toString(16) });
            } catch(e) {}
        }
        
        // Try different entry layouts
        // Layout A: entries@+0x18, count@+0x20
        try {
            var entriesA = npcsDict.add(0x18).readPointer();
            var countA = npcsDict.add(0x20).readU32();
            r.layoutA = { entries: entriesA.toString(), count: countA };
            
            if (countA > 0 && countA < 1000) {
                r.samplesA = [];
                for (var a = 0; a < Math.min(countA, 3); a++) {
                    var e = entriesA.add(a * 24);
                    var key = e.readPointer();
                    var val = e.add(8).readPointer();
                    var kstr = '';
                    try {
                        var kl = key.add(0x10).readU32();
                        if (kl > 0 && kl < 64) kstr = key.add(0x14).readUtf16String(kl);
                    } catch(e2) {}
                    r.samplesA.push({ idx: a, keyPtr: key.toString(), valPtr: val.toString(), key: kstr });
                }
            }
        } catch(e) {}
        
        // Layout B: entries@+0x8, count@+0x18  
        try {
            var entriesB = npcsDict.add(0x8).readPointer();
            var countB = npcsDict.add(0x18).readU32();
            r.layoutB = { entries: entriesB.toString(), count: countB };
        } catch(e) {}
        
        // Layout C: IL2CPP Dictionary (different internal layout)
        try {
            // In some Unity versions: +0x10 = count, +0x18 = entries
            var countC = npcsDict.add(0x10).readU32();
            var entriesC = npcsDict.add(0x18).readPointer();
            r.layoutC = { entries: entriesC.toString(), count: countC };
            if (countC > 0 && countC < 1000) {
                r.samplesC = [];
                for (var c = 0; c < Math.min(countC, 3); c++) {
                    var ec = entriesC.add(c * 24);
                    var kc = ec.readPointer();
                    var vc = ec.add(8).readPointer();
                    var kcs = '';
                    try {
                        var kcl = kc.add(0x10).readU32();
                        if (kcl > 0 && kcl < 64) kcs = kc.add(0x14).readUtf16String(kcl);
                    } catch(e2) {}
                    r.samplesC.push({ idx: c, keyPtr: kc.toString(), valPtr: vc.toString(), key: kcs });
                }
            }
        } catch(e) {}
        
        r.ok = true;
    } catch(e) {
        r.error = e.message;
    }
    return r;
};
`;
        const scr = await session.session.createScript(debugSrc);
        await scr.load();
        
        // First call getNearbyShops to init CharManager
        console.log('📡 getNearbyShops (init CharManager)...');
        const shopRes = await session.callRpc('getNearbyShops');
        console.log('Shops:', shopRes && shopRes.ok !== undefined ? (shopRes.ok ? (shopRes.shops ? shopRes.shops.length : '?') : shopRes.error) : 'no result');
        
        // Now debug NpcManager
        console.log('\n📡 debugNpcManager...');
        const debug = await scr.exports.debugNpcManager();
        console.log(JSON.stringify(debug, null, 2));
        
    } catch(e) {
        console.error('Error:', e.message);
    } finally {
        await session.disconnect().catch(() => {});
        console.log('\n👋 Done');
        process.exit(0);
    }
}
main();
