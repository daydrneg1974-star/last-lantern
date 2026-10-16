/* Developer overlay, loaded only with ?debug in the address (see audio-bootstrap.js).
   Read-only: it shows audio and layout state for device checks and never changes the game. */
(() => {
  'use strict';
  const panel=document.createElement('pre');panel.id='lanternDebug';
  panel.style.cssText='position:fixed;z-index:200;left:env(safe-area-inset-left,0);bottom:env(safe-area-inset-bottom,0);max-width:min(96vw,520px);max-height:38vh;overflow:hidden;margin:0;padding:6px 8px;background:#081321e6;color:#f3dc9d;font:10px/1.35 monospace;pointer-events:none;white-space:pre-wrap';
  document.body.appendChild(panel);
  const events=[],began=performance.now();
  const log=(text)=>{events.push(((performance.now()-began)/1000).toFixed(1)+'s '+text);if(events.length>10)events.shift();};
  window.addEventListener('error',e=>log('error: '+e.message+' @'+(e.filename||'').split('/').pop()+':'+e.lineno));
  window.addEventListener('unhandledrejection',e=>log('rejection: '+String(e.reason?.message||e.reason)));
  for(const type of ['pagehide','pageshow','blur','focus','orientationchange'])window.addEventListener(type,()=>log(type));
  document.addEventListener('visibilitychange',()=>log('visibility: '+document.visibilityState));
  const simulated=(location.search.match(/[?&]audio=(fail|slow)\b/)||[])[1];
  function render(){
    const s=window.lanternSound,g=window.lanternGame,r=s?.recordings,session=navigator.audioSession;
    const lines=[
      `UA: ${navigator.userAgent.replace(/^Mozilla\/5\.0 /,'').slice(0,90)}`,
      `viewport ${innerWidth}×${innerHeight} dpr ${devicePixelRatio} · ${document.documentElement.className||'desktop'}${simulated?' · simulated audio='+simulated:''}`,
      s?`AudioContext: ${s.context?.state||'none'} · ready ${s.ready()} · failed ${s.failed} · pending ${Boolean(s.pending)} · stalls ${s.resumeStalls} · session ${session?session.type:'n/a'}`:'sound: not loaded',
      r?`recordings: loaded ${r.loaded} · ok [${Object.keys(r.buffers).join(',')}] · failed [${[...r.failed].join(',')}] · music ${r.musicKey||'synth/none'} · synth voices ${s.musicVoices.size}`:'',
      g?`game: ${g.get().state} · axis ${g.touchAxis.x.toFixed(2)},${g.touchAxis.y.toFixed(2)} · volumes ${Math.round(s.volume*100)}/${Math.round(s.musicVolume*100)}/${Math.round(s.effectsVolume*100)} · enabled ${s.enabled}`:'game: not loaded',
      ...events];
    const text=lines.filter(Boolean).join('\n');if(panel.textContent!==text)panel.textContent=text;
  }
  setInterval(render,400);render();
})();
