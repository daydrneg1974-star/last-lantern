/* Test harness: minimal DOM + Web Audio stubs and an isolated loader for the game modules.
   No dependencies. Used by `node --test tests/`. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');

/* ---------- DOM stub ---------- */
class ClassList{constructor(){this.set=new Set();}add(...c){c.forEach(x=>this.set.add(x));}remove(...c){c.forEach(x=>this.set.delete(x));}toggle(c,force){const on=force===undefined?!this.set.has(c):Boolean(force);on?this.set.add(c):this.set.delete(c);return on;}contains(c){return this.set.has(c);}toString(){return [...this.set].join(' ');}}
function anyObject(){
  const store={};
  return new Proxy(function(){},{
    get(_,key){if(key in store)return store[key];if(key==='then')return undefined;if(typeof key==='symbol')return undefined;return (...args)=>anyObject();},
    set(_,key,value){store[key]=value;return true;},
    apply(){return anyObject();}
  });
}
function makeContext2d(){return anyObject();}
class Element{
  constructor(doc,tag,id){this.ownerDocument=doc;this.tagName=String(tag||'div').toUpperCase();this.id=id||'';this.children=[];this.parentNode=null;this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.value='';this.open=false;this.title='';this.style={setProperty(k,v){this[k]=String(v);},getPropertyValue(k){return this[k]||'';},removeProperty(k){delete this[k];}};this.classList=new ClassList();this.dataset={};this.attributes={};this.listeners={};this.width=300;this.height=150;this.focused=false;this._rect={width:1200,height:760,left:0,top:0};}
  getContext(){return this._ctx||(this._ctx=makeContext2d());}
  getBoundingClientRect(){return {...this._rect,right:this._rect.left+this._rect.width,bottom:this._rect.top+this._rect.height,x:this._rect.left,y:this._rect.top};}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.classList=Object.assign(new ClassList(),{set:new Set(String(v).split(/\s+/).filter(Boolean))});}
  getAttribute(k){return k in this.attributes?this.attributes[k]:null;}
  hasAttribute(k){return k in this.attributes;}
  removeAttribute(k){delete this.attributes[k];}
  addEventListener(type,fn,opts){(this.listeners[type]||(this.listeners[type]=[])).push({fn,opts});}
  removeEventListener(type,fn){if(this.listeners[type])this.listeners[type]=this.listeners[type].filter(l=>l.fn!==fn);}
  dispatch(type,event={}){event.type=type;event.target=event.target||this;event.currentTarget=this;event.isTrusted=event.isTrusted??true;event.preventDefault=event.preventDefault||(()=>{event.defaulted=true;});event.stopPropagation=event.stopPropagation||(()=>{});
    const handler=this['on'+type];if(typeof handler==='function')handler.call(this,event);
    for(const l of [...(this.listeners[type]||[])])l.fn.call(this,event);
    return event;}
  appendChild(c){c.parentNode=this;this.children.push(c);this.ownerDocument._attached(c);return c;}
  append(...c){c.forEach(x=>this.appendChild(x));}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}
  focus(){this.focused=true;this.ownerDocument.activeElement=this;}
  blur(){this.focused=false;if(this.ownerDocument.activeElement===this)this.ownerDocument.activeElement=null;}
  click(){this.dispatch('click');}
  contains(other){let n=other;while(n){if(n===this)return true;n=n.parentNode;}return false;}
  closest(sel){let n=this;while(n){if(matches(n,sel))return n;n=n.parentNode;}return null;}
  querySelector(sel){return this.ownerDocument.querySelector(sel,this);}
  querySelectorAll(sel){return this.ownerDocument.querySelectorAll(sel,this);}
  requestFullscreen(){this.ownerDocument.fullscreenElement=this;return Promise.resolve();}
}
function matches(el,sel){if(sel.startsWith('#'))return el.id===sel.slice(1);if(sel.startsWith('.'))return el.classList.contains(sel.slice(1));return el.tagName===sel.toUpperCase();}
class Document{
  constructor(){this.byId=new Map();this.all=[];this.hidden=false;this.listeners={};this.fullscreenEnabled=true;this.fullscreenElement=null;this.activeElement=null;this.body=this.createElement('body');this.head=this.createElement('head');this.documentElement=this.createElement('html');this.documentElement.appendChild(this.body);this.documentElement.appendChild(this.head);this.visibilityState='visible';}
  _attached(el){if(!this.all.includes(el))this.all.push(el);}
  createElement(tag){const el=new Element(this,tag,'');this.all.push(el);return el;}
  getElementById(id){if(!this.byId.has(id)){const el=new Element(this,id==='game'?'canvas':id.startsWith('preview')&&id!=='previewDistance'&&id!=='previewStatus'&&id!=='previewDistanceValue'?'button':'div',id);this.byId.set(id,el);this.all.push(el);this.body.appendChild(el);}return this.byId.get(id);}
  querySelector(sel,scope){const list=this.querySelectorAll(sel,scope);return list[0]||null;}
  querySelectorAll(sel,scope){return this.all.filter(el=>matches(el,sel)&&(!scope||scope.contains(el)));}
  addEventListener(type,fn,opts){(this.listeners[type]||(this.listeners[type]=[])).push({fn,opts});}
  removeEventListener(type,fn){if(this.listeners[type])this.listeners[type]=this.listeners[type].filter(l=>l.fn!==fn);}
  dispatch(type,event={}){event.type=type;event.target=event.target||this;for(const l of [...(this.listeners[type]||[])])l.fn.call(this,event);return event;}
  exitFullscreen(){this.fullscreenElement=null;return Promise.resolve();}
  hasFocus(){return !this.hidden;}
}

