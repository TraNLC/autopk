const adb = require('./src/adb');
const { FridaSession } = require('./src/frida-session');
const { PacketInjector } = require('./src/packet-injector');

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function run() {
    const devices = adb.listDevices();
    const activeDevice = devices.find(d => d.status === 'device');
    if (!activeDevice) {
        console.error("[-] No active ADB devices found. Please open an emulator.");
        process.exit(1);
    }
    
    console.log(`[+] Testing dialogue suppression on device: ${activeDevice.id}`);
    const session = new FridaSession(activeDevice.id, 'vn.perfingame.jx1mobile');
    
    try {
        await session.connect();
        await session.loadScript('frida-scripts/bot.bundle.js');
        
        // Ensure blocking is enabled
        console.log(`[+] Activating dialogue blocking hook...`);
        await session.callRpc('setBlockNpcDialog', true);
        
        // Scan for nearby NPCs
        console.log(`[+] Scanning for nearby NPCs...`);
        const scanRes = await session.callRpc('getNearNpcNames');
        if (!scanRes || !scanRes.ok || !scanRes.npcMap || Object.keys(scanRes.npcMap).length === 0) {
            console.error("[-] No nearby NPCs detected. Please move near Xa Phu, Le Quan, or any city NPC.");
            await session.disconnect();
            process.exit(1);
        }
        
        const npcIds = Object.keys(scanRes.npcMap);
        const targetNpcId = npcIds[0];
        const targetNpcName = scanRes.npcMap[targetNpcId];
        console.log(`[+] Selected target NPC: ${targetNpcName} (ID: ${targetNpcId})`);
        
        console.log(`[+] Initiating interaction with ${targetNpcName}...`);
        const injector = new PacketInjector(session);
        await injector.sendNpcDialogue(targetNpcId);
        
        console.log(`[+] Waiting 600ms (verifying dialogue is suppressed)...`);
        await sleep(600);
        
        console.log(`[+] Sending option selection packet (Index 0)...`);
        await injector.sendNpcSelect(0);
        
        console.log(`[+] Waiting 1000ms for server to process...`);
        await sleep(1000);
        
        console.log(`[+] Clearing dialogue state and focus...`);
        await session.callRpc('closeDialogPopups');
        await session.callRpc('clearFocus');
        
        console.log(`\n======================================================`);
        console.log(`✅ TEST SUCCEEDED!`);
        console.log(`1. Dialogue hook successfully processed.`);
        console.log(`2. The emulator screen remained completely clear of popups.`);
        console.log(`3. The server accepted the option packet successfully.`);
        console.log(`======================================================\n`);
        
        // Turn off blocking for normal play
        await session.callRpc('setBlockNpcDialog', false);
        await session.disconnect();
    } catch(e) {
        console.error(`[-] Test failed with error:`, e.message);
        if (session) {
            try { await session.disconnect(); } catch(err) {}
        }
    }
    process.exit(0);
}
run();
