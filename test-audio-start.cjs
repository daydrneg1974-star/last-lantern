const assert=require('node:assert/strict');
const {FakeAudioContext}=require('./audio-test-support.cjs');
const elements=new Map();let frame;const ctx=new Proxy({},{get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}});
global.document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,{style:{},classList:{toggle(){}},getContext:()=>ctx,focus(){}});return elements.get(id);},createElement:()=>({getContext:()=>ctx}),addEventListener(){}};
const resolveDecoders=[];
class Context extends FakeAudioContext{constructor(){super();this.state='suspended';}decodeAudioData(){return new Promise(resolve=>resolveDecoders.push(()=>resolve({duration:10,numberOfChannels:0})));}}
global.window={AudioContext:Context,LANTERN_AUDIO_PACK:Object.fromEntries(['dark','light','near','attack1','attack2'].map(k=>[k,{data:'AQ=='}])),atob:()=>String.fromCharCode(1),addEventListener(){}};global.requestAnimationFrame=fn=>frame=fn;
const g=require('./game.js');let checks=0;const pass=n=>{checks++;console.log('PASS '+n);};
(async()=>{
 const preparation=g.sound.prepare();assert.equal(resolveDecoders.length,5);const click=elements.get('start').onclick();assert.equal(g.sound.context.resumeCalls,1);assert.equal(g.get().state,'preparing');frame(1000);assert.equal(g.get().remaining,120);assert.match(elements.get('start').textContent,/Подготовка/);resolveDecoders.forEach(fn=>fn());await preparation;await click;assert.equal(g.get().state,'playing');assert.equal(g.get().remaining,120);assert.equal(g.sound.recordings.musicKey,'dark');pass('Click resumes synchronously; timer waits for decoding and music starts with round');
 for(const mode of ['normal','training']){g.showMenu();g.selectMode(mode);g.start();const p=g.get().player;p.bag=7;p.lives=1;g.get().lamps[0].lit=true;g.update(.1);g.overlay('lost');g.showMenu();assert.equal(elements.get('time').textContent,'02:00');assert.equal(elements.get('sparks').textContent,'✦ 0');assert.equal(elements.get('lamps').innerHTML,'0 <em>/ 7</em>');assert.equal(g.get().player.lives,mode==='normal'?3:5);assert.equal(elements.get('lives').textContent,'♥ '.repeat(mode==='normal'?3:5));pass(mode+': result-to-menu immediately resets every HUD counter');}
 g.selectMode('normal');assert.equal(g.get().player.lives,3);g.selectMode('training');assert.equal(g.get().player.lives,5);pass('Changing menu difficulty immediately updates HUD lives');
 g.start();const x=g.get();x.player.x=60;x.player.y=60;x.lamps[0].lit=true;x.enemies.length=1;Object.assign(x.enemies[0],{x:60,y:180});g.updateSoundThreat();assert.ok(g.sound.threat>0);assert.equal(g.sound.heartbeat,0);assert.equal(g.sound.protectedThreat,true);pass('Game supplies nearby monster presence from inside protected light');
 g.overlay('paused');const oldTime=g.get().remaining;await g.sound.previewThreat(40);frame(3000);assert.equal(g.get().remaining,oldTime);g.sound.stopDiagnostic();g.resume();assert.equal(g.get().state,'playing');pass('Diagnostic audio cannot advance the paused game clock');
 g.showMenu();const start=elements.get('start').onclick();assert.equal(g.get().state,'playing');await start;assert.equal(g.get().remaining,120);pass('Prepared restart begins immediately with no extra waiting');
 g.sound.onPreviewRequest();assert.equal(g.get().state,'paused');g.resume();g.overlay('paused');g.sound.onPreviewEnd();assert.equal(g.get().state,'paused');pass('Old diagnostic session cannot resume a later manual pause');
 console.log(`\n${checks} start/HUD checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
