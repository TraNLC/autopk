const { FridaSession } = require('./src/frida-session');
const fs = require('fs');

async function run() {
  const session = new FridaSession();
  const ok = await session.connect('127.0.0.1:62001');
  
  if (!ok) {
    console.log("Not connected");
    return;
  }
  
  const source = fs.readFileSync('frida-scripts/dump_classes.bundle.js', 'utf8');
  const script = await session.session.createScript(source);
  await script.load();
  console.log(await script.exports.dumpClasses());
  process.exit(0);
}

run();
