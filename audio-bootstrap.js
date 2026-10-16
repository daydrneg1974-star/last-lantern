/* Load the large local audio pack without blocking the start screen.
   AudioContext creation/resume and all mixing remain in the existing engine. */
(() => {
  'use strict';
  const start=document.getElementById('start'), notice=document.getElementById('loadNotice');
  const mobile=Boolean(document.documentElement?.classList.contains('mobile-device'));
  let recordingNotice='',audioRunning=null;
  const report=(stage,detail={})=>{
    start.dataset.audioStage=stage;
    if(mobile&&stage==='fallback-active')recordingNotice='Записи недоступны или ещё загружаются. Игра работает с резервным звуком.';
    if(mobile&&stage==='audio-ready')recordingNotice='';
    if(mobile&&stage==='audio-context')audioRunning=Boolean(detail.ready);
    if(mobile&&stage==='audio-context-error')audioRunning=false;
    if(mobile&&['fallback-active','audio-ready','audio-context','audio-context-error'].includes(stage))
      notice.textContent=audioRunning===false?'Звук пока не запущен. Коснитесь экрана ещё раз.':recordingNotice;
    if(typeof window.dispatchEvent==='function'&&typeof CustomEvent==='function')
      window.dispatchEvent(new CustomEvent('lantern-audio-stage',{detail:{stage,...detail}}));
  };
  window.lanternAudioReport=report;
  if(mobile){
    // The files are byte-identical CC0 originals. Safari never parses the 34 MiB JS pack.
    window.lanternMobileAudio=true;
    window.LANTERN_AUDIO_PACK={
      dark:{url:'assets/audio/dark_cavern_ambient_002.ogg'},
      light:{url:'assets/audio/first_light_particles.wav'},
      near:{url:'assets/audio/monster_01.ogg'},
      attack1:{url:'assets/audio/roar_02.ogg'},
      attack2:{url:'assets/audio/roar_03.ogg'}
    };
  }
  const load=(src,timeout=12000)=>new Promise((resolve,reject)=>{
    const script=document.createElement('script');let settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
    const timer=setTimeout(()=>finish(Error(src+' timeout')),timeout);
    script.src=src;script.onload=()=>finish();script.onerror=()=>finish(Error(src+' unavailable'));
    document.head.appendChild(script);
  });
  (async()=>{
    let fallback=false;
    if(!mobile){
      report('audio-data-request');
      try{await load('assets/audio/audio-data.js');report('audio-data-complete');}
      catch(error){fallback=true;report(/timeout/.test(error.message)?'audio-data-timeout':'audio-data-error');}
    }
    try{
      report('core-loading');
      await load('recordings.js');
      // A late pack response must not switch a fallback round to recordings.
      if(fallback)window.LANTERN_AUDIO_PACK={};
      await load('sound.js');await load('game.js');await load('display.js');await load('touch.js');
      start.dataset.bootState=fallback?'fallback':'ready';
      notice.textContent=fallback?'Аудиозаписи не загрузились. Доступен резервный звук. Для записей обновите страницу.':'';
      report('game-unlocked',{mode:mobile?'mobile-binary':fallback?'fallback':'embedded'});
    }catch(error){
      start.disabled=true;start.dataset.bootState='error';
      notice.textContent='Не удалось загрузить игру. Проверьте соединение и обновите страницу.';
      report('core-error',{message:String(error?.message||error)});
    }
  })();
})();
