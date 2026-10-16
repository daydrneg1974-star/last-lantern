'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {boot,load,settle}=require('./harness.js');
function mobileBoot(opts={}){
  const b=boot(opts);const {win,doc,game}=b;
  doc.documentElement.classList.add('mobile');
  const zone=doc.getElementById('stickZone');zone._rect={left:20,top:34,width:368,height:356};zone.setPointerCapture=()=>{};
  const base=doc.getElementById('stickBase');base._rect={left:24,top:250,width:110,height:110}; // centre (79,305)
  doc.getElementById('touchControls').hidden=true;for(const id of ['rotateNotice','rotateTip','touchSound','touchSoundPanel'])doc.getElementById(id).hidden=true;
  const ac=doc.createElement('span');ac.setAttribute('class','audio-controls');doc.body.appendChild(ac);ac.appendChild(doc.getElementById('soundToggle'));
  const mobileModule=load(win,'mobile.js');const mobile=mobileModule.setupMobile(doc,win,game);
  const runFrame=()=>{const fns=win.raf.splice(0);fns.forEach(f=>f(0));};
  return {...b,mobile,zone,runFrame};
}
const pd=(el,x,y,id=1)=>el.dispatch('pointerdown',{pointerId:id,clientX:x,clientY:y});
const pm=(el,x,y,id=1)=>el.dispatch('pointermove',{pointerId:id,clientX:x,clientY:y});
const pu=(el,id=1)=>el.dispatch('pointerup',{pointerId:id});
const axis=game=>[game.touchAxis.x,game.touchAxis.y];

test('setAxis normalises direction; hero speed stays 180 u/s in every direction',()=>{
  const {game}=boot();game.start();const p=game.get().player;
  game.setAxis(3,0);const x0=p.x;game.update(.5);assert.ok(Math.abs(p.x-x0-90)<1e-6);
  game.setAxis(-1,-1);const x1=p.x,y1=p.y;game.update(.1);assert.ok(Math.abs(Math.hypot(p.x-x1,p.y-y1)-18)<1e-6,'diagonal at full speed');
  game.setAxis(0,0);const x2=p.x;game.update(.1);assert.equal(p.x,x2);
  game.setAxis(NaN,1);assert.deepEqual(axis(game),[0,0]);
});
test('keyboard has priority over the joystick axis',()=>{
  const {game}=boot();game.start();const p=game.get().player;game.setAxis(1,0);game.keys.add('KeyS');const x=p.x,y=p.y;game.update(.1);assert.equal(p.x,x);assert.ok(p.y>y);
});
test('joystick: fixed base; press steers from the base centre, drag sets the axis, release stops immediately',()=>{
  const {game,zone,doc}=mobileBoot();game.start();const base=doc.getElementById('stickBase');
  pd(zone,119,305);assert.ok(base.classList.contains('active'));assert.ok(game.touchAxis.x>.99,'press right of centre moves right at once');
  pm(zone,79,265);assert.ok(game.touchAxis.y<-.99);
  pm(zone,82,308);assert.deepEqual(axis(game),[0,0],'dead zone');
  pm(zone,40,345);assert.ok(game.touchAxis.x<0&&game.touchAxis.y>0,'360°');
  pm(zone,300,100);assert.ok(Math.abs(Math.hypot(game.touchAxis.x,game.touchAxis.y)-1)<1e-9,'far touch is still unit direction');
  pu(zone);assert.deepEqual(axis(game),[0,0]);assert.equal(base.classList.contains('active'),false);
});
test('joystick: a second pointer in the zone is ignored, pointercancel and lostpointercapture release',()=>{
  const {game,zone}=mobileBoot();game.start();
  pd(zone,129,305,1);pm(zone,150,305,1);pd(zone,79,200,2);pm(zone,79,150,2);assert.ok(game.touchAxis.x>.99,'first pointer still owns the stick');
  zone.dispatch('pointercancel',{pointerId:1});assert.deepEqual(axis(game),[0,0]);
  pd(zone,129,305,3);pm(zone,150,305,3);zone.dispatch('lostpointercapture',{pointerId:3});assert.deepEqual(axis(game),[0,0]);
});
test('joystick is inert outside the playing state',()=>{
  const {game,zone,doc}=mobileBoot();pd(zone,129,305);pm(zone,160,305);assert.deepEqual(axis(game),[0,0]);assert.equal(doc.getElementById('stickBase').classList.contains('active'),false);
});
test('action buttons: flash and ignite fire on pointerdown while the stick is held; click default prevented',()=>{
  const {game,zone,doc}=mobileBoot();game.start();const s=game.get();
  pd(zone,129,305);pm(zone,150,305);
  doc.getElementById('touchFlash').dispatch('pointerdown',{pointerId:2});assert.equal(game.get().cooldown,8);assert.ok(game.touchAxis.x>.99,'movement continues');
  s.player.bag=1;s.player.x=60;s.player.y=100;doc.getElementById('touchIgnite').dispatch('pointerdown',{pointerId:3});assert.equal(s.lamps[0].lit,true);
  const e=doc.getElementById('touchFlash').dispatch('click',{});assert.equal(e.defaulted,true);
});
test('pause, blur, hidden page and pagehide all clear the joystick',()=>{
  const {game,zone,win,doc,runFrame}=mobileBoot();
  for(const trigger of [()=>game.overlay('paused'),()=>win.dispatch('blur'),()=>{doc.hidden=true;doc.dispatch('visibilitychange');doc.hidden=false;},()=>win.dispatch('pagehide'),()=>win.dispatch('orientationchange')]){
    game.showMenu();game.start();pd(zone,129,305);pm(zone,150,305);assert.ok(game.touchAxis.x>.99);trigger();runFrame();assert.deepEqual(axis(game),[0,0]);assert.equal(doc.getElementById('stickBase').classList.contains('active'),false);pm(zone,170,305);assert.deepEqual(axis(game),[0,0],'late move after pause is ignored');
  }
});
test('frame sync: controls visible only while playing; cooldown ring and ignite readiness follow the state',()=>{
  const {game,doc,runFrame}=mobileBoot();const controls=doc.getElementById('touchControls');
  runFrame();assert.equal(controls.hidden,true);game.start();runFrame();assert.equal(controls.hidden,false);
  game.flash();runFrame();assert.ok(doc.getElementById('touchFlash').classList.contains('cooling'));
  const s=game.get();s.player.bag=1;s.player.x=60;s.player.y=100;runFrame();assert.ok(doc.getElementById('touchIgnite').classList.contains('ready'));
  game.overlay('paused');runFrame();assert.equal(controls.hidden,true);
});
test('orientation: portrait pauses a running round and shows the rotate notice; landscape hides it',()=>{
  const media={'(orientation: portrait)':false};const {game,doc,mobile,win,runFrame}=mobileBoot({media});
  game.start();runFrame();assert.equal(doc.getElementById('rotateNotice').hidden,true);
  media['(orientation: portrait)']=true;win.dispatch('resize');assert.equal(game.get().state,'paused');assert.equal(doc.getElementById('rotateNotice').hidden,false);assert.ok(doc.documentElement.classList.contains('portrait'));
  media['(orientation: portrait)']=false;win.dispatch('resize');assert.equal(doc.getElementById('rotateNotice').hidden,true);assert.equal(game.get().state,'paused');
  game.showMenu();media['(orientation: portrait)']=true;win.dispatch('resize');runFrame();assert.equal(doc.getElementById('rotateNotice').hidden,true,'menu has no blocking notice');assert.equal(doc.getElementById('rotateTip').hidden,false);
});
test('sound settings move into the pause card and the toggle only shows in menu/pause',()=>{
  const {game,doc,runFrame}=mobileBoot();const panel=doc.getElementById('touchSoundPanel'),toggle=doc.getElementById('touchSound');
  assert.equal(panel.children.some(c=>c.classList.contains('audio-controls')),true);
  runFrame();assert.equal(toggle.hidden,false);toggle.dispatch('click');assert.equal(panel.hidden,false);
  game.start();runFrame();assert.equal(toggle.hidden,true);assert.equal(panel.hidden,true);
  game.overlay('paused');runFrame();assert.equal(toggle.hidden,false);
});
test('touch labels replace keyboard hints only on the mobile page',()=>{
  const {doc,game}=mobileBoot({mobileClass:true});game.start();game.update(.01);assert.equal(doc.getElementById('flashLabel').textContent,'ГОТОВА');
  const desk=boot();desk.game.start();desk.game.update(.01);assert.equal(desk.doc.getElementById('flashLabel').textContent,'ПРОБЕЛ · ГОТОВА');
});

