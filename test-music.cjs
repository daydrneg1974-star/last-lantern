const assert=require('node:assert/strict');
const {LanternSound,setupSound}=require('./sound.js');
const {FakeAudioContext}=require('./audio-test-support.cjs');
let checks=0;
const pass=name=>{checks++;console.log('PASS '+name);};
(async()=>{
 const s=new LanternSound({AudioContext:FakeAudioContext});s.setScene('playing');s.tick();assert.equal(s.context,null);await s.unlock();const c=s.context;s.tick();
 assert.equal(s.musicStage,0);assert.equal(s.musicVoices.size,5);assert.deepEqual([...s.musicVoices].map(v=>v.source.frequency.value),[146.83,174.61,220,73.42,293.66]);pass('0 lamps: harmony, harmonic bass and audible motif, only after unlock');
 const sameNotes=c.nodes.length;s.tick();s.tick();assert.equal(c.nodes.length,sameNotes);assert.equal(FakeAudioContext.instances.length,1);pass('Repeated frame calls do not duplicate the composition or context');
 s.setLanternCount(3);c.advance(.31);s.tick();assert.equal(s.musicStage,1);assert.equal(s.musicVoices.size,5);assert.ok([...s.musicVoices].some(v=>v.source.frequency.value===349.23));
 const beat=s.musicBeat,time=s.nextMusicTime;s.setLanternCount(5);assert.equal(s.musicStage,1);assert.equal(s.musicBeat,beat);assert.equal(s.nextMusicTime,time);pass('3 and 5 lamps: warm harmony and melody, no restart within phase');
 s.setLanternCount(6);c.advance(.31);s.tick();assert.equal(s.musicStage,2);assert.equal(s.musicVoices.size,5);c.advance(.8);s.tick();assert.ok([...s.musicVoices].some(v=>v.source.frequency.value===440));pass('6 lamps: fuller harmony and a note on every beat');
 const pausedBeat=s.musicBeat;s.setScene('paused');c.advance(.5);const nodes=c.nodes.length;s.tick();assert.equal(c.nodes.length,nodes);assert.equal(s.musicVoices.size,0);c.advance(12);s.setScene('playing');s.tick();assert.equal(s.musicStage,2);assert.equal(s.musicBeat,pausedBeat+1);assert.ok(s.musicVoices.size>=4);pass('Pause releases music; resume restores harmony without catch-up bursts');
 s.setMusicVolume(0);c.advance(.5);assert.equal(s.musicVoices.size,0);assert.equal(s.music.gain.value,0);assert.equal(s.effects.gain.value,.7);s.play('spark');assert.ok(s.voices.size>0);const before=c.nodes.length;s.tick();assert.equal(c.nodes.length,before);
 s.setMusicVolume(.3);s.tick();assert.ok(s.musicVoices.size>0);assert.equal(s.music.gain.value,.3);assert.equal(s.effects.gain.value,.7);pass('Music zero leaves effects and rain enabled; restoring volume resumes music');
 s.setEffectsVolume(.2);assert.equal(s.effects.gain.value,.2);assert.equal(s.music.gain.value,.3);s.setEffectsVolume(0);c.advance(.1);const beforeEffect=c.nodes.length;s.play('flash');assert.equal(c.nodes.length,beforeEffect);c.advance(.8);s.tick();assert.ok(c.nodes.length>beforeEffect);pass('Effects volume is independent of the music bus');
 s.setEnabled(false);assert.equal(s.master.gain.value,0);c.advance(.5);assert.equal(s.musicVoices.size,0);const off=c.nodes.length;s.tick();assert.equal(c.nodes.length,off);s.setEnabled(true);await s.unlock();s.tick();assert.ok(s.musicVoices.size>0);assert.equal(FakeAudioContext.instances.length,1);pass('Global mute silences both buses, unmute reuses one transport');
 s.setLanternCount(7);c.advance(.5);const count=c.nodes.length;s.tick();assert.equal(c.nodes.length,count);s.setScene('won');assert.equal(s.musicVoices.size,9);const winCount=c.nodes.length;s.setScene('won');s.tick();assert.equal(c.nodes.length,winCount);c.advance(5);assert.equal(s.musicVoices.size,0);pass('7 lamps: loop stops, one finite victory composition');
 s.setScene('lost');assert.equal(s.musicVoices.size,8);const lossCount=c.nodes.length;s.setScene('lost');assert.equal(c.nodes.length,lossCount);c.advance(5);assert.equal(s.musicVoices.size,0);pass('Defeat has a separate finite, non-repeating musical ending');
 s.setScene('menu');s.setScene('playing');s.tick();assert.equal(s.lanterns,0);assert.equal(s.musicStage,0);assert.equal(s.musicBeat,1);assert.deepEqual([...s.musicVoices].map(v=>v.source.frequency.value),[146.83,174.61,220,73.42,293.66]);pass('Restart resets lantern count, phase and musical cursor');
 s.setLanternCount(6);s.resetMusic();c.advance(.5);s.tick();assert.equal(s.musicStage,0);assert.equal(s.musicBeat,1);s.setPageActive(false);c.advance(.5);assert.equal(s.musicVoices.size,0);s.setPageActive(true);s.tick();assert.ok(s.musicVoices.size>0);pass('Direct restart and hidden-window recovery clear old voices');
 for(let i=0;i<3000;i++){c.advance(.05);s.tick();assert.ok(s.musicVoices.size<=24);}assert.equal(c.nodes.filter(n=>n.loop).length,2);pass('150-second transport remains bounded with no extra ambience loops');
 const controls=new Map(),listeners={},doc={getElementById(id){if(!controls.has(id))controls.set(id,{setAttribute(){}});return controls.get(id);},addEventListener(n,fn){listeners[n]=fn;}},host={AudioContext:FakeAudioContext,addEventListener(n,fn){listeners[n]=fn;}};
 setupSound(s,doc,host);controls.get('musicVolume').value='0';controls.get('musicVolume').oninput();assert.equal(s.musicVolume,0);assert.equal(controls.get('musicValue').textContent,'0%');controls.get('effectsVolume').value='65';controls.get('effectsVolume').oninput();assert.equal(s.effectsVolume,.65);assert.equal(s.musicVolume,0);
 for(const id of ['musicVolume','effectsVolume']){let stopped=false;controls.get(id).onkeydown({code:'ArrowLeft',stopPropagation(){stopped=true;}});assert.ok(stopped);}
 pass('Independent UI sliders update labels and retain keyboard focus');
 console.log(`\n${checks} music checks passed (mock Web Audio; not a listening test).`);
})().catch(e=>{console.error(e);process.exitCode=1;});

