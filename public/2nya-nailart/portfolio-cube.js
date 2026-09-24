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

  section.classList.remove('portfolio-cube-v2');
  section.classList.add('portfolio-cube-v3');
  card.innerHTML=`<div class="cube-scene" aria-hidden="true"><div class="portfolio-cube" id="portfolioCube">
    <figure class="cube-face cube-front" data-cube-face="0"><img alt="" decoding="async"></figure>
    <figure class="cube-face cube-right" data-cube-face="1"><img alt="" decoding="async"></figure>
    <figure class="cube-face cube-back" data-cube-face="2"><img alt="" decoding="async"></figure>
    <figure class="cube-face cube-left" data-cube-face="3"><img alt="" decoding="async"></figure>
    <div class="cube-cap cube-top"></div><div class="cube-cap cube-bottom"></div>
  </div></div><div class="cube-glow" aria-hidden="true"></div><div class="cube-caption"><b id="featureTitle"></b><span>برای تغییر، مکعب را بکشید</span><small class="cube-sub">Swipe · Drag · Arrow keys</small></div>`;
  if(orbit)orbit.innerHTML='<span class="cube-hint">یک گالری سه‌بعدی از طراحی‌های دنیا</span>';

  const cube=card.querySelector('#portfolioCube');
  const faces=[...cube.querySelectorAll('[data-cube-face]')];
  const mod=(value,length)=>((value%length)+length)%length;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const idleOffset=()=>matchMedia('(max-width:620px)').matches?-18:-24;
  let cubeStep=0;
  let drag=null;
  let suppressClick=false;
  let animating=false;
  let unlockTimer=null;

  const setFace=(slot,itemIndex)=>{
    const index=mod(itemIndex,portfolio.length),item=portfolio[index],face=faces[mod(slot,4)],image=face?.querySelector('img');
    if(!image||!item)return;
    if(image.getAttribute('src')!==item.src)image.src=item.src;
    image.alt='';
    face.dataset.itemIndex=String(index);
  };
  const angleForStep=()=>-cubeStep*90+idleOffset();
  const setAngle=(angle,instant=false)=>{
    if(instant)cube.style.transition='none';
    cube.style.setProperty('--cube-y',`${angle}deg`);
    if(instant)requestAnimationFrame(()=>cube.style.removeProperty('transition'));
  };
  const paintUi=()=>{
    const item=portfolio[pIndex];
    const title=card.querySelector('#featureTitle');
    if(title)title.textContent=item.title;
    card.setAttribute('aria-label',`${item.title}؛ برای بزرگ‌نمایی Enter یا Space را بزنید. برای جابه‌جایی از کلیدهای چپ و راست استفاده کنید.`);
    counter.textContent=`${String(pIndex+1).padStart(2,'0')} / ${String(portfolio.length).padStart(2,'0')}`;
    dots.innerHTML=portfolio.map((_,i)=>`<button class="${i===pIndex?'on':''}" data-cube-dot="${i}" aria-label="تصویر ${i+1} از ${portfolio.length}" ${i===pIndex?'aria-current="true"':''}></button>`).join('');
    dots.querySelectorAll('[data-cube-dot]').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      const target=Number(button.dataset.cubeDot);
      if(!Number.isFinite(target)||target===pIndex)return;
      const forward=mod(target-pIndex,portfolio.length),backward=mod(pIndex-target,portfolio.length);
      navigate(forward<=backward?1:-1,target);
    }));
  };
  const unlock=()=>{animating=false;clearTimeout(unlockTimer)};
  const navigate=(direction,targetIndex=null)=>{
    if(animating)return;
    const dir=direction<0?-1:1;
    const target=targetIndex===null?mod(pIndex+dir,portfolio.length):mod(targetIndex,portfolio.length);
    if(target===pIndex)return;
    animating=true;
    cubeStep+=dir;
    const incomingSlot=mod(cubeStep,4);
    setFace(incomingSlot,target);
    pIndex=target;
    paintUi();
    cube.classList.remove('is-dragging');
    requestAnimationFrame(()=>setAngle(angleForStep(),reduced));
    const adjacent=portfolio[mod(pIndex+dir,portfolio.length)];
    if(adjacent){const preload=new Image();preload.src=adjacent.src;}
    if(reduced)unlock();
    else unlockTimer=setTimeout(unlock,900);
  };

  setFace(0,pIndex);setFace(1,pIndex+1);setFace(2,pIndex+2);setFace(3,pIndex-1);
  setAngle(angleForStep(),true);paintUi();
  renderPortfolio=paintUi;
  if(prev)prev.onclick=()=>navigate(-1);
  if(next)next.onclick=()=>navigate(1);

  const isControl=target=>target instanceof Element&&!!target.closest('.portfolio-nav,.portfolio-dots,.portfolio-link');
  stage.addEventListener('pointerdown',event=>{
    if(isControl(event.target)||event.button!==0)return;
    event.stopImmediatePropagation();
    drag={x:event.clientX,time:performance.now(),lastX:event.clientX,lastTime:performance.now()};
    cube.classList.add('is-dragging');
    stage.setPointerCapture?.(event.pointerId);
  },true);
  stage.addEventListener('pointermove',event=>{
    if(!drag)return;
    event.stopImmediatePropagation();
    const dx=event.clientX-drag.x;
    drag.lastX=event.clientX;drag.lastTime=performance.now();
    const limited=Math.max(-48,Math.min(48,dx*.16));
    setAngle(angleForStep()+limited);
  },true);
  const finishDrag=event=>{
    if(!drag)return;
    event.stopImmediatePropagation();
    const dx=event.clientX-drag.x,dt=Math.max(1,performance.now()-drag.time),velocity=dx/dt;
    const shouldTurn=Math.abs(dx)>52||Math.abs(velocity)>.55;
    if(Math.abs(dx)>7){suppressClick=true;setTimeout(()=>{suppressClick=false},160);}
    drag=null;
    cube.classList.remove('is-dragging');
    if(event.pointerId!==undefined&&stage.hasPointerCapture?.(event.pointerId))stage.releasePointerCapture(event.pointerId);
    if(shouldTurn)navigate(dx<0?1:-1);else setAngle(angleForStep(),reduced);
  };
  stage.addEventListener('pointerup',finishDrag,true);
  stage.addEventListener('pointercancel',event=>{if(!drag)return;event.stopImmediatePropagation();drag=null;cube.classList.remove('is-dragging');setAngle(angleForStep(),reduced)},true);

  card.addEventListener('click',event=>{
    if(!suppressClick)return;
    event.preventDefault();event.stopImmediatePropagation();suppressClick=false;
  },true);
  card.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'){event.preventDefault();event.stopImmediatePropagation();navigate(1)}
    if(event.key==='ArrowRight'){event.preventDefault();event.stopImmediatePropagation();navigate(-1)}
  },true);
  window.addEventListener('resize',()=>setAngle(angleForStep(),true),{passive:true});
})();
