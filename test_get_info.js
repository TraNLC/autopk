const { FridaSession } = require('./src/frida-session');
async function run() {
    const session = new FridaSession('127.0.0.1:5555');
    await session.connect('vn.perfingame.jx1mobile');
    await session.loadScript('frida-scripts/bot.bundle.js');
    console.log("Waiting 3s for game memory to settle...");
    await new Promise(r => setTimeout(r, 3000));
    const info = await session.callRpc('getPlayerInfo');
    console.log("Player Info: ", JSON.stringify(info, null, 2));
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
