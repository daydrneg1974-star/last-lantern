'use strict';
/* Cases ported from the Codex mobile-v1.0.1 branch (ideas, not code): touch activation on release,
   invariants of the map and balance on the mobile page, display buffer sizing, restored difficulty. */
const test=require('node:test'),assert=require('node:assert/strict');
const {boot,load,settle,FakeAudioContext}=require('./harness.js');
const touchOpts={navigator:{maxTouchPoints:5,userAgent:'iPhone'},mobileClass:true};

test('touch page: a touch pointerdown does not start resume(); touchend does, exactly once',async()=>{
  const {sound,win}=boot(touchOpts);sound.options.touchActivation=true;
  // listeners were bound in setupSound before the option existed: rebind through a fresh setup
  const {soundModule,doc}=boot(touchOpts);const s2=new soundModule.LanternSound(Object.assign(win,{LANTERN_AUDIO_OPTIONS:{touchActivation:true}}));soundModule.setupSound(s2,doc,win);
  s2.build();const ctx=s2.context;
  win.dispatch('pointerdown',{pointerType:'touch',target:doc.body});await settle();assert.equal(ctx.resumeCalls,0,'touch press must not resume');
  win.dispatch('pointerup',{pointerType:'touch',target:doc.body});await settle();assert.equal(ctx.resumeCalls,0,'touch release waits for touchend');
  win.dispatch('touchend',{target:doc.body});await settle();assert.equal(ctx.resumeCalls,1);assert.equal(ctx.state,'running');
  win.dispatch('pointerdown',{pointerType:'mouse',target:doc.body});await settle();assert.equal(ctx.state,'running');
  win.dispatch('pointerup',{pointerType:'pen',target:doc.body});await settle();
});
test('desktop page keeps unlocking on pointerdown (v1.0 behaviour)',async()=>{
  const {sound,win,doc}=boot();sound.build();win.dispatch('pointerdown',{pointerType:'touch',target:doc.body});await settle();assert.equal(sound.context.resumeCalls,1);
});
test('invariants: the mobile page has the same map, spawns, lamp/spark positions, shadow speed and lives as desktop',()=>{
  const m=boot(touchOpts),d=boot();
  assert.deepEqual(JSON.parse(JSON.stringify(m.game.buildings)),JSON.parse(JSON.stringify(d.game.buildings)));assert.equal(m.game.buildings.length,12);
  assert.deepEqual(JSON.parse(JSON.stringify(m.game.lampPositions)),[[60,60],[600,60],[1140,60],[320,300],[880,300],[60,720],[1140,720]]);
  assert.equal(m.game.sparkPositions.length,14);
  assert.deepEqual(JSON.parse(JSON.stringify(m.game.get().enemies.map(e=>[e.x,e.y]))),[[600,390],[1090,710],[880,250],[310,220]]);
  assert.equal(m.game.get().enemies.length,4);
  for(const mode of ['normal','training']){m.game.selectMode(mode);d.game.selectMode(mode);m.game.start();d.game.start();assert.equal(m.game.shadowSpeed(0),d.game.shadowSpeed(0));assert.ok(Math.abs(m.game.shadowSpeed(60)-(72+12)*.85*(mode==='training'?.8:1))<1e-9);assert.equal(m.game.get().player.lives,d.game.get().player.lives);assert.equal(m.game.get().remaining,120);m.game.showMenu();d.game.showMenu();}
});
test('display: backing buffer keeps the 1200:760 aspect and the pixel budget on phone and desktop sizes',()=>{
  const {win}=boot();const {fitBuffer}=load(win,'display.js');
  for(const [w,h,dpr] of [[1200,760,1],[616,390,3],[844,390,2],[390,247,3],[1920,1080,1],[3440,1440,2]]){const b=fitBuffer(w,h,dpr);assert.ok(Math.abs(b.width/b.height-1200/760)<.003,`${w}x${h}`);assert.ok(b.width*b.height<=3004000);assert.ok(b.width>=120);}
});
test('restored difficulty: a browser-restored <select> value is honoured at load',()=>{
  const b=boot({});// fresh boot with modeSelect preset before game.js runs
  const win=require('./harness.js').makeHost({});win._modules={};win.document.getElementById('modeSelect').value='training';
  const Art=load(win,'scenery.js');win._modules['scenery.js']=Art;const Rec=load(win,'recordings.js');win._modules['recordings.js']=Rec;win._modules['sound.js']=load(win,'sound.js');
  const game=load(win,'game.js');assert.equal(game.get().selectedMode,'training');assert.equal(game.get().player.lives,5);
  win.document.getElementById('modeSelect').value='bogus';assert.equal(b.game.get().selectedMode,'normal');
});
test('mobile: pagehide pauses a running round and releases the joystick',()=>{
  const {win,doc,game}=boot(touchOpts);const zone=doc.getElementById('stickZone');zone._rect={left:0,top:34,width:388,height:356};zone.setPointerCapture=()=>{};zone.hasPointerCapture=()=>true;let released=0;zone.releasePointerCapture=()=>released++;
  doc.getElementById('stickBase').hidden=true;const ac=doc.createElement('span');ac.setAttribute('class','audio-controls');doc.body.appendChild(ac);
  load(win,'mobile.js').setupMobile(doc,win,game);game.start();
  zone.dispatch('pointerdown',{pointerId:1,clientX:100,clientY:200});zone.dispatch('pointermove',{pointerId:1,clientX:150,clientY:200});assert.ok(game.touchAxis.x>.99);
  win.dispatch('pagehide');assert.equal(game.get().state,'paused');assert.equal(game.touchAxis.x,0);assert.equal(released,1,'pointer capture released');
});
