const assert=require('node:assert/strict');
const elements=new Map(),ctx=new Proxy({},{get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}});
global.document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,{style:{},classList:{toggle(){}},getContext:()=>ctx,focus(){}});return elements.get(id);},createElement:()=>({getContext:()=>ctx}),addEventListener(){}};
global.window={lanternMobileAudio:true,lanternMobile:true,addEventListener(){}};
global.requestAnimationFrame=()=>{};
const g=require('./game.js');let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
function path(from,to){
  const cols=60,rows=38,id=(x,y)=>Math.floor(y/20)*cols+Math.floor(x/20),start=id(from.x,from.y),end=id(to.x,to.y),queue=[start],prev=new Map([[start,null]]);
  for(let i=0;i<queue.length&&!prev.has(end);i++){const n=queue[i],x=n%cols,y=Math.floor(n/cols);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy,k=b*cols+a;if(a<0||a>=cols||b<0||b>=rows||prev.has(k)||g.blocked(a*20+10,b*20+10,12))continue;prev.set(k,n);queue.push(k);}}
  assert.ok(prev.has(end),'reachable target');const out=[];for(let n=end;n!==null;n=prev.get(n))out.push({x:n%cols*20+10,y:Math.floor(n/cols)*20+10});return out.reverse();
}
function winRoute(){
  const s=g.get();let simulated=0;
  function walk(target){for(const p of path(s.player,target)){let limit=0;while(Math.hypot(p.x-s.player.x,p.y-s.player.y)>3){assert.ok(limit++<100,'route not stuck');g.keys.clear();const dx=p.x-s.player.x,dy=p.y-s.player.y;if(Math.abs(dx)>2)g.keys.add(dx>0?'KeyD':'KeyA');if(Math.abs(dy)>2)g.keys.add(dy>0?'KeyS':'KeyW');if(s.enemies.some(e=>Math.hypot(e.x-s.player.x,e.y-s.player.y)<125))g.flash();g.update(.02);simulated+=.02;assert.equal(g.get().state,'playing','survive route');}}g.keys.clear();}
  for(const index of [0,1,2,4,6,3,5]){if(!s.player.bag){const candidates=s.sparks.filter(p=>!p.taken).sort((a,b)=>path(s.player,a).length-path(s.player,b).length);walk(candidates[0]);}walk(s.lamps[index]);g.light();}
  assert.equal(g.get().state,'won');assert.ok(simulated<120);return{seconds:simulated,lives:s.player.lives};
}
for(const mode of ['normal','training']){
  g.showMenu();g.selectMode(mode);g.start();
  assert.equal(g.get().enemies.length,6);assert.deepEqual(g.get().enemies.slice(4).map(e=>[e.x,e.y]),[[320,650],[600,650]]);
  assert.equal(g.shadowSpeed(0),72*1.15*(mode==='training'?.8:1));
  assert.equal(g.get().remaining,120);assert.equal(g.get().lamps.length,7);
  pass(mode+': six mobile shadows and a faster chase; time and lamps unchanged');
  const result=winRoute();
  pass(mode+`: full reachable seven-lamp route in ${result.seconds.toFixed(1)} seconds with ${result.lives} lives left`);
  g.showMenu();g.start();
  const pair=g.get().enemies.slice(0,2);
  pair[0].x=300;pair[0].y=500;pair[1].x=312;pair[1].y=500;
  const before=Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y);
  g.update(.04);
  const after=Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y);
  assert.ok(after>before,`mobile shadows should separate instead of merging: ${before} -> ${after}`);
  pass(mode+': neighboring shadows spread while keeping the same chase speed');
}
console.log(checks+' mobile balance checks passed');
