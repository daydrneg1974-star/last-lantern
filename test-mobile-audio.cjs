const assert=require('node:assert/strict');
const {LanternSound}=require('./sound.js');
const {FakeAudioContext}=require('./audio-test-support.cjs');
class AudioContext extends FakeAudioContext{
  async decodeAudioData(bytes){assert.equal(bytes.byteLength,4);return{duration:3,numberOfChannels:1,getChannelData:()=>new Float32Array([-.5,.5])};}
}
const keys=['dark','light','near','attack1','attack2'];
const pack=Object.fromEntries(keys.map(key=>[key,{url:'assets/audio/'+key+'.ogg'}]));
let passed=0;const pass=label=>{passed++;console.log('PASS '+label)};
function host(fetcher){const stages=[];return{
  AudioContext,lanternMobileAudio:true,LANTERN_AUDIO_PACK:pack,
  fetch:fetcher,AbortController,setTimeout,clearTimeout,
  lanternAudioReport:(stage,detail)=>stages.push({stage,...detail}),stages
};}
const response={ok:true,arrayBuffer:async()=>Uint8Array.of(1,2,3,4).buffer};
(async()=>{
  let requests=[];let h=host(async(url)=>{requests.push(url);return response});let s=new LanternSound(h);
  await s.prepare();assert.deepEqual(requests.sort(),keys.map(key=>'assets/audio/'+key+'.ogg').sort());
  assert.equal(s.recordings.loaded,true);assert.equal(s.recordings.failed.size,0);
  assert.equal(h.stages.filter(e=>e.stage==='audio-loaded'&&e.bytes===4).length,5);
  assert.equal(h.stages.at(-1).stage,'audio-ready');pass('Normal binary responses decode all five recordings and report actual byte counts');

  h=host(async()=>{await new Promise(resolve=>setTimeout(resolve,30));return response});s=new LanternSound(h);
  await s.prepare();assert.equal(s.recordings.loaded,true);assert.equal(s.recordings.failed.size,0);
  pass('Delayed binary responses complete without blocking the game core');

  h=host(async()=>{throw Error('network refused')});s=new LanternSound(h);await s.prepare();
  assert.equal(s.recordings.loaded,true);assert.equal(s.recordings.failed.size,5);
  assert.equal(h.stages.filter(e=>e.stage==='audio-error').length,5);
  assert.equal(h.stages.at(-1).stage,'fallback-active');
  s.setScene('playing');await s.unlock();s.tick();assert.ok(s.musicVoices.size>0);
  pass('Full binary resource failure completes preparation and starts procedural fallback');

  h=host(async url=>url.includes('light')?{ok:false,status:503}:response);s=new LanternSound(h);await s.prepare();
  assert.ok(s.recordings.failed.has('light'));assert.equal(s.recordings.buffers.dark.duration,3);
  assert.equal(h.stages.at(-1).stage,'fallback-active');
  pass('Partial HTTP failure retains valid recordings and uses fallback for missing theme');

  h=host(()=>new Promise(()=>{}));h.setTimeout=(fn,ms)=>setTimeout(fn,2);s=new LanternSound(h);
  s.setScene('playing');await s.unlock();s.tick();assert.ok(s.musicVoices.size>0);
  await s.recordings.load();assert.equal(s.recordings.loaded,true);assert.equal(s.recordings.failed.size,5);
  assert.equal(h.stages.filter(e=>e.stage==='audio-timeout').length,5);
  pass('Hanging binary requests have a deadline while the round can already use fallback music');

  console.log(passed+' mobile audio checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
