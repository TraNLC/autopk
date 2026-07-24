const { FridaSession } = require('./src/frida-session');
const { scanDevices } = require('./src/gui/adb-helper');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);

async function main() {
  const adbPath = path.join(process.cwd(), 'tools', 'adb.exe'); 
  const device = { id: 'emulator-5554' };
  console.log('Đang kết nối tới:', device.id);
  const session = new FridaSession(device.id, 'vn.perfingame.jx1mobile');
  await session.connect();

  // Tạo script dùng Il2Cpp để lấy chính xác offset của trường 'items' trong PlayerMain
  const scriptContent = `
    rpc.exports.findItemsOffset = function() {
        return new Promise(function(resolve) {
            // Configure module name before perform
            var mod = Process.findModuleByName('libil2cpp.so') || Process.findModuleByName('libil4i3n.so');
            if (mod) {
                Il2Cpp.moduleName = mod.name;
            }

            Il2Cpp.perform(function() {
                try {
                    var pmClass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerMain");
                    var itemsField = pmClass.field("items");
                    var offset = itemsField.offset;
                    var pmInst = pmClass.field("instance").value;
                    
                    var itemsDict = pmInst.field("items").value;
                    
                    var keysCollection = itemsDict.method("get_Keys").invoke();
                    var enumerator = keysCollection.method("GetEnumerator").invoke();
                    var testItems = [];
                    var count = 0;
                    
                    while (enumerator.method("MoveNext").invoke() && count < 10) {
                        var key = enumerator.method("get_Current").invoke();
                        var valueOut = Memory.alloc(Process.pointerSize);
                        var success = itemsDict.method("TryGetValue").invoke(key, valueOut);
                        if (success) {
                            var itemPtr = valueOut.readPointer();
                            if (!itemPtr.isNull() && parseInt(itemPtr.toString()) > 0x10000) {
                                var location = itemPtr.add(0x60).readInt();
                                var particular = itemPtr.add(0x4C).readInt();
                                var genre = itemPtr.add(0x44).readInt();
                                var namePtr = new NativeFunction(Il2Cpp.module.base.add(0xF8AF5C), 'pointer', ['pointer'])(itemPtr);
                                var nameStr = !namePtr.isNull() ? namePtr.add(0x14).readUtf16String() : "Unknown";
                                testItems.push({key: parseInt(key.toString()), loc: location, p: particular, g: genre, name: nameStr});
                                count++;
                            }
                        }
                    }
                    
                    resolve({ ok: true, offset: offset.toString(16), testItems: testItems });
                } catch(e) {
                    resolve({ ok: false, error: e.message });
                }
            });
        });
    };
  `;

  // We STILL load bridge to find the instance, but let's change test-scan to use Il2Cpp properly.
  const bridgeSource = await fs.promises.readFile(path.join(process.cwd(), 'frida-scripts', 'il2cpp-bridge.bundle.js'), 'utf8');
  const fullScript = bridgeSource + '\n;\n' + scriptContent;

  
  const fridaScript = await session.session.createScript(fullScript);
  await fridaScript.load();
  
  console.log('Đang quét bộ nhớ bằng Il2Cpp...');
  const result = await fridaScript.exports.findItemsOffset();
  console.log('Kết quả scan:', JSON.stringify(result, null, 2));
  
  process.exit(0);
}

main().catch(console.error);
