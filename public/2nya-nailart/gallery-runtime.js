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

  function ensureStyle(){
    if(document.getElementById('donya-managed-gallery-style'))return;
    const style=document.createElement('style');
    style.id='donya-managed-gallery-style';
    style.textContent=`
      .managed-gallery{position:relative}.managed-gallery-main{position:relative;width:min(760px,100%);margin:0 auto}.managed-gallery-card{position:relative;display:block;width:100%;height:min(68vh,620px);min-height:420px;padding:0;border:0;border-radius:34px;overflow:hidden;background:#2d111a;box-shadow:0 24px 70px rgba(46,17,26,.25);cursor:zoom-in}.managed-gallery-card img{width:100%;height:100%;object-fit:cover;display:block}.managed-gallery-shade{position:absolute;inset:auto 0 0;padding:52px 24px 20px;background:linear-gradient(transparent,rgba(31,11,18,.82));color:#fff;text-align:right}.managed-gallery-shade b{font-family:Estedad,Vazirmatn,sans-serif;font-size:1.05rem}.managed-gallery-controls{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:14px}.managed-gallery-controls button{width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.55);background:#fff;color:#5b1730;font-size:1.5rem;box-shadow:0 8px 22px rgba(72,29,40,.12);cursor:pointer}.managed-gallery-count{min-width:92px;text-align:center;font-weight:800;color:#6d5260}.managed-gallery-thumbs{display:flex;gap:10px;overflow-x:auto;padding:15px 2px 4px;scrollbar-width:none}.managed-gallery-thumbs::-webkit-scrollbar{display:none}.managed-gallery-thumb{flex:0 0 92px;width:92px;height:112px;border-radius:17px;overflow:hidden;border:2px solid transparent;padding:0;background:#ead8d5;opacity:.72;transition:.2s;cursor:pointer}.managed-gallery-thumb.active{opacity:1;border-color:#7b1038;transform:translateY(-3px)}.managed-gallery-thumb img{width:100%;height:100%;object-fit:cover;display:block}.managed-gallery-empty{padding:44px 18px;text-align:center;border:1px dashed rgba(91,47,43,.2);border-radius:24px;background:rgba(255,255,255,.55);color:#806a6f}.managed-gallery-lightbox{position:fixed;z-index:150;inset:0;display:none;place-items:center;padding:22px;background:rgba(15,8,11,.94)}.managed-gallery-lightbox.open{display:grid}.managed-gallery-lightbox img{max-width:94vw;max-height:88vh;border-radius:24px;box-shadow:0 20px 70px rgba(0,0,0,.4)}.managed-gallery-lightbox button{position:absolute;top:18px;right:18px;width:46px;height:46px;border:0;border-radius:50%;background:#fff;color:#32151f;font-size:1.35rem;cursor:pointer}@media(max-width:800px){.managed-gallery-card{height:min(64vh,510px);min-height:390px;border-radius:26px}.managed-gallery-shade{padding:46px 18px 16px}.managed-gallery-thumb{flex-basis:78px;width:78px;height:96px}.managed-gallery-controls{margin-top:11px}}
    `;
    document.head.append(style);
  }

  function mount(items){
    const shell=document.querySelector('#portfolio .portfolio-shell');
    if(!shell)return;
    ensureStyle();
    const heading=shell.querySelector('.portfolio-top')?.outerHTML||'<div class="portfolio-top"><div><span class="eyebrow">نمونه‌کارهای دنیا</span><h2>هنر ناخن، از نزدیک</h2></div></div>';
    if(!items.length){
      shell.innerHTML=`${heading}<div class="managed-gallery-empty">هنوز نمونه‌کاری برای نمایش ثبت نشده است.</div>`;
      const counter=shell.querySelector('#portfolioCounter');if(counter)counter.textContent='00 / 00';
      return;
    }

    let index=0;
    shell.innerHTML=`${heading}<div class="managed-gallery"><div class="managed-gallery-main"><button class="managed-gallery-card" id="managedGalleryCard" type="button" aria-label="بزرگ‌نمایی نمونه‌کار"><img id="managedGalleryImage" alt=""><span class="managed-gallery-shade"><b id="managedGalleryTitle"></b></span></button><div class="managed-gallery-controls"><button id="managedGalleryPrev" type="button" aria-label="قبلی">›</button><span class="managed-gallery-count" id="managedGalleryCount"></span><button id="managedGalleryNext" type="button" aria-label="بعدی">‹</button></div></div><div class="managed-gallery-thumbs" id="managedGalleryThumbs" aria-label="انتخاب نمونه‌کار"></div></div>`;
    const legacyCounter=shell.querySelector('#portfolioCounter');if(legacyCounter)legacyCounter.style.display='none';
    const image=shell.querySelector('#managedGalleryImage'),title=shell.querySelector('#managedGalleryTitle'),count=shell.querySelector('#managedGalleryCount'),thumbs=shell.querySelector('#managedGalleryThumbs'),card=shell.querySelector('#managedGalleryCard');

    thumbs.innerHTML=items.map((item,i)=>`<button class="managed-gallery-thumb" data-gallery-index="${i}" type="button" aria-label="${esc(item.title||`نمونه‌کار ${i+1}`)}"><img src="${esc(item.src)}" alt="" loading="lazy" decoding="async"></button>`).join('');
    const thumbButtons=[...thumbs.querySelectorAll('[data-gallery-index]')];
    function paint(){
      const item=items[index];
      image.src=item.src;image.alt=item.title||'نمونه طراحی ناخن Donya Nail Art';title.textContent=item.title||'نمونه طراحی ناخن';count.textContent=`${pad(index+1)} / ${pad(items.length)}`;
      thumbButtons.forEach((button,i)=>button.classList.toggle('active',i===index));
      thumbButtons[index]?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
    }
    function select(next){index=(next+items.length)%items.length;paint()}
    shell.querySelector('#managedGalleryPrev').onclick=()=>select(index-1);
    shell.querySelector('#managedGalleryNext').onclick=()=>select(index+1);
    thumbButtons.forEach(button=>button.onclick=()=>select(Number(button.dataset.galleryIndex)));

    let startX=null;
    card.addEventListener('touchstart',event=>{startX=event.touches?.[0]?.clientX??null},{passive:true});
    card.addEventListener('touchend',event=>{if(startX==null)return;const end=event.changedTouches?.[0]?.clientX??startX,delta=end-startX;startX=null;if(Math.abs(delta)>42)select(index+(delta>0?-1:1));},{passive:true});

    const lightbox=document.createElement('div');lightbox.className='managed-gallery-lightbox';lightbox.innerHTML='<button type="button" aria-label="بستن">×</button><img alt="">';document.body.append(lightbox);
    card.onclick=()=>{const item=items[index];const preview=lightbox.querySelector('img');preview.src=item.src;preview.alt=item.title||'نمونه طراحی ناخن';lightbox.classList.add('open')};
    lightbox.querySelector('button').onclick=()=>lightbox.classList.remove('open');
    lightbox.onclick=event=>{if(event.target===lightbox)lightbox.classList.remove('open')};
    document.addEventListener('keydown',event=>{if(event.key==='Escape')lightbox.classList.remove('open')});
    paint();
  }

  async function init(){
    try{mount(await loadItems())}catch{/* Keep the built-in static gallery as a safe fallback. */}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
