(()=>{
  const section=document.querySelector('#portfolio');
  const stage=document.querySelector('#portfolioStage');
  const card=document.querySelector('#featureCard');
  const orbit=document.querySelector('#portfolioOrbit');
  const dots=document.querySelector('#portfolioDots');
  const counter=document.querySelector('#portfolioCounter');
  if(!section||!stage||!card||!dots||!counter||typeof portfolio==='undefined'||!Array.isArray(portfolio)||!portfolio.length||typeof pIndex==='undefined'||typeof renderPortfolio==='undefined')return;

  section.classList.add('portfolio-cube-v2');
  card.innerHTML=`<div class="portfolio-cube" id="portfolioCube" aria-hidden="true">
    <figure class="cube-face cube-front" data-cube-face="0"><img alt="" decoding="async"></figure>
    <figure class="cube-face cube-right" data-cube-face="1"><img alt="" decoding="async"></figure>
    <figure class="cube-face cube-back" data-cube-face="2"><img alt="" decoding="async"></figure>
    <figure class="cube-face cube-left" data-cube-face="3"><img alt="" decoding="async"></figure>
    <div class="cube-cap cube-top"></div><div class="cube-cap cube-bottom"></div>
  </div><div class="cube-glow" aria-hidden="true"></div><div class="cube-caption"><b id="featureTitle"></b><span>برای تغییر، مکعب را بکشید</span></div>`;
  if(orbit)orbit.innerHTML='<span class="cube-hint">Drag · Swipe · Rotate</span>';

  const cube=card.querySelector('#portfolioCube');
  const faces=[...cube.querySelectorAll('[data-cube-face]')];
  const mod=(value,length)=>((value%length)+length)%length;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cubeStep=0;
  let lastIndex=pIndex;
  let ready=false;
  let dragStart=null;
  let dragged=false;
  let suppressClick=false;

  const setFace=(slot,itemIndex)=>{
    const item=portfolio[mod(itemIndex,portfolio.length)];
    const face=faces[slot];
    const image=face?.querySelector('img');
    if(!image||!item)return;
    image.src=item.src;
    face.dataset.itemIndex=String(mod(itemIndex,portfolio.length));
  };
  const setAngle=angle=>cube.style.setProperty('--cube-y',`${angle}deg`);
  const settledAngle=()=>-cubeStep*90-10;

  setFace(0,pIndex);
  setFace(1,pIndex+1);
  setFace(2,pIndex+2);
  setFace(3,pIndex-1);
  setAngle(settledAngle());

  const cubeRenderPortfolio=()=>{
    const item=portfolio[pIndex];
    if(!item)return;
    if(ready){
      let direction=1;
      if(pIndex===mod(lastIndex-1,portfolio.length))direction=-1;
      else if(pIndex===mod(lastIndex+1,portfolio.length))direction=1;
      cubeStep+=direction;
      setFace(mod(cubeStep,4),pIndex);
      cube.classList.remove('is-dragging');
      if(reduced){
        cube.style.transition='none';
        setAngle(settledAngle());
        requestAnimationFrame(()=>cube.style.removeProperty('transition'));
      }else{
        requestAnimationFrame(()=>setAngle(settledAngle()));
      }
    }else{
      ready=true;
      setAngle(settledAngle());
    }
    lastIndex=pIndex;
    const title=card.querySelector('#featureTitle');
    if(title)title.textContent=item.title;
    card.setAttribute('aria-label',`${item.title}؛ برای بزرگ‌نمایی کلیک کنید`);
    counter.textContent=`${String(pIndex+1).padStart(2,'0')} / ${String(portfolio.length).padStart(2,'0')}`;
    dots.innerHTML=portfolio.map((_,i)=>`<button class="${i===pIndex?'on':''}" data-cube-dot="${i}" aria-label="تصویر ${i+1} از ${portfolio.length}" ${i===pIndex?'aria-current="true"':''}></button>`).join('');
    dots.querySelectorAll('[data-cube-dot]').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      const next=Number(button.dataset.cubeDot);
      if(next===pIndex)return;
      pIndex=next;
      cubeRenderPortfolio();
    }));
    const preload=portfolio[mod(pIndex+1,portfolio.length)];
    if(preload){const image=new Image();image.src=preload.src;}
  };

  renderPortfolio=cubeRenderPortfolio;
  cubeRenderPortfolio();

  stage.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('.portfolio-nav,.portfolio-dots,.portfolio-link'))return;
    dragStart=event.clientX;
    dragged=false;
    cube.classList.add('is-dragging');
    stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointermove',event=>{
    if(dragStart===null)return;
    const dx=event.clientX-dragStart;
    if(Math.abs(dx)>5)dragged=true;
    setAngle(settledAngle()+Math.max(-68,Math.min(68,dx*.18)));
  });
  const finishDrag=event=>{
    if(dragStart===null)return;
    if(dragged){suppressClick=true;setTimeout(()=>{suppressClick=false},80);}
    dragStart=null;
    cube.classList.remove('is-dragging');
    setAngle(settledAngle());
    if(event?.pointerId!==undefined&&stage.hasPointerCapture?.(event.pointerId))stage.releasePointerCapture(event.pointerId);
  };
  stage.addEventListener('pointerup',finishDrag);
  stage.addEventListener('pointercancel',finishDrag);
  card.addEventListener('click',event=>{
    if(!suppressClick)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick=false;
  },true);
})();
