// tools/test-dump-dict38.js — Debug dict NpcManager+0x38
const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    try {
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));
        
        const src = `
rpc.exports.dumpDict38 = function() {
 var r={};
 try {
  var cmInst = _charManagerClass.add(0xB8).readPointer().readPointer();
  var world = cmInst.add(0x20).readPointer();
  var npcMgr = world.add(0x28).readPointer();
  var d38 = npcMgr.add(0x38).readPointer();
  r.d38 = d38.toString();
  if(d38.isNull()) return r;
  
  r.header=[];
  for(var j=0;j<0x30;j+=4) {
    try{r.header.push("0x"+j.toString(16)+"=0x"+d38.add(j).readU32().toString(16))}catch(e){}
  }
  
  var entries = d38.add(0x18).readPointer();
  var count = d38.add(0x20).readU32();
  r.entries=entries.toString(); r.count=count;
  
  if(count>0 && count<500 && !entries.isNull()) {
    r.samples=[];
    for(var s=0;s<Math.min(count,10);s++) {
      var ea=entries.add(s*24);
      var kp=ea.readPointer(); var vp=ea.add(8).readPointer();
      var ks="";
      try{var kl=kp.add(0x10).readU32();if(kl>0&&kl<64)ks=kp.add(0x14).readUtf16String(kl)}catch(e2){}
      var vs="";
      if(vp && !vp.isNull()){
       try{
        var ident=vp.add(0x28).readPointer();
        if(ident && !ident.isNull()){
         var np=ident.add(0x48).readPointer();
         if(np && !np.isNull()){
          var nl=np.add(0x10).readU32();
          if(nl>0&&nl<256)vs=np.add(0x14).readUtf16String(nl);
         }
        }
       }catch(e2){}
      }
      r.samples.push({idx:s,kp:kp.toString(),vp:vp.toString(),key:ks,name:vs});
    }
  }
  r.ok=true;
 }catch(e){r.error=e.message}
 return r;
};
`;
        const scr = await session.session.createScript(src);
        await scr.load();
        
        await session.callRpc('getNearbyShops');
        const r = await scr.exports.dumpDict38();
        console.log(JSON.stringify(r, null, 2));
        
    } catch(e) {
        console.error(e);
    } finally {
        await session.disconnect().catch(() => {});
        process.exit(0);
    }
}
main();
