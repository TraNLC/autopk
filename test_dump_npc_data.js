const { FridaSession } = require('./src/frida-session');
async function run() {
    const session = new FridaSession(null, 'vn.perfingame.jx1mobile');
    await session.connect();
    const source = \
        setTimeout(function() {
            var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
            // "Kim Quan"
            var pattern = '4b 00 69 00 6d 00 20 00 51 00 75 00 e2 00 6e 00'; 
            
            for (var i = 0; i < allRanges.length; i++) {
                try {
                    var matches = Memory.scanSync(allRanges[i].base, allRanges[i].size, pattern);
                    for (var m = 0; m < matches.length; m++) {
                        var strAddr = matches[m].address;
                        var strObj = strAddr.sub(0x14); 
                        
                        var hex = strObj.toString(16);
                        while(hex.length < 16) hex = '0' + hex;
                        var parts = [];
                        for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
                        var ptrPattern = parts.join(' ');
                        
                        for (var k = 0; k < allRanges.length; k++) {
                            try {
                                var ptrMatches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                                for (var pm = 0; pm < ptrMatches.length; pm++) {
                                    var objAddr = ptrMatches[pm].address;
                                    send("Found NpcData containing name at: " + objAddr);
                                    
                                    // Dump -0x50 to +0x50
                                    for(var offset = -0x50; offset < 0x50; offset += 4) {
                                        try {
                                            var val = objAddr.add(offset).readU32();
                                            if (val > 0) {
                                                send("  Offset " + (offset < 0 ? "-" : "+") + "0x" + Math.abs(offset).toString(16) + ": " + val);
                                            }
                                        } catch(e){}
                                    }
                                }
                            } catch(e) {}
                        }
                    }
                } catch(e) {}
            }
            send("DONE");
        }, 500);
    \;
    const radarScript = await session.session.createScript(source);
    radarScript.message.connect((msg) => {
        if (msg.type === 'send') {
            console.log(msg.payload);
            if (msg.payload === "DONE") {
                session.disconnect();
                process.exit(0);
            }
        }
    });
    await radarScript.load();
}
run();
