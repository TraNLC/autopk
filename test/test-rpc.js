const { FridaSession } = require('../src/frida-session');
const config = require('../config');

async function main() {
    const session = new FridaSession(null, config.GAME_PACKAGE);
    try {
        await session.connect();
        await session.loadScript(require('path').join(config.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        
        console.log("Calling getNearNpcNames...");
        const res = await session.callRpc('getNearNpcNames');
        console.log("Result:", res);
    } catch(e) {
        console.error(e);
    } finally {
        session.disconnect();
    }
}
main();
