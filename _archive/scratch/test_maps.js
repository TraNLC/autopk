const { FridaSession } = require('../src/frida-session');
async function run() {
  const s = new FridaSession();
  await s.connect();
  const p = await s.session.createScript(`
    rpc.exports = {
      inspect: function() {
        var libc = Process.findModuleByName('libc.so');
        var fn_fopen = libc.findExportByName('fopen');
        var fn_fgets = libc.findExportByName('fgets');
        var fn_fclose = libc.findExportByName('fclose');
        var fopen = new NativeFunction(fn_fopen, 'pointer', ['pointer', 'pointer']);
        var fgets = new NativeFunction(fn_fgets, 'pointer', ['pointer', 'int', 'pointer']);
        var fclose = new NativeFunction(fn_fclose, 'int', ['pointer']);
        
        var fp = fopen(Memory.allocUtf8String('/proc/self/maps'), Memory.allocUtf8String('r'));
        if (fp.isNull()) return 'Failed to open maps';
        
        var lineBuf = Memory.alloc(1024);
        var matches = [];
        while (true) {
            var res = fgets(lineBuf, 1024, fp);
            if (res.isNull()) break;
            var line = lineBuf.readUtf8String();
            if (line.indexOf('metadata') !== -1 || line.indexOf('il2cpp') !== -1) {
                matches.push(line.trim());
            }
        }
        fclose(fp);
        return matches.join('\\n');
      }
    };
  `);
  await p.load();
  console.log("Matches:\n", await p.exports.inspect());
  process.exit(0);
}
run();