/* ---------- Web Audio stub ---------- */
class FakeParam{constructor(v=0){this.value=v;this.calls=[];}setValueAtTime(v){this.value=v;this.calls.push(['set',v]);return this;}linearRampToValueAtTime(v){this.value=v;this.calls.push(['lin',v]);return this;}exponentialRampToValueAtTime(v){this.value=v;this.calls.push(['exp',v]);return this;}setTargetAtTime(v){this.value=v;this.calls.push(['target',v]);return this;}cancelScheduledValues(){this.calls.push(['cancel']);return this;}cancelAndHoldAtTime(){this.calls.push(['hold']);return this;}}
class FakeNode{constructor(ctx,kind){this.context=ctx;this.kind=kind;this.connections=new Set();this.connectedTo=new Set();this.disconnected=false;this.gain=new FakeParam(1);this.frequency=new FakeParam(350);this.Q=new FakeParam(1);this.pan=new FakeParam(0);this.detune=new FakeParam(0);this.playbackRate=new FakeParam(1);this.threshold=new FakeParam(-24);this.knee=new FakeParam(30);this.ratio=new FakeParam(12);this.attack=new FakeParam(.003);this.release=new FakeParam(.25);this.started=null;this.stopped=null;this.onended=null;this.loop=false;this.buffer=null;this.type='sine';this.curve=null;this.oversample='none';ctx.nodes.push(this);}
  connect(n){this.connections.add(n);if(n instanceof FakeNode)n.connectedTo.add(this);return n;}
  disconnect(){this.disconnected=true;for(const n of this.connections)if(n instanceof FakeNode)n.connectedTo.delete(this);this.connections.clear();}
  start(t=0){if(this.started!==null)throw new Error('InvalidStateError: start twice');this.started=t;this.context.sources.push(this);}
  stop(t=0){if(this.started===null)throw new Error('InvalidStateError: stop before start');this.stopped=t;}
}
class FakeBuffer{constructor(channels,length,rate,fill=0){this.numberOfChannels=channels;this.length=length;this.sampleRate=rate;this.duration=length/rate;this.data=[];for(let c=0;c<channels;c++){const a=new Float32Array(length);if(fill)for(let i=0;i<Math.min(length,2048);i++)a[i]=fill*Math.sin(i/7);this.data.push(a);}}getChannelData(c){return this.data[c];}}
class FakeAudioContext{
  constructor(options={}){this.state='suspended';this.currentTime=0;this.sampleRate=8000;this.nodes=[];this.sources=[];this.destination={name:'destination'};this.resumeMode=FakeAudioContext.nextResumeMode||'resolve';this.decodeMode=FakeAudioContext.nextDecodeMode||'ok';this.resumeCalls=0;this.suspendCalls=0;this.closeCalls=0;this.onstatechange=null;FakeAudioContext.instances.push(this);this.options=options;}
  resume(){this.resumeCalls++;if(this.resumeMode==='never')return new Promise(()=>{});if(this.resumeMode==='reject')return Promise.reject(new Error('NotAllowedError'));if(this.resumeMode==='delay'){return new Promise(r=>setTimeout(()=>{this.setState('running');r();},FakeAudioContext.resumeDelayMs||50));}this.setState('running');return Promise.resolve();}
  suspend(){this.suspendCalls++;this.setState('suspended');return Promise.resolve();}
  close(){this.closeCalls++;this.setState('closed');return Promise.resolve();}
  setState(s){if(this.state===s)return;this.state=s;if(this.onstatechange)this.onstatechange({type:'statechange'});}
  createGain(){return new FakeNode(this,'gain');}createOscillator(){return new FakeNode(this,'oscillator');}createBufferSource(){return new FakeNode(this,'source');}createBiquadFilter(){return new FakeNode(this,'filter');}createWaveShaper(){return new FakeNode(this,'shaper');}createDynamicsCompressor(){return new FakeNode(this,'compressor');}createStereoPanner(){return new FakeNode(this,'panner');}
  createBuffer(ch,len,rate){return new FakeBuffer(ch,len,rate);}
  decodeAudioData(bytes){const n=bytes.byteLength;if(this.decodeMode==='fail')return Promise.reject(new Error('EncodingError'));if(this.decodeMode==='never')return new Promise(()=>{});const seconds=Math.max(.5,Math.min(140,n/20000));return Promise.resolve(new FakeBuffer(2,Math.round(seconds*this.sampleRate),this.sampleRate,.5));}
  advance(seconds){this.currentTime+=seconds;}
  endFinished(){for(const s of this.sources)if(s.stopped!==null&&!s.ended&&s.stopped<=this.currentTime){s.ended=true;if(s.onended)s.onended();}}
  liveSources(){return this.sources.filter(s=>!s.ended);}
}
FakeAudioContext.instances=[];FakeAudioContext.nextResumeMode=null;FakeAudioContext.nextDecodeMode=null;

