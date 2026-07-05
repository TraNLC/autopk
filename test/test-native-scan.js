const { FridaSession } = require('../src/frida-session');
const config = require('../config');

async function main() {
    const session = new FridaSession(null, config.GAME_PACKAGE);
    await session.connect();
    
    const source = `
        var il2cppBase = null;

        function getIl2CppBase() {
            var lines = File.readAllText('/proc/self/maps').split('\\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (line.indexOf('libil2cpp.so') !== -1 && line.indexOf('r--p') !== -1) {
                    var parts = line.trim().split(/\\s+/);
                    return ptr('0x' + parts[0].split('-')[0]);
                }
            }
            return null;
        }

        function findElfExport(base, targetName) {
            if (!base || base.isNull()) return ptr(0);
            try {
                var exp = Module.findExportByName(null, targetName);
                if (exp && !exp.isNull()) return exp;
            } catch(e) {}
            
            var magic = base.readByteArray(4);
            var u8 = new Uint8Array(magic);
            if (u8[0] !== 0x7f || u8[1] !== 0x45 || u8[2] !== 0x4c || u8[3] !== 0x46) return ptr(0);
            
            var elfClass = base.add(4).readU8();
            var is64 = (elfClass === 2);
            var e_phoff = is64 ? base.add(32).readU64().toNumber() : base.add(28).readU32().toNumber();
            var e_phentsize = is64 ? base.add(54).readU16() : base.add(42).readU16();
            var e_phnum = is64 ? base.add(56).readU16() : base.add(44).readU16();
            
            var dynAddr = null;
            var dynSize = 0;
            for (var i = 0; i < e_phnum; i++) {
                var phdrAddr = base.add(e_phoff + i * e_phentsize);
                var p_type = phdrAddr.readU32();
                if (p_type === 2) {
                    var p_vaddr = is64 ? phdrAddr.add(16).readU64().toNumber() : phdrAddr.add(8).readU32().toNumber();
                    var p_memsz = is64 ? phdrAddr.add(40).readU64().toNumber() : phdrAddr.add(20).readU32().toNumber();
                    dynAddr = base.add(p_vaddr);
                    dynSize = p_memsz;
                    break;
                }
            }
            if (!dynAddr) return ptr(0);
            
            var symtab = null;
            var strtab = null;
            var offset = 0;
            var dynEntrySize = is64 ? 16 : 8;
            while (offset < dynSize) {
                var entryAddr = dynAddr.add(offset);
                var d_tag = is64 ? entryAddr.readS64().toNumber() : entryAddr.readS32();
                var d_val = is64 ? entryAddr.add(8).readPointer() : entryAddr.add(4).readPointer();
                if (d_tag === 0) break;
                if (d_tag === 6) symtab = d_val;
                if (d_tag === 5) strtab = d_val;
                offset += dynEntrySize;
            }
            if (!symtab || !strtab) return ptr(0);
            if (parseInt(symtab.toString()) < parseInt(base.toString())) symtab = base.add(symtab);
            if (parseInt(strtab.toString()) < parseInt(base.toString())) strtab = base.add(strtab);

            var idx = 0;
            var symEntrySize = is64 ? 24 : 16;
            while (idx < 50000) {
                try {
                    var symAddr = symtab.add(idx * symEntrySize);
                    var st_name = symAddr.readU32();
                    var st_value = is64 ? symAddr.add(8).readU64() : symAddr.add(4).readU32();
                    if (st_name === 0 && st_value.toString() === '0' && idx > 0) break;
                    
                    var nameAddr = strtab.add(st_name);
                    var name = nameAddr.readUtf8String();
                    if (name === targetName) {
                        return base.add(ptr(st_value.toString()));
                    }
                } catch(e) { break; }
                idx++;
            }
            return ptr(0);
        }

        function callNativeIl2Cpp(exportName, retType, argTypes, args) {
            var exp = findElfExport(il2cppBase, exportName);
            if (!exp || exp.isNull()) return null;
            var fn = new NativeFunction(exp, retType, argTypes);
            return fn.apply(null, args);
        }

        setTimeout(function() {
            try {
                il2cppBase = getIl2CppBase();
                send("il2cppBase: " + il2cppBase);
                if (!il2cppBase) { send("DONE"); return; }
                
                var domain = callNativeIl2Cpp('il2cpp_domain_get', 'pointer', [], []);
                var assembly = callNativeIl2Cpp('il2cpp_domain_assembly_open', 'pointer', ['pointer', 'pointer'], [domain, Memory.allocUtf8String("Assembly-CSharp")]);
                var image = callNativeIl2Cpp('il2cpp_assembly_get_image', 'pointer', ['pointer'], [assembly]);
                var klass = callNativeIl2Cpp('il2cpp_class_from_name', 'pointer', ['pointer', 'pointer', 'pointer'], [image, Memory.allocUtf8String(""), Memory.allocUtf8String("PlayerMain")]);
                
                send("PlayerMain klass: " + klass);
                
                var field = callNativeIl2Cpp('il2cpp_class_get_field_from_name', 'pointer', ['pointer', 'pointer'], [klass, Memory.allocUtf8String("nearNpcs")]);
                send("nearNpcs field: " + field);
                
                if (field && !field.isNull()) {
                    var offset = callNativeIl2Cpp('il2cpp_field_get_offset', 'int32', ['pointer'], [field]);
                    send("nearNpcs offset: " + offset.toString(16));
                }
                
                send("DONE");
            } catch(e) {
                send("ERROR: " + e.message);
                send("DONE");
            }
        }, 1000);
    `;
    const script = await session.session.createScript(source);
    script.message.connect((msg) => {
        if (msg.type === 'send') {
            console.log(msg.payload);
            if (msg.payload === "DONE") {
                session.disconnect();
                process.exit(0);
            }
        }
    });
    await script.load();
}
main();
