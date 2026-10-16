const assert=require('node:assert/strict');
const {fitBuffer,setupDisplay}=require('./display.js');
const Art=require('./scenery.js');
let checks=0;
function pass(name){checks++;console.log('PASS '+name);}
(async()=>{
 for(const [w,h,dpr]of [[1200,760,1],[600,380,2],[1920,1080,1],[3440,1440,2],[390,247,3]]){
  const b=fitBuffer(w,h,dpr);assert.ok(Math.abs(b.width/b.height-1200/760)<.003);assert.ok(b.width*b.height<3004000);
 }
 pass('Buffer aspect ratio and pixel budget on five viewport sizes');
 const listeners={},transforms=[];let entered=0,exited=0;
 const button={setAttribute(k,v){this[k]=v;},blur(){}},notice={};
 const canvas={width:1200,height:760,getBoundingClientRect:()=>({width:600,height:380}),getContext:()=>({setTransform:(...args)=>transforms.push(args)})};
 const shell={async requestFullscreen(){entered++;doc.fullscreenElement=shell;}};
 const doc={fullscreenElement:null,fullscreenEnabled:true,async exitFullscreen(){exited++;this.fullscreenElement=null;},getElementById:id=>({game:canvas,gameShell:shell,fullscreen:button,displayNotice:notice}[id]),addEventListener:(name,fn)=>listeners[name]=fn};
 const win={devicePixelRatio:2,addEventListener:(name,fn)=>listeners[name]=fn};
 setupDisplay(doc,win);await button.onclick();assert.equal(entered,1);assert.equal(button['aria-pressed'],'true');assert.ok(button.textContent.includes('Выйти'));
 await button.onclick();assert.equal(exited,1);assert.equal(button['aria-pressed'],'false');
 pass('Fullscreen API enter and exit, button state');
 doc.fullscreenElement=shell;listeners.fullscreenchange();doc.fullscreenElement=null;listeners.fullscreenchange();assert.equal(button['aria-pressed'],'false');
 win.devicePixelRatio=1;listeners.resize();assert.equal(canvas.width,600);assert.equal(canvas.height,380);assert.deepEqual(transforms.at(-1),[.5,0,0,.5,0,0]);
 pass('External fullscreen exit and resize keep logical coordinates');
 shell.requestFullscreen=async()=>{throw new Error('denied');};await button.onclick();assert.equal(button.disabled,false);assert.ok(notice.textContent.includes('недоступен'));
 pass('Rejected fullscreen request leaves window mode usable');
 doc.fullscreenEnabled=false;setupDisplay(doc,win);assert.equal(button.disabled,true);pass('Unsupported fullscreen is disabled');
 let drawImages=0,roundRects=0,depth=0;
 const context=new Proxy({}, {get:(_,name)=>{
  if(name==='createRadialGradient')return ()=>({addColorStop(){}});
  return (...args)=>{for(const a of args)if(typeof a==='number')assert.ok(Number.isFinite(a),name+' uses finite values');if(name==='drawImage')drawImages++;if(name==='roundRect')roundRects++;if(name==='save')depth++;if(name==='restore')depth--;assert.ok(depth>=0);};
 }});
 global.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
 const buildings=Object.freeze([100,380,660,940].flatMap(x=>[100,340,580].map(y=>Object.freeze({x,y,w:160,h:100}))));
 const art=new Art(context,buildings),tiles=roundRects;
 const player=Object.freeze({x:60,y:490}),lamps=Object.freeze([Object.freeze({x:60,y:60,lit:true,ignition:0})]);
 for(let i=0;i<600;i++){art.advance(1/60,player,true);art.ground(lamps);art.weather();art.traveler(player,1);art.creature({x:300,y:200,phase:1},art.clock);art.lamp(lamps[0],0);}
 assert.equal(art.cacheBuilds,1);assert.equal(roundRects,tiles);assert.equal(drawImages,600*4);assert.equal(art.rain.length,65);assert.equal(art.puddles.length,9);assert.equal(depth,0);
 pass('600 visual frames: one terrain cache, fixed weather pools, balanced Canvas state');
 art.reset();art.advance(.016,{x:60,y:490},true);art.advance(.016,{x:63,y:490},true);assert.ok(art.stride>0);assert.ok(art.walk>0);art.advance(.016,{x:63,y:490},true);assert.equal(art.stride,0);
 pass('Walking responds to movement and stops at rest');
 console.log(`\n${checks} display checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
