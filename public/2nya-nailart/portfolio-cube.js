(()=>{
  const section=document.querySelector('#portfolio');
  const stage=document.querySelector('#portfolioStage');
  const card=document.querySelector('#featureCard');
  const orbit=document.querySelector('#portfolioOrbit');
  const dots=document.querySelector('#portfolioDots');
  const counter=document.querySelector('#portfolioCounter');
  const prev=document.querySelector('#portfolioPrev');
  const next=document.querySelector('#portfolioNext');
  if(!section||!stage||!card||!dots||!counter||typeof portfolio==='undefined'||!Array.isArray(portfolio)||!portfolio.length||typeof pIndex==='undefined'||typeof renderPortfolio==='undefined')return;

  const originalImage=card.querySelector('#featureImage');
  const fallbackSrc=originalImage?.currentSrc||originalImage?.getAttribute('src')||portfolio[pIndex]?.src||'';
  section.classList.remove('portfolio-cube-v2','portfolio-cube-v3');
  section.classList.add('portfolio-turn-v4');
  card.innerHTML=`<div class="turn-scene" aria-hidden="true">
    <div class="turn-fallback"><img src="${fallbackSrc}" alt=""></div>
    <div class="turn-cube" id="portfolioTurnCube">
      <figure class="turn-face turn-front" data-turn-face="0"><img alt="" decoding="async"></figure>
      <figure class="turn-face turn-right" data-turn-face="1"><img alt="" decoding="async"></figure>
      <figure class="turn-face turn-back" data-turn-face="2"><img alt="" decoding="async"></figure>
      <figure class="turn-face turn-left" data-turn-face="3"><img alt="" decoding="async"></figure>
    </div>
  </div><div class="turn-shadow" aria-hidden="true"></div><div class="turn-caption"><b id="featureTitle"></b><span>برای دیدن طرح بعدی، تصویر را بکشید</span></div>`;
  if(orbit)orbit.innerHTML='';

  const cube=card.querySelector('#portfolioTurnCube');
  const faces=[...cube.querySelectorAll('[data-turn-face]')];
  const mod=(value,length)=>((value%length)+length)%length;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const imageCache=new Map();
  let step=0;
  let drag=null;
  let suppressClick=false;
  let animating=false;
  let unlockTimer=null;
  let navigationToken=0;

  const preloadItem=itemIndex=>{
    const index=mod(itemIndex,portfolio.length);
    if(imageCache.has(index))return imageCache.get(index);
    const item=portfolio[index];
    const promise=new Promise(resolve=>{
      const image=new Image();
      image.decoding='async';
      image.onload=()=>resolve(true);
      image.onerror=()=>resolve(false);
      image.src=item.src;
      if(image.complete&&image.naturalWidth)resolve(true);
    });
    imageCache.set(index,promise);
    return promise;
  };

  const setFace=(slot,itemIndex)=>{
    const index=mod(itemIndex,portfolio.length),item=portfolio[index],face=faces[mod(slot,4)],img=face?.querySelector('img');
    if(!item||!img)return;
    if(img.getAttribute('src')!==item.src)img.src=item.src;
    face.dataset.itemIndex=String(index);
  };

  const baseAngle=()=>-step*90;
  const setAngle=(angle,instant=false)=>{
    if(instant)cube.style.transition='none';
    cube.style.setProperty('--turn-y',`${angle}deg`);
    if(instant)requestAnimationFrame(()=>cube.style.removeProperty('transition'));
  };

  const paintUi=()=>{
    const item=portfolio[pIndex];
    const title=card.querySelector('#featureTitle');
    if(title)title.textContent=item.title;
    card.setAttribute('aria-label',`${item.title}؛ برای بزرگ‌نمایی Enter یا Space را بزنید. برای جابه‌جایی از کلیدهای چپ و راست استفاده کنید.`);
    counter.textContent=`${String(pIndex+1).padStart(2,'0')} / ${String(portfolio.length).padStart(2,'0')}`;
    dots.innerHTML=portfolio.map((_,i)=>`<button class="${i===pIndex?'on':''}" data-turn-dot="${i}" aria-label="تصویر ${i+1} از ${portfolio.length}" ${i===pIndex?'aria-current="true"':''}></button>`).join('');
    dots.querySelectorAll('[data-turn-dot]').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      const target=Number(button.dataset.turnDot);
      if(!Number.isFinite(target)||target===pIndex)return;
      const forward=mod(target-pIndex,portfolio.length),backward=mod(pIndex-target,portfolio.length);
      navigate(forward<=backward?1:-1,target);
    }));
  };

  const preloadNeighbors=()=>{
    [pIndex+1,pIndex-1,pIndex+2,pIndex-2].forEach(index=>preloadItem(index));
  };

  const unlock=()=>{
    animating=false;
    card.classList.remove('is-turning','is-loading');
    clearTimeout(unlockTimer);
  };

  const navigate=(direction,targetIndex=null)=>{
    if(animating)return;
    const dir=direction<0?-1:1;
    const target=targetIndex===null?mod(pIndex+dir,portfolio.length):mod(targetIndex,portfolio.length);
    if(target===pIndex)return;

    animating=true;
    card.classList.add('is-loading');
    const token=++navigationToken;

    preloadItem(target).then(ok=>{
      if(token!==navigationToken)return;
      if(!ok){unlock();return;}

      step+=dir;
      setFace(mod(step,4),target);
      pIndex=target;
      paintUi();
      card.classList.remove('is-loading');
      card.classList.add('is-turning');
      cube.classList.remove('is-dragging');
      requestAnimationFrame(()=>setAngle(baseAngle(),reduced));
      preloadNeighbors();

      if(reduced)unlock();
      else unlockTimer=setTimeout(unlock,790);
    });
  };

  setFace(0,pIndex);
  setFace(1,pIndex+1);
  setFace(2,pIndex+2);
  setFace(3,pIndex-1);
  setAngle(baseAngle(),true);
  paintUi();
  renderPortfolio=paintUi;

  const frontImage=faces[0]?.querySelector('img');
  const revealCube=()=>card.classList.add('is-cube-ready');
  if(frontImage){
    if(frontImage.complete&&frontImage.naturalWidth)requestAnimationFrame(revealCube);
    else{
      frontImage.addEventListener('load',revealCube,{once:true});
      frontImage.addEventListener('error',revealCube,{once:true});
    }
  }else revealCube();

  preloadItem(pIndex).then(()=>revealCube());
  preloadNeighbors();

  if(prev)prev.onclick=()=>navigate(-1);
  if(next)next.onclick=()=>navigate(1);

  const isControl=target=>target instanceof Element&&!!target.closest('.portfolio-nav,.portfolio-dots,.portfolio-link');
  stage.addEventListener('pointerdown',event=>{
    if(isControl(event.target)||event.button!==0||animating)return;
    event.stopImmediatePropagation();
    drag={x:event.clientX,time:performance.now()};
    cube.classList.add('is-dragging');
    stage.setPointerCapture?.(event.pointerId);
  },true);

  stage.addEventListener('pointermove',event=>{
    if(!drag)return;
    event.stopImmediatePropagation();
    const dx=event.clientX-drag.x;
    const preview=Math.max(-62,Math.min(62,dx*.23));
    setAngle(baseAngle()+preview);
  },true);

  const finishDrag=event=>{
    if(!drag)return;
    event.stopImmediatePropagation();
    const dx=event.clientX-drag.x,dt=Math.max(1,performance.now()-drag.time),velocity=dx/dt;
    const turn=Math.abs(dx)>46||Math.abs(velocity)>.48;
    if(Math.abs(dx)>7){suppressClick=true;setTimeout(()=>{suppressClick=false},180)}
    drag=null;
    cube.classList.remove('is-dragging');
    if(event.pointerId!==undefined&&stage.hasPointerCapture?.(event.pointerId))stage.releasePointerCapture(event.pointerId);
    if(turn)navigate(dx<0?1:-1);else setAngle(baseAngle(),reduced);
  };

  stage.addEventListener('pointerup',finishDrag,true);
  stage.addEventListener('pointercancel',event=>{
    if(!drag)return;
    event.stopImmediatePropagation();
    drag=null;
    cube.classList.remove('is-dragging');
    setAngle(baseAngle(),reduced);
  },true);

  card.addEventListener('click',event=>{
    if(!suppressClick)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick=false;
  },true);

  card.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'){event.preventDefault();event.stopImmediatePropagation();navigate(1)}
    if(event.key==='ArrowRight'){event.preventDefault();event.stopImmediatePropagation();navigate(-1)}
  },true);
})();
