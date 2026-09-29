/* Load the large local audio pack without blocking the start screen.
   AudioContext creation/resume and all mixing remain in the existing engine. */
(() => {
  'use strict';
  const start=document.getElementById('start'), notice=document.getElementById('loadNotice');
  const load=(src,timeout=12000)=>new Promise((resolve,reject)=>{
    const script=document.createElement('script');let settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
    const timer=setTimeout(()=>finish(Error(src+' timeout')),timeout);
    script.src=src;script.onload=()=>finish();script.onerror=()=>finish(Error(src+' unavailable'));
    document.head.appendChild(script);
  });
  (async()=>{
    let fallback=false;
    try{await load('assets/audio/audio-data.js');}catch{fallback=true;}
    try{
      await load('recordings.js');
      // A late pack response must not switch a fallback round to recordings.
      if(fallback)window.LANTERN_AUDIO_PACK={};
      await load('sound.js');await load('game.js');await load('display.js');
      start.dataset.bootState=fallback?'fallback':'ready';
      notice.textContent=fallback?'Аудиозаписи не загрузились. Доступен резервный звук. Для записей обновите страницу.':'';
    }catch{
      start.disabled=true;start.dataset.bootState='error';
      notice.textContent='Не удалось загрузить игру. Проверьте соединение и обновите страницу.';
    }
  })();
})();
