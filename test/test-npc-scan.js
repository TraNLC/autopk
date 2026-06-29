const { FridaSession } = require('../src/frida-session');

async function run() {
    const session = new FridaSession('emulator-5554');
    try {
        console.log("Connecting to VLTK1 Mobile...");
        await session.connect('vn.perfingame.jx1mobile');

        console.log("Injecting memory scanner to bypass il2cpp-bridge...");

        const scriptStr = `
            try {
                // Get il2cpp base address
                var il2cppBase = Module.findBaseAddress('libil2cpp.so');
                if (!il2cppBase) {
                    send({ type: 'error', msg: 'libil2cpp.so not found!' });
                } else {
                    send({ type: 'log', msg: 'libil2cpp.so found at ' + il2cppBase });
                    
                    // Hook into World.Update (0x2DED670) to grab playerMain Instance safely
                    var worldUpdateAddr = il2cppBase.add(0x2DED670);
                    send({ type: 'log', msg: 'Hooking World.Update at ' + worldUpdateAddr });
                    
                    var _playerMain = null;
                    var _nearNpcs = null;

                    Interceptor.attach(worldUpdateAddr, {
                        onEnter: function(args) {
                            try {
                                var worldPtr = args[0];
                                if (worldPtr.isNull()) return;
                                
                                // PlayerMain is at World + 0x40
                                var playerMainPtr = worldPtr.add(0x40).readPointer();
                                if (!playerMainPtr.isNull() && (_playerMain === null || _playerMain.toString() !== playerMainPtr.toString())) {
                                    _playerMain = playerMainPtr;
                                    send({ type: 'success', msg: 'PlayerMain captured: ' + _playerMain });
                                    
                                    // Try reading nearNpcs which is usually an offset in PlayerMain
                                    // We will scan the first 0x200 bytes of PlayerMain looking for a C# Dictionary
                                    // C# Dictionary usually has a specific structure: count at offset 0x20, entries at 0x18
                                    // But to be safe, we just log we found the player first.
                                }
                            } catch(e) {}
                        }
                    });
                }
            } catch(e) {
                send({ type: 'error', msg: e.message });
            }
        `;

        const script = await session.session.createScript(scriptStr);
        script.message.connect(message => {
            if (message.type === 'send') {
                const payload = message.payload;
                if (payload.type === 'success') {
                    console.log("[+] " + payload.msg);
                } else if (payload.type === 'error') {
                    console.error("[-] " + payload.msg);
                } else {
                    console.log("[i] " + payload.msg);
                }
            } else {
                console.dir(message);
            }
        });

        await script.load();
        console.log("Scanner script loaded successfully. Please move around in the game to trigger World.Update...");

        // Keep process alive
        await new Promise(r => setTimeout(r, 60000));

    } catch (err) {
        console.error("Test failed: ", err);
    }
}

run();
