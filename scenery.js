/* Procedural artwork only. This file never changes game objects or collision geometry. */
(() => {
  'use strict';
  class LanternArt {
    constructor(ctx,buildings,width=1200,height=760){
      this.ctx=ctx;this.buildings=buildings;this.w=width;this.h=height;
      this.clock=0;this.walk=0;this.stride=0;this.facing=1;this.previous=null;this.cacheBuilds=0;
      // Fixed-size pools: weather cannot accumulate over a long session.
      this.rain=Array.from({length:65},(_,i)=>({x:this.noise(i+1)*width,y:this.noise(i+100)*height,s:90+this.noise(i+200)*65}));
      this.puddles=[[70,92,29,8],[580,96,42,9],[1120,95,35,8],[333,275,24,6],[866,328,31,7],[80,700,30,8],[1120,704,32,7],[570,500,45,9],[885,535,36,8]];
      this.layer=document.createElement('canvas');this.layer.width=width;this.layer.height=height;
      this.buildScene(this.layer.getContext('2d'));this.cacheBuilds++;
      this.mist=document.createElement('canvas');this.mist.width=200;this.mist.height=200;this.glow(this.mist.getContext('2d'),100,100,100,'#9dbbd109');
    }
    noise(n){const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);}
    line(c,x,y,x2,y2,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();}
    poly(c,points,fill,stroke){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
    ellipse(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();}
    glow(c,x,y,r,color){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
    buildScene(c){
      c.fillStyle='#172537';c.fillRect(0,0,this.w,this.h);
      // Thousands of irregular wet cobbles are drawn only once.
      for(let row=0;row<64;row++)for(let col=0;col<64;col++){
        const seed=row*64+col,n=this.noise(seed),x=col*20-(row%2)*10,y=row*12;
        c.fillStyle=['#1d2c3d','#202e40','#233245','#1b2b3d'][Math.floor(n*4)];
        c.beginPath();c.roundRect(x+1+n,y+1,17-n*2,9,1.5);c.fill();this.line(c,x+2,y+2,x+15,y+2,'#40546a30');
        if(n>.91)this.line(c,x+4,y+7,x+13,y+7,'#65839a25');
      }
      // Drainage channels along the old street grid.
      for(const x of [84,276,364,556,644,836,924,1116])this.line(c,x,0,x,this.h,'#080f1c88',2);
      for(const b of this.buildings){
        c.fillStyle='#26374a';c.fillRect(b.x-7,b.y-7,b.w+14,b.h+14);
        for(let i=0;i<b.w+14;i+=13){this.line(c,b.x-7+i,b.y-7,b.x-7+i,b.y-2,'#43546a');this.line(c,b.x-7+i,b.y+b.h+2,b.x-7+i,b.y+b.h+7,'#43546a');}
      }
      this.buildings.forEach((b,i)=>this.house(c,b,i));
      c.font='italic 11px Georgia';c.textAlign='center';c.fillStyle='#8193a138';
      c.fillText('RUE DES LANTERNES',595,242);c.fillText('PLACE DU VEILLEUR',590,558);
      for(const [x,y] of [[306,406],[586,166],[866,645]]){
        this.ellipse(c,x,y,10,5,'#0b1420');for(let i=-6;i<=6;i+=3)this.line(c,x+i,y-3,x+i,y+3,'#3e4e5b');
      }
    }
    house(c,b,i){
      const {x,y,w,h}=b;
      c.fillStyle='#050b16a0';c.fillRect(x+5,y+9,w,h);
      c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
      c.fillStyle=['#30394b','#343b49','#293a49','#373b47'][i%4];c.fillRect(x,y,w,h);
      // Raised roof over a shallow visible facade. Every ornament stays in the original footprint.
      c.fillStyle='#1a2737';c.fillRect(x,y+68,w,32);
      for(let yy=72;yy<99;yy+=7)for(let xx=0;xx<w;xx+=24){this.line(c,x+xx,y+yy,x+xx+20,y+yy,'#6170831a');}
      const roof=['#30465d','#35465b','#293e55','#3c4358'][i%4];
      const roofType=(i+Math.floor(i/3))%3;
      if(roofType===0){
        this.poly(c,[[x+2,y+10],[x+80,y+1],[x+158,y+10],[x+148,y+68],[x+12,y+68]],roof,'#63728a');
        this.poly(c,[[x+2,y+10],[x+80,y+1],[x+80,y+66],[x+12,y+68]],'#23364b');
        this.line(c,x+80,y+3,x+80,y+66,'#78869b',2);
      }else if(roofType===1){
        for(let j=0;j<2;j++){
          const xx=x+j*80;
          this.poly(c,[[xx+2,y+23],[xx+38,y+2],[xx+77,y+23],[xx+77,y+68],[xx+2,y+68]],roof,'#607089');
          this.poly(c,[[xx+38,y+3],[xx+77,y+23],[xx+77,y+68],[xx+38,y+52]],'#233246');
          this.line(c,xx+38,y+3,xx+38,y+52,'#708098');
        }
      }else{
        this.poly(c,[[x+3,y+14],[x+25,y+2],[x+135,y+2],[x+157,y+14],[x+147,y+69],[x+13,y+69]],roof,'#6a7a90');
        this.poly(c,[[x+25,y+2],[x+135,y+2],[x+128,y+37],[x+32,y+37]],'#24374b');
        this.line(c,x+32,y+38,x+128,y+38,'#697b92',2);
      }
      // Slate seams and uneven highlights.
      for(let yy=17;yy<66;yy+=8)for(let xx=15;xx<145;xx+=15){
        this.line(c,x+xx+(yy%2)*3,y+yy,x+xx+12,y+yy,'#93a2b01c');
        this.line(c,x+xx,y+yy,x+xx-2,y+yy+6,'#0d1b2d55');
      }
      this.line(c,x+10,y+69,x+150,y+69,'#08121f',4);this.line(c,x+10,y+67,x+150,y+67,'#61728a',1);
      // Chimney, brickwork and a dormer window.
      const ch=x+24+(i%3)*38;c.fillStyle='#111b29';c.fillRect(ch+4,y+12,13,23);c.fillStyle='#586070';c.fillRect(ch,y+8,12,23);
      c.fillStyle='#28303d';c.fillRect(ch-2,y+6,16,5);for(let yy=15;yy<30;yy+=5)this.line(c,ch,y+yy,ch+12,y+yy,'#273446');
      this.poly(c,[[x+95,y+48],[x+106,y+34],[x+117,y+48]],'#59667b','#89909d');
      c.fillStyle='#162337';c.fillRect(x+98,y+48,16,13);c.fillStyle='#c2a16b';c.fillRect(x+102,y+50,8,8);this.line(c,x+106,y+50,x+106,y+58,'#3b3d42');
      for(let j=0;j<4;j++){
        const wx=x+16+j*36,lit=(i+j)%3!==0;
        if(lit)this.glow(c,wx+5,y+84,19,'#e3b26920');
        c.fillStyle='#111b29';c.fillRect(wx-2,y+73,14,18);c.fillStyle=lit?'#c5a16b':'#34506a';c.fillRect(wx,y+76,10,12);
        this.line(c,wx+5,y+76,wx+5,y+88,'#454043');this.line(c,wx,y+82,wx+10,y+82,'#454043');
        this.line(c,wx-2,y+90,wx+12,y+90,'#7f7c76');
      }
      c.fillStyle='#111b29';c.fillRect(x+69,y+78,19,22);this.poly(c,[[x+69,y+78],[x+78,y+72],[x+88,y+78]],'#162132');
      c.fillStyle='#4a4544';c.fillRect(x+73,y+82,11,18);c.fillStyle='#bb985e';c.fillRect(x+80,y+89,2,2);
      this.line(c,x+68,y+99,x+89,y+99,'#71808c',2);
      // Small bench and potted tree sit against the facade, inside the blocked footprint.
      for(let j=0;j<3;j++)this.line(c,x+5,y+93+j*2,x+25,y+93+j*2,'#76634e',1.5);
      this.line(c,x+8,y+91,x+8,y+100,'#141e29',2);this.line(c,x+23,y+91,x+23,y+100,'#141e29',2);
      c.fillStyle='#645445';c.fillRect(x+137,y+91,12,9);this.line(c,x+143,y+95,x+143,y+80,'#796957',2);
      this.ellipse(c,x+143,y+82,11,10,'#172f32');this.ellipse(c,x+139,y+79,7,7,'#2c4747');this.ellipse(c,x+146,y+76,7,7,'#365354');
      c.restore();
    }
    advance(dt,player,playing){
      this.clock+=dt;
      if(this.previous&&playing){const dx=player.x-this.previous.x,dy=player.y-this.previous.y,d=Math.hypot(dx,dy);this.stride=Math.min(1,d/Math.max(.001,dt*100));this.walk+=d*.12;if(Math.abs(dx)>.1)this.facing=dx>0?1:-1;}else this.stride=0;
      this.previous={x:player.x,y:player.y};
    }
    reset(){this.previous=null;this.walk=0;this.stride=0;this.facing=1;}
    ground(lamps){const c=this.ctx;c.drawImage(this.layer,0,0);for(const [x,y,rx,ry]of this.puddles){
      this.ellipse(c,x,y,rx,ry,'#0c1d2be0');this.line(c,x-rx*.6,y+ry*.5,x+rx*.6,y+ry*.5,'#6d8da035');
      const l=lamps.find(l=>l.lit&&Math.hypot(l.x-x,l.y-y)<135);if(l){
        for(let j=0;j<5;j++){const flicker=Math.sin(this.clock*2+j+x)*2;this.line(c,x-rx*.5+j*2+flicker,y-ry+3+j*2,x+rx*.5-j*2+flicker,y-ry+3+j*2,`rgba(238,188,98,${.25-j*.035})`,1.5);}
      }
    }}
    lamp(l,index){const c=this.ctx;c.save();c.translate(l.x,l.y);
      this.ellipse(c,0,7,14,5,'#050c18aa');this.ellipse(c,0,3,8,4,'#3d5064');
      this.line(c,0,3,0,-29,l.lit?'#806b4d':'#46596e',4);this.line(c,1,0,1,-29,'#a5a49155');
      c.strokeStyle=l.lit?'#a79870':'#657c91';c.lineWidth=2;c.beginPath();c.moveTo(0,-21);c.quadraticCurveTo(-15,-37,-9,-39);c.stroke();
      this.poly(c,[[-8,-33],[0,-39],[8,-33]],l.lit?'#c2aa79':'#697b90');
      this.poly(c,[[-6,-32],[6,-32],[4,-20],[-4,-20]],l.lit?'#ffe7ab':'#233a51','#81909b');
      this.line(c,0,-32,0,-20,l.lit?'#b49a65':'#50657b');this.line(c,-6,-19,6,-19,'#536474',2);
      if(l.lit){const progress=1-l.ignition/.8;this.glow(c,0,-26,28+12*progress,'#ffd38499');
        for(let i=0;i<3;i++){const a=this.clock*.7+i*2.1;c.fillStyle='#f3ce8977';c.fillRect(Math.cos(a)*17,-23+Math.sin(a*1.3)*12,1.5,1.5);}
      }else{this.line(c,-8,-12,-4,-16,'#a4bfd050');this.line(c,4,-4,9,-9,'#a4bfd035');}
      c.font='10px Segoe UI';c.textAlign='center';c.fillStyle=l.lit?'#f0d294':'#94a7be';c.fillText(String(index+1).padStart(2,'0'),0,29);c.restore();
    }
    traveler(player,opacity){const c=this.ctx,step=Math.sin(this.walk)*this.stride,bob=Math.abs(step)*1.2,side=this.facing;
      this.glow(c,player.x+side*18,player.y+5,84,'#efd0852b');c.save();c.translate(player.x,player.y);c.scale(1.5,1.5);c.globalAlpha=opacity;
      this.ellipse(c,0,12,13,5,'#050d1abb');
      this.line(c,-4,7,-5,15+step*2,'#7c6853',4);this.line(c,4,7,5,15-step*2,'#7c6853',4);
      c.translate(0,-bob);c.shadowColor='#b9edff';c.shadowBlur=9;
      this.poly(c,[[0,-9],[8,-4],[11+step,11],[0,9],[-11+step,11],[-8,-4]],'#547f98','#b9e2e9');c.shadowBlur=0;
      this.poly(c,[[-7,-2],[-3,-5],[1,6],[-6,8]],'#2e506a');
      c.fillStyle='#9b7954';c.fillRect(-7*side-3,-2,6,10);this.line(c,-8*side,1,-4*side,1,'#d2b17b');
      this.ellipse(c,0,-10,8,9,'#719cb2');this.ellipse(c,side*2,-8,5,5,'#d6bd94');
      this.poly(c,[[-8,-11],[-6,-18],[1,-21],[7,-16],[8,-10],[1,-14]],'#658eaa','#a6d5e2');
      this.line(c,-5,-2,7,-2,'#dfb976',3);this.poly(c,[[5,-3],[12+step*2,0],[6,3]],'#c59b60');
      const lx=side*14,ly=4+step*2;
      this.line(c,side*7,0,lx,ly-4,'#88a9b6',3);this.line(c,lx,ly-4,lx,ly,'#d1b885',1);
      c.strokeStyle='#e7c888';c.lineWidth=1;c.beginPath();c.arc(lx,ly,3,Math.PI,Math.PI*2);c.stroke();
      c.fillStyle='#56482d';c.fillRect(lx-4,ly,8,10);c.fillStyle='#ffe6a0';c.fillRect(lx-2,ly+2,4,6);this.glow(c,lx,ly+5,24,'#ffd785aa');c.restore();
    }
    creature(e,t){const c=this.ctx;const sway=Math.sin(t*2+e.phase)*2;c.save();c.translate(e.x,e.y);c.scale(1.3,1.3);
      this.ellipse(c,0,12,16,5,'#03091588');this.glow(c,0,0,30,'#271b4c44');
      c.strokeStyle='#a992bd';c.lineWidth=1.1;c.fillStyle='#17172f';c.beginPath();c.moveTo(-13,11);
      c.quadraticCurveTo(-15,-4,-10,-12);c.lineTo(-12,-22);c.lineTo(-4,-18);c.quadraticCurveTo(1,-22,7,-17);c.lineTo(14,-23);c.lineTo(12,-10);c.quadraticCurveTo(18,0,12,12);
      for(let j=12;j>=-12;j-=4)c.lineTo(j,12+Math.sin(t*3+e.phase+j)*5);c.closePath();c.fill();c.stroke();
      this.poly(c,[[-8,-8],[0,-13],[9,-7],[5,3],[-5,4]],'#080e20');
      for(const side of [-1,1]){c.strokeStyle='#88739c';c.beginPath();c.moveTo(side*11,-4);c.quadraticCurveTo(side*23,sway,side*20,8+sway);c.stroke();}
      c.shadowColor='#e6b2e8';c.shadowBlur=8;this.line(c,-6,-6,-2,-5,'#f0c5ec',2);this.line(c,3,-5,7,-6,'#f0c5ec',2);c.restore();
    }
    weather(){const c=this.ctx,t=this.clock;c.save();c.strokeStyle='#a3bed029';c.lineWidth=.7;c.beginPath();
      for(const d of this.rain){const y=(d.y+t*d.s)%this.h,x=(d.x+t*19)%this.w;c.moveTo(x,y);c.lineTo(x-3,y-9);}c.stroke();
      for(let i=0;i<8;i++){const p=this.puddles[i],phase=(t*.65+i*.31)%1;c.strokeStyle=`rgba(149,180,199,${(1-phase)*.17})`;c.beginPath();c.ellipse(p[0]+Math.sin(i)*10,p[1],phase*9,phase*3,0,0,Math.PI*2);c.stroke();}
      for(let i=0;i<3;i++){c.save();c.translate((i*430+t*8)%(this.w+300)-150,240+i*190);c.scale(3,.5);c.drawImage(this.mist,-100,-100);c.restore();}c.restore();
    }
    particles(particles){const c=this.ctx;c.save();for(const p of particles){c.globalAlpha=Math.max(0,p.life);this.line(c,p.x,p.y,p.x-p.vx*.035,p.y-p.vy*.035,p.color,1.3);c.fillStyle=p.color;c.fillRect(p.x-1,p.y-1,2.5,2.5);if(p.life>.7){c.globalAlpha=p.life*.16;this.ellipse(c,p.x,p.y,4,4,p.color);}}c.restore();}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=LanternArt;else window.LanternArt=LanternArt;
})();
