/* Последний фонарь — автономная Canvas-игра, без загрузок и зависимостей. */
(() => {
  'use strict';
  const W=1200,H=760,SAFE=105,SPEED=180;
  // Visual scale is independent of collision radii to preserve the existing routes.
  const HERO_SCALE=1.5,SHADOW_SCALE=1.3,SHADOW_SPEED_FACTOR=.85;
  const HIT_FLASH_SECONDS=.24,IGNITION_SECONDS=.8,BURST_SECONDS=.7;
  const MODES={normal:{name:'Обычная игра',lives:3,speed:1,immunity:3},training:{name:'Обучение',lives:5,speed:.8,immunity:4}};
  let selectedMode='normal',activeMode='normal';
  const settings=()=>MODES[activeMode];
  let dangerPulse=0,dangerCooldown=0;
  const buildings=[];
  for(const x of [100,380,660,940]) for(const y of [100,340,580]) buildings.push({x,y,w:160,h:100});
  const lampPositions=[[60,60],[600,60],[1140,60],[320,300],[880,300],[60,720],[1140,720]];
  const sparkPositions=[[60,390],[60,270],[320,490],[320,60],[600,260],[880,60],[1140,260],[880,490],[600,720],[320,720],[1140,500],[880,720],[600,490],[60,720]];
  const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
  const ui=Object.fromEntries(['time','lives','sparks','lamps','pause','overlay','eyebrow','title','description','intro','start','restart','tip','hint','flashLabel','flashBar'].map(id=>[id,document.getElementById(id)]));
  const Art=typeof module!=='undefined'&&module.exports?require('./scenery.js'):window.LanternArt;
  const art=new Art(ctx,buildings,W,H);
  const sound=typeof module!=='undefined'&&module.exports?new (require('./sound.js').LanternSound)(window):window.lanternSound;
  // Touch joystick axis from mobile.js. Keyboard keeps priority; both clear together.
  const touchAxis={x:0,y:0};const touchUI=document.documentElement.classList.contains('mobile');
  function setAxis(x,y){const len=Math.hypot(x,y);if(!Number.isFinite(len)||len<1e-6){touchAxis.x=0;touchAxis.y=0;return;}touchAxis.x=x/len;touchAxis.y=y/len;}
  const keys=new Set();const clearInput=()=>{keys.clear();touchAxis.x=0;touchAxis.y=0;};let state='menu',player,lamps,sparks,enemies,particles,remaining,cooldown,invulnerable,burst,burstOrigin,hitFlash,elapsed=0,last=0;
  function reset(){art.reset();sound.resetMusic();player={x:60,y:490,r:12,bag:0,lives:settings().lives};lamps=lampPositions.map(([x,y])=>({x,y,lit:false,ignition:0}));sparks=sparkPositions.map(([x,y],i)=>({x,y,t:i*.9,taken:false}));enemies=[[600,390],[1090,710],[880,250],[310,220]].map(([x,y],i)=>({x,y,r:14,vx:0,vy:0,phase:i*2}));dangerPulse=0;dangerCooldown=0;particles=[];remaining=120;cooldown=0;invulnerable=0;burst=0;burstOrigin=null;hitFlash=0;elapsed=0;navClock=0;field=[];clearInput();updateUI();}
  const modePicker=document.getElementById('modePicker'),modeSelect=document.getElementById('modeSelect'),modeDetails=document.getElementById('modeDetails');
  function selectMode(value){if(state!=='menu'||!Object.hasOwn(MODES,value))return;selectedMode=value;activeMode=value;player.lives=settings().lives;updateUI();modeSelect.value=value;modeDetails.textContent=`Выбрано: ${MODES[value].name} · ${MODES[value].lives} ${value==='training'?'жизней':'жизни'} · защита ${MODES[value].immunity} сек.`;ui.intro.innerHTML=`<span><b>7</b> фонарей</span><span><b>120</b> секунд</span>`;}
  let startToken=0,previewPaused=false;
  function showMenu(){previewPaused=false;startToken++;sound.stopDiagnostic();sound.setScene('menu');state='menu';activeMode=selectedMode;reset();ui.start.disabled=false;modeSelect.disabled=false;clearInput();ui.overlay.hidden=false;ui.pause.disabled=true;ui.intro.hidden=false;ui.restart.hidden=true;modePicker.hidden=false;ui.eyebrow.textContent='МАЛЕНЬКАЯ ИСТОРИЯ В БОЛЬШОМ ГОРОДЕ';ui.title.innerHTML='Последний<br><span>фонарь</span>';ui.description.textContent='Соберите искры и зажгите семь фонарей, пока ночь не забрала последний свет.';ui.start.textContent='Зажечь надежду →';ui.tip.textContent='Свет фонарей защищает от теней.';ui.hint.hidden=true;selectMode(selectedMode);}
  modeSelect.onchange=()=>selectMode(modeSelect.value);
  function start(){previewPaused=false;activeMode=selectedMode;reset();state='playing';sound.setScene('playing');ui.overlay.hidden=true;modePicker.hidden=true;ui.pause.disabled=false;canvas.focus();}
  async function requestStart(){
    if(state!=='menu')return;
    // resume() happens synchronously inside this click, before any await.
    sound.startRequestedAt=sound.host.performance?.now()??Date.now();const ready=sound.unlock(),token=++startToken;
    state='preparing';ui.start.disabled=true;modeSelect.disabled=true;ui.start.textContent='Подготовка звука…';
    if(sound.enabled&&sound.volume>0&&sound.available()&&!sound.failed){
      const work=(async()=>{if(!sound.recordings.loaded)await sound.prepare();if(sound.context?.state!=='running')await ready;})();
      // Mobile page: the round starts within a fixed budget; recordings attach later if still loading.
      const budget=sound.startBudgetMs;
      if(Number.isFinite(budget))await Promise.race([work,new Promise(resolve=>setTimeout(resolve,budget))]);else await work;
    }
    if(token!==startToken||state!=='preparing')return;
    ui.start.disabled=false;modeSelect.disabled=false;start();sound.beginRound();
    if(document.hidden||!sound.pageActive)overlay('paused');
  }
  function overlay(kind){sound.setScene(kind);if(kind==='won'||kind==='lost')sound.play(kind);state=kind;clearInput();ui.overlay.hidden=false;ui.intro.hidden=true;ui.restart.hidden=kind!=='paused';ui.pause.disabled=true;
    modePicker.hidden=true;
    ui.eyebrow.textContent=kind==='paused'?'ГОРОД ПОДОЖДЁТ':kind==='won'?'НОЧЬ ОТСТУПИЛА':'СВЕТ ЕЩЁ МОЖНО ВЕРНУТЬ';
    ui.title.textContent=kind==='paused'?'Тихая пауза':kind==='won'?'Город снова светит':'Последняя искра';
    ui.description.textContent=kind==='paused'?'Сделайте вдох. Ваше время и весь город замерли.':kind==='won'?`Вы зажгли все семь фонарей за ${Math.ceil(120-remaining)} сек. В окнах снова появился свет.`:player.lives===0?'Тени настигли вас. Держитесь ближе к свету и используйте вспышку, когда они подойдут.':'Время истекло. Собирайте искры по пути и зажигайте фонари, чтобы открыть безопасные убежища.';
    ui.start.textContent=kind==='paused'?'Продолжить →':'Попробовать снова →';ui.tip.textContent=kind==='won'?'Даже одна искра может изменить ночь.':touchUI?'Джойстик — движение · Зажечь · Вспышка':'WASD — движение · E — фонарь · Пробел — вспышка';ui.hint.hidden=true;
  }
  function resume(){previewPaused=false;state='playing';sound.setScene('playing');ui.overlay.hidden=true;ui.pause.disabled=false;clearInput();}
  sound.onPreviewRequest=()=>{if(state==='playing'){previewPaused=true;overlay('paused');}};
  sound.onPreviewEnd=()=>{if(previewPaused&&state==='paused'&&!document.hidden){previewPaused=false;resume();}else previewPaused=false;};
  ui.start.onclick=()=>{if(state==='preparing')return;if(state==='paused'){sound.stopDiagnostic();sound.recordings.stopAll();previewPaused=false;void sound.unlock();resume();}else if(state==='menu')return requestStart();else showMenu();};ui.restart.onclick=showMenu;ui.pause.onclick=()=>{if(state==='playing')overlay('paused');};
  const movement=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'];
  window.addEventListener('keydown',e=>{if([...movement,'Space','KeyE','Escape'].includes(e.code))e.preventDefault();if(e.code==='Escape'&&!e.repeat){if(state==='playing')overlay('paused');else if(state==='paused')resume();return;}if(state!=='playing')return;keys.add(e.code);if(!e.repeat&&e.code==='KeyE')light();if(!e.repeat&&e.code==='Space')flash();});
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{clearInput();if(state==='playing')overlay('paused');});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')overlay('paused');});
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function blocked(x,y,r){return x<r||x>W-r||y<r||y>H-r||buildings.some(b=>Math.hypot(x-Math.max(b.x,Math.min(x,b.x+b.w)),y-Math.max(b.y,Math.min(y,b.y+b.h)))<r);}
  function safeAt(x,y){return lamps.some(l=>l.lit&&Math.hypot(x-l.x,y-l.y)<SAFE);}
  // Audio-only proximity check. It never alters collision, pursuit or invulnerability.
  function updateSoundThreat(){
    const inLight=safeAt(player.x,player.y),protectedPlayer=state!=='playing'||invulnerable>0||inLight;let nearest=Infinity,pan=0;
    if(state==='playing')for(const e of enemies){const d=distance(e,player);if(d>=210||d>=nearest||safeAt(e.x,e.y))continue;
      let visible=true;const samples=Math.ceil(d/10);for(let i=1;i<samples;i++)if(blocked(player.x+(e.x-player.x)*i/samples,player.y+(e.y-player.y)*i/samples,0.1)){visible=false;break;}
      if(visible){nearest=d;pan=(e.x-player.x)/Math.max(1,d)*.55;}
    }
    sound.setThreat(nearest,protectedPlayer,pan,inLight);
  }
  function move(o,dx,dy,avoidLight=false){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/5));for(let i=0;i<steps;i++){let x=o.x+dx/steps,y=o.y+dy/steps;if(!blocked(x,o.y,o.r)&&(!avoidLight||!safeAt(x,o.y)))o.x=x;if(!blocked(o.x,y,o.r)&&(!avoidLight||!safeAt(o.x,y)))o.y=y;}}
  function emit(x,y,n,color){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=25+Math.random()*100;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,color});}}
  function expel(e,l){let a=Math.atan2(e.y-l.y,e.x-l.x);for(let k=0;k<64;k++){let angle=a+k*Math.PI*2/64,x=l.x+Math.cos(angle)*(SAFE+18),y=l.y+Math.sin(angle)*(SAFE+18);if(!blocked(x,y,e.r)&&!safeAt(x,y)){e.x=x;e.y=y;return;}}}
  function light(){const l=lamps.find(l=>!l.lit&&distance(l,player)<52);if(!l||player.bag<1)return;l.lit=true;l.ignition=IGNITION_SECONDS;player.bag--;sound.setLanternCount(lamps.filter(l=>l.lit).length);sound.play('lamp');emit(l.x,l.y,45,'#f7ce77');for(const e of enemies)if(distance(e,l)<SAFE+16)expel(e,l);updateSoundThreat();updateUI();if(lamps.every(l=>l.lit))overlay('won');}
  function flash(){if(cooldown>0)return;sound.play('flash');cooldown=8;burst=BURST_SECONDS;burstOrigin={x:player.x,y:player.y};emit(player.x,player.y,85,'#ffe4a4');for(const e of enemies){let d=distance(e,player);if(d<195){const a=Math.atan2(e.y-player.y,e.x-player.x);e.vx=Math.cos(a)*450;e.vy=Math.sin(a)*450;}}}
  // Navigation grid: breadth-first field prevents shadows getting stuck behind houses.
  const CELL=20,COLS=W/CELL,ROWS=H/CELL;let field=[],navClock=0;
  function navigation(){field=new Int16Array(COLS*ROWS).fill(-1);const sx=Math.floor(player.x/CELL),sy=Math.floor(player.y/CELL),queue=[sy*COLS+sx];field[queue[0]]=0;for(let head=0;head<queue.length;head++){const id=queue[head],x=id%COLS,y=Math.floor(id/COLS);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){let nx=x+dx,ny=y+dy,ni=ny*COLS+nx;if(nx<0||nx>=COLS||ny<0||ny>=ROWS||field[ni]>=0||blocked(nx*CELL+10,ny*CELL+10,15))continue;field[ni]=field[id]+1;queue.push(ni);}}}
  const shadowSpeed=t=>(72+Math.min(t*.2,22))*SHADOW_SPEED_FACTOR*settings().speed;
  const heroOpacity=()=>invulnerable>0&&Math.floor((settings().immunity-invulnerable)*10)%2===0?.25:1;
  function updateDanger(dt){
    dangerPulse=Math.max(0,dangerPulse-dt);dangerCooldown=Math.max(0,dangerCooldown-dt);
    if(invulnerable>0||safeAt(player.x,player.y)){dangerPulse=0;return;}
    const close=enemies.some(e=>distance(e,player)<72);
    if(!close){dangerPulse=0;return;}
    if(dangerCooldown===0){dangerPulse=.45;dangerCooldown=2.5;}
  }
  function updateEffects(dt){burst=Math.max(0,burst-dt);hitFlash=Math.max(0,hitFlash-dt);for(const l of lamps)l.ignition=Math.max(0,l.ignition-dt);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);}
  function update(dt){elapsed+=dt;remaining=Math.max(0,remaining-dt);cooldown=Math.max(0,cooldown-dt);invulnerable=Math.max(0,invulnerable-dt);updateEffects(dt);let dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),dy=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));if(!dx&&!dy){dx=touchAxis.x;dy=touchAxis.y;}const len=Math.hypot(dx,dy)||1;const oldX=player.x,oldY=player.y;move(player,dx/len*SPEED*dt,dy/len*SPEED*dt);sound.walk(Math.hypot(player.x-oldX,player.y-oldY));
    for(const s of sparks)if(!s.taken&&distance(s,player)<25){s.taken=true;player.bag++;sound.play('spark');emit(s.x,s.y,12,'#edc878');}
    navClock-=dt;if(navClock<=0){navigation();navClock=.25;}
    for(const e of enemies){if(safeAt(e.x,e.y)){const l=lamps.find(l=>l.lit&&distance(e,l)<SAFE);expel(e,l);}let tx=player.x,ty=player.y;const ix=Math.floor(e.x/CELL),iy=Math.floor(e.y/CELL);let best=field[iy*COLS+ix];if(distance(e,player)>45){for(const [ox,oy] of [[0,1],[1,0],[-1,0],[0,-1]]){const nx=ix+ox,ny=iy+oy;if(nx<0||nx>=COLS||ny<0||ny>=ROWS)continue;const f=field[ny*COLS+nx];if(f>=0&&(best<0||f<best)){best=f;tx=nx*CELL+10;ty=ny*CELL+10;}}}const a=Math.atan2(ty-e.y,tx-e.x),speed=shadowSpeed(elapsed);move(e,(Math.cos(a)*speed+e.vx)*dt,(Math.sin(a)*speed+e.vy)*dt,true);e.vx*=Math.exp(-5*dt);e.vy*=Math.exp(-5*dt);if(distance(e,player)<25&&invulnerable<=0&&!safeAt(player.x,player.y)){player.lives--;sound.play('hit');invulnerable=settings().immunity;hitFlash=HIT_FLASH_SECONDS;emit(player.x,player.y,28,'#ffd6c2');e.vx=-Math.cos(a)*260;e.vy=-Math.sin(a)*260;if(player.lives===0){overlay('lost');break;}}}
    updateDanger(dt);if(remaining<=0&&state==='playing')overlay('lost');updateSoundThreat();updateUI();}
  function updateUI(){const t=Math.ceil(remaining);ui.time.textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;ui.time.classList.toggle('urgent',remaining<25);ui.lives.textContent='♥ '.repeat(player.lives)+'♡ '.repeat(settings().lives-player.lives);ui.sparks.textContent='✦ '+player.bag;ui.lamps.innerHTML=lamps.filter(l=>l.lit).length+' <em>/ 7</em>';ui.flashLabel.textContent=cooldown>0?`ЕЩЁ ${cooldown.toFixed(1)} СЕК`:touchUI?'ГОТОВА':'ПРОБЕЛ · ГОТОВА';ui.flashBar.style.width=(1-cooldown/8)*100+'%';const l=lamps.find(l=>!l.lit&&distance(l,player)<52);ui.hint.hidden=state!=='playing'||!l;ui.hint.textContent=player.bag?(touchUI?'Зажечь фонарь · 1 искра':'E · Зажечь фонарь · 1 искра'):'Нужна искра · ищите золотые огоньки';}
  function glow(x,y,r,color){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
  function circle(x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  function ring(x,y,r,color,width=2){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  // Cache large translucent gradients. Only animation opacity changes each frame.
  const lampTexture=document.createElement('canvas');lampTexture.width=320;lampTexture.height=320;
  const lightCtx=lampTexture.getContext('2d');
  const halo=lightCtx.createRadialGradient(160,160,0,160,160,150);halo.addColorStop(0,'#f2b74e55');halo.addColorStop(1,'transparent');lightCtx.fillStyle=halo;lightCtx.fillRect(0,0,320,320);
  const pool=lightCtx.createRadialGradient(160,160,0,160,160,SAFE);pool.addColorStop(0,'#ffdb876e');pool.addColorStop(.65,'#edb55245');pool.addColorStop(.96,'#dba24929');pool.addColorStop(1,'#dba24918');lightCtx.fillStyle=pool;lightCtx.beginPath();lightCtx.arc(160,160,SAFE,0,Math.PI*2);lightCtx.fill();
  const vignetteTexture=document.createElement('canvas');vignetteTexture.width=W;vignetteTexture.height=H;
  const vignetteCtx=vignetteTexture.getContext('2d'),edge=vignetteCtx.createRadialGradient(W/2,H/2,180,W/2,H/2,760);edge.addColorStop(0,'transparent');edge.addColorStop(1,'#040a1588');vignetteCtx.fillStyle=edge;vignetteCtx.fillRect(0,0,W,H);
  function drawLampLight(l){
    ctx.save();
    const pulse=l.ignition/IGNITION_SECONDS;
    const warmth=.12+.88*(1-pulse*pulse);
    ctx.globalAlpha=warmth;
    ctx.drawImage(lampTexture,l.x-160,l.y-160);
    ctx.globalAlpha=1;
    // This permanent ring always marks the actual gameplay boundary.
    ring(l.x,l.y,SAFE,'#f5cf8720',5);
    ring(l.x,l.y,SAFE,'#f5cf8799',2);
    ctx.shadowBlur=0;
    if(pulse>0){ring(l.x,l.y,SAFE*(1-(pulse*pulse)),`rgba(255,230,175,${pulse})`,3);}
    ctx.restore();
  }
  function drawShadow(e,t){art.creature(e,t);}
  function drawHero(){art.traveler(player,heroOpacity());}
  function drawBurst(){
    if(burst<=0||!burstOrigin)return;
    const fade=burst/BURST_SECONDS,progress=1-fade,radius=195*(1-fade*fade),{x,y}=burstOrigin;
    ctx.save();glow(x,y,195,`rgba(255,226,155,${fade*.55})`);
    circle(x,y,radius,`rgba(255,224,151,${fade*.1})`);
    ctx.shadowColor='#ffe8ab';ctx.shadowBlur=18;
    ring(x,y,radius,`rgba(255,236,189,${fade})`,3+fade*8);
    ring(x,y,Math.max(0,radius-18*progress),`rgba(255,207,110,${fade*.65})`,2);
    ctx.shadowBlur=0;ctx.lineWidth=1.5;ctx.strokeStyle=`rgba(255,229,173,${fade*.65})`;ctx.beginPath();
    for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.moveTo(x+Math.cos(a)*radius*.76,y+Math.sin(a)*radius*.76);ctx.lineTo(x+Math.cos(a)*radius,y+Math.sin(a)*radius);}ctx.stroke();
    ctx.restore();
  }
  function draw(t){art.ground(lamps);
    for(const l of lamps){if(l.lit)drawLampLight(l);art.lamp(l,lamps.indexOf(l));}
    for(const s of sparks)if(!s.taken){let y=s.y+Math.sin(t*2+s.t)*4;glow(s.x,y,25,'#f3c36744');ctx.save();ctx.translate(s.x,y);ctx.rotate(Math.PI/4);ctx.fillStyle='#f7d98a';ctx.fillRect(-4,-4,8,8);ctx.restore();}
    for(const e of enemies)drawShadow(e,t);
    drawHero();drawBurst();
    art.particles(particles);art.weather();
    ctx.drawImage(vignetteTexture,0,0);
    if(state==='playing'&&dangerPulse>0){ctx.save();ctx.globalAlpha=Math.sin(Math.PI*dangerPulse/.45);ring(player.x,player.y,31,'#e9ad81',2);ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.fillStyle='#ffd4af';ctx.fillText('ТЕНЬ РЯДОМ',player.x,Math.max(15,player.y-43));ctx.restore();}
    if(hitFlash>0){ctx.save();const fade=hitFlash/HIT_FLASH_SECONDS;ctx.fillStyle=`rgba(255,155,124,${fade*.16})`;ctx.fillRect(0,0,W,H);glow(player.x,player.y,90,`rgba(255,227,212,${fade*.8})`);ring(player.x,player.y,24+(1-fade)*40,`rgba(255,195,168,${fade})`,4);ctx.restore();}
  }
  function frame(ms){const dt=Math.max(0,Math.min((ms-last)/1000,.04));last=ms;if(state==='playing')update(dt);else if(state==='won'||state==='lost')updateEffects(dt);if(state!=='paused')art.advance(dt,player,state==='playing');sound.tick();draw(art.clock);requestAnimationFrame(frame);}
  reset();showMenu();requestAnimationFrame(frame);
  // Read-only geometry plus actions for the local regression test runner.
  const api={buildings,lampPositions,sparkPositions,blocked,start,update,light,flash,overlay,resume,keys,sound,updateSoundThreat,shadowSpeed,heroOpacity,showMenu,selectMode,setAxis,touchAxis,requestStart,get:()=>({state,player,lamps,sparks,enemies,remaining,cooldown,invulnerable,burst,burstOrigin,hitFlash,selectedMode,activeMode,dangerPulse,dangerCooldown})};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.lanternGame=api;
})();







