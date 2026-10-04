/* Browser-level checks in real Chromium: mobile layout + touch, desktop regression.
   Requires Playwright (npm i -g playwright) and a static server on BASE (default http://127.0.0.1:8011).
   Run from the project root:  node tests/browser/e2e.js
   Screenshots are written to tests/browser/shots/ (ignored by git). */
const {chromium,devices}=require('playwright');const path=require('path'),fs=require('fs');
const EXE=process.env.CHROME_PATH||undefined;const BASE=process.env.BASE||'http://127.0.0.1:8011';
const SHOTS=path.join(__dirname,'shots');fs.mkdirSync(SHOTS,{recursive:true});const shot=name=>path.join(SHOTS,name);
const results=[];const check=(name,ok,info)=>{results.push({name,ok:Boolean(ok),info});console.log((ok?'PASS':'FAIL')+' '+name+(info!==undefined?' '+JSON.stringify(info):''));};
async function open(browser,{w,h,mobile,suffix='',safe}){
  const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,hasTouch:mobile,isMobile:mobile,userAgent:mobile?devices['iPhone 13'].userAgent:undefined});
  const page=await ctx.newPage();const logs=[];page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')logs.push(m.type()+': '+m.text());});page.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
  await page.goto(BASE+'/index.html'+suffix,{waitUntil:'load'});
  await page.waitForFunction(()=>document.getElementById('start').dataset.bootState,{timeout:40000});
  if(safe)await page.addStyleTag({content:`html.mobile{--sal:${safe}px;--sar:${safe}px;--sab:21px}`});
  return {ctx,page,logs};
}
const state=page=>page.evaluate(()=>window.lanternGame.get());
const noScroll=page=>page.evaluate(()=>{const se=document.scrollingElement;return se.scrollWidth<=innerWidth&&se.scrollHeight<=innerHeight&&document.body.scrollWidth<=innerWidth&&document.body.scrollHeight<=innerHeight;});
async function touchDrag(page,from,to,steps=8,hold=300){
  const cdp=await page.context().newCDPSession(page);
  const tp=(x,y)=>({x,y,radiusX:8,radiusY:8,force:1,id:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tp(from.x,from.y)]});
  for(let i=1;i<=steps;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[tp(from.x+(to.x-from.x)*i/steps,from.y+(to.y-from.y)*i/steps)]});await page.waitForTimeout(16);}
  await page.waitForTimeout(hold);
  return {end:async()=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();},cdp};
}
(async()=>{
  const browser=await chromium.launch(EXE?{executablePath:EXE}:{});
  // ---- Mobile landscape (iPhone 13 class) ----
  {
    const {page,logs}=await open(browser,{w:844,h:390,mobile:true,suffix:'?mobile',safe:59});
    check('mobile: html.mobile set',await page.evaluate(()=>document.documentElement.classList.contains('mobile')));
    check('mobile: audio-data.js never requested',!(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('audio-data.js')))));
    check('mobile: no page scroll (menu)',await noScroll(page));
    const bootMs=await page.evaluate(()=>performance.now());check('mobile: boot ready quickly',bootMs<8000,{bootMs:Math.round(bootMs)});
    await page.screenshot({path:shot('e2e-m-menu.png')});
    const overlayFits=await page.evaluate(()=>{const o=document.getElementById('overlay'),c=o.querySelector('.card').getBoundingClientRect();return {fits:c.bottom<=innerHeight+1&&c.top>=0,top:Math.round(c.top),bottom:Math.round(c.bottom)};});
    check('mobile: menu card fits landscape screen',overlayFits.fits,overlayFits);
    await page.tap('#start');const t0=Date.now();
    await page.waitForFunction(()=>window.lanternGame.get().state==='playing',{timeout:6000}).catch(()=>{});
    check('mobile: round starts after tap within budget',(await state(page)).state==='playing',{ms:Date.now()-t0});
    await page.waitForTimeout(400);
    check('mobile: controls visible while playing',await page.evaluate(()=>!document.getElementById('touchControls').hidden));
    const geo=await page.evaluate(()=>{const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)];};return {canvas:r('game'),flash:r('touchFlash'),ignite:r('touchIgnite'),zone:r('stickZone'),hud:r('pause')};});
    // canvas drawn region (object-fit contain) inside the element box
    const drawn=await page.evaluate(()=>{const b=document.getElementById('game').getBoundingClientRect();const s=Math.min(b.width/1200,b.height/760);const w=1200*s,h=760*s;return [Math.round(b.left+(b.width-w)/2),Math.round(b.top+(b.height-h)/2),Math.round(b.left+(b.width+w)/2),Math.round(b.top+(b.height+h)/2)];});
    check('mobile: action buttons outside the drawn map',geo.flash[0]>=drawn[2]-2&&geo.ignite[0]>=drawn[2]-2,{drawn,flash:geo.flash,ignite:geo.ignite});
    check('mobile: buttons inside safe area (59px)',geo.flash[2]<=844-59&&geo.ignite[2]<=844-59&&geo.flash[3]<=390-21,geo.flash);
    check('mobile: touch targets >= 44px',geo.flash[2]-geo.flash[0]>=44&&geo.ignite[2]-geo.ignite[0]>=44);
    const before=await state(page);
    const drag=await touchDrag(page,{x:110,y:250},{x:150,y:250},6,500);
    const mid=await state(page);
    check('mobile: joystick drag right moves hero',mid.player.x>before.player.x+30,{from:Math.round(before.player.x),to:Math.round(mid.player.x)});
    check('mobile: joystick base shown at touch point',await page.evaluate(()=>!document.getElementById('stickBase').hidden));
    await page.screenshot({path:shot('e2e-m-play-stick.png')});
    await drag.end();await page.waitForTimeout(120);const after=await state(page);await page.waitForTimeout(200);const after2=await state(page);
    check('mobile: hero stops after release',Math.abs(after2.player.x-after.player.x)<1&&(await page.evaluate(()=>window.lanternGame.touchAxis.x===0)),{dx:after2.player.x-after.player.x});
    // diagonal 360°: up-left
    const d2=await touchDrag(page,{x:150,y:300},{x:120,y:270},6,400);const diag=await state(page);await d2.end();
    check('mobile: joystick diagonal (up-left) moves on both axes',diag.player.x<after2.player.x-5&&diag.player.y<after2.player.y-5,{dx:Math.round(diag.player.x-after2.player.x),dy:Math.round(diag.player.y-after2.player.y)});
    // flash while moving: second touch point
    {
      const cdp=await page.context().newCDPSession(page);const tp=(x,y,id)=>({x,y,radiusX:8,radiusY:8,force:1,id});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tp(120,250,1)]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[tp(160,250,1)]});await page.waitForTimeout(100);
      const sx=(await state(page)).player.x;
      const f=geo.flash;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tp(160,250,1),tp((f[0]+f[2])/2,(f[1]+f[3])/2,2)]});
      await page.waitForTimeout(60);const s2=await state(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[tp(160,250,1)]});await page.waitForTimeout(150);const s3=await state(page);
      check('mobile: flash fires while joystick held (multitouch)',s2.cooldown>7&&s3.player.x>sx+5,{cooldown:s2.cooldown,moved:Math.round(s3.player.x-sx)});
      await page.screenshot({path:shot('e2e-m-play-flash.png')});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    }
    // ignite: teleport hero next to lamp with a spark, tap ignite
    await page.evaluate(()=>{const s=window.lanternGame.get();s.player.bag=1;s.player.x=60;s.player.y=100;});await page.waitForTimeout(50);
    await page.tap('#touchIgnite');await page.waitForTimeout(50);
    check('mobile: ignite button lights the lamp',(await state(page)).lamps[0].lit);
    // pause via HUD, controls hidden, resume via card
    await page.tap('#pause');await page.waitForTimeout(50);
    check('mobile: pause from HUD',(await state(page)).state==='paused'&&(await page.evaluate(()=>document.getElementById('touchControls').hidden)));
    await page.screenshot({path:shot('e2e-m-pause.png')});
    await page.tap('#touchSound');await page.waitForTimeout(50);
    check('mobile: sound panel opens in pause card',await page.evaluate(()=>!document.getElementById('touchSoundPanel').hidden&&document.getElementById('touchSoundPanel').querySelector('#soundToggle')!==null));
    const pauseFits=await page.evaluate(()=>{const c=document.querySelector('.card').getBoundingClientRect();return {fits:c.bottom<=innerHeight+1,bottom:Math.round(c.bottom)};});
    check('mobile: pause card with sound panel fits landscape screen',pauseFits.fits,pauseFits);
    await page.screenshot({path:shot('e2e-m-pause-sound.png')});
    await page.tap('#start');await page.waitForTimeout(50);
    check('mobile: resume from pause card',(await state(page)).state==='playing');
    // background/visibility: emulate hidden → paused and axis reset
    const d3=await touchDrag(page,{x:120,y:250},{x:160,y:250},4,100);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForTimeout(50);
    check('mobile: hidden page pauses and clears joystick',(await state(page)).state==='paused'&&(await page.evaluate(()=>window.lanternGame.touchAxis.x===0&&document.getElementById('stickBase').hidden)));
    await d3.end().catch(()=>{});
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
    // rotate to portrait while paused → rotate notice
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
    check('mobile: portrait shows rotate notice while round active',await page.evaluate(()=>!document.getElementById('rotateNotice').hidden));
    check('mobile: no page scroll (portrait)',await noScroll(page));
    await page.screenshot({path:shot('e2e-m-rotate.png')});
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(150);
    check('mobile: back to landscape hides notice, stays paused',await page.evaluate(()=>document.getElementById('rotateNotice').hidden)&&(await state(page)).state==='paused');
    await page.tap('#restart');await page.waitForTimeout(50);
    check('mobile: restart returns to menu',(await state(page)).state==='menu');
    const audio=await page.evaluate(()=>({ctx:window.lanternSound.context.state,buffers:Object.keys(window.lanternSound.recordings.buffers).sort(),failed:[...window.lanternSound.recordings.failed].sort(),sources:Object.fromEntries(Object.entries(window.lanternSound.recordings.metrics).map(([k,v])=>[k,v.source||v.error]))}));
    check('mobile: AudioContext running after tap',audio.ctx==='running');
    check('mobile: recordings loaded (Chromium build has no AAC → Ogg fallbacks; light has none)',audio.buffers.join()==='attack1,attack2,dark,near'&&audio.failed.join()==='light',audio);
    check('mobile: no page errors',logs.filter(l=>l.startsWith('PAGEERROR')).length===0,logs);
    await page.context().close();
  }
  // ---- Mobile: all audio files fail (offline assets) → game must still start ----
  {
    const ctx=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true,isMobile:true,userAgent:devices['iPhone 13'].userAgent});
    const page=await ctx.newPage();await page.route('**/assets/audio/mobile/**',r=>r.abort());
    await page.goto('http://127.0.0.1:8011/index.html?mobile',{waitUntil:'load'});await page.waitForFunction(()=>document.getElementById('start').dataset.bootState,{timeout:30000});
    const t=Date.now();await page.tap('#start');await page.waitForFunction(()=>window.lanternGame.get().state==='playing',{timeout:6000}).catch(()=>{});
    const st=await state(page);check('mobile offline audio: round starts with synth fallback',st.state==='playing',{ms:Date.now()-t});
    await page.waitForTimeout(300);
    check('mobile offline audio: procedural music scheduled',await page.evaluate(()=>window.lanternSound.musicVoices.size>0||window.lanternSound.recordings.musicVoice!==null));
    check('mobile offline audio: no technical notice shown to the player',await page.evaluate(()=>document.getElementById('loadNotice').textContent===''&&getComputedStyle(document.getElementById('soundStatus')).display==='none'));
    await ctx.close();
  }
  // ---- Mobile: slow audio (stalled responses) → start within ~2.5 s, late attach ----
  {
    const ctx=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true,isMobile:true,userAgent:devices['iPhone 13'].userAgent});
    const page=await ctx.newPage();let release;const gate=new Promise(r=>release=r);
    // The light track's original WAV is taken from the desktop pack (base64) so this file is self-contained.
    const packSrc=fs.readFileSync(path.join(__dirname,'..','..','assets','audio','audio-data.js'),'latin1');const packJson=packSrc.slice(packSrc.indexOf('{'),packSrc.lastIndexOf('}')+1);
    const wav=Buffer.from(JSON.parse(packJson).light.data,'base64');
    // This Chromium build cannot decode AAC: the light track is served as the original WAV so the late-attach path is exercised.
    await page.route('**/assets/audio/mobile/**',async r=>{await gate;if(r.request().url().endsWith('light.m4a'))await r.fulfill({contentType:'audio/wav',body:wav});else await r.continue();});
    await page.goto('http://127.0.0.1:8011/index.html?mobile',{waitUntil:'load'});await page.waitForFunction(()=>document.getElementById('start').dataset.bootState,{timeout:30000});
    const t=Date.now();await page.tap('#start');await page.waitForFunction(()=>window.lanternGame.get().state==='playing',{timeout:8000}).catch(()=>{});
    const ms=Date.now()-t;check('mobile slow audio: round starts within budget (≤ ~3 s)',(await state(page)).state==='playing'&&ms<3500,{ms});
    release();await page.waitForFunction(()=>window.lanternSound.recordings.loaded,{timeout:20000}).catch(()=>{});
    await page.waitForTimeout(300);await page.evaluate(()=>window.lanternSound.tick());
    check('mobile slow audio: recordings attach late and recorded music takes over',await page.evaluate(()=>window.lanternSound.recordings.loaded&&window.lanternSound.recordings.musicKey==='dark'&&window.lanternSound.recordings.musicVoice!==null),await page.evaluate(()=>({loaded:window.lanternSound.recordings.loaded,key:window.lanternSound.recordings.musicKey,buffers:Object.keys(window.lanternSound.recordings.buffers)})));
    await ctx.close();
  }
  // ---- Desktop regression ----
  // 1920x1080 scrolls on the published v1.0 as well (baseline-scroll.js); it is reported, not asserted.
  for(const [w,h] of [[1024,768],[1280,720],[1366,768],[1440,900]]){
    const {page,logs}=await open(browser,{w,h,mobile:false});
    check(`desktop ${w}x${h}: not mobile`,await page.evaluate(()=>!document.documentElement.classList.contains('mobile')));
    check(`desktop ${w}x${h}: no scroll on menu`,await noScroll(page),await page.evaluate(()=>[document.scrollingElement.scrollWidth,document.scrollingElement.scrollHeight,innerWidth,innerHeight]));
    check(`desktop ${w}x${h}: touch controls and rotate notice not rendered`,await page.evaluate(()=>['touchControls','rotateNotice','touchSound','rotateTip'].every(id=>getComputedStyle(document.getElementById(id)).display==='none')));
    check(`desktop ${w}x${h}: footer audio controls in place`,await page.evaluate(()=>document.querySelector('footer .audio-controls')!==null&&getComputedStyle(document.querySelector('footer')).display!=='none'));
    await page.screenshot({path:shot(`e2e-d-${w}x${h}-menu.png`)});
    await page.click('#start');await page.waitForFunction(()=>window.lanternGame.get().state==='playing',{timeout:30000}).catch(()=>{});
    check(`desktop ${w}x${h}: round starts with audio pack`,(await state(page)).state==='playing',await page.evaluate(()=>({boot:document.getElementById('start').dataset.bootState,buffers:Object.keys(window.lanternSound.recordings.buffers).length})));
    await page.keyboard.down('KeyD');await page.waitForTimeout(300);await page.keyboard.up('KeyD');const s=await state(page);
    check(`desktop ${w}x${h}: keyboard moves hero`,s.player.x>90);
    await page.keyboard.press('Space');await page.waitForTimeout(30);check(`desktop ${w}x${h}: Space flashes`,(await state(page)).cooldown>7);
    await page.keyboard.press('Escape');await page.waitForTimeout(30);check(`desktop ${w}x${h}: Esc pauses`,(await state(page)).state==='paused');
    check(`desktop ${w}x${h}: no scroll while paused`,await noScroll(page));
    await page.screenshot({path:shot(`e2e-d-${w}x${h}-pause.png`)});
    await page.keyboard.press('Escape');await page.waitForTimeout(30);check(`desktop ${w}x${h}: Esc resumes`,(await state(page)).state==='playing');
    check(`desktop ${w}x${h}: flash label keeps keyboard hint`,await page.evaluate(()=>document.getElementById('flashLabel').textContent.includes('ПРОБЕЛ')||document.getElementById('flashLabel').textContent.includes('ЕЩЁ')));
    check(`desktop ${w}x${h}: no page errors`,logs.filter(l=>l.startsWith('PAGEERROR')).length===0,logs);
    await page.context().close();
  }
  await browser.close();
  const failed=results.filter(r=>!r.ok);console.log(`\n${results.length} checks, ${failed.length} failed`);process.exit(failed.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
