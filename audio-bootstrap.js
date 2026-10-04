/* Load the large local audio pack without blocking the start screen.
   AudioContext creation/resume and all mixing remain in the existing engine.
   Mobile page (html.mobile): the 34 MiB pack is never requested; five small AAC copies of the
   same CC0 recordings are fetched separately by recordings.js with per-file time limits. */
(() => {
  'use strict';
  const start=document.getElementById('start'), notice=document.getElementById('loadNotice');
  const mobile=document.documentElement.classList.contains('mobile');
  const load=(src,timeout=12000)=>new Promise((resolve,reject)=>{
    const script=document.createElement('script');let settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
    const timer=setTimeout(()=>finish(Error(src+' timeout')),timeout);
    script.src=src;script.onload=()=>finish();script.onerror=()=>finish(Error(src+' unavailable'));
    document.head.appendChild(script);
  });
  (async()=>{
    let fallback=false;
    if(mobile){
      notice.textContent='';
      // AAC copy first; the CC0 original (Ogg) follows where its size allows. The 25 MiB WAV has no mobile original.
      const file=(name,timeout,original=true)=>({urls:['assets/audio/mobile/'+name+'.m4a'].concat(original?['assets/audio/mobile/'+name+'.ogg']:[]),file:name+'.m4a',timeout});
      window.LANTERN_AUDIO_PACK={dark:file('dark',20000),light:file('light',25000,false),near:file('near',8000),attack1:file('attack1',8000),attack2:file('attack2',8000)};
      window.LANTERN_AUDIO_OPTIONS={startBudgetMs:2500,resumeTimeoutMs:2500,playbackSession:true};
    }else{
      try{await load('assets/audio/audio-data.js');}catch{fallback=true;}
    }
    try{
      await load('recordings.js');
      // A late pack response must not switch a fallback round to recordings.
      if(fallback)window.LANTERN_AUDIO_PACK={};
      await load('sound.js');await load('game.js');await load('display.js');
      if(mobile)await load('mobile.js');
      start.dataset.bootState=fallback?'fallback':'ready';
      notice.textContent=fallback?'Аудиозаписи не загрузились. Доступен резервный звук. Для записей обновите страницу.':'';
    }catch{
      start.disabled=true;start.dataset.bootState='error';
      notice.textContent='Не удалось загрузить игру. Проверьте соединение и обновите страницу.';
    }
  })();
})();
