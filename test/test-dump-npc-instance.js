// tools/test-dump-npc-instance.js — Dump raw NpcController instance memory
const path = require('path');
const CONFIG = require('../config');
const { FridaSession } = require('../src/frida-session');

async function main() {
    const session = new FridaSession(null, CONFIG.GAME_PACKAGE);
    try {
        await session.connect();
        await session.loadScript(path.join(CONFIG.FRIDA_SCRIPTS_DIR, 'bot.bundle.js'));

        const src = `
rpc.exports.dumpInstance = function() {
 var r={};
 try {
  var maps=File.readAllText("/proc/self/maps").split("\\n");
  var meta=null;
  for(var i=0;i<maps.length;i++){
   if(maps[i].indexOf("global-metadata.dat")!==-1){
    var p=maps[i].split(" ")[0].split("-");
    meta={base:ptr("0x"+p[0]),size:parseInt("0x"+p[1])-parseInt("0x"+p[0])};
    break;
   }
  }
  var res=Memory.scanSync(meta.base,meta.size,"4e 70 63 43 6f 6e 74 72 6f 6c 6c 65 72");
  var na=null;
  for(var ri=0;ri<res.length;ri++){
   try{if(res[ri].address.readUtf8String()==="NpcController"){na=res[ri].address;break}}catch(e){}
  }
  
  var h=na.toString(16);while(h.length<16)h="0"+h;
  var pp=[];for(var j=14;j>=0;j-=2)pp.push(h.substring(j,j+2));
  var ar=Process.enumerateRanges({protection:"rw-",coalesce:true});
  var nc=null;
  for(var k=0;k<ar.length&&!nc;k++){
   try{
    var ms=Memory.scanSync(ar[k].base,ar[k].size,pp.join(" "));
    for(var m=0;m<ms.length;m++){
     var ca=ms[m].address.sub(0x10);
     try{if(ca.add(0x10).readPointer().toString()===na.toString()){nc=ca;break}}catch(e){}
    }
   }catch(e){}
  }
  r.npcClass=nc.toString();
  
  var hp=nc.toString(16);while(hp.length<16)hp="0"+hp;
  var cpp=[];for(var cj=14;cj>=0;cj-=2)cpp.push(hp.substring(cj,cj+2));
  
  var found=null;
  for(var hh=0;hh<ar.length&&!found;hh++){
   if(ar[hh].size<0x1000)continue;
   try{
    var ims=Memory.scanSync(ar[hh].base,ar[hh].size,cpp.join(" "));
    for(var ii=0;ii<ims.length&&!found;ii++){
     var oa=ims[ii].address;
     try{if(!oa.readPointer().equals(nc))continue}catch(e){continue}
     var os=oa.toString(16);
     if(os.indexOf("7c9d60")===0||os.indexOf("7c9d61")===0)continue;
     found=oa;
    }
   }catch(e){}
  }
  if(!found)return{error:"no heap instance"};
  r.instAddr=found.toString();
  
  r.dump=[];
  for(var d=0;d<0x60;d+=8){
   try{r.dump.push("+0x"+d.toString(16)+"="+found.add(d).readPointer())}catch(e){r.dump.push("+0x"+d.toString(16)+"=ERR")}
  }
  
  r.strings={};
  for(var off=0x20;off<=0x58;off+=8){
   try{
    var sp=found.add(off).readPointer();
    if(sp&&!sp.isNull()){
     var sl=sp.add(0x10).readU32();
     if(sl>0&&sl<64){var ss=sp.add(0x14).readUtf16String(sl);r.strings["+"+off.toString(16)]=ss}
    }
   }catch(e){}
  }
  r.ok=true;
 }catch(e){r.error=e.message}
 return r;
};
`;
        const scr = await session.session.createScript(src);
        await scr.load();
        const r = await scr.exports.dumpInstance();
        console.log(JSON.stringify(r, null, 2));

    } catch(e) {
        console.error(e);
    } finally {
        await session.disconnect().catch(() => {});
        process.exit(0);
    }
}
main();
