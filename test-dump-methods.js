const { FridaSession } = require('./src/frida-session');
const { scanDevices } = require('./src/gui/adb-helper');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);

async function main() {
    const adbPath = path.join(process.cwd(), 'tools', 'adb.exe'); 
    const res = await scanDevices(adbPath, execAsync, console.log);
    if (!res.ok || res.devices.length === 0) return console.log('Không tìm thấy thiết bị');
    
    const device = res.devices[0];
    const session = new FridaSession(device.id, 'vn.perfingame.jx1mobile');
    if (!(await session.connect())) return console.log('Lỗi kết nối');
    
    // We will inject a pure JS script that uses il2cpp C API
    const scriptCode = `
        rpc.exports.dumpMethods = function() {
            var libName = 'libil2cpp.so';
            var libBase = Process.findModuleByName('libil2cpp.so') || Process.findModuleByName('libil4i3n.so');
            if (libBase) {
                libName = libBase.name;
            } else {
                var lines = File.readAllText('/proc/self/maps').split('\\n');
                for (var i = 0; i < lines.length; i++) {
                    if ((lines[i].indexOf('libil2cpp.so') !== -1 || lines[i].indexOf('libil4i3n.so') !== -1) && lines[i].indexOf('r-x') !== -1) {
                        libName = lines[i].indexOf('libil4i3n.so') !== -1 ? 'libil4i3n.so' : 'libil2cpp.so';
                        libBase = { base: ptr('0x' + lines[i].trim().split(/\\s+/)[0].split('-')[0]) };
                        break;
                    }
                }
                if (!libBase) {
                    for (var i = 0; i < lines.length; i++) {
                        if ((lines[i].indexOf('libil2cpp.so') !== -1 || lines[i].indexOf('libil4i3n.so') !== -1) && lines[i].indexOf('r--p') !== -1) {
                            libName = lines[i].indexOf('libil4i3n.so') !== -1 ? 'libil4i3n.so' : 'libil2cpp.so';
                            libBase = { base: ptr('0x' + lines[i].trim().split(/\\s+/)[0].split('-')[0]) };
                            break;
                        }
                    }
                }
            }
            if (!libBase) return 'No libil2cpp or libil4i3n';

            var domain_get = new NativeFunction(Module.findExportByName(libName, 'il2cpp_domain_get'), 'pointer', []);
            var assembly_open = new NativeFunction(Module.findExportByName(libName, 'il2cpp_domain_assembly_open'), 'pointer', ['pointer', 'pointer']);
            var get_image = new NativeFunction(Module.findExportByName(libName, 'il2cpp_assembly_get_image'), 'pointer', ['pointer']);
            var class_from_name = new NativeFunction(Module.findExportByName(libName, 'il2cpp_class_from_name'), 'pointer', ['pointer', 'pointer', 'pointer']);
            var class_get_methods = new NativeFunction(Module.findExportByName(libName, 'il2cpp_class_get_methods'), 'pointer', ['pointer', 'pointer']);
            var method_get_name = new NativeFunction(Module.findExportByName(libName, 'il2cpp_method_get_name'), 'pointer', ['pointer']);

            var domain = domain_get();
            var assembly = assembly_open(domain, Memory.allocUtf8String('Assembly-CSharp'));
            var image = get_image(assembly);
            var klass = class_from_name(image, Memory.allocUtf8String(''), Memory.allocUtf8String('PlayerMain'));
            
            var iter = Memory.alloc(4);
            iter.writeInt(0);
            var result = [];
            
            var method;
            while (!(method = class_get_methods(klass, iter)).isNull()) {
                var name = method_get_name(method).readUtf8String();
                var methodPtr = method.readPointer();
                var rva = methodPtr.sub(libBase.base);
                if (name.indexOf('Move') !== -1 || name.indexOf('Goto') !== -1 || name.indexOf('Teleport') !== -1) {
                    result.push(name + ' -> ' + methodPtr + ' (RVA: 0x' + rva.toString(16) + ')');
                }
            }
            return result;
        };
    `;
    const script = await session.session.createScript(scriptCode);
    await script.load();
    console.log('Dumping methods...');
    const result = await script.exports.dumpMethods();
    console.log(result);
    process.exit(0);
}
main();
