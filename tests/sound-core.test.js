'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {boot,settle,FakeAudioContext}=require('./harness.js');

test('AudioContext is created once and resumed from a gesture; nodes are shared',async()=>{
  const {sound,win}=boot();const before=FakeAudioContext.instances.length;
  win.dispatch('pointerdown',{target:win.document.body});await settle();
  assert.equal(FakeAudioContext.instances.length,before+1);assert.equal(sound.context.state,'running');
  win.dispatch('pointerdown',{target:win.document.body});await settle();
  assert.equal(FakeAudioContext.instances.length,before+1,'no second context');
});
test('prepare decodes the five pack entries and reports CC0 status',async()=>{
  const {sound,ui}=boot();await sound.prepare();
  assert.deepEqual(Object.keys(sound.recordings.buffers).sort(),['attack1','attack2','dark','light','near']);
  assert.equal(sound.recordings.status(),'Записи CC0');
});
test('decode failure of every entry leaves synth fallback and a clear status',async()=>{
  FakeAudioContext.nextDecodeMode='fail';const {sound}=boot();await sound.prepare();FakeAudioContext.nextDecodeMode=null;
  assert.equal(Object.keys(sound.recordings.buffers).length,0);assert.equal(sound.recordings.failed.size,5);
  assert.equal(sound.recordings.status(),'Записи недоступны — резервный синтез');assert.equal(sound.failed,false);
});
test('empty pack (fallback boot) is treated as unavailable recordings, synth music plays',async()=>{
  const {game,sound}=boot({pack:{}});await sound.unlock();await sound.prepare();
  game.start();sound.tick();assert.ok(sound.musicVoices.size>0,'procedural music scheduled');
});
test('recorded music: dark loop before 3 lamps, light after, stops at 7; ducking on attack',async()=>{
  const {game,sound}=boot();await sound.unlock();await sound.prepare();game.start();sound.tick();
  assert.equal(sound.recordings.musicKey,'dark');assert.equal(sound.musicVoices.size,0,'no synth when recorded music runs');
  sound.setLanternCount(3);sound.tick();assert.equal(sound.recordings.musicKey,'light');
  sound.setLanternCount(7);sound.tick();assert.equal(sound.recordings.musicVoice,null);
  sound.setLanternCount(2);sound.tick();sound.play('hit');assert.ok(sound.duckUntil>sound.context.currentTime);
});
test('threat stages follow distance and are silenced when protected',async()=>{
  const {sound}=boot();await sound.unlock();await sound.prepare();sound.setScene('playing');
  sound.setThreat(180,false,0,false);assert.equal(sound.threatStage,'A');
  sound.setThreat(100,false,0,false);assert.equal(sound.threatStage,'B');
  sound.setThreat(40,false,0,false);assert.equal(sound.threatStage,'C');assert.ok(sound.heartbeat>0);
  sound.setThreat(40,true,0,true);assert.ok(sound.threat<.4);assert.equal(sound.heartbeat,0);
  sound.setThreat(Infinity);assert.equal(sound.threatStage,'none');
});
test('attack sounds are rate limited to one per 2.5 s',async()=>{
  const {sound}=boot();await sound.unlock();await sound.prepare();sound.setScene('playing');
  const n=sound.context.sources.length;sound.play('hit');const after=sound.context.sources.length;assert.ok(after>n);
  sound.play('hit');assert.equal(sound.context.sources.length,after);sound.context.advance(3);sound.play('hit');assert.ok(sound.context.sources.length>after);
});
test('voices are bounded and released; no unbounded source growth across rounds',async()=>{
  const {game,sound}=boot();await sound.unlock();await sound.prepare();
  for(let round=0;round<5;round++){game.start();sound.setScene('playing');for(let i=0;i<40;i++){sound.play('spark');sound.play('flash');sound.context.advance(.1);sound.tick();sound.context.endFinished();}game.showMenu();sound.context.advance(2);sound.context.endFinished();}
  assert.ok(sound.voices.size<=32);assert.ok(sound.recordings.voices.size<=12);
  assert.ok(sound.context.liveSources().length<60,'live sources: '+sound.context.liveSources().length);
});
test('sound settings: toggle, volumes, page blur silence and restore',async()=>{
  const {sound,ui,win}=boot();await sound.unlock();
  ui('soundToggle').click();assert.equal(sound.enabled,false);ui('soundToggle').click();assert.equal(sound.enabled,true);
  ui('musicVolume').value='0';ui('musicVolume').dispatch('input');assert.equal(sound.musicVolume,0);
  win.dispatch('blur');assert.equal(sound.pageActive,false);assert.equal(sound.ready(),false);
  win.dispatch('focus');assert.equal(sound.pageActive,true);assert.equal(sound.ready(),true);
});
test('no AudioContext in host: game still starts, sound silently unavailable',async()=>{
  const {game,ui,sound}=boot({noAudio:true});assert.equal(sound.available(),false);
  ui('start').click();await settle(10);assert.equal(game.get().state,'playing');
});
