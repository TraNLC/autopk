const { FridaSession } = require('./src/frida-session');
const { scanDevices } = require('./src/gui/adb-helper');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);

async function main() {
  const adbPath = path.join(process.cwd(), 'tools', 'adb.exe');
  const res = await scanDevices(adbPath, execAsync, console.log);
  if (!res.ok || res.devices.length === 0) { console.log('No devices found'); return; }
  
  let deviceId = res.devices[0].id;
  for (let d of res.devices) {
      if (d.id.includes('emulator') && d.isGameRunning) deviceId = d.id;
  }
  
  console.log("Connecting to", deviceId);
  const session = new FridaSession(deviceId, 'vn.perfingame.jx1mobile');
  
  session.onMessage((payload, data) => {
      if (payload && payload.type === 'log') {
          console.log(payload.message);
      }
  });

  await session.connect();

  const scriptContent = `
    function getIl2CppBase() {
        var mod = Process.findModuleByName('libil2cpp.so') || Process.findModuleByName('libil4i3n.so');
        if (mod) return mod.base;
        var base = null;
        var lines = File.readAllText('/proc/self/maps').split('\\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r-x') !== -1) {
                var parts = line.trim().split(/\\s+/);
                base = ptr('0x' + parts[0].split('-')[0]);
                break;
            }
        }
        if (!base) {
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r--p') !== -1) {
                    var parts = line.trim().split(/\\s+/);
                    base = ptr('0x' + parts[0].split('-')[0]);
                    break;
                }
            }
        }
        return base;
    }
    
    var il2cppBase = getIl2CppBase();
    if (il2cppBase) {
        var rvasToHook = [
            0xFE4DCC, 0xFE4E00, 0xFE4E58, 0xFE4EB0, 
            0xE44FD4, 0xE47278,
            0xE4CEFC, 0xE4D000, 
            0xE93720, 0xE94714
        ];
        
        rvasToHook.forEach(function(rva) {
            try {
                Interceptor.attach(il2cppBase.add(rva), {
                    onEnter: function(args) {
                        send({ type: 'log', message: '[Hook IL2CPP] Gọi hàm tại RVA: ' + rva.toString(16) });
                    }
                });
            } catch(e) {}
        });
        console.log("[Sniffer] Hooked IL2CPP RVAs");
    }

    var libcModule = null;
    try { libcModule = Process.getModuleByName('libc.so'); } catch(e){}
    
    if (libcModule) {
        var sendPtr = libcModule.findExportByName('send');
        if (sendPtr) {
            Interceptor.attach(sendPtr, {
                onEnter: function(args) {
                    var len = args[2].toInt32();
                    if (len > 6) {
                        try {
                            var buf = args[1].readByteArray(Math.min(len, 64));
                            var data = new Uint8Array(buf);
                            if ((data[4] | (data[5] << 8)) === 140) { // game packet signature
                                var hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
                                send({ type: 'log', message: '[libc:send] Game Packet | len=' + len + ' | data: ' + hex });
                            }
                        } catch(e) {}
                    }
                }
            });
            console.log("[Sniffer] Hooked libc send!");
        }
        
        var writePtr = libcModule.findExportByName('write');
        if (writePtr) {
            Interceptor.attach(writePtr, {
                onEnter: function(args) {
                    var len = args[2].toInt32();
                    if (len > 10) {
                        try {
                            var buf = args[1].readByteArray(Math.min(len, 64));
                            var data = new Uint8Array(buf);
                            var hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
                            send({ type: 'log', message: '[libc:write] len=' + len + ' | data: ' + hex });
                        } catch(e) {}
                    }
                }
            });
            console.log("[Sniffer] Hooked libc write!");
        }
        
        var sendtoPtr = libcModule.findExportByName('sendto');
        if (sendtoPtr) {
            Interceptor.attach(sendtoPtr, {
                onEnter: function(args) {
                    var len = args[2].toInt32();
                    if (len > 0) {
                        try {
                            var buf = args[1].readByteArray(Math.min(len, 64));
                            var data = new Uint8Array(buf);
                            var hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
                            send({ type: 'log', message: '[libc:sendto] len=' + len + ' | data: ' + hex });
                        } catch(e) {}
                    }
                }
            });
            console.log("[Sniffer] Hooked libc sendto!");
        }
        
        var sendmsgPtr = libcModule.findExportByName('sendmsg');
        if (sendmsgPtr) {
            Interceptor.attach(sendmsgPtr, {
                onEnter: function(args) {
                    try {
                        // struct msghdr is args[1]. It contains iov array.
                        // For simplicity, just log that sendmsg was called
                        send({ type: 'log', message: '[libc:sendmsg] Called!' });
                    } catch(e) {}
                }
            });
            console.log("[Sniffer] Hooked libc sendmsg!");
        }
    }

    send({ type: 'log', message: 'Da hook toan bo! Vui long vao game click su dung vat pham nhe!' });
  `;
  const fs = require('fs');
  const tempFile = path.join(__dirname, 'sniff-bundle.js');
  fs.writeFileSync(tempFile, scriptContent);
  await session.loadScript(tempFile);
  console.log("Đã chạy script. Vui lòng vào game bấm sử dụng vật phẩm, log sẽ hiện ở đây (Bấm Ctrl+C để thoát)...");
}
main();
