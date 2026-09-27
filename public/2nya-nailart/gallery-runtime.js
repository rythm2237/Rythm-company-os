(()=>{
  const ENDPOINT='/api/2nya-nailart/portfolio';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const pad=n=>String(n).padStart(2,'0');

  async function loadItems(){
    const response=await fetch(ENDPOINT,{cache:'no-store'});
    const payload=await response.json();
    if(!response.ok||!payload?.ok||!Array.isArray(payload.items))throw new Error('gallery unavailable');
    return payload.items;
  }

  function emptyState(shell){
    shell.innerHTML=`<div class="portfolio-top"><div><span class="eyebrow">نمونه‌کارهای دنیا</span><h2>هنر ناخن، از نزدیک</h2><p>هر اثر را از زاویه‌ای تازه ببینید؛ تصویر را بکشید یا یکی از عکس‌های کنار آن را انتخاب کنید.</p></div><div class="portfolio-counter">00 / 00</div></div><div class="empty" style="margin-top:24px">هنوز نمونه‌کاری برای نمایش ثبت نشده است.</div><div class="portfolio-link"><a href="/portfolio">دیدن همه نمونه‌کارها ←</a></div>`;
  }

  function mount(items){
    const shell=document.querySelector('#portfolio .portfolio-shell');
    if(!shell)return;
    if(!items.length){emptyState(shell);return}

    shell.innerHTML=`
      <div class="portfolio-top">
        <div><span class="eyebrow">نمونه‌کارهای دنیا</span><h2>هنر ناخن، از نزدیک</h2><p>هر اثر را از زاویه‌ای تازه ببینید؛ تصویر را بکشید یا یکی از عکس‌های کنار آن را انتخاب کنید.</p></div>
        <div class="portfolio-counter" id="managedPortfolioCounter" aria-live="polite">01 / ${pad(items.length)}</div>
      </div>
      <div class="portfolio-stage" id="managedPortfolioStage">
        <div class="portfolio-rail portfolio-rail-left" id="managedPortfolioRailLeft" role="group" aria-label="نیمهٔ اول نمونه‌کارها"></div>
        <button class="portfolio-nav prev" id="managedPortfolioPrev" type="button" aria-label="نمونه‌کار قبلی"><span aria-hidden="true">›</span></button>
        <div class="cube-scene">
          <div class="feature-card" id="managedFeatureCard" role="button" tabindex="0" aria-label="بزرگ‌نمایی نمونه‌کار">
            <div class="cube-rotor" id="managedCubeRotor">
              <div class="cube-face cube-front"><img id="managedFeatureImage" alt="نمونه طراحی ناخن Donya Nail Art" decoding="async"></div>
              <div class="cube-face cube-right"><img id="managedCubeNextImage" alt="" decoding="async"></div>
              <div class="cube-face cube-left"><img id="managedCubePrevImage" alt="" decoding="async"></div>
              <div class="cube-face cube-back" aria-hidden="true"></div>
            </div>
          </div>
        </div>
        <button class="portfolio-nav next" id="managedPortfolioNext" type="button" aria-label="نمونه‌کار بعدی"><span aria-hidden="true">‹</span></button>
        <div class="portfolio-rail portfolio-rail-right" id="managedPortfolioRailRight" role="group" aria-label="نیمهٔ دوم نمونه‌کارها"></div>
      </div>
      <div class="portfolio-meta">
        <span class="portfolio-meta-line">DONYA / NAIL ART</span>
        <div><b id="managedFeatureTitle"></b><span class="portfolio-hint">برای چرخاندن بکشید · برای بزرگ‌نمایی لمس کنید</span></div>
        <span class="portfolio-progress" id="managedPortfolioProgress" aria-hidden="true"><i></i></span>
      </div>
      <div class="orbit" id="managedPortfolioOrbit" role="group" aria-label="انتخاب نمونه‌کار در موبایل"></div>
      <div class="portfolio-link"><a href="/portfolio">دیدن همه نمونه‌کارها ←</a></div>`;

    const face=shell.querySelector('#managedFeatureCard');
    const rotor=shell.querySelector('#managedCubeRotor');
    const front=shell.querySelector('#managedFeatureImage');
    const nextImage=shell.querySelector('#managedCubeNextImage');
    const prevImage=shell.querySelector('#managedCubePrevImage');
    const title=shell.querySelector('#managedFeatureTitle');
    const counter=shell.querySelector('#managedPortfolioCounter');
    const progress=shell.querySelector('#managedPortfolioProgress i');
    const leftRail=shell.querySelector('#managedPortfolioRailLeft');
    const rightRail=shell.querySelector('#managedPortfolioRailRight');
    const orbit=shell.querySelector('#managedPortfolioOrbit');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let index=0,rotating=false,target=0,timer=null,dragStart=null,suppressClick=false,queuedTarget=null;
    const at=value=>(value+items.length)%items.length;

    const thumb=(item,i)=>`<button type="button" class="p-thumb" data-managed-index="${i}" aria-label="دیدن نمونه‌کار ${i+1}: ${esc(item.title||'نمونه طراحی ناخن')}" aria-pressed="false"><img src="${esc(item.src)}" loading="lazy" decoding="async" alt=""></button>`;
    const split=Math.ceil(items.length/2);
    leftRail.innerHTML=items.slice(0,split).map((item,i)=>thumb(item,i)).join('');
    rightRail.innerHTML=items.slice(split).map((item,i)=>thumb(item,i+split)).join('');
    orbit.innerHTML=items.map(thumb).join('');

    function paint(){
      const item=items[index],next=items[at(index+1)],prev=items[at(index-1)];
      front.src=item.src;front.alt=item.title||'نمونه طراحی ناخن Donya Nail Art';
      nextImage.src=next.src;prevImage.src=prev.src;
      title.textContent=item.title||'نمونه طراحی ناخن';
      counter.textContent=`${pad(index+1)} / ${pad(items.length)}`;
      progress.style.width=`${((index+1)/items.length)*100}%`;
      face.setAttribute('aria-label',`بزرگ‌نمایی: ${item.title||'نمونه طراحی ناخن'}`);
      shell.querySelectorAll('[data-managed-index]').forEach(button=>{
        const active=Number(button.dataset.managedIndex)===index;
        button.classList.toggle('on',active);
        button.setAttribute('aria-pressed',String(active));
        if(active)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
      });
    }

    function finishRotation(){
      if(!rotating)return;
      if(timer)clearTimeout(timer);
      index=target;rotating=false;
      rotor.style.transition='none';rotor.classList.remove('rotate-next','rotate-prev');
      paint();void rotor.offsetWidth;rotor.style.transition='';
      if(queuedTarget!==null){const nextTarget=queuedTarget;queuedTarget=null;requestAnimationFrame(()=>select(nextTarget))}
    }

    function select(value){
      const nextTarget=at(value);
      if(nextTarget===index&&!rotating)return;
      if(rotating){queuedTarget=nextTarget;return}
      const direction=nextTarget===at(index-1)?-1:1;
      rotating=true;target=nextTarget;face.setAttribute('aria-busy','true');
      const preload=new Image();preload.src=items[nextTarget].src;
      const start=()=>{
        face.removeAttribute('aria-busy');
        if(reduced.matches){index=nextTarget;rotating=false;paint();return}
        const incoming=direction===1?nextImage:prevImage;
        incoming.src=preload.src;
        rotor.classList.add(direction===1?'rotate-next':'rotate-prev');
        timer=setTimeout(finishRotation,850);
      };
      if(preload.complete&&preload.naturalWidth)start();
      else{preload.onload=start;preload.onerror=()=>{face.removeAttribute('aria-busy');rotating=false}};
    }

    [leftRail,rightRail,orbit].forEach(rail=>rail.addEventListener('click',event=>{
      const button=event.target.closest('[data-managed-index]');
      if(button)select(Number(button.dataset.managedIndex));
    }));
    shell.querySelector('#managedPortfolioPrev').onclick=()=>select(index-1);
    shell.querySelector('#managedPortfolioNext').onclick=()=>select(index+1);

    face.addEventListener('pointerdown',event=>{if(event.button!==0)return;dragStart={x:event.clientX,y:event.clientY,id:event.pointerId}});
    face.addEventListener('pointerup',event=>{
      if(!dragStart||dragStart.id!==event.pointerId)return;
      const dx=event.clientX-dragStart.x,dy=event.clientY-dragStart.y;dragStart=null;
      if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy)){
        suppressClick=true;setTimeout(()=>{suppressClick=false},0);select(index+(dx<0?1:-1));
      }
    });
    face.addEventListener('pointercancel',()=>{dragStart=null});

    const lightbox=document.querySelector('#lightbox');
    face.addEventListener('click',()=>{
      if(suppressClick){suppressClick=false;return}
      if(!lightbox)return;
      const image=lightbox.querySelector('img'),item=items[index];
      image.src=item.src;image.alt=item.title||'نمونه طراحی ناخن';lightbox.classList.add('open');
    });
    face.addEventListener('keydown',event=>{
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
        event.preventDefault();select(index+(event.key==='ArrowLeft'?1:-1));
      }else if(event.key==='Enter'||event.key===' '){event.preventDefault();face.click()}
    });
    rotor.addEventListener('transitionend',event=>{if(event.target===rotor&&event.propertyName==='transform')finishRotation()});
    paint();
  }

  async function init(){
    try{mount(await loadItems())}catch{/* Keep the built-in static cube gallery as the safe fallback. */}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