function fakePack(keys=['dark','light','near','attack1','attack2'],bytes={dark:40000,light:60000,near:20000,attack1:18000,attack2:16000}){const pack={};for(const k of keys){pack[k]={data:Buffer.alloc(bytes[k]||20000,1).toString('base64'),file:k+'.bin'};}return pack;}

/* ---------- loader ---------- */
function makeHost(options={}){
  const doc=new Document();
  const raf=[];
  const timers=[];
  const win={document:doc,devicePixelRatio:options.dpr||1,innerWidth:options.width||1280,innerHeight:options.height||800,listeners:{},
    addEventListener(type,fn,opts){(this.listeners[type]||(this.listeners[type]=[])).push({fn,opts});},
    removeEventListener(type,fn){if(this.listeners[type])this.listeners[type]=this.listeners[type].filter(l=>l.fn!==fn);},
    dispatch(type,event={}){event.type=type;event.target=event.target||this;event.isTrusted=event.isTrusted??true;event.preventDefault=event.preventDefault||(()=>{event.defaulted=true;});event.stopPropagation=event.stopPropagation||(()=>{});for(const l of [...(this.listeners[type]||[])])l.fn.call(this,event);return event;},
    requestAnimationFrame(fn){raf.push(fn);return raf.length;},cancelAnimationFrame(){},
    performance:{now:()=>Date.now()},setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.push(id);return id;},clearTimeout,
    atob:s=>Buffer.from(s,'base64').toString('binary'),
    AudioContext:options.noAudio?undefined:FakeAudioContext,
    matchMedia:q=>({get matches(){return Boolean(options.media&&options.media[q]);},media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}),
    navigator:options.navigator||{maxTouchPoints:0,userAgent:'node'},
    visualViewport:options.visualViewport,
    fetch:options.fetch,
    AbortController:globalThis.AbortController,
    location:{search:options.search||'',href:'http://localhost/index.html'},
    history:{replaceState(){}},
    screen:{orientation:{type:'landscape-primary',lock:()=>Promise.reject(new Error('NotSupported')),addEventListener(){}}},
    ResizeObserver:undefined,
    LANTERN_AUDIO_PACK:options.pack===undefined?fakePack():options.pack,
    raf,timers,
  };
  win.window=win;win.self=win;doc.defaultView=win;
  return win;
}
function load(win,file,extra={}){
  const code=fs.readFileSync(path.join(ROOT,file),'utf8');
  const sandbox={console,Math,Object,Array,Number,String,Boolean,Promise,Error,Set,Map,WeakMap,Symbol,JSON,Date,Int16Array,Float32Array,Uint8Array,ArrayBuffer,Infinity,NaN,isFinite,isNaN,parseInt,parseFloat,Reflect,Proxy,setTimeout,clearTimeout,queueMicrotask,
    window:win,document:win.document,requestAnimationFrame:win.requestAnimationFrame,performance:win.performance,navigator:win.navigator,
    module:{exports:{}},exports:{},...extra};
  sandbox.require=name=>{const key=path.basename(name);if(!win._modules)win._modules={};if(!win._modules[key])win._modules[key]=load(win,key);return win._modules[key];};
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code,sandbox,{filename:file});
  return sandbox.module.exports;
}
/* Browser-like boot: scenery/sound/recordings/game with module hooks, plus setupSound on the DOM. */
function boot(options={}){
  const win=makeHost(options);
  win._modules={};if(options.mobileClass)win.document.documentElement.classList.add('mobile');
  const Art=load(win,'scenery.js');win._modules['scenery.js']=Art;win.LanternArt=Art;
  const Rec=load(win,'recordings.js');win._modules['recordings.js']=Rec;win.LanternRecordings=Rec;
  const soundModule=load(win,'sound.js');win._modules['sound.js']=soundModule;
  const game=load(win,'game.js');
  if(options.setupSound!==false)soundModule.setupSound(game.sound,win.document,win);
  return {win,doc:win.document,game,sound:game.sound,soundModule,ui:id=>win.document.getElementById(id)};
}
const tick=()=>new Promise(r=>setImmediate(r));
async function settle(n=5){for(let i=0;i<n;i++)await tick();}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
module.exports={Document,Element,FakeAudioContext,FakeBuffer,FakeNode,fakePack,makeHost,load,boot,settle,sleep,ROOT};
