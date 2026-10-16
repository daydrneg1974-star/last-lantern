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
    const RADIUS=42,DEAD=10;
    let stick=null; // {id}
    const playing=()=>game.get().state==='playing';
    // Diagnostics for the ?debug overlay: which event last released the stick and how often.
    const stats={releases:{},lastRelease:'',holds:0};
    function layoutStick(dx,dy){const d=Math.hypot(dx,dy),k=d>RADIUS?RADIUS/d:1;knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;}
    function releaseStick(reason='code'){if(stick!==null){try{if(zone.hasPointerCapture?.(stick.id))zone.releasePointerCapture(stick.id);}catch{}stats.releases[reason]=(stats.releases[reason]||0)+1;stats.lastRelease=reason;}stick=null;game.setAxis(0,0);knob.style.transform='';base.classList.remove('active');}
    // Fixed joystick: the base sits in the left band; direction is measured from the base centre.
    function baseCenter(){const r=base.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}
    function steer(e){const c=baseCenter(),dx=e.clientX-c.x,dy=e.clientY-c.y,d=Math.hypot(dx,dy);layoutStick(dx,dy);if(d<DEAD)game.setAxis(0,0);else game.setAxis(dx,dy);} // direction only: hero speed is fixed in game.js
    zone.addEventListener('pointerdown',e=>{
      if(stick!==null||!playing())return;e.preventDefault();
      stick={id:e.pointerId};stats.holds++;base.classList.add('active');steer(e);
      try{zone.setPointerCapture(e.pointerId);}catch{}
    });
    zone.addEventListener('pointermove',e=>{
      if(!stick||e.pointerId!==stick.id)return;e.preventDefault();if(!playing()){releaseStick('not-playing');return;}
      steer(e);
    });
    const end=type=>e=>{if(stick&&e.pointerId===stick.id)releaseStick(type);};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(type,end(type));
    // iOS: a finger held still for ~0.5 s starts the long-press recogniser and the browser cancels the touch.
    // Preventing the default on the raw touch events keeps the gesture with the page (no callout, no zoom, no scroll).
    for(const type of ['touchstart','touchmove','touchend','touchcancel'])controls.addEventListener(type,e=>{if(e.cancelable)e.preventDefault();},{passive:false});
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
    const reset=(reason='code')=>{releaseStick(reason);flashButton.classList.remove('pressed');igniteButton.classList.remove('pressed');};
    win.addEventListener('blur',()=>reset('blur'));doc.addEventListener('visibilitychange',()=>reset('visibility'));
    win.addEventListener('pagehide',()=>{reset('pagehide');if(playing())game.overlay('paused');});
    win.addEventListener('orientationchange',()=>reset('orientation'));
    // Orientation: landscape is the play orientation; portrait pauses and asks to rotate.
    const portraitQuery=win.matchMedia?win.matchMedia('(orientation: portrait)'):null;
    const isPortrait=()=>portraitQuery?portraitQuery.matches:win.innerHeight>win.innerWidth;
    function applyOrientation(){
      const portrait=isPortrait(),state=game.get().state;
      if(portrait&&state==='playing'){reset('portrait');game.overlay('paused');}
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
      if(s.state!==lastState){lastState=s.state;controls.hidden=s.state!=='playing';controls.setAttribute('aria-hidden',String(s.state!=='playing'));if(s.state!=='playing')reset('state');soundToggle.hidden=!audioControls||!['menu','paused'].includes(s.state);if(!['menu','paused'].includes(s.state)){soundPanel.hidden=true;soundToggle.setAttribute('aria-expanded','false');}applyOrientation();}
      const ratio=Math.max(0,Math.min(1,1-s.cooldown/8));flashRing.style.setProperty('--cooldown',String(ratio));flashButton.classList.toggle('cooling',s.cooldown>0);
      igniteButton.classList.toggle('ready',s.state==='playing'&&s.player.bag>0&&s.lamps.some(l=>!l.lit&&Math.hypot(l.x-s.player.x,l.y-s.player.y)<52));
      win.requestAnimationFrame(frame);
    }
    applyOrientation();win.requestAnimationFrame(frame);
    return {releaseStick,applyOrientation,isPortrait,stats,get stick(){return stick;}};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={setupMobile};else window.lanternMobile=setupMobile(document,window,window.lanternGame);
})();
