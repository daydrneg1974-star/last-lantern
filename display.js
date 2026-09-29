/* Fullscreen and backing-buffer sizing; logical game coordinates remain 1200 x 760. */
(() => {
  'use strict';
  function fitBuffer(width,height,dpr=1){
    const scale=Math.max(.1,Math.min(width/1200,height/760))*Math.min(2,Math.max(1,dpr));
    const bounded=Math.min(scale,Math.sqrt(3000000/(1200*760)));
    return {width:Math.round(1200*bounded),height:Math.round(760*bounded)};
  }
  function setupDisplay(doc,win){
    const canvas=doc.getElementById('game'),shell=doc.getElementById('gameShell'),button=doc.getElementById('fullscreen'),notice=doc.getElementById('displayNotice');
    const ctx=canvas.getContext('2d');
    function resize(){const box=canvas.getBoundingClientRect();if(box.width<=0||box.height<=0)return;const size=fitBuffer(box.width,box.height,win.devicePixelRatio||1);if(canvas.width!==size.width||canvas.height!==size.height){canvas.width=size.width;canvas.height=size.height;}ctx.setTransform(canvas.width/1200,0,0,canvas.height/760,0,0);}
    function sync(){const active=doc.fullscreenElement===shell;button.textContent=active?'⛶ Выйти из полного экрана':'⛶ Полный экран';button.setAttribute('aria-pressed',String(active));resize();}
    button.onclick=async()=>{
      notice.textContent='';button.disabled=true;
      try{if(doc.fullscreenElement===shell)await doc.exitFullscreen();else await shell.requestFullscreen();sync();}
      catch{notice.textContent='Полный экран недоступен. Можно продолжить игру в этом окне.';}
      finally{button.disabled=false;button.blur();}
    };
    if(!shell.requestFullscreen||doc.fullscreenEnabled===false){button.disabled=true;button.title='Этот браузер не поддерживает полноэкранный режим';}
    doc.addEventListener('fullscreenchange',sync);win.addEventListener('resize',resize);
    if(win.ResizeObserver){const observer=new win.ResizeObserver(resize);observer.observe(canvas);}
    resize();return {resize,sync};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={fitBuffer,setupDisplay};else setupDisplay(document,window);
})();
