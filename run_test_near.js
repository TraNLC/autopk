const { FridaSession } = require('./src/frida-session');
const fs = require('fs');
async function run() {
    const session = new FridaSession(null, 'vn.perfingame.jx1mobile');
    await session.connect();
    const source = fs.readFileSync('test_near.js', 'utf8');
    const radarScript = await session.session.createScript(source);
    radarScript.message.connect((msg) => {
        if (msg.type === 'send') {
            console.log(msg.payload);
            if (msg.payload === 'DONE' || msg.payload.includes('Error:')) {
                session.disconnect();
                process.exit(0);
            }
        } else {
            console.log(msg);
        }
    });
    await radarScript.load();
}
run();
