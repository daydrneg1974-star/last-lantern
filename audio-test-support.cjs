// Small deterministic Web Audio substitute for logic tests, not a sound renderer.
const assert=require('node:assert/strict');
class Param{constructor(value=0){this.value=value;this.events=[];}setValueAtTime(v,t){this.set(v,t,'set');}linearRampToValueAtTime(v,t){this.set(v,t,'linear');}exponentialRampToValueAtTime(v,t){assert.ok(v>0);this.set(v,t,'exponential');}setTargetAtTime(v,t,k){assert.ok(k>0);this.set(v,t,'target');}cancelScheduledValues(t){this.events.push(['cancel',t]);}set(v,t,kind){assert.ok(Number.isFinite(v)&&Number.isFinite(t));this.value=v;this.events.push([kind,v,t]);}}
class Node{constructor(c){this.context=c;this.connections=[];this.gain=new Param();this.frequency=new Param();this.Q=new Param();for(const p of ['threshold','knee','ratio','attack','release'])this[p]=new Param();}connect(n){this.connections.push(n);return n;}disconnect(){this.connections=[];}start(t=0){this.started=t;}stop(t=0){this.stopped=t;}}
class FakeAudioContext{
 static instances=[];
 constructor(){this.currentTime=0;this.sampleRate=8000;this.state='running';this.destination={};this.nodes=[];this.resumeCalls=0;FakeAudioContext.instances.push(this);}
 node(type){const n=new Node(this);n.kind=type;this.nodes.push(n);return n;}
 createGain(){return this.node('gain');}createDynamicsCompressor(){return this.node('compressor');}createBufferSource(){return this.node('buffer');}createOscillator(){return this.node('oscillator');}createBiquadFilter(){return this.node('filter');}createWaveShaper(){return this.node('waveshaper');}
 createBuffer(channels,length){const data=Array.from({length:channels},()=>new Float32Array(length));return{getChannelData:ch=>data[ch]};}
 async resume(){this.resumeCalls++;if(this.rejectResume)throw Error('autoplay blocked');this.state='running';}
 advance(dt){this.currentTime+=dt;for(const n of this.nodes)if(n.stopped!==undefined&&n.stopped<=this.currentTime&&!n.ended){n.ended=true;n.onended?.();}}
}
module.exports={FakeAudioContext};
