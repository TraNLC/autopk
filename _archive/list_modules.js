const { FridaSession } = require('./src/frida-session');
async function run() {
  const s = new FridaSession();
  await s.connect();
  const p = await s.session.createScript(`
    rpc.exports = {
      list: function() {
        return Process.enumerateModules().map(m => m.name).filter(n => n.includes("lib")).join(", ");
      }
    };
  `);
  await p.load();
  console.log("Modules:", await p.exports.list());
  process.exit(0);
}
run();
