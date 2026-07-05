const { FridaSession } = require('./src/frida-session');

async function run() {
  const session = new FridaSession();
  const ok = await session.connect('127.0.0.1:62001'); // Assuming 127.0.0.1:62001 based on logs or emulator-5554
  
  if (!ok) {
    console.log("Not connected");
    return;
  }
  
  const script = await session.session.createScript(`
    rpc.exports = {
      dump: function() {
        if (typeof Il2Cpp !== 'undefined') {
          return new Promise(resolve => {
            Il2Cpp.perform(function() {
              try {
                var klass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerDie");
                if (klass) {
                  var methods = klass.methods.map(function(m) { return m.name; });
                  resolve("PlayerDie methods: " + methods.join(", "));
                } else {
                  resolve("PlayerDie not found");
                }
              } catch(e) {
                resolve("Error: " + e.message);
              }
            });
          });
        }
        return "Il2Cpp not found";
      }
    };
  `);
  
  await script.load();
  console.log(await script.exports.dump());
  process.exit(0);
}

run();
