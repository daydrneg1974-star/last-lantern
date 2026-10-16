/* Local test-server overlay only. This file is never copied into test-build. */
(() => {
  const panel=document.createElement('pre');
  panel.id='audioDiagnostic';
  panel.style.cssText='position:fixed;z-index:100;left:6px;bottom:6px;max-width:min(95vw,520px);max-height:35vh;overflow:auto;margin:0;padding:7px;background:#081321ed;color:#f3dc9d;font:11px/1.35 monospace;pointer-events:none;white-space:pre-wrap';
  document.body.appendChild(panel);
  const lines=[],began=performance.now();
  let currentState='';
  const add=(stage,detail)=>{
    lines.push(((performance.now()-began)/1000).toFixed(1)+'s '+stage+(detail?' '+JSON.stringify(detail):''));
    panel.textContent=currentState+'\n'+lines.slice(-14).join('\n');
  };
  add('diagnostic-start',{userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight]});
  const mode=new URLSearchParams(location.search).get('audio-mode');
  if(mode==='slow'||mode==='fail'){
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(url,options)=>{
      if(!String(url).includes('assets/audio/'))return nativeFetch(url,options);
      add('simulated-'+mode,{url:String(url)});
      if(mode==='fail')return Promise.resolve(new Response('',{status:503}));
      return new Promise(resolve=>setTimeout(resolve,4000)).then(()=>nativeFetch(url,options));
    };
  }
  window.addEventListener('lantern-audio-stage',e=>add(e.detail.stage,e.detail));
  window.addEventListener('error',e=>add('script-error',{message:e.message,source:e.filename,line:e.lineno}));
  window.addEventListener('unhandledrejection',e=>add('promise-error',{message:String(e.reason?.message||e.reason)}));
  setInterval(()=>{
    const sound=window.lanternSound;
    if(!sound)return;
    const state=`AudioContext: ${sound.context?.state||'нет'} · ready: ${sound.ready()} · failed: ${sound.failed} · pending: ${Boolean(sound.pending)} · page: ${sound.pageActive} · mute: ${!sound.enabled}\nMusic: ${sound.recordings.musicKey||'синтез/нет'} · synth voices: ${sound.musicVoices.size} · volumes: ${Math.round(sound.volume*100)}/${Math.round(sound.musicVolume*100)}/${Math.round(sound.effectsVolume*100)} · CC0: ${Object.keys(sound.recordings.buffers).join(',')||'нет'} · errors: ${[...sound.recordings.failed].join(',')||'нет'}`;
    if(state!==currentState){currentState=state;panel.textContent=currentState+'\n'+lines.slice(-14).join('\n');}
  },500);
})();
