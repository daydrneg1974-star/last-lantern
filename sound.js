/* One Web Audio mixer for local recordings and procedural fallback. */
(() => {
  'use strict';
  class LanternSound {
    constructor(host={}){this.host=host;this.context=null;this.enabled=true;this.volume=.35;this.effectsVolume=.7;this.musicVolume=.55;this.scene='menu';this.pageActive=true;this.voices=new Set();this.musicVoices=new Set();this.lanterns=0;this.musicStage=0;this.musicBeat=0;this.nextMusicTime=null;this.steps=0;this.pending=null;this.failed=false;this.onChange=()=>{};this.threat=0;this.heartbeat=0;this.nextHeartbeat=null;this.lastAttack=-Infinity;this.duckUntil=0;this.mixDuck=1;this.threatVoices=new Set();this.options=host.LANTERN_AUDIO_OPTIONS||{};this.startBudgetMs=Number.isFinite(this.options.startBudgetMs)?this.options.startBudgetMs:undefined;this.resumeStalls=0;const Recordings=typeof module!=='undefined'&&module.exports?require('./recordings.js'):host.LanternRecordings;this.recordings=new Recordings(this,host.LANTERN_AUDIO_PACK);}
    available(){return Boolean(this.host.AudioContext||this.host.webkitAudioContext);}
    async prepare(){
      if(!this.available()||this.failed)return;
      try{if(!this.context)this.build();await this.recordings.load();}catch{this.failed=true;this.onChange();}
    }
    beginRound(){this.tick();if(this.ready()&&this.musicVolume){this.musicNote(146.83,.65,.11,0,'bass');this.musicNote(220,.8,.06,0,'pad');}this.startLatencyMs=this.startRequestedAt!==undefined?Math.round((this.host.performance?.now()??Date.now())-this.startRequestedAt):0;this.onChange();}
    async previewThreat(distance,attack=false,persistent=false){
      this.stopDiagnostic();const token=this.diagnosticToken=(this.diagnosticToken||0)+1;
      const unlocked=this.unlock();await this.prepare();if(!await unlocked||token!==this.diagnosticToken)return;
      this.recordings.stopAll();this.haltMusic();this.clear();this.resetThreat();
      this.diagnostic={distance,until:persistent?Infinity:this.context.currentTime+6,lastAttack:this.lastAttack,duckUntil:this.duckUntil};
      this.apply();this.tick();
      if(attack){this.lastAttack=-Infinity;this.play('hit');}
    }
    stopDiagnostic(){
      this.diagnosticToken=(this.diagnosticToken||0)+1;
      if(!this.diagnostic)return;
      this.lastAttack=this.diagnostic.lastAttack;this.duckUntil=this.diagnostic.duckUntil;this.diagnostic=null;
      this.recordings.stopAll();this.haltMusic();this.clear();this.resetThreat();this.safeApply();
    }
    ready(){return this.context?.state==='running'&&this.enabled&&this.volume>0&&this.pageActive;}
    ramp(param,value,time=.04){param.setTargetAtTime(value,this.context.currentTime,time);}
    apply(){if(this.master){this.ramp(this.master.gain,this.enabled&&this.pageActive?this.volume:0);this.ramp(this.ambient.gain,this.scene==='playing'||this.diagnostic?1:0,.15);this.ramp(this.effects.gain,this.effectsVolume);this.ramp(this.music.gain,this.musicVolume,.12);this.updateMix();}this.onChange();}
    async unlock(){
      if(!this.enabled||!this.available()||this.failed)return false;
      if(this.pending)return this.pending.then(()=>this.context?.state==='running');
      try{
        if(!this.context)this.build();
        // Called directly from a trusted pointer/key/click handler, never from animation.
        if(this.context.state!=='running'){
          // iOS can leave resume() pending forever (interrupted session, background return).
          // Bound the wait so a stalled promise never blocks the round or later gestures.
          this.applySession();const c=this.context,limit=Number.isFinite(this.options.resumeTimeoutMs)?this.options.resumeTimeoutMs:3000;
          const attempt=this.resumeStalls>0&&c.state==='interrupted'&&typeof c.suspend==='function'?Promise.resolve(c.suspend()).catch(()=>{}).then(()=>c.resume()):c.resume();
          let timer;const pending=this.pending=Promise.race([Promise.resolve(attempt).then(()=>true,()=>false),new Promise(resolve=>{timer=this.host.setTimeout?this.host.setTimeout(()=>resolve('stalled'),limit):undefined;})]);
          const result=await pending;if(timer!==undefined)this.host.clearTimeout(timer);if(this.pending===pending)this.pending=null;
          if(result==='stalled')this.resumeStalls++;else this.resumeStalls=0;
        }
        this.apply();void this.recordings.load();return this.context.state==='running';
      }catch{this.failed=true;this.pending=null;this.onChange();return false;}
    }
    // W3C Audio Session (Safari 16.4+): 'playback' keeps game audio audible with the ring/silent
    // switch on and survives lock-screen interruptions. Other browsers lack the API and skip this.
    applySession(){
      const session=this.host.navigator?.audioSession;if(!session||!this.options.playbackSession)return;
      try{const wanted=this.enabled&&this.volume>0?'playback':'auto';if(session.type!==wanted)session.type=wanted;}catch{}
    }
    // Page returned to the foreground: a suspended or interrupted context is resumed without a gesture
    // where the browser allows it. The next real tap repeats this through unlock().
    wake(){const c=this.context;if(!c||!this.enabled||this.failed||c.state==='running'||c.state==='closed')return;this.applySession();try{Promise.resolve(c.resume()).then(()=>this.safeApply(),()=>{});}catch{}}
    build(){
      this.applySession();
      const C=this.host.AudioContext||this.host.webkitAudioContext,c=this.context=new C();
      this.master=c.createGain();this.master.gain.value=0;
      this.compressor=c.createDynamicsCompressor();this.compressor.threshold.value=-14;this.compressor.knee.value=12;this.compressor.ratio.value=8;this.compressor.attack.value=.003;this.compressor.release.value=.22;
      // Transparent at ordinary levels, softly bounds exceptional transients after compression.
      this.ceiling=c.createWaveShaper();const curve=new Float32Array(2049);for(let i=0;i<curve.length;i++){const x=i/1024-1,a=Math.abs(x);curve[i]=Math.sign(x)*(a<=.65?a:.65+.25*(1-Math.exp(-(a-.65)/.25)));}this.ceiling.curve=curve;this.ceiling.oversample='none';
      // Maximum curve amplitude * output <= 0.7071 (-3.01 dBFS), including full sliders.
      this.output=c.createGain();this.output.gain.value=.7071/Math.max(...curve.map(Math.abs));
      this.master.connect(this.compressor);this.compressor.connect(this.ceiling);this.ceiling.connect(this.output);this.output.connect(c.destination);
      this.effects=c.createGain();this.effects.gain.value=this.effectsVolume;this.effects.connect(this.master);
      this.dangerPan=c.createStereoPanner?c.createStereoPanner():c.createGain();this.dangerPan.connect(this.effects);
      this.music=c.createGain();this.music.gain.value=0;
      this.musicDuck=c.createGain();this.musicDuck.gain.value=1;this.music.connect(this.musicDuck);this.musicDuck.connect(this.master);
      this.ambient=c.createGain();this.ambient.gain.value=0;this.ambient.connect(this.effects);
      this.noise=c.createBuffer(2,c.sampleRate*4,c.sampleRate);
      for(let ch=0;ch<2;ch++){const data=this.noise.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
      const bed=(type,freq,level)=>{const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noise;source.loop=true;filter.type=type;filter.frequency.value=freq;filter.Q.value=.5;gain.gain.value=level;source.connect(filter);filter.connect(gain);gain.connect(this.ambient);source.start();return gain;};
      bed('lowpass',2400,.045); // Rain deliberately quieter than the musical motif.
      const wind=bed('lowpass',320,.035),lfo=c.createOscillator(),depth=c.createGain();lfo.frequency.value=.085;depth.gain.value=.012;lfo.connect(depth);depth.connect(wind.gain);lfo.start();
      this.threatBus=c.createGain();this.threatBus.gain.value=0;this.threatBus.connect(this.dangerPan);
      this.humFilter=c.createBiquadFilter();this.humFilter.type='lowpass';this.humFilter.frequency.value=420;this.humFilter.Q.value=.5;this.humFilter.connect(this.threatBus);
      this.humSources=[68,137].map(f=>{const o=c.createOscillator();o.type='triangle';o.frequency.value=f;o.connect(this.humFilter);o.start();return o;});
      this.growlCurve=new Float32Array(512);for(let i=0;i<512;i++)this.growlCurve[i]=Math.tanh((i/511*2-1)*2.5)*.75;
      c.onstatechange=()=>this.onChange();
    }
    setEnabled(value){if(!value)this.stopDiagnostic();this.enabled=Boolean(value);this.steps=0;if(!this.enabled){this.clear();this.haltMusic();this.resetThreat();this.recordings.stopAll();}this.applySession();this.safeApply();}
    setVolume(value){if(!Number.isFinite(value))return;this.volume=Math.max(0,Math.min(1,value));if(!this.volume){this.clear();this.haltMusic();this.resetThreat();this.recordings.stopAll();}this.safeApply();}
    setEffectsVolume(value){if(!Number.isFinite(value))return;this.effectsVolume=Math.max(0,Math.min(1,value));if(!this.effectsVolume){this.clear();this.resetThreat();}this.safeApply();}
    setMusicVolume(value){if(!Number.isFinite(value))return;this.musicVolume=Math.max(0,Math.min(1,value));if(!this.musicVolume){this.haltMusic();this.recordings.stopMusic();if(this.recordings.previewVoice&&['dark','light'].includes(this.recordings.previewVoice.key))this.recordings.stopAll();}this.safeApply();}
    setPageActive(value){if(!value)this.stopDiagnostic();this.pageActive=value;if(!value){this.clear();this.haltMusic();this.resetThreat();this.recordings.stopAll();}this.safeApply();}
    setScene(scene){this.stopDiagnostic();const previous=this.scene;this.scene=scene;this.steps=0;this.clear(scene==='lost');if(scene!==previous){this.recordings.stopAll(scene==='lost');this.resetThreat();this.haltMusic();if(scene==='menu'){this.lanterns=0;this.musicStage=0;this.musicBeat=0;}else if(scene==='playing'&&previous!=='paused'){this.lanterns=0;this.musicStage=0;this.musicBeat=0;}}this.safeApply();if(scene!==previous&&(scene==='won'||scene==='lost'))this.ending(scene);}
    setLanternCount(count){
      if(!Number.isFinite(count))return;this.lanterns=Math.max(0,Math.min(7,Math.floor(count)));
      const stage=this.lanterns>=7?3:this.lanterns>=6?2:this.lanterns>=3?1:0;
      if(stage!==this.musicStage){this.haltMusic();this.musicStage=stage;this.musicBeat=0;}
    }
    resetMusic(){this.stopDiagnostic();this.recordings.stopAll();this.haltMusic();this.resetThreat();this.lastAttack=-Infinity;this.duckUntil=0;this.lanterns=0;this.musicStage=0;this.musicBeat=0;}
    release(v,seconds=.12){if(v.releasing)return;v.releasing=true;const t=this.context.currentTime,p=v.gain.gain;if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(t);else{const level=p.value;p.cancelScheduledValues(t);p.setValueAtTime(level,t);}p.setTargetAtTime(0,t,seconds/4);v.source.stop(t+seconds);}
    resetThreat(){this.recordings.stopThreat();this.threat=0;this.heartbeat=0;this.protectedThreat=false;this.threatStage='none';this.nextHeartbeat=null;if(this.context){for(const v of this.threatVoices){try{this.release(v);}catch{}}if(this.threatBus)this.ramp(this.threatBus.gain,0,.12);}}
    setThreat(distance,protectedPlayer=false,pan=0,presence=false){
      const audible=this.ready()&&(this.scene==='playing'||this.diagnostic)&&this.effectsVolume>0;
      const raw=audible&&Number.isFinite(distance)?Math.max(0,Math.min(1,(210-distance)/185)):0;
      this.protectedThreat=protectedPlayer;this.threat=raw*(protectedPlayer?(presence?.32:0):1);
      this.threatStage=!this.threat?'none':distance>140?'A':distance>70?'B':'C';
      this.heartbeat=audible&&!protectedPlayer&&distance<140?Math.max(0,Math.min(1,(140-distance)/115)):0;
      if(this.dangerPan?.pan)this.ramp(this.dangerPan.pan,Math.max(-.55,Math.min(.55,pan)),.15);
      if(!this.heartbeat){this.nextHeartbeat=null;for(const v of this.threatVoices){try{this.release(v);}catch{}}}
      if(this.threatBus){try{this.ramp(this.threatBus.gain,this.threat*(this.recordings.buffers.near?.035:.085),.18);if(!this.threat)this.recordings.stopThreat();this.ramp(this.humFilter.frequency,320+this.threat*380,.2);this.updateMix();}catch{}}
    }
    updateMix(){if(!this.musicDuck)return;const danger=this.effectsVolume>0&&!this.protectedThreat?this.threat:0;const a=70/185,b=140/185;const attenuation=danger<=a?danger*2/a:danger<=b?2+(danger-a)*2/(b-a):4+(danger-b)*1/(1-b);const target=this.effectsVolume>0&&this.context.currentTime<this.duckUntil?.35:Math.pow(10,-attenuation/20);if(Math.abs(target-this.mixDuck)>.002){this.ramp(this.musicDuck.gain,target,target<this.mixDuck?.08:.45);this.mixDuck=target;}}
    tickThreat(){
      this.updateMix();this.recordings.threat();if(!this.heartbeat||!this.effectsVolume||(this.scene!=='playing'&&!this.diagnostic))return;
      const now=this.context.currentTime;if(this.nextHeartbeat===null)this.nextHeartbeat=now;
      if(now>=this.nextHeartbeat){const level=.055+.075*this.heartbeat;
        this.voice(125,65,.16,level,0,'sine',false,true);this.voice(155,80,.13,level*.65,.18,'sine',false,true);
        this.nextHeartbeat=now+1.05-.55*this.heartbeat;
      }
    }
    haltMusic(){
      this.nextMusicTime=null;this.musicNeedsPad=true;if(!this.context)return;
      for(const v of this.musicVoices){try{const t=this.context.currentTime,p=v.gain.gain;
        // Hold the current envelope before cancelling its future ramps to avoid clicks.
        if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(t);else{const level=p.value;p.cancelScheduledValues(t);p.setValueAtTime(level,t);}
        p.setTargetAtTime(0,t,.07);v.source.stop(t+.3);
      }catch{}}
    }
    musicNote(freq,duration,level,delay=0,role='melody'){
      if(this.musicVoices.size>=24)return;
      const c=this.context,t=c.currentTime+delay,source=c.createOscillator(),gain=c.createGain(),filter=c.createBiquadFilter();source.type=role==='pad'?'sine':'triangle';source.frequency.value=freq;filter.type='lowpass';filter.frequency.value=role==='bass'?650:1800;filter.Q.value=.5;
      const attack=role==='pad'?.5:role==='bass'?.06:.035;
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level,t+Math.min(attack,duration*.25));gain.gain.linearRampToValueAtTime(level*.65,t+duration*.6);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);gain.gain.linearRampToValueAtTime(0,t+duration+.04);
      source.connect(filter);filter.connect(gain);gain.connect(this.music);const v={source,gain,role};this.musicVoices.add(v);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();this.musicVoices.delete(v);};source.start(t);source.stop(t+duration+.05);
    }
    // One transport, driven by the existing animation loop. No extra interval or AudioContext.
    tick(){
      if(!this.ready()||this.failed)return;
      if(this.diagnostic){if(this.context.currentTime>=this.diagnostic.until){this.stopDiagnostic();return;}this.setThreat(this.diagnostic.distance);}
      const recordedMusic=this.recordings.tick();if(this.recordings.previewUntil>this.context.currentTime)return;try{this.tickThreat();}catch{this.resetThreat();}
      if(recordedMusic||!this.musicVolume||(this.scene!=='playing'&&!this.diagnostic)||this.musicStage===3)return;
      try{const now=this.context.currentTime;
        if(this.nextMusicTime===null||this.nextMusicTime<now-.2)this.nextMusicTime=now+.04;
        while(this.nextMusicTime<now+.16){
          const beat=this.musicBeat%8,bar=Math.floor(this.musicBeat/8)%2,delay=Math.max(0,this.nextMusicTime-now),stage=this.musicStage;
          // A repeated eight-note idea, answered in the next bar; D minor opens into F major.
          const chords=stage===0?[[146.83,174.61,220],[130.81,164.81,196]]:stage===1?[[174.61,220,261.63],[146.83,174.61,220]]:[[174.61,220,261.63],[130.81,174.61,196]];
          const bass=stage===0?[73.42,65.41]:stage===1?[87.31,73.42]:[87.31,65.41];
          if(beat===0||this.musicNeedsPad){chords[bar].forEach((f,i)=>this.musicNote(f,5.9,.08-i*.012,delay,'pad'));this.musicNote(bass[bar],3.05,.16,delay,'bass');this.musicNeedsPad=false;}
          else if(beat===4)this.musicNote(bass[bar]*1.5,2.9,.12,delay,'bass');
          const motifs=stage===0?[[293.66,0,349.23,329.63,293.66,0,220,0],[261.63,0,329.63,293.66,261.63,0,196,0]]:stage===1?[[349.23,440,523.25,0,440,392,349.23,0],[293.66,349.23,440,0,392,349.23,293.66,0]]:[[349.23,440,523.25,587.33,523.25,440,392,349.23],[392,523.25,587.33,523.25,440,392,349.23,0]];
          if(motifs[bar][beat])this.musicNote(motifs[bar][beat],1.25,stage===0?.19:stage===1?.23:.25,delay,'melody');
          this.musicBeat++;this.nextMusicTime+=.8;
        }
      }catch{this.haltMusic();}
    }
    ending(scene){if(this.recordings.ending(scene))return;
      if(!this.ready()||!this.musicVolume||this.failed)return;
      try{const notes=scene==='won'?[261.63,329.63,392,523.25,493.88,523.25]:[293.66,261.63,220,196,146.83];
        notes.forEach((f,i)=>this.musicNote(f,scene==='won'?1.3:1.1,.2,.25+i*.42));
        (scene==='won'?[130.81,164.81,196]:[146.83,174.61,220]).forEach(f=>this.musicNote(f,3.6,.065,.25,'pad'));
      }catch{this.haltMusic();}
    }
    safeApply(){try{this.apply();}catch{this.failed=true;}}
    clear(keepAttack=false){this.recordings.stopEffects(keepAttack);
      if(!this.context)return;
      for(const v of this.voices){if(keepAttack&&v.event==='hit')continue;try{this.release(v,.04);}catch{}}
      // onended disconnects nodes; the set is bounded even during rapid toggles.
    }
    voice(freq,end,duration,level,delay=0,type='sine',noise=false,threat=false,growl=false){
      if(this.voices.size>=32)return;
      const c=this.context,t=c.currentTime+delay,gain=c.createGain(),source=noise?c.createBufferSource():c.createOscillator();
      let filter,shaper;
      if(noise){source.buffer=this.noise;filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=freq;filter.Q.value=.5;source.connect(filter);filter.connect(gain);}
      else{source.type=type;source.frequency.setValueAtTime(freq,t);source.frequency.exponentialRampToValueAtTime(end,t+duration);
        if(growl){filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(1100,t);filter.frequency.exponentialRampToValueAtTime(240,t+duration);filter.Q.value=.7;shaper=c.createWaveShaper();shaper.curve=this.growlCurve;shaper.oversample='2x';source.connect(shaper);shaper.connect(filter);filter.connect(gain);}else source.connect(gain);}
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level,t+Math.min(.035,duration*.2));gain.gain.exponentialRampToValueAtTime(.0001,t+duration);gain.gain.linearRampToValueAtTime(0,t+duration+.025);gain.connect(threat?this.dangerPan:this.effects);
      const v={source,gain,event:this.currentEffect};this.voices.add(v);if(threat)this.threatVoices.add(v);source.onended=()=>{source.disconnect();gain.disconnect();filter?.disconnect();shaper?.disconnect();this.voices.delete(v);this.threatVoices.delete(v);};source.start(t);source.stop(t+duration+.03);
    }
    play(event){
      if(!this.ready()||this.failed||!this.effectsVolume)return;
      try{
        if(event==='hit'){if(this.context.currentTime-this.lastAttack<2.5)return;this.lastAttack=this.context.currentTime;}
        this.currentEffect=event;
        if(['spark','lamp','flash','hit','won','lost'].includes(event)){this.duckUntil=Math.max(this.duckUntil,this.context.currentTime+(event==='hit'?.75:.4));this.updateMix();}
        const tone=(a,b,d,l,delay=0,type='sine')=>this.voice(a,b,d,l,delay,type);
        switch(event){
          case 'step':this.voice(650,650,.09,.055,0,'sine',true);tone(105,65,.075,.025);break;
          case 'spark':tone(880,1000,.2,.085);tone(1320,1450,.26,.045,.055);break;
          case 'lamp':tone(220,440,.45,.09);[440,554.37,659.25].forEach((f,i)=>tone(f,f,.65,.035,.08+i*.09));break;
          case 'flash':this.voice(1400,1400,.5,.13,0,'sine',true);tone(180,620,.35,.1);tone(740,880,.55,.04,.06);break;
          case 'hit':if(!this.recordings.attack())this.voice(155,52,.55,.23,0,'sawtooth',false,false,true);this.voice(900,900,.18,.09,0,'sine',true);tone(100,45,.24,.13);tone(1250,740,.18,.12,.015,'triangle');tone(622.25,293.66,.3,.09,.02,'triangle');tone(659.25,311.13,.28,.06,.035,'triangle');break;
          case 'won':[261.63,329.63,392,523.25].forEach((f,i)=>tone(f,f,.8,.075,i*.16));break;
          case 'lost':[293.66,261.63,196].forEach((f,i)=>tone(f,f*.98,.65,.065,i*.22));break;
        }
      }catch{this.failed=true;this.safeApply();}finally{this.currentEffect=null;}
    }
    walk(distance){if(this.scene!=='playing'||!this.ready()){this.steps=0;return;}this.steps+=distance;if(this.steps>=48){this.steps%=48;this.play('step');}}
  }
  function setupSound(sound,doc,host){
    const toggle=doc.getElementById('soundToggle'),slider=doc.getElementById('soundVolume'),value=doc.getElementById('soundValue'),status=doc.getElementById('soundStatus');
    const musicSlider=doc.getElementById('musicVolume'),musicValue=doc.getElementById('musicValue'),effectsSlider=doc.getElementById('effectsVolume'),effectsValue=doc.getElementById('effectsValue');
    const sliders=[slider,musicSlider,effectsSlider];
    function refresh(){toggle.textContent=sound.enabled?'♫ Звук вкл.':'♫ Звук выкл.';toggle.setAttribute('aria-pressed',String(sound.enabled));slider.value=String(Math.round(sound.volume*100));value.textContent=slider.value+'%';musicSlider.value=String(Math.round(sound.musicVolume*100));musicValue.textContent=musicSlider.value+'%';effectsSlider.value=String(Math.round(sound.effectsVolume*100));effectsValue.textContent=effectsSlider.value+'%';status.textContent=!sound.available()||sound.failed?'Звук недоступен в этом браузере':sound.enabled&&sound.context?.state!=='running'?'Нажмите для запуска звука':sound.recordings.status();const metrics=doc.getElementById('audioMetrics');if(metrics){const r=sound.recordings;metrics.textContent=Object.entries(r.metrics||{}).filter(([k])=>['dark','light'].includes(k)).map(([k,v])=>k+': декодирование и анализ '+(v.decodeAndAnalysisMs??'ошибка')+' мс; смещение '+(v.offset||0).toFixed(2)+' с').join(' · ')+(sound.startLatencyMs!==undefined?' · Запуск раунда: '+sound.startLatencyMs+' мс':'');}}
    sound.onChange=refresh;
    for(const [id,key] of [['previewDark','dark'],['previewLight','light']]){
      const button=doc.getElementById(id);
      button.onclick=async()=>{sound.onPreviewRequest?.();sound.stopDiagnostic();try{const message=await sound.recordings.preview(key);if(message)doc.getElementById('previewStatus').textContent=message;}catch{doc.getElementById('previewStatus').textContent='Не удалось воспроизвести запись.';}};
      button.onkeydown=e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation();};
    }
    const distanceSlider=doc.getElementById('previewDistance'),distanceValue=doc.getElementById('previewDistanceValue');
    const preview=(distance,attack=false,persistent=false)=>{sound.onPreviewRequest?.();distanceSlider.value=String(distance);distanceValue.textContent=distance+' ед.';doc.getElementById('previewStatus').textContent='Игровой микс: музыка, дождь и угроза. Закройте настройки, чтобы закончить.';void sound.previewThreat(distance,attack,persistent);};
    for(const [id,d,attack] of [['previewFar',180,false],['previewNear',110,false],['previewClose',40,false],['previewAttack',25,true]]){const button=doc.getElementById(id);button.onclick=()=>preview(d,attack);button.onkeydown=e=>{if(['Space','Enter'].includes(e.code))e.stopPropagation();};}
    distanceSlider.oninput=()=>{const d=Number(distanceSlider.value);distanceValue.textContent=d+' ед.';if(sound.diagnostic){sound.diagnostic.distance=d;sound.diagnostic.until=Infinity;}else preview(d,false,true);};
    distanceSlider.onkeydown=e=>e.stopPropagation();
    doc.getElementById('audioPreview').ontoggle=()=>{if(!doc.getElementById('audioPreview').open){sound.stopDiagnostic();sound.recordings.stopAll();sound.onPreviewEnd?.();}};
    const gesture=e=>{if(e.isTrusted&&e.target!==toggle&&!sliders.includes(e.target))void sound.unlock();};
    host.addEventListener('pointerdown',gesture,{capture:true});host.addEventListener('keydown',gesture,{capture:true});
    toggle.onclick=()=>{sound.setEnabled(!sound.enabled);if(sound.enabled)void sound.unlock();};
    slider.oninput=()=>{sound.setVolume(Number(slider.value)/100);void sound.unlock();};
    musicSlider.oninput=()=>{sound.setMusicVolume(Number(musicSlider.value)/100);void sound.unlock();};
    effectsSlider.oninput=()=>{sound.setEffectsVolume(Number(effectsSlider.value)/100);void sound.unlock();};
    // Preserve native slider keyboard controls; other game controls remain unchanged.
    for(const control of sliders)control.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Space'].includes(e.code))e.stopPropagation();};
    host.addEventListener('blur',()=>sound.setPageActive(false));host.addEventListener('focus',()=>sound.setPageActive(!doc.hidden));
    doc.addEventListener('visibilitychange',()=>{sound.setPageActive(!doc.hidden);if(!doc.hidden)void sound.wake();});refresh();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={LanternSound,setupSound};else{window.lanternSound=new LanternSound(window);setupSound(window.lanternSound,document,window);void window.lanternSound.prepare();}
})();



