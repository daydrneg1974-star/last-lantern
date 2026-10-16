/* Recorded assets backend for LanternSound. Uses its context and mixer, never a new one. */
(() => {
  'use strict';
  class LanternRecordings {
    constructor(sound,pack){this.sound=sound;this.pack=pack||{};this.buffers={};this.gains={};this.failed=new Set();this.loading=null;this.loaded=false;this.musicVoice=null;this.musicKey=null;this.voices=new Set();this.nextCreature=0;this.attackIndex=0;this.previewVoice=null;this.previewUntil=0;this.endUntil=0;this.previewToken=0;}
    load(){
      if(this.loading)return this.loading;
      const c=this.sound.context;
      if(!c||typeof c.decodeAudioData!=='function'){this.loaded=true;return Promise.resolve();}
      this.metrics={};this.offsets={};const clock=()=>this.sound.host.performance?.now()??Date.now();
      this.loading=Promise.all(['dark','light','near','attack1','attack2'].map(async key=>{
        const item=this.pack[key];if(!item?.data&&!item?.url){this.failed.add(key);return;}
        const began=clock();try{
          let bytes;
          if(item.data){
            const binary=this.sound.host.atob(item.data),array=new Uint8Array(binary.length);
            for(let i=0;i<binary.length;i++)array[i]=binary.charCodeAt(i);
            bytes=array.buffer;
          }else{
            this.sound.host.lanternAudioReport?.('audio-request',{key});
            const controller=new AbortController();let requestTimer;
            const request=this.sound.host.fetch(item.url,{signal:controller.signal}).then(async response=>{
              if(!response.ok)throw Error('HTTP '+response.status);
              return response.arrayBuffer();
            });
            bytes=await Promise.race([request,new Promise((_,reject)=>{
              requestTimer=(this.sound.host.setTimeout||setTimeout)(()=>{controller.abort();reject(Error('Fetch timeout'));},10000);
            })]).finally(()=>(this.sound.host.clearTimeout||clearTimeout)(requestTimer));
            this.sound.host.lanternAudioReport?.('audio-loaded',{key,bytes:bytes.byteLength});
          }
          const decodedAt=clock();
          const decode=c.decodeAudioData(bytes);let timeout;
          const buffer=await (this.sound.host.setTimeout?Promise.race([decode,new Promise((_,reject)=>{timeout=this.sound.host.setTimeout(()=>reject(Error('Decode timeout')),10000);})]).finally(()=>this.sound.host.clearTimeout(timeout)):decode);
          if(!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Invalid recording');this.buffers[key]=buffer;
          let peak=0;for(let ch=0;ch<(buffer.numberOfChannels||0);ch++){const a=buffer.getChannelData(ch);for(let i=0;i<a.length;i++)peak=Math.max(peak,Math.abs(a[i]));}
          this.gains[key]=peak>.001?Math.min(2,.85/peak):1;
          if(['dark','light'].includes(key))this.offsets[key]=this.findOnset(buffer);
          this.metrics[key]={unpackMs:Math.round(decodedAt-began),decodeAndAnalysisMs:Math.round(clock()-decodedAt),duration:buffer.duration,offset:this.offsets[key]||0};
          if(item.url)this.sound.host.lanternAudioReport?.('audio-decoded',{key});
        }catch(error){this.failed.add(key);this.metrics[key]={error:String(error?.message||error)};if(item.url)this.sound.host.lanternAudioReport?.(/timeout/i.test(String(error?.message))?'audio-timeout':'audio-error',{key,message:String(error?.message||error)});}
      })).then(()=>{this.loaded=true;this.sound.onChange();this.sound.host.lanternAudioReport?.(this.failed.size?'fallback-active':'audio-ready',{status:this.status()});});return this.loading;
    }
    // Skip only a sustained quiet introduction, never seek on every frame.
    findOnset(buffer){
      if(!buffer.sampleRate||!buffer.numberOfChannels)return 0;
      const data=buffer.getChannelData(0),size=Math.ceil(buffer.sampleRate*.1),windows=[];
      for(let start=0;start<Math.min(data.length,buffer.sampleRate*30);start+=size){let sum=0,n=0;for(let i=start;i<Math.min(start+size,data.length);i+=4){sum+=data[i]*data[i];n++;}windows.push(Math.sqrt(sum/Math.max(1,n)));}
      const threshold=Math.max(.003,Math.max(...windows)*.2);
      const index=windows.findIndex((v,i)=>v>=threshold&&windows[i+1]>=threshold&&windows[i+2]>=threshold);
      return index>=5?Math.max(0,index*.1-.05):0;
    }
    status(){if(!this.loaded&&Object.keys(this.pack).length)return 'Загрузка записей CC0…';const count=Object.keys(this.buffers).length;return count===5?'Записи CC0':count?'Часть записей недоступна — используется резерв':'Записи недоступны — резервный синтез';}
    start(key,bus,level,{loop=false,duration,offset=0,rate=1,attack=.08,preview=false,lowpass=0,presence=false,creature=false}={}){
      const b=this.buffers[key],c=this.sound.context;if(!b||this.voices.size>=12)return null;
      const source=c.createBufferSource(),gain=c.createGain();source.buffer=b;source.loop=loop;if(source.playbackRate)source.playbackRate.value=rate;
      level*=this.gains[key]||1;const now=c.currentTime;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(level,now+attack);
      const color=[];let input=source;
      // Creature-only coloration: recover audible harmonics without raising the sub-bass.
      if(presence||creature){
        const high=c.createBiquadFilter();high.type='highpass';high.frequency.value=95;high.Q.value=.5;
        const shape=c.createWaveShaper();shape.curve=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/1023*2-1;shape.curve[i]=Math.tanh(x*6)*.7;}shape.oversample='2x';
        const mid=c.createBiquadFilter();mid.type='peaking';mid.frequency.value=950;mid.Q.value=.65;
        mid.gain.value=creature?8:this.presenceColor();const cut=c.createBiquadFilter();cut.type='highpass';cut.frequency.value=300;cut.Q.value=.5;const wet=c.createGain();wet.gain.value=creature?1.5:this.presenceColor()/7*2.1;source.connect(high);high.connect(shape);shape.connect(mid);mid.connect(cut);cut.connect(wet);wet.connect(gain);const body=c.createBiquadFilter();body.type='peaking';body.frequency.value=950;body.Q.value=.65;body.gain.value=creature?6:this.presenceColor()*2;source.connect(body);input=body;color.push(high,shape,mid,cut,wet,body);
      }
      let filter;if(lowpass){filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=lowpass;filter.Q.value=.5;input.connect(filter);filter.connect(gain);}else input.connect(gain);
      // Distance automation must never overwrite a finite source's release envelope.
      let intensity;if(presence){intensity=c.createGain();intensity.gain.value=this.sound.threat;gain.connect(intensity);intensity.connect(bus);}else gain.connect(bus);
      const v={source,gain,key,loop,preview,level,filter,intensity,presence,rate,color};this.voices.add(v);source.onended=()=>{source.disconnect();for(const n of color)n.disconnect();filter?.disconnect();gain.disconnect();intensity?.disconnect();this.voices.delete(v);if(this.previewVoice===v)this.previewVoice=null;};
      source.start(now,Math.min(offset,Math.max(0,b.duration-.1)));
      if(!loop){const length=Math.min(duration||b.duration,(b.duration-Math.min(offset,b.duration-.1))/rate);gain.gain.setValueAtTime(level,now+Math.max(attack,length-.25));gain.gain.linearRampToValueAtTime(0,now+length);source.stop(now+length+.04);}
      return v;
    }
    stop(v,fade=.2){if(!v||v.releasing)return;v.releasing=true;const c=this.sound.context,p=v.gain.gain,t=c.currentTime;if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(t);else{const val=p.value;p.cancelScheduledValues(t);p.setValueAtTime(val,t);}p.linearRampToValueAtTime(0,t+fade);v.source.stop(t+fade+.02);}
    stopMusic(fade=.35){this.stop(this.musicVoice,fade);this.stop(this.melodyVoice,fade);this.musicVoice=null;this.melodyVoice=null;this.musicKey=null;}
    stopAll(keepAttack=false,invalidate=true){if(invalidate)this.previewToken++;for(const v of this.voices)if(!(keepAttack&&!v.presence&&v.key.startsWith('attack')))this.stop(v);this.musicVoice=null;this.melodyVoice=null;this.musicKey=null;this.previewVoice=null;this.previewUntil=0;this.endUntil=0;this.nextCreature=0;this.presenceIndex=0;}
    stopEffects(keepAttack=false){for(const v of this.voices)if(!['dark','light'].includes(v.key)&&!(keepAttack&&!v.presence&&v.key.startsWith('attack')))this.stop(v);}
    stopThreat(){for(const v of this.voices)if(v.presence)this.stop(v,.35);}
    tick(){
      const s=this.sound,c=s.context;if(!c)return false;
      if(!s.ready()){this.stopAll(false,false);return false;}
      if(this.previewUntil>c.currentTime){return true;}
      if(s.scene!=='playing'&&!s.diagnostic){if(c.currentTime>=this.endUntil)this.stopMusic();return false;}
      if(s.lanterns>=7&&!s.diagnostic){this.stopMusic();return true;}
      if(!s.musicVolume){this.stopMusic();return false;}
      const key=s.lanterns>=3?'light':'dark';
      if(!this.loaded&&Object.keys(this.pack).length)return !s.host.lanternMobileAudio;
      // A low drone alone is not a substitute for an audible musical part.
      if(!this.buffers[key]||!this.buffers.light){this.stopMusic();return false;}
      if(this.musicKey!==key){
        const transition=Boolean(this.musicVoice);this.stopMusic(transition?.65:.15);s.haltMusic();this.musicKey=key;
        // Sequential fade with a short overlap at low level; no two loud scores.
        this.musicVoice=this.start(key,s.music,key==='dark'?.18:s.lanterns>=6?1.3:1.2,{loop:true,attack:transition?1.6:.5,offset:this.offsets?.[key]||0});
        // The same licensed piano recording forms a continuous, darker early arrangement.
        // This is a sustained recorded part, independent of the one-shot start accent.
        if(key==='dark')this.melodyVoice=this.start('light',s.music,1.4,{loop:true,rate:.9,lowpass:2200,attack:.5,offset:this.offsets?.light||0});
        if(this.musicVoice){this.musicVoice.source.loopStart=this.offsets?.[key]||0;this.musicVoice.source.loopEnd=this.buffers[key].duration;this.metrics.playbackContextTime=c.currentTime;}
        if(!this.musicVoice||(key==='dark'&&!this.melodyVoice))this.stopMusic(.05);
      }else if(this.musicVoice){const target=(key==='dark'?.18:s.lanterns>=6?1.3:1.2)*(this.gains[key]||1);if(this.musicVoice.level!==target){s.ramp(this.musicVoice.gain.gain,target,.8);this.musicVoice.level=target;}}
      return true;
    }
    presenceColor(){return Math.max(0,Math.min(1,(this.sound.threat-70/185)/(115/185)))*7;}
    presenceCutoff(){return 450+1550*this.sound.threat+this.presenceColor()*220;}
    threat(){
      const s=this.sound,c=s.context;if(!this.buffers.near)return false;
      if(!s.ready()||!s.effectsVolume||(s.scene!=='playing'&&!s.diagnostic)||!s.threat){this.stopThreat();return true;}
      for(const v of this.voices)if(v.presence&&!v.releasing){s.ramp(v.intensity.gain,s.threat,.18);s.ramp(v.filter.frequency,this.presenceCutoff(),.2);s.ramp(v.color[2].gain,this.presenceColor(),.2);s.ramp(v.color[4].gain,this.presenceColor()/7*2.1,.2);s.ramp(v.color[5].gain,this.presenceColor()*2,.2);}
      if(c.currentTime<this.nextCreature||[...this.voices].some(v=>v.presence&&!v.releasing))return true;
      const index=this.presenceIndex||0;this.presenceIndex=index+1;
      // Breath / rustle / subdued growl, with a contrasting closer palette. No sample loop.
      const close=!s.protectedThreat&&s.threatStage==='C';
      const palette=close?['near','attack2','near','attack1']:['near','near','attack2','near'];
      let key=palette[index%palette.length];if(s.threatStage==='A'||s.protectedThreat||!this.buffers[key])key='near';
      const rates=[.72,.94,.81,1.08],rate=rates[index%rates.length];
      const voice=this.start(key,s.dangerPan,key==='near'?.42:.3,{rate,duration:2.5,attack:close?.09:.22,lowpass:this.presenceCutoff(),presence:true});
      if(voice){const duration=Math.min(2.5,this.buffers[key].duration/rate);const gaps=[.4,.95,.65,1.2];this.nextCreature=c.currentTime+duration+1.1+(1-s.threat)*2+gaps[index%gaps.length];}
      else this.nextCreature=c.currentTime+.25;
      return true;
    }
    attack(){const keys=['attack1','attack2'].filter(k=>this.buffers[k]);if(!keys.length)return false;this.stopThreat();this.nextCreature=this.sound.context.currentTime+2.5;const key=keys[this.attackIndex++%keys.length];return Boolean(this.start(key,this.sound.effects,.58,{duration:2.8,attack:.025,rate:this.attackIndex%2?.96:1.04,lowpass:3200,creature:true}));}
    ending(scene){this.stopMusic(.5);if(scene!=='won'||!this.buffers.light)return false;const s=this.sound;if(!s.ready()||!s.musicVolume)return false;this.musicVoice=this.start('light',s.music,.65,{duration:6,offset:12,attack:.8});this.endUntil=s.context.currentTime+6;return true;}
    async preview(key){
      const s=this.sound;this.stopAll();const token=this.previewToken;s.haltMusic();s.clear();
      if(!s.enabled||!s.volume){return 'Включите звук и общую громкость для прослушивания.';}
      if(!await s.unlock())return 'Браузер не разрешил звук. Нажмите кнопку ещё раз.';
      await this.load();if(token!==this.previewToken)return '';if(!this.buffers[key])return 'Запись не загрузилась. Проверьте assets/audio и AUDIO_SOURCES.md. Синтез не подменяет этот пример.';
      const isMusic=key==='dark'||key==='light';if(!(isMusic?s.musicVolume:s.effectsVolume))return 'Поднимите громкость выбранной категории выше 0%.';
      this.stopAll();this.previewUntil=s.context.currentTime+5;this.previewVoice=this.start(key,isMusic?s.music:s.effects,key==='dark'?.09:key==='light'?.6:.35,{duration:5,attack:.12,preview:true,offset:this.offsets?.[key]||0});
      if(key==='dark'&&this.buffers.light)this.start('light',s.music,.7,{duration:5,rate:.9,lowpass:2200,attack:.12,preview:true});
      return 'Прослушивание аранжировки CC0 — до 5 секунд.';
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=LanternRecordings;else window.LanternRecordings=LanternRecordings;
})();


