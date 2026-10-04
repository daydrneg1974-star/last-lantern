'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {boot,settle,sleep,FakeAudioContext}=require('./harness.js');
const MOBILE_PACK=()=>({dark:{urls:['a/dark.m4a','a/dark.ogg'],timeout:300},light:{urls:['a/light.m4a'],timeout:300},near:{urls:['a/near.m4a','a/near.ogg'],timeout:300},attack1:{urls:['a/attack1.m4a'],timeout:300},attack2:{urls:['a/attack2.m4a'],timeout:300}});
const okFetch=(bytes=30000,delays={})=>async(url,opts)=>{const d=delays[url]||0;if(d===Infinity)return new Promise((_,reject)=>{opts?.signal?.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})));});if(d)await sleep(d);return {ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(bytes)};};
const mobileBoot=(extra={})=>boot({pack:MOBILE_PACK(),fetch:okFetch(),...extra,navigator:extra.navigator||{maxTouchPoints:5,userAgent:'iPhone'}});

test('mobile pack: five files fetched separately and decoded; streaming flag set',async()=>{
  const {sound}=mobileBoot();assert.equal(sound.recordings.streaming,true);
  await sound.prepare();assert.equal(Object.keys(sound.recordings.buffers).length,5);assert.equal(sound.recordings.failed.size,0);
  assert.equal(sound.recordings.metrics.dark.source,'a/dark.m4a');
});
test('mobile pack: HTTP error on the AAC copy falls back to the Ogg original; light has no fallback',async()=>{
  const fetch=async url=>url.endsWith('.m4a')?{ok:false,status:404}:{ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(30000)};
  const {sound}=mobileBoot({fetch});await sound.prepare();
  assert.deepEqual(Object.keys(sound.recordings.buffers).sort(),['dark','near']);assert.deepEqual([...sound.recordings.failed].sort(),['attack1','attack2','light']);
  assert.equal(sound.recordings.metrics.dark.source,'a/dark.ogg');
});
test('mobile pack: decode failure of the AAC copy tries the next candidate',async()=>{
  const {sound}=mobileBoot();let calls=0;
  sound.build();const real=sound.context.decodeAudioData.bind(sound.context);sound.context.decodeAudioData=bytes=>{calls++;return calls===1?Promise.reject(new Error('EncodingError')):real(bytes);};
  await sound.recordings.load();assert.ok(sound.recordings.buffers.dark||sound.recordings.buffers.near);assert.ok(calls>=2);
});
test('mobile pack: a stalled request is aborted by its own timeout; the others still load',async()=>{
  const {sound}=mobileBoot({fetch:okFetch(30000,{'a/light.m4a':Infinity})});const t=Date.now();await sound.prepare();
  assert.ok(Date.now()-t<2000,'did not wait forever');assert.deepEqual([...sound.recordings.failed],['light']);assert.equal(Object.keys(sound.recordings.buffers).length,4);assert.equal(sound.recordings.loaded,true);
});
test('mobile pack: fetch unavailable or every file failing never blocks the game',async()=>{
  const {game,ui,sound}=boot({pack:MOBILE_PACK(),fetch:undefined});Object.assign(sound.options,{startBudgetMs:2500});sound.startBudgetMs=2500;
  ui('start').click();await settle(30);assert.equal(game.get().state,'playing');assert.equal(sound.recordings.failed.size,5);assert.equal(sound.failed,false);
});
test('streaming: procedural music plays while files load, recordings attach later in the same round',async()=>{
  let release;const gate=new Promise(r=>release=r);
  const fetch=async()=>{await gate;return {ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(30000)};};
  const {game,sound}=mobileBoot({fetch});await sound.unlock();game.start();sound.tick();
  assert.equal(sound.recordings.loaded,false);assert.ok(sound.musicVoices.size>0,'synth music while loading');assert.equal(sound.recordings.musicVoice,null);
  release();await sound.recordings.loading;sound.tick();
  assert.equal(sound.recordings.musicKey,'dark');assert.notEqual(sound.recordings.musicVoice,null,'recorded music took over');
  assert.equal(sound.recordings.status(),'Записи CC0');
});
test('start budget: round starts within the budget even if resume() never settles (iOS stall)',async()=>{
  FakeAudioContext.nextResumeMode='never';
  const {game,ui,sound}=mobileBoot();sound.build();FakeAudioContext.nextResumeMode=null;sound.startBudgetMs=120;sound.options.resumeTimeoutMs=80;
  const t=Date.now();ui('start').click();assert.equal(game.get().state,'preparing');
  for(let i=0;i<40&&game.get().state!=='playing';i++)await sleep(10);
  assert.equal(game.get().state,'playing');assert.ok(Date.now()-t<400,'took '+(Date.now()-t));
});
test('start budget: without a budget (desktop) the round waits for the recordings as before',async()=>{
  let release;const gate=new Promise(r=>release=r);const fetch=async()=>{await gate;return {ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(30000)};};
  const {game,ui,sound}=mobileBoot({fetch});assert.equal(sound.startBudgetMs,undefined);
  ui('start').click();await sleep(60);assert.equal(game.get().state,'preparing');release();await settle(20);assert.equal(game.get().state,'playing');
});
test('unlock: stalled resume() is bounded, pending is cleared and the next gesture retries',async()=>{
  FakeAudioContext.nextResumeMode='never';const {sound}=mobileBoot();sound.build();FakeAudioContext.nextResumeMode=null;sound.options.resumeTimeoutMs=50;
  const first=await sound.unlock();assert.equal(first,false);assert.equal(sound.pending,null);assert.equal(sound.resumeStalls,1);
  sound.context.resumeMode='resolve';const second=await sound.unlock();assert.equal(second,true);assert.equal(sound.context.state,'running');assert.equal(sound.resumeStalls,0);
});
test('unlock: after a stall an interrupted context gets suspend()+resume()',async()=>{
  FakeAudioContext.nextResumeMode='never';const {sound}=mobileBoot();sound.build();FakeAudioContext.nextResumeMode=null;sound.options.resumeTimeoutMs=30;
  await sound.unlock();sound.context.state='interrupted';sound.context.resumeMode='resolve';await sound.unlock();
  assert.equal(sound.context.suspendCalls,1);assert.equal(sound.context.state,'running');
});
test('wake: returning to the foreground resumes a suspended/interrupted context without a new gesture',async()=>{
  const {sound,doc}=mobileBoot();await sound.unlock();sound.context.state='interrupted';
  doc.hidden=true;doc.dispatch('visibilitychange');doc.hidden=false;doc.dispatch('visibilitychange');await settle();
  assert.equal(sound.context.state,'running');assert.equal(sound.pageActive,true);
});
test('wake: no context yet or sound disabled → no-op, no context created',async()=>{
  const {sound}=mobileBoot();sound.context=null;sound.wake();assert.equal(sound.context,null);
});
test('wake: a stalled background resume never blocks the next real gesture',async()=>{
  const {sound}=mobileBoot();await sound.unlock();sound.context.state='interrupted';sound.context.resumeMode='never';
  sound.wake();assert.equal(sound.pending,null,'wake does not occupy pending');
  sound.context.resumeMode='resolve';const ok=await sound.unlock();assert.equal(ok,true);assert.equal(sound.context.state,'running');
});
test('unlock: a concurrent caller sees the real context state, not the race token',async()=>{
  const {sound}=mobileBoot();sound.build();sound.context.resumeMode='delay';FakeAudioContext.resumeDelayMs=30;
  const a=sound.unlock(),b=sound.unlock();assert.deepEqual(await Promise.all([a,b]),[true,true]);FakeAudioContext.resumeDelayMs=null;
});
test('audio session: playback type is requested only on the mobile page, follows the sound toggle, and is skipped when the API is absent',async()=>{
  const session={type:'auto'};
  const a=boot({pack:MOBILE_PACK(),fetch:okFetch(),navigator:{audioSession:session,maxTouchPoints:5}});
  a.sound.options.playbackSession=true;a.sound.context=null;a.sound.build();assert.equal(session.type,'playback');
  a.sound.setEnabled(false);assert.equal(session.type,'auto');a.sound.setEnabled(true);assert.equal(session.type,'playback');
  const session2={type:'auto'};const b=boot({navigator:{audioSession:session2}});await b.sound.unlock();assert.equal(session2.type,'auto','desktop page leaves the session alone');
  const c=boot({navigator:{}});c.sound.options.playbackSession=true;await c.sound.unlock();assert.equal(c.sound.context.state,'running','no API, no error');
});
test('repeated rounds on the mobile pack keep one AudioContext and bounded live sources',async()=>{
  const {game,sound}=mobileBoot();await sound.unlock();await sound.prepare();const n=FakeAudioContext.instances.length;
  for(let r=0;r<6;r++){game.start();for(let i=0;i<30;i++){sound.setThreat(60,false,0,false);sound.play('spark');sound.context.advance(.2);sound.tick();sound.context.endFinished();}game.showMenu();sound.context.advance(3);sound.context.endFinished();}
  assert.equal(FakeAudioContext.instances.length,n);assert.ok(sound.context.liveSources().length<60,'live: '+sound.context.liveSources().length);
});
