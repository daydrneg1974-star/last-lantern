// Logic tests with a minimal DOM; no browser or dependencies required.
const assert=require('node:assert/strict');
const elements=new Map(),events={};let frame,capture=false;const drawCalls=[];
const ctx=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):(...args)=>{if(capture)drawCalls.push([key,...args]);}});
global.document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,{style:{},classList:{toggle(){}},getContext:()=>ctx,focus(){}});return elements.get(id);},addEventListener:(key,fn)=>events[key]=fn};
global.document.createElement=()=>({width:0,height:0,getContext:()=>ctx});
global.window={addEventListener:(key,fn)=>events[key]=fn};global.requestAnimationFrame=fn=>frame=fn;
if(process.env.LANTERN_TEST_AUDIO)global.window.AudioContext=require('./audio-test-support.cjs').FakeAudioContext;
const g=require('./game.js');let checks=0;
if(process.env.LANTERN_TEST_AUDIO){void g.sound.unlock();if(process.env.LANTERN_TEST_AUDIO==='muted')g.sound.setEnabled(false);const update=g.update;g.update=dt=>{g.sound.context.advance(dt);update(dt);g.sound.tick();};}
function test(name,fn){g.showMenu();g.selectMode('normal');g.start();fn();checks++;console.log('PASS '+name);}
function tick(seconds){for(let t=0;t<seconds-1e-8;t+=.02)g.update(Math.min(.02,seconds-t));}
test('Original collision map and all spawn positions are unchanged',()=>{
 assert.deepEqual(g.buildings,[100,380,660,940].flatMap(x=>[100,340,580].map(y=>({x,y,w:160,h:100}))));
 assert.deepEqual(g.lampPositions,[[60,60],[600,60],[1140,60],[320,300],[880,300],[60,720],[1140,720]]);
 assert.deepEqual(g.sparkPositions,[[60,390],[60,270],[320,490],[320,60],[600,260],[880,60],[1140,260],[880,490],[600,720],[320,720],[1140,500],[880,720],[600,490],[60,720]]);
 assert.deepEqual(g.get().enemies.map(({x,y})=>[x,y]),[[600,390],[1090,710],[880,250],[310,220]]);
 assert.deepEqual([g.get().player.x,g.get().player.y,g.get().player.r],[60,490,12]);
});
test('14 sparks, seven lamps, three lives and 120 seconds',()=>{const s=g.get();assert.equal(s.sparks.length,14);assert.equal(s.lamps.length,7);assert.equal(s.player.lives,3);assert.equal(s.remaining,120);});
test('Actual lamp interactions advance music and restart resets it',()=>{const s=g.get();s.player.bag=7;for(let i=0;i<7;i++){Object.assign(s.player,{x:s.lamps[i].x,y:s.lamps[i].y});g.light();assert.equal(g.sound.lanterns,i+1);assert.equal(g.sound.musicStage,i+1>=7?3:i+1>=6?2:i+1>=3?1:0);}assert.equal(g.get().state,'won');g.start();assert.equal(g.sound.lanterns,0);assert.equal(g.sound.musicBeat,0);assert.equal(g.sound.musicStage,0);});
test('Threat audio uses nearest exposed enemy, excludes walls and safe zones',()=>{
 const s=g.get(),setThreat=g.sound.setThreat;let heard;
 g.sound.setThreat=(distance,protectedPlayer)=>{heard={distance,protectedPlayer};setThreat.call(g.sound,distance,protectedPlayer);};
 try{
  s.enemies.length=2;Object.assign(s.enemies[0],{x:60,y:630});Object.assign(s.enemies[1],{x:60,y:550});g.updateSoundThreat();assert.equal(heard.distance,60);
  Object.assign(s.enemies[1],{x:600,y:490});g.updateSoundThreat();assert.equal(heard.distance,140);
  Object.assign(s.player,{x:80,y:150});Object.assign(s.enemies[0],{x:280,y:150});g.updateSoundThreat();assert.equal(heard.distance,Infinity,'house blocks apparent proximity');
  Object.assign(s.player,{x:60,y:60,bag:1});g.light();assert.equal(heard.protectedPlayer,true,'light immediately quiets warnings');
  Object.assign(s.player,{x:60,y:175});Object.assign(s.enemies[0],{x:60,y:100});g.updateSoundThreat();assert.equal(heard.distance,Infinity,'enemy in a safe zone is not a threat');
  Object.assign(s.player,{x:60,y:490});Object.assign(s.enemies[0],{x:60,y:490});g.update(.01);assert.equal(heard.protectedPlayer,true,'invulnerability suppresses danger');
 }finally{g.sound.setThreat=setThreat;}
});
test('Audio events fire only for successful actions and final outcomes',()=>{
 const heard=[],play=g.sound.play;g.sound.play=name=>{heard.push(name);play.call(g.sound,name);};
 try{const s=g.get();g.light();assert.deepEqual(heard,[]);Object.assign(s.player,{x:60,y:390});g.update(.01);g.update(.01);assert.deepEqual(heard,['spark']);Object.assign(s.player,{x:60,y:60});g.light();g.light();assert.equal(heard.filter(n=>n==='lamp').length,1);g.flash();g.flash();assert.equal(heard.filter(n=>n==='flash').length,1);
 Object.assign(s.player,{x:60,y:490});Object.assign(s.enemies[0],{x:60,y:490});g.update(.01);g.update(.01);assert.equal(heard.filter(n=>n==='hit').length,1);
 g.overlay('won');g.overlay('lost');assert.deepEqual(heard.slice(-2),['won','lost']);
 }finally{g.sound.play=play;}
});
test('Movement, diagonal normalization and wall collision',()=>{g.get().enemies.length=0;g.keys.add('KeyD');tick(1);assert.ok(Math.abs(g.get().player.x-240)<.01);g.keys.clear();Object.assign(g.get().player,{x:60,y:490});g.keys.add('KeyD');g.keys.add('KeyS');tick(.2);assert.ok(Math.abs(Math.hypot(g.get().player.x-60,g.get().player.y-490)-36)<.01);g.keys.clear();Object.assign(g.get().player,{x:60,y:150});g.keys.add('KeyD');tick(2);assert.ok(g.get().player.x<=88);});
test('Collect once, spend one, cannot relight or light remotely',()=>{const s=g.get();Object.assign(s.player,{x:60,y:390});g.update(.01);assert.equal(s.player.bag,1);g.update(.01);assert.equal(s.player.bag,1);g.light();assert.equal(s.player.bag,1);Object.assign(s.player,{x:60,y:60});g.light();assert.equal(s.player.bag,0);assert.ok(s.lamps[0].lit);g.light();assert.equal(s.player.bag,0);});
test('Flash knockback and eight-second cooldown',()=>{const s=g.get();s.enemies.length=1;Object.assign(s.enemies[0],{x:100,y:490});g.flash();assert.equal(g.get().cooldown,8);assert.ok(s.enemies[0].vx>0);tick(.5);assert.ok(s.enemies[0].x>100);const cd=g.get().cooldown;g.flash();assert.equal(g.get().cooldown,cd);s.enemies.length=0;tick(7.5);assert.ok(g.get().cooldown<.001);});
test('Hit, full three-second immunity, blinking and defeat',()=>{
 const s=g.get();s.enemies.length=1;const e=s.enemies[0];
 const collide=()=>{Object.assign(e,{x:s.player.x,y:s.player.y,vx:0,vy:0});g.update(.01);};
 collide();assert.equal(s.player.lives,2);assert.equal(g.get().invulnerable,3);assert.equal(g.get().hitFlash,.24);
 const opacity=g.heroOpacity();Object.assign(e,{x:1000,y:500});tick(.15);assert.notEqual(g.heroOpacity(),opacity);
 tick(2.83);collide();assert.equal(s.player.lives,2,'still protected at 2.99 seconds');assert.equal(g.get().hitFlash,0);
 tick(.02);collide();assert.equal(s.player.lives,1,'damage resumes after three seconds');
 Object.assign(e,{x:1000,y:500});tick(3.1);collide();assert.equal(g.get().state,'lost');
});
test('Shadow chase speed reduced by 15 percent, with late-game acceleration',()=>{
 assert.equal(g.shadowSpeed(0),72*.85);assert.equal(g.shadowSpeed(60),84*.85);assert.equal(g.shadowSpeed(120),94*.85);
 const s=g.get();s.enemies.length=1;Object.assign(s.player,{x:60,y:490});Object.assign(s.enemies[0],{x:60,y:530});
 g.update(.02);assert.ok(Math.abs(s.enemies[0].y-(530-(72+.02*.2)*.85*.02))<1e-8);
});
test('Ignition, fixed flash origin, effect expiry, pause and clean reset',()=>{
 const s=g.get();s.enemies.length=0;Object.assign(s.player,{x:60,y:60,bag:1});g.light();assert.equal(s.lamps[0].ignition,.8);
 g.flash();assert.equal(g.get().burst,.7);g.keys.add('KeyD');tick(.1);g.keys.clear();assert.ok(s.player.x>60);assert.deepEqual(g.get().burstOrigin,{x:60,y:60});
 frame(500);g.overlay('paused');const before=g.get();const ignition=s.lamps[0].ignition;frame(540);assert.equal(g.get().burst,before.burst);assert.equal(s.lamps[0].ignition,ignition);
 g.resume();tick(.8);assert.equal(g.get().burst,0);assert.equal(s.lamps[0].ignition,0);assert.ok(g.get().cooldown>0);
 g.flash();assert.equal(g.get().burst,0,'cooldown still blocks flash');
 g.start();assert.equal(g.get().hitFlash,0);assert.equal(g.get().burstOrigin,null);assert.equal(g.get().invulnerable,0);assert.ok(g.get().lamps.every(l=>l.ignition===0));
});
test('Canvas renders scaled actors, exact safety ring and both flash effects',()=>{
 const s=g.get();Object.assign(s.player,{x:320,y:300,bag:1});g.light();Object.assign(s.player,{x:60,y:490});Object.assign(s.enemies[0],{x:60,y:490});g.update(.01);g.flash();g.overlay('paused');
 drawCalls.length=0;capture=true;frame(600);capture=false;
 assert.ok(drawCalls.some(c=>c[0]==='scale'&&c[1]===1.5&&c[2]===1.5));assert.ok(drawCalls.some(c=>c[0]==='scale'&&c[1]===1.3&&c[2]===1.3));
 assert.ok(drawCalls.some(c=>c[0]==='arc'&&c[1]===320&&c[2]===300&&c[3]===105));
 assert.ok(g.get().burst>0&&g.get().hitFlash>0);
 assert.equal(drawCalls.filter(c=>c[0]==='save').length,drawCalls.filter(c=>c[0]==='restore').length);
});
test('Safe light repels shadows and prevents damage',()=>{const s=g.get();Object.assign(s.player,{x:320,y:300,bag:1});Object.assign(s.enemies[0],{x:321,y:300});g.light();assert.ok(Math.hypot(s.enemies[0].x-320,s.enemies[0].y-300)>=105);tick(6);assert.equal(s.player.lives,3);assert.ok(s.enemies.every(e=>Math.hypot(e.x-320,e.y-300)>=105));});
test('Pause freezes time, resume and automatic focus pause',()=>{frame(100);g.overlay('paused');const t=g.get().remaining;frame(140);assert.equal(g.get().remaining,t);g.resume();frame(180);assert.ok(g.get().remaining<t);events.blur();assert.equal(g.get().state,'paused');});
test('Timeout and clean restart',()=>{g.get().enemies.length=0;tick(120.1);assert.equal(g.get().state,'lost');g.start();assert.equal(g.get().remaining,120);assert.equal(g.get().player.lives,3);assert.equal(g.get().cooldown,0);});
function path(from,to){const cols=60,rows=38,id=(x,y)=>Math.floor(y/20)*cols+Math.floor(x/20),start=id(from.x,from.y),end=id(to.x,to.y),q=[start],prev=new Map([[start,null]]);for(let i=0;i<q.length&&!prev.has(end);i++){let n=q[i],x=n%cols,y=Math.floor(n/cols);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){let a=x+dx,b=y+dy,k=b*cols+a;if(a<0||a>=cols||b<0||b>=rows||prev.has(k)||g.blocked(a*20+10,b*20+10,12))continue;prev.set(k,n);q.push(k);}}assert.ok(prev.has(end),'reachable target');const out=[];for(let n=end;n!==null;n=prev.get(n))out.push({x:n%cols*20+10,y:Math.floor(n/cols)*20+10});return out.reverse();}
test('Every lamp and spark is reachable with player radius',()=>{for(const [x,y]of [...g.lampPositions,...g.sparkPositions])path(g.get().player,{x,y});});
function winningRoute(){
 const s=g.get();let simulated=0;
 function walk(target){for(const p of path(s.player,target)){let limit=0;while(Math.hypot(p.x-s.player.x,p.y-s.player.y)>3){assert.ok(limit++<100,'route not stuck');g.keys.clear();let dx=p.x-s.player.x,dy=p.y-s.player.y;if(Math.abs(dx)>2)g.keys.add(dx>0?'KeyD':'KeyA');if(Math.abs(dy)>2)g.keys.add(dy>0?'KeyS':'KeyW');if(s.enemies.some(e=>Math.hypot(e.x-s.player.x,e.y-s.player.y)<125))g.flash();g.update(.02);simulated+=.02;assert.equal(g.get().state,'playing','survive route');}}g.keys.clear();}
 for(const index of [0,1,2,4,6,3,5]){if(!s.player.bag){const candidates=s.sparks.filter(p=>!p.taken).sort((a,b)=>path(s.player,a).length-path(s.player,b).length);walk(candidates[0]);}walk(s.lamps[index]);g.light();}
 assert.equal(g.get().state,'won');assert.ok(simulated<120);console.log(`  Winning route: ${simulated.toFixed(1)} s, lives left: ${s.player.lives}`);
}
test('Full playable winning route with active shadows within 120 seconds',winningRoute);
test('Canvas draw executes in menu, play, pause and results',()=>{for(const state of ['playing','paused','won','lost']){if(state!=='playing')g.overlay(state);frame(200);}});
for(const mode of ['normal','training']){
 const lives=mode==='training'?5:3,immunity=mode==='training'?4:3;
 function choose(){g.showMenu();const select=elements.get('modeSelect');select.value=mode;select.onchange();assert.equal(g.get().selectedMode,mode);assert.ok(elements.get('modeDetails').textContent.includes(mode==='training'?'Обучение':'Обычная игра'));elements.get('start').onclick();}
 test(`${mode}: selection, speed, lives, immunity and damage defeat`,()=>{
  choose();const s=g.get();assert.equal(s.activeMode,mode);assert.equal(s.player.lives,lives);assert.equal(s.remaining,120);assert.equal(s.lamps.length,7);
  for(const t of [0,60,120])assert.equal(g.shadowSpeed(t),(72+Math.min(t*.2,22))*.85*(mode==='training'?.8:1));
  assert.equal((elements.get('lives').textContent.match(/♥/g)||[]).length,lives);
  s.enemies.length=1;const e=s.enemies[0];
  Object.assign(e,{x:60,y:530});g.update(.02);assert.ok(Math.abs(e.y-(530-g.shadowSpeed(.02)*.02))<1e-8);
  for(let left=lives-1;left>=0;left--){
   Object.assign(e,{x:s.player.x,y:s.player.y,vx:0,vy:0});g.update(.01);assert.equal(s.player.lives,left);assert.equal(g.get().invulnerable,immunity);
   if(left){Object.assign(e,{x:1000,y:500,vx:0,vy:0});const opacity=g.heroOpacity();tick(.15);assert.notEqual(g.heroOpacity(),opacity);tick(immunity-.17);Object.assign(e,{x:s.player.x,y:s.player.y,vx:0,vy:0});g.update(.01);assert.equal(s.player.lives,left);Object.assign(e,{x:1000,y:500,vx:0,vy:0});tick(.03);}
  }
  assert.equal(g.get().state,'lost');assert.equal((elements.get('lives').textContent.match(/♡/g)||[]).length,lives);
  elements.get('start').onclick();assert.equal(g.get().state,'menu');assert.equal(elements.get('modePicker').hidden,false);
 });
 test(`${mode}: real winning route and return to difficulty selection`,()=>{choose();winningRoute();elements.get('start').onclick();assert.equal(g.get().state,'menu');assert.equal(elements.get('modePicker').hidden,false);});
 test(`${mode}: timeout and restart into the other mode`,()=>{
  choose();g.get().enemies.length=0;tick(120.1);assert.equal(g.get().state,'lost');elements.get('start').onclick();
  g.selectMode(mode==='training'?'normal':'training');elements.get('start').onclick();const s=g.get();assert.equal(s.player.lives,mode==='training'?3:5);assert.equal(s.remaining,120);assert.equal(s.player.bag,0);assert.equal(s.cooldown,0);assert.equal(s.invulnerable,0);assert.equal(s.dangerPulse,0);assert.equal(s.dangerCooldown,0);assert.ok(s.lamps.every(l=>!l.lit));assert.ok(s.sparks.every(p=>!p.taken));assert.equal(s.enemies.length,4);
 });
 test(`${mode}: pause preserves mode; restart opens selection`,()=>{
  choose();g.overlay('paused');g.selectMode(mode==='training'?'normal':'training');elements.get('start').onclick();assert.equal(g.get().activeMode,mode);assert.equal(g.get().player.lives,lives);
  g.overlay('paused');elements.get('restart').onclick();assert.equal(g.get().state,'menu');assert.equal(elements.get('modePicker').hidden,false);
  elements.get('start').onclick();assert.equal(g.get().activeMode,mode);assert.equal(g.get().remaining,120);
 });
}
test('Danger warning is short, rate limited, paused, and does not protect',()=>{
 const s=g.get();s.enemies.length=1;const e=s.enemies[0];
 Object.assign(e,{x:60,y:560});g.update(.01);assert.ok(g.get().dangerPulse>0);assert.equal(s.player.lives,3);assert.equal(g.get().invulnerable,0);
 capture=true;drawCalls.length=0;frame(700);capture=false;assert.ok(drawCalls.some(c=>c[0]==='fillText'&&c[1]==='ТЕНЬ РЯДОМ'));
 g.overlay('paused');const pulse=g.get().dangerPulse;frame(740);assert.equal(g.get().dangerPulse,pulse);g.resume();
 for(let i=0;i<30;i++){Object.assign(e,{x:60,y:555});g.update(.02);}assert.equal(g.get().dangerPulse,0);assert.ok(g.get().dangerCooldown>0);
 Object.assign(e,{x:60,y:490});g.update(.01);assert.equal(s.player.lives,2,'warning grants no protection');assert.equal(g.get().dangerPulse,0);
 g.start();const fresh=g.get();fresh.enemies.length=1;Object.assign(fresh.player,{x:60,y:60,bag:1});g.light();Object.assign(fresh.enemies[0],{x:60,y:125});g.update(.01);assert.equal(g.get().dangerPulse,0,'no warning inside safe zone');
});
console.log(`\n${checks} checks passed.`);
