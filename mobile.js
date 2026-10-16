/* Mobile presentation: floating joystick, action buttons, orientation handling and lifecycle resets.
   Gameplay, speeds and the keyboard path live in game.js and are not changed here. */
(() => {
  'use strict';
  function setupMobile(doc,win,game){
    const el=id=>doc.getElementById(id);
    const controls=el('touchControls'),zone=el('stickZone'),base=el('stickBase'),knob=el('stickKnob');
    const flashButton=el('touchFlash'),igniteButton=el('touchIgnite'),flashRing=el('touchFlashRing');
    const rotate=el('rotateNotice'),rotateTip=el('rotateTip'),soundToggle=el('touchSound'),soundPanel=el('touchSoundPanel');
    const overlay=el('overlay'),pause=el('pause'),stage=el('stage'),fullscreen=el('fullscreen');
    const RADIUS=42,DEAD=8;
    let stick=null; // {id,x,y}
    const playing=()=>game.get().state==='playing';
    function layoutStick(dx,dy){const d=Math.hypot(dx,dy),k=d>RADIUS?RADIUS/d:1;knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;}
    function releaseStick(){if(stick!==null){try{if(zone.hasPointerCapture?.(stick.id))zone.releasePointerCapture(stick.id);}catch{}}stick=null;game.setAxis(0,0);base.hidden=true;knob.style.transform='';zone.classList.remove('active');}
    function clientPoint(e){const r=zone.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
    zone.addEventListener('pointerdown',e=>{
      if(stick!==null||!playing())return;e.preventDefault();
      const p=clientPoint(e);stick={id:e.pointerId,x:p.x,y:p.y};
      base.style.left=p.x+'px';base.style.top=p.y+'px';base.hidden=false;zone.classList.add('active');layoutStick(0,0);
      try{zone.setPointerCapture(e.pointerId);}catch{}
    });
    zone.addEventListener('pointermove',e=>{
      if(!stick||e.pointerId!==stick.id)return;e.preventDefault();if(!playing()){releaseStick();return;}
      const p=clientPoint(e),dx=p.x-stick.x,dy=p.y-stick.y,d=Math.hypot(dx,dy);
      layoutStick(dx,dy);
      if(d<DEAD)game.setAxis(0,0);else game.setAxis(dx,dy); // direction only: hero speed is fixed in game.js
    });
    const end=e=>{if(stick&&e.pointerId===stick.id)releaseStick();};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(type,end);
    // Action buttons: fire on press, independent of the joystick pointer.
    const press=(button,action)=>{
      button.addEventListener('pointerdown',e=>{e.preventDefault();if(!playing())return;button.classList.add('pressed');action();});
      for(const type of ['pointerup','pointercancel','pointerleave'])button.addEventListener(type,()=>button.classList.remove('pressed'));
      button.addEventListener('click',e=>e.preventDefault());
    };
    press(flashButton,()=>game.flash());press(igniteButton,()=>game.light());
    // Nothing on the stage may scroll, zoom, select or show a callout.
    // The overlay card may scroll vertically on very short screens; everything else is locked.
    stage.addEventListener('touchmove',e=>{if(!overlay.contains(e.target)||overlay.hidden)e.preventDefault();},{passive:false});
    for(const type of ['gesturestart','gesturechange'])doc.addEventListener(type,e=>e.preventDefault(),{passive:false});
    doc.addEventListener('dblclick',e=>{if(!overlay.contains(e.target))e.preventDefault();});
    controls.addEventListener('contextmenu',e=>e.preventDefault());
    // Any loss of input continuity stops the hero immediately.
    const reset=()=>{releaseStick();flashButton.classList.remove('pressed');igniteButton.classList.remove('pressed');};
    win.addEventListener('blur',reset);doc.addEventListener('visibilitychange',reset);
    win.addEventListener('pagehide',()=>{reset();if(playing())game.overlay('paused');});
    win.addEventListener('orientationchange',reset);
    // Orientation: landscape is the play orientation; portrait pauses and asks to rotate.
    const portraitQuery=win.matchMedia?win.matchMedia('(orientation: portrait)'):null;
    const isPortrait=()=>portraitQuery?portraitQuery.matches:win.innerHeight>win.innerWidth;
    function applyOrientation(){
      const portrait=isPortrait(),state=game.get().state;
      if(portrait&&state==='playing'){reset();game.overlay('paused');}
      rotate.hidden=!(portrait&&['playing','paused','preparing'].includes(game.get().state));
      rotateTip.hidden=!(portrait&&game.get().state==='menu');
      doc.documentElement.classList.toggle('portrait',portrait);
    }
    if(portraitQuery){if(portraitQuery.addEventListener)portraitQuery.addEventListener('change',applyOrientation);else if(portraitQuery.addListener)portraitQuery.addListener(applyOrientation);}
    win.addEventListener('resize',applyOrientation);
    // Sound settings live in the pause card: the footer controls are moved, not duplicated.
    const audioControls=doc.querySelector('.audio-controls');
    if(audioControls)soundPanel.appendChild(audioControls);
    soundToggle.addEventListener('click',()=>{const open=soundPanel.hidden;soundPanel.hidden=!open;soundToggle.setAttribute('aria-expanded',String(open));});
    // Fullscreen exists on Android; iOS hides the disabled button through CSS.
    if(fullscreen&&fullscreen.disabled)fullscreen.hidden=true;
    // Per-frame HUD sync: controls follow the state, the flash button shows the cooldown.
    let lastState=null;
    function frame(){
      const s=game.get();
      if(s.state!==lastState){lastState=s.state;controls.hidden=s.state!=='playing';controls.setAttribute('aria-hidden',String(s.state!=='playing'));if(s.state!=='playing')reset();soundToggle.hidden=!audioControls||!['menu','paused'].includes(s.state);if(!['menu','paused'].includes(s.state)){soundPanel.hidden=true;soundToggle.setAttribute('aria-expanded','false');}applyOrientation();}
      const ratio=Math.max(0,Math.min(1,1-s.cooldown/8));flashRing.style.setProperty('--cooldown',String(ratio));flashButton.classList.toggle('cooling',s.cooldown>0);
      igniteButton.classList.toggle('ready',s.state==='playing'&&s.player.bag>0&&s.lamps.some(l=>!l.lit&&Math.hypot(l.x-s.player.x,l.y-s.player.y)<52));
      win.requestAnimationFrame(frame);
    }
    applyOrientation();win.requestAnimationFrame(frame);
    return {releaseStick,applyOrientation,isPortrait,get stick(){return stick;}};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={setupMobile};else window.lanternMobile=setupMobile(document,window,window.lanternGame);
})();