test('touch controls prevent the browser defaults of raw touch events (long-press, zoom, scroll)',()=>{
  const {doc}=mobileBoot();const controls=doc.getElementById('touchControls');
  for(const type of ['touchstart','touchmove','touchend','touchcancel']){const e=controls.dispatch(type,{cancelable:true});assert.equal(e.defaulted,true,type);}
  const e=controls.dispatch('touchmove',{cancelable:false});assert.equal(e.defaulted,undefined,'non-cancelable left alone');
});
test('release diagnostics name the event that ended a hold',()=>{
  const {game,zone,mobile}=mobileBoot();game.start();pd(zone,129,305);zone.dispatch('pointercancel',{pointerId:1});pd(zone,129,305);pu(zone);
  assert.equal(mobile.stats.holds,2);assert.deepEqual(JSON.parse(JSON.stringify(mobile.stats.releases)),{pointercancel:1,pointerup:1});assert.equal(mobile.stats.lastRelease,'pointerup');
});
test('frame loop: a slow 80 ms frame advances the world by 80 ms in two steps; a 500 ms gap is clamped to 100 ms',()=>{
  const {game}=boot();game.start();const s=game.get();game.keys.add('KeyD');
  game.frame(1000);const x0=s.player.x;game.frame(1080);assert.ok(Math.abs(s.player.x-x0-180*.08)<1e-6,'80 ms → 14.4 units');
  const x1=s.player.x;game.frame(1580);assert.ok(Math.abs(s.player.x-x1-180*.1)<1e-6,'500 ms gap → 100 ms of movement');
  const x2=s.player.x;game.frame(1596);assert.ok(Math.abs(s.player.x-x2-180*.016)<1e-6,'16 ms frame unchanged');
});
