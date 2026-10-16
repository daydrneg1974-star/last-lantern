const assert=require('node:assert/strict');
const {LanternSound,setupSound}=require('./sound.js');
const {FakeAudioContext}=require('./audio-test-support.cjs');
let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
let activated=false;
class TouchAudioContext extends FakeAudioContext{
  constructor(){super();this.state='suspended';}
  resume(){this.resumeCalls++;if(!activated)return new Promise(()=>{});this.state='running';return Promise.resolve();}
}
const controls=new Map(),listeners={};
const document={hidden:false,getElementById(id){if(!controls.has(id))controls.set(id,{setAttribute(){}});return controls.get(id);},addEventListener(n,fn){listeners[n]=fn;}};
const host={lanternMobileAudio:true,navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',audioSession:{type:'ambient'}},AudioContext:TouchAudioContext,addEventListener(n,fn){listeners[n]=fn;},setTimeout,clearTimeout};
const sound=new LanternSound(host);setupSound(sound,document,host);
const touch={isTrusted:true,pointerType:'touch',target:{}};
(async()=>{
  listeners.pointerdown(touch);
  assert.equal(sound.context,null,'a touch press must not start a suspended context');
  listeners.pointerup(touch);
  assert.equal(sound.context,null,'touch pointerup must not hold a pending resume before touchend');
  activated=true;listeners.pointerup(touch);activated=false;
  assert.equal(sound.context,null,'touch activation is reserved for touchend on iOS');
  activated=true;listeners.touchend(touch);activated=false;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sound.context.state,'running');assert.equal(sound.ready(),true);
  assert.equal(sound.context.resumeCalls,1);
  assert.equal(host.navigator.audioSession.type,'playback');
  pass('Touchend unlocks Web Audio once without an earlier pointer event poisoning pending resume');

  const android={lanternMobileAudio:true,navigator:{userAgent:'Mozilla/5.0 (Linux; Android 15)',audioSession:{type:'ambient'}}};
  new LanternSound(android).configureMobileSession();
  assert.equal(android.navigator.audioSession.type,'ambient');
  const desktop={lanternMobileAudio:false,navigator:{userAgent:'Mozilla/5.0 (iPhone)',audioSession:{type:'ambient'}}};
  new LanternSound(desktop).configureMobileSession();
  assert.equal(desktop.navigator.audioSession.type,'ambient');
  pass('Playback audio session is requested only for mobile iOS');

  const preloadHost={lanternMobileAudio:true,navigator:{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)',audioSession:{type:'ambient'}},AudioContext:TouchAudioContext};
  const preloaded=new LanternSound(preloadHost);
  await preloaded.prepare();
  assert.equal(preloadHost.navigator.audioSession.type,'playback');
  assert.equal(preloaded.context.state,'suspended','preloading still does not autoplay');
  pass('iOS playback session is selected before background audio decoding without autoplay');

  sound.context.state='suspended';activated=true;listeners.touchend(touch);activated=false;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sound.context.state,'running');assert.equal(TouchAudioContext.instances.filter(c=>c===sound.context).length,1);
  pass('touchend supports Safari touch activation without another AudioContext');

  sound.context.state='suspended';const never=sound.unlock();
  assert.ok(sound.pending);assert.equal(await never,false);assert.equal(sound.pending,null);
  activated=true;const retry=sound.unlock();activated=false;
  assert.equal(await retry,true);assert.equal(sound.context.state,'running');
  pass('A hung mobile resume expires after 1.2 seconds and can retry on a later gesture');
  await controls.get('menuSoundCheck').onclick();
  assert.match(controls.get('mobileAudioTestStatus').textContent,/Аудиоконтекст запущен; сигнал отправлен/);
  assert.match(controls.get('mobileAudioTestStatus').textContent,/Системный аудиорежим: playback/);
  assert.ok(sound.voices.size>0,'the check uses the existing game effects bus');
  pass('Menu sound check triggers an existing game signal through the mixer');
  console.log(checks+' mobile unlock checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
