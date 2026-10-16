const assert=require('node:assert/strict');
const {LanternSound,setupSound}=require('./sound.js');
const {FakeAudioContext}=require('./audio-test-support.cjs');
let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
(async()=>{
 const sound=new LanternSound({AudioContext:FakeAudioContext});assert.equal(sound.context,null);sound.setScene('playing');sound.play('flash');sound.walk(100);assert.equal(sound.context,null);assert.equal(sound.volume,.35);pass('No AudioContext or sound before user unlock; default volume 35%');
 await sound.unlock();const c=sound.context;assert.equal(c.state,'running');assert.equal(sound.master.gain.value,.35);assert.equal(sound.ambient.gain.value,1);assert.equal(c.nodes.filter(n=>n.loop).length,2);pass('Single context with rain and modulated wind after unlock');
 for(const event of ['step','spark','lamp','flash','hit','won','lost']){sound.clear();c.advance(1);sound.play(event);assert.ok(sound.voices.size>0,event);c.advance(3);assert.equal(sound.voices.size,0,event+' releases sources');}
 pass('All seven effects schedule envelopes and release nodes');
 sound.setScene('playing');sound.walk(0);assert.equal(sound.voices.size,0);sound.walk(47);assert.equal(sound.voices.size,0);sound.walk(1);assert.ok(sound.voices.size>0);c.advance(1);pass('Steps depend on distance, not held keys or standing still');
 sound.play('won');sound.setEnabled(false);assert.equal(sound.master.gain.value,0);c.advance(.1);assert.equal(sound.voices.size,0);const count=c.nodes.length;sound.play('spark');sound.walk(100);assert.equal(c.nodes.length,count);sound.setEnabled(true);await sound.unlock();assert.equal(FakeAudioContext.instances.length,1);pass('Mute cancels pending notes, emits nothing and reuses context');
 sound.setVolume(0);assert.equal(sound.master.gain.value,0);sound.play('flash');assert.equal(c.nodes.length,count);sound.setVolume(.6);assert.equal(sound.master.gain.value,.6);sound.setVolume(NaN);assert.equal(sound.volume,.6);pass('Master volume, zero volume and invalid input');
 sound.play('flash');sound.setScene('paused');assert.equal(sound.ambient.gain.value,0);c.advance(.1);assert.equal(sound.voices.size,0);sound.setScene('playing');assert.equal(sound.ambient.gain.value,1);sound.setPageActive(false);assert.equal(sound.master.gain.value,0);sound.setPageActive(true);assert.equal(sound.master.gain.value,.6);pass('Pause and hidden-window audio stop and restore correctly');
 for(let i=0;i<100;i++)sound.play('flash');assert.ok(sound.voices.size<=32);c.advance(2);assert.equal(sound.voices.size,0);pass('Voice limit prevents runaway audio');
 c.state='suspended';c.rejectResume=true;assert.equal(await sound.unlock(),false);c.rejectResume=false;assert.equal(await sound.unlock(),true);pass('Autoplay rejection can be retried on a later gesture');
 const silent=new LanternSound({});assert.equal(await silent.unlock(),false);silent.play('won');silent.setScene('playing');silent.setVolume(.4);pass('Missing Web Audio remains harmless');
 class Broken{constructor(){throw Error('device unavailable');}}
 const broken=new LanternSound({AudioContext:Broken});assert.equal(await broken.unlock(),false);broken.play('hit');broken.setEnabled(false);pass('Audio device failure does not throw into gameplay');
 const controls=new Map(),listeners={};const doc={hidden:false,getElementById(id){if(!controls.has(id))controls.set(id,{setAttribute(k,v){this[k]=v;}});return controls.get(id);},addEventListener(n,fn){listeners[n]=fn;}};
 const host={AudioContext:FakeAudioContext,addEventListener(n,fn){listeners[n]=fn;}},uiSound=new LanternSound(host);setupSound(uiSound,doc,host);
 listeners.pointerdown({isTrusted:false,target:{}});assert.equal(uiSound.context,null);listeners.pointerdown({isTrusted:true,target:{}});assert.ok(uiSound.context);
 controls.get('soundToggle').onclick();assert.equal(uiSound.enabled,false);assert.equal(controls.get('soundToggle')['aria-pressed'],'false');controls.get('soundVolume').value='20';controls.get('soundVolume').oninput();assert.equal(uiSound.volume,.2);assert.equal(controls.get('soundValue').textContent,'20%');let stopped=false;controls.get('soundVolume').onkeydown({code:'ArrowRight',stopPropagation(){stopped=true;}});assert.ok(stopped);pass('Trusted activation, accessible controls and slider keyboard handling');
 console.log(`\n${checks} audio checks passed (mock Web Audio, no listening test).`);
})().catch(e=>{console.error(e);process.exitCode=1;});
