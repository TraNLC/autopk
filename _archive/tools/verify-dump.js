// tools/verify-dump.js — Verify dump offsets bằng cách đọc memory game
// So sánh offset từ dump với giá trị thực tế

const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');
const DUMP_FIELDS = require('../data/output/dump_fields.json');

// Các field cần verify (có thể nhìn thấy trong game)
const VERIFY_CLASSES = [
    { class: 'PlayerMain', fields: ['instance', 'level', 'name', 'mapId', 'money', 'hp', 'maxHp', 'mp', 'maxMp'] },
    { class: 'PlayerController', fields: ['identify', 'data'] },
    { class: 'NpcController', fields: ['identify'] },
];

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  🔬 DUMP VERIFIER — Verify field offsets');
    console.log('═══════════════════════════════════════════\n');

    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    
    try {
        await session.connect();
        await session.loadScript(require('path').join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        console.log('✅ Connected.\n');

        // Gửi RPC để Frida script verify
        const verifyPayload = { classes: {} };
        for (const cls of VERIFY_CLASSES) {
            if (DUMP_FIELDS[cls.class]) {
                verifyPayload.classes[cls.class] = DUMP_FIELDS[cls.class];
            }
        }

        // Dùng RPC custom để verify trên Frida side
        const injectedCode = `
            // Verify offsets bằng cách đọc memory
            var results = {};
            var verifyData = ${JSON.stringify(verifyPayload)};
            
            try {
                var pmRes = readPlayerMainDirect();
                if (pmRes.ok && _playerMainInstance) {
                    var pmPtr = _playerMainInstance;
                    results['PlayerMain'] = { pointer: pmPtr.toString() };
                    
                    // Đọc từng field
                    var pmFields = verifyData.classes['PlayerMain'] || [];
                    for (var i = 0; i < pmFields.length; i++) {
                        var f = pmFields[i];
                        try {
                            var off = parseInt(f.offset);
                            var val = pmPtr.add(off).readInt();
                            results['PlayerMain'][f.name] = { offset: f.offset, value: val, type: f.type };
                        } catch(e) {
                            results['PlayerMain'][f.name] = { offset: f.offset, error: e.message };
                        }
                    }
                }
                
                // Đọc PlayerController
                try {
                    var ctrlPtr = pmPtr.add(0x8).readPointer(); // Assuming npcontroller at +0x8
                    if (ctrlPtr && !ctrlPtr.isNull()) {
                        results['PlayerController'] = { pointer: ctrlPtr.toString() };
                        var ctrlFields = verifyData.classes['PlayerController'] || [];
                        for (var i = 0; i < ctrlFields.length; i++) {
                            var f = ctrlFields[i];
                            try {
                                var off = parseInt(f.offset);
                                var val = ctrlPtr.add(off).readPointer();
                                results['PlayerController'][f.name] = { offset: f.offset, value: val.toString(), type: f.type };
                            } catch(e) {
                                results['PlayerController'][f.name] = { offset: f.offset, error: e.message };
                            }
                        }
                    }
                } catch(e) {
                    results['PlayerController'] = { error: e.message };
                }
            } catch(e) {
                results.error = e.message;
            }
            
            send(JSON.stringify({ type: 'verify_result', data: results }));
        `;

        // Gửi code qua RPC
        const res = await session.callRpc('sendPacket', 0, ''); // dummy call to ensure script is ready
        
        // Dùng session._script để gửi code trực tiếp
        // Thay vào đó dùng onMessage
        let verifyResult = null;
        session.onMessage((payload) => {
            if (payload.type === 'verify_result') {
                verifyResult = payload.data || payload;
            }
        });

        // Inject code qua script.post
        await new Promise((resolve, reject) => {
            session.script.post({ type: 'eval', code: injectedCode });
            setTimeout(() => {
                if (verifyResult) {
                    console.log('📊 Verify results:');
                    console.log(JSON.stringify(verifyResult, null, 2));
                } else {
                    console.log('⚠️ No verify result received (script.post may not support eval)');
                    console.log('   Try running the GUI app and checking the log for field values.');
                }
                resolve();
            }, 2000);
        });

    } catch(e) {
        console.error(`❌ ${e.message}`);
    } finally {
        try { await session.disconnect(); } catch(e) {}
    }
}

main();
