const p=require('path'),c=require('./config'),{FridaSession}=require('./src/frida-session');
(async()=>{
 const s=new FridaSession('127.0.0.1:16384',c.GAME_PACKAGE);
 await s.connect();
 await s.loadScript(p.join(c.FRIDA_SCRIPTS_DIR,'bot.bundle.js'));
 const src='rpc.exports.ds=function(){var r={};var f=ptr("0x933c660");var p28=f.add(0x28).readPointer();var p30=f.add(0x30).readPointer();r.p28=p28.toString();r.p30=p30.toString();r.raw28="";r.raw30="";for(var i=0;i<40;i++){var b28=p28.add(i).readU8();var b30=p30.add(i).readU8();r.raw28+=(b28>=32&&b28<127)?String.fromCharCode(b28):".";r.raw30+=(b30>=32&&b30<127)?String.fromCharCode(b30):"."};return r};';
 const scr=await s.session.createScript(src);await scr.load();
 const r=await scr.exports.ds();
 console.log(JSON.stringify(r,null,2));
 await s.disconnect();
})().catch(e=>{console.error(e.message)});
