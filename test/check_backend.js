const { FridaSession } = require('./src/frida-session');
async function run() {
  const s = new FridaSession();
  await s.connect('127.0.0.1:62001');
  const p = await s.session.createScript(`
    rpc.exports = {
      check: function() {
        return Process.findModuleByName("libmono.so") !== null ? "Mono" : 
               Process.findModuleByName("libil2cpp.so") !== null ? "Il2Cpp" : "None";
      }
    };
  `);
  await p.load();
  console.log("Backend:", await p.exports.check());
  process.exit(0);
}
run();
