'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {boot,settle}=require('./harness.js');

test('boots to menu with 7 lamps, 14 sparks, 4 shadows and default normal mode',()=>{
  const {game,ui}=boot();const s=game.get();
  assert.equal(s.state,'menu');assert.equal(s.lamps.length,7);assert.equal(s.sparks.length,14);assert.equal(s.enemies.length,4);
  assert.equal(s.selectedMode,'normal');assert.equal(s.player.lives,3);assert.equal(s.remaining,120);
  assert.equal(ui('time').textContent,'02:00');assert.equal(ui('lamps').innerHTML,'0 <em>/ 7</em>');
});
test('training mode: 5 lives, 20% slower shadows, longer immunity; normal unchanged',()=>{
  const {game}=boot();
  game.selectMode('training');assert.equal(game.get().player.lives,5);
  const slow=game.shadowSpeed(0);game.start();
  assert.equal(game.get().activeMode,'training');assert.equal(game.shadowSpeed(0),slow);
  game.showMenu();game.selectMode('normal');game.start();
  assert.ok(Math.abs(game.shadowSpeed(0)/slow-1.25)<1e-9,'normal is 1/0.8 faster');
  assert.equal(game.shadowSpeed(0),(72)*.85);
});
test('start enters playing, hides overlay and enables pause',()=>{
  const {game,ui}=boot();game.start();
  assert.equal(game.get().state,'playing');assert.equal(ui('overlay').hidden,true);assert.equal(ui('pause').disabled,false);
});
test('WASD movement at 180 u/s and walls/buildings block',()=>{
  const {game}=boot();game.start();const p=game.get().player;const x0=p.x;
  game.keys.add('KeyD');game.update(.5);assert.ok(Math.abs(p.x-x0-90)<1e-6);game.keys.clear();
  game.keys.add('KeyW');for(let i=0;i<200;i++)game.update(.05);assert.ok(p.y>=p.r,'top wall');game.keys.clear();
  assert.equal(game.blocked(100+80,100+50,12),true);assert.equal(game.blocked(60,490,12),false);
});
test('collects spark, ignites lamp with E only when close and holding a spark',()=>{
  const {game,ui}=boot();game.start();const s=game.get();
  game.light();assert.equal(s.lamps.filter(l=>l.lit).length,0,'no spark, no light');
  s.player.x=60;s.player.y=390;game.update(.001);assert.equal(s.player.bag,1,'spark at 60,390 collected');
  s.player.x=60;s.player.y=100;game.light();assert.equal(s.lamps[0].lit,true);assert.equal(s.player.bag,0);
  assert.equal(ui('lamps').innerHTML,'1 <em>/ 7</em>');
});
test('igniting all seven lamps wins the round',()=>{
  const {game,ui}=boot();game.start();const s=game.get();
  for(const l of s.lamps){s.player.bag=1;s.player.x=l.x;s.player.y=l.y;game.light();}
  assert.equal(game.get().state,'won');assert.equal(ui('title').textContent,'Город снова светит');
});
test('flash: 8 s cooldown, pushes nearby shadows, no double use',()=>{
  const {game}=boot();game.start();const s=game.get();
  s.enemies[0].x=s.player.x+50;s.enemies[0].y=s.player.y;game.flash();
  assert.equal(game.get().cooldown,8);assert.ok(s.enemies[0].vx>400);assert.ok(game.get().burst>0);
  s.enemies[0].vx=0;game.flash();assert.equal(s.enemies[0].vx,0,'cooldown blocks second flash');
  game.update(.04);assert.ok(game.get().cooldown<8);
});
test('shadow contact costs a life, grants immunity; lit lamp zone is safe',()=>{
  const {game}=boot();game.start();const s=game.get();
  s.enemies[0].x=s.player.x+5;s.enemies[0].y=s.player.y;game.update(.016);
  assert.equal(s.player.lives,2);assert.ok(game.get().invulnerable>2.9);
  s.enemies[0].x=s.player.x+5;s.enemies[0].y=s.player.y;game.update(.016);assert.equal(s.player.lives,2,'immune');
  game.update(3.1);game.update(.04);assert.equal(game.get().invulnerable,0);s.lamps[0].lit=true;s.player.x=60;s.player.y=60;s.enemies[0].x=65;s.enemies[0].y=60;game.update(.016);
  assert.equal(s.player.lives,2,'safe zone');assert.ok(Math.hypot(s.enemies[0].x-60,s.enemies[0].y-60)>105,'shadow expelled');
});
test('losing all lives or running out of time ends the round',()=>{
  const {game}=boot();game.start();let s=game.get();
  for(let i=0;i<3;i++){s.enemies.forEach(e=>{e.x=1100;e.y=60;});for(let k=0;k<100&&game.get().invulnerable>0;k++)game.update(.04);s.enemies[0].x=s.player.x+5;s.enemies[0].y=s.player.y;game.update(.016);if(game.get().state==='lost')break;}
  assert.equal(game.get().state,'lost');assert.equal(s.player.lives,0);
  game.showMenu();game.start();s=game.get();
  for(let i=0;i<130/.04+5;i++){if(game.get().state!=='playing')break;s.enemies.forEach(e=>{e.x=1100;e.y=60;});game.update(.04);}
  assert.equal(game.get().state,'lost');assert.equal(game.get().remaining,0);
});
test('pause/resume via Esc and button; movement keys are cleared on pause',()=>{
  const {game,win,ui}=boot();game.start();
  game.keys.add('KeyD');win.dispatch('keydown',{code:'Escape'});
  assert.equal(game.get().state,'paused');assert.equal(game.keys.size,0);assert.equal(ui('restart').hidden,false);
  win.dispatch('keydown',{code:'Escape'});assert.equal(game.get().state,'playing');
  ui('pause').click();assert.equal(game.get().state,'paused');
  ui('start').click();assert.equal(game.get().state,'playing');
});
test('window blur and hidden document pause the game',()=>{
  const {game,win,doc}=boot();game.start();win.dispatch('blur');assert.equal(game.get().state,'paused');
  game.resume();doc.hidden=true;doc.dispatch('visibilitychange');assert.equal(game.get().state,'paused');
});
test('restart from pause returns to menu with full state reset',()=>{
  const {game,ui}=boot();game.start();const s=game.get();s.player.bag=3;game.overlay('paused');ui('restart').click();
  const n=game.get();assert.equal(n.state,'menu');assert.equal(n.player.bag,0);assert.equal(n.remaining,120);assert.equal(n.sparks.filter(x=>x.taken).length,0);
});
test('keyboard: E ignites and Space flashes only while playing; repeats ignored',()=>{
  const {game,win}=boot();
  win.dispatch('keydown',{code:'Space'});assert.equal(game.get().cooldown,0,'menu ignores space');
  game.start();const e=win.dispatch('keydown',{code:'Space'});assert.equal(game.get().cooldown,8);assert.equal(e.defaulted,true,'default prevented');
  win.dispatch('keydown',{code:'KeyE',repeat:true});
});
test('requestStart with ready audio: goes through preparing to playing and begins round music',async()=>{
  const {game,ui,sound}=boot();
  ui('start').click();assert.equal(game.get().state,'preparing');await settle(20);
  assert.equal(game.get().state,'playing');assert.equal(sound.context.state,'running');assert.equal(sound.recordings.loaded,true);
});
