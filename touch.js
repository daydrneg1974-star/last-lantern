/* Pointer input is measured in CSS pixels relative to the joystick, never canvas pixels. */
(()=>{'use strict';
 function direction(clientX,clientY,rect){const radius=Math.max(1,Math.min(rect.width,rect.height)/2),x=(clientX-rect.left-rect.width/2)/radius,y=(clientY-rect.top-rect.height/2)/radius,len=Math.hypot(x,y);if(len<.18)return{x:0,y:0};return{x:x/Math.max(1,len),y:y/Math.max(1,len)};}
 class TouchController{
  constructor(api){this.api=api;this.pointer=null;this.actions=new Set();this.onMove=()=>{};}
  move(id,x,y,rect){if(id!==this.pointer)return;const v=direction(x,y,rect);this.api.touch.x=v.x;this.api.touch.y=v.y;this.onMove(v);}
  down(id,x,y,rect){if(!this.api.playing()||this.pointer!==null)return false;this.pointer=id;this.move(id,x,y,rect);return true;}
  up(id){this.actions.delete(id);if(id===this.pointer){this.pointer=null;this.api.touch.x=this.api.touch.y=0;this.onMove({x:0,y:0});}}
  action(id,name){if(!this.api.playing()||this.actions.has(id))return;this.actions.add(id);this.api[name]();}
  clear(){this.pointer=null;this.actions.clear();this.api.touch.x=this.api.touch.y=0;this.onMove({x:0,y:0});}
 }
 function setup(doc,win,api){
  const pad=doc.getElementById('joystick'),stick=doc.getElementById('stick'),area=doc.getElementById('playArea'),light=doc.getElementById('touchLight'),flash=doc.getElementById('touchFlash'),cool=doc.getElementById('touchCooldown'),audio=doc.querySelector('.audio-controls'),preview=doc.getElementById('audioPreview');
  const controller=new TouchController(api);const active=new Map();
  const release=()=>{for(const [id,el]of active){try{if(el.hasPointerCapture(id))el.releasePointerCapture(id);}catch{}}active.clear();controller.clear();};
  controller.onMove=v=>{stick.style.transform=`translate(${v.x*28}px,${v.y*28}px)`;};api.touch.onClear=release;
  const capture=(el,e)=>{active.set(e.pointerId,el);try{el.setPointerCapture(e.pointerId);}catch{}};
  pad.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();if(controller.down(e.pointerId,e.clientX,e.clientY,pad.getBoundingClientRect()))capture(pad,e);});
  pad.addEventListener('pointermove',e=>{if(e.pointerId===controller.pointer){e.preventDefault();controller.move(e.pointerId,e.clientX,e.clientY,pad.getBoundingClientRect());}});
  for(const [button,name]of [[light,'light'],[flash,'flash']]){
   button.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();capture(button,e);controller.action(e.pointerId,name);});
   button.addEventListener('click',e=>{if(e.detail===0&&api.playing())api[name]();});
  }
  for(const el of [pad,light,flash])for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,e=>{controller.up(e.pointerId);active.delete(e.pointerId);});
  for(const event of ['pointerup','pointercancel'])win.addEventListener(event,e=>{controller.up(e.pointerId);active.delete(e.pointerId);});
  win.addEventListener('blur',release);win.addEventListener('pagehide',()=>{release();api.pause();});doc.addEventListener('visibilitychange',()=>{if(doc.hidden)release();});
  // The mobile settings panel covers the field: never let the round run behind it.
  preview.addEventListener('toggle',()=>{if(preview.open&&win.lanternMobile){release();api.pause();}});
  const coarse=win.matchMedia('(any-pointer: coarse)');let forced=false,lastLandscape=win.innerWidth>win.innerHeight;
  function layout(){release();const landscape=win.innerWidth>win.innerHeight;if(win.lanternMobile&&landscape!==lastLandscape)api.pause();lastLandscape=landscape;const mobile=forced||coarse.matches||win.navigator.maxTouchPoints>0;win.lanternMobile=mobile;doc.documentElement.classList.toggle('mobile-device',mobile);if(mobile){preview.appendChild(audio);}else preview.before(audio);area.style.setProperty('--field-height',Math.max(1,area.clientHeight-2)+'px');}
  win.addEventListener('resize',layout);win.addEventListener('orientationchange',()=>{api.pause();layout();});win.visualViewport?.addEventListener('resize',layout);coarse.addEventListener?.('change',layout);
  win.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!win.lanternMobile){forced=true;layout();}},{capture:true});
  // UI-only refresh; one RAF chain for the lifetime of the page, no restart listeners.
  function refresh(){const s=api.status(),playing=s.state==='playing';light.disabled=!playing;flash.disabled=!playing||s.cooldown>0;const label=s.cooldown>0?Math.ceil(s.cooldown)+' с':'Готова';if(cool.textContent!==label)cool.textContent=label;win.requestAnimationFrame(refresh);}
  layout();refresh();return{controller,layout,release};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={direction,TouchController,setup};else{window.LanternTouch={direction,TouchController,setup};window.lanternTouchUI=setup(document,window,window.lanternControls);}
})();

