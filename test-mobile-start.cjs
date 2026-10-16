const assert=require('node:assert/strict');
const elements=new Map(),ctx=new Proxy({},{get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}});
global.document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,{style:{},classList:{toggle(){}},getContext:()=>ctx,focus(){},dataset:{}});return elements.get(id)},createElement:()=>({getContext:()=>ctx}),addEventListener(){}};
global.window={lanternMobileAudio:true,lanternAudioReport(stage){stages.push(stage)},addEventListener(){}};
let frame;global.requestAnimationFrame=callback=>{frame=callback};
document.getElementById('modeSelect').value='training';
const stages=[],g=require('./game.js');let passed=0;const pass=s=>{passed++;console.log('PASS '+s)};
(async()=>{
  assert.equal(g.get().selectedMode,'training');assert.equal(g.get().player.lives,5);
  pass('Difficulty chosen while core loads is retained when the game becomes ready');
  g.sound.available=()=>true;g.sound.unlock=()=>new Promise(()=>{});g.sound.prepare=()=>new Promise(()=>{});
  const oldSet=global.setTimeout,oldClear=global.clearTimeout;
  try{
    global.setTimeout=fn=>{setImmediate(fn);return 1};global.clearTimeout=()=>{};
    g.showMenu();g.selectMode('training');const click=elements.get('start').onclick();
    assert.equal(g.get().state,'preparing');frame(500);assert.equal(g.get().remaining,120);
    await click;assert.equal(g.get().state,'playing');assert.equal(g.get().player.lives,5);
    assert.ok(stages.includes('start-timeout')&&stages.includes('fallback-active'));
    pass('iOS-style never-settling resume and decode cannot trap Start');
  }finally{global.setTimeout=oldSet;global.clearTimeout=oldClear}

  g.sound.unlock=()=>Promise.resolve(false);g.sound.prepare=()=>Promise.reject(Error('decode failed'));
  g.showMenu();await elements.get('start').onclick();assert.equal(g.get().state,'playing');
  pass('Immediate audio rejection still unlocks the round');

  let called=0;g.sound.unlock=()=>{called++;return Promise.resolve(true)};g.sound.prepare=()=>Promise.resolve();
  g.showMenu();await elements.get('start').onclick();assert.equal(g.get().state,'playing');assert.equal(called,1);
  pass('Normal mobile audio path unlocks once without duplicate start');
  console.log(passed+' mobile start checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
