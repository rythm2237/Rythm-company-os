(()=>{
  const VERSION='20260925-3';
  const NAV_CSS=`/2nya-nailart/navigation.css?v=${VERSION}`;
  const FIT_CSS='/2nya-nailart/viewport-fit.css?v=20260925-1';
  const NAV_ITEMS=[
    {href:'/',label:'خانه',key:'home'},
    {href:'/services',label:'خدمات',key:'services'},
    {href:'/training',label:'آموزش',key:'training'},
    {href:'/portfolio',label:'نمونه‌کارها',key:'portfolio'},
    {href:'/nail-care',label:'مراقبت ناخن',key:'nail-care'},
    {href:'/#about',label:'درباره دنیا',key:'about'},
    {href:'/contact',label:'تماس',key:'contact'},
  ];

  const ensureStyles=()=>{
    [[NAV_CSS,'navigation.css'],[FIT_CSS,'viewport-fit.css']].forEach(([href,needle])=>{
      if(document.querySelector(`link[href*="${needle}"]`)) return;
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href=href;
      document.head.append(link);
    });
  };

  const cleanPath=value=>{
    const path=(value||'/').split('?')[0].replace(/\/+$/,'');
    return path||'/';
  };

  const currentKey=()=>{
    const path=cleanPath(location.pathname);
    if(path==='/'&&location.hash==='#about') return 'about';
    if(path==='/') return 'home';
    if(path==='/services') return 'services';
    if(path==='/training') return 'training';
    if(path==='/portfolio') return 'portfolio';
    if(path==='/nail-care') return 'nail-care';
    if(path==='/contact') return 'contact';
    return '';
  };

  const navLinks=scope=>NAV_ITEMS.map(item=>`<a href="${item.href}" data-nav-key="${item.key}"${scope==='mobile'?' class="mobile-nav-link"':''}>${item.label}</a>`).join('');

  const buildHeader=()=>{
    const training=cleanPath(location.pathname)==='/training';
    const ctaHref=training?'#consultation':'/?book=';
    const ctaLabel=training?'وقت مشاوره':'رزرو وقت';
    const header=document.createElement('header');
    header.className='top donya-top donya-unified-nav';
    header.setAttribute('data-donya-unified-nav','true');
    header.innerHTML=`
      <div class="donya-nav-shell">
        <a class="donya-brand" href="/" aria-label="Donya Nail Art - صفحه اصلی">
          <img src="/2nya-media/donya-logo.webp" alt="لوگوی Donya Nail Art" width="58" height="60">
          <span class="donya-brand-copy"><b dir="ltr">Donya Nail Art</b><small>هنر ناخن، جلوه‌ای از زیبایی تو</small></span>
        </a>
        <nav class="desktop-nav" aria-label="ناوبری اصلی">${navLinks('desktop')}</nav>
        <a class="book nav-book" href="${ctaHref}"${training?'':' data-book'}><span>${ctaLabel}</span><span class="nav-book-icon" aria-hidden="true">▦</span></a>
        <button class="nav-search" type="button" aria-label="باز کردن منو" aria-expanded="false" aria-controls="mobileNav">☰</button>
      </div>
      <nav id="mobileNav" class="mobile-nav" aria-label="منوی موبایل">${navLinks('mobile')}</nav>`;
    return header;
  };

  const setActive=(header)=>{
    const key=currentKey();
    header.querySelectorAll('[data-nav-key]').forEach(link=>{
      if(link.dataset.navKey===key) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
  };

  const mountHeader=()=>{
    const existingUnified=document.querySelector('[data-donya-unified-nav="true"]');
    if(existingUnified) return existingUnified;
    const header=buildHeader();
    const root=document.querySelector('#donya-navigation-root');
    const legacy=document.querySelector('.donya-top,.site-head');
    if(root) root.replaceWith(header);
    else if(legacy) legacy.replaceWith(header);
    else document.body.prepend(header);
    return header;
  };

  const init=()=>{
    ensureStyles();
    const header=mountHeader();
    setActive(header);

    const menu=header.querySelector('.nav-search');
    const panel=header.querySelector('#mobileNav');
    const closeMenu=()=>{
      panel?.classList.remove('open');
      menu?.setAttribute('aria-expanded','false');
    };
    menu?.addEventListener('click',()=>{
      const open=!panel?.classList.contains('open');
      panel?.classList.toggle('open',open);
      menu.setAttribute('aria-expanded',String(open));
      menu.setAttribute('aria-label',open?'بستن منو':'باز کردن منو');
    });
    panel?.addEventListener('click',event=>{
      if(event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape') closeMenu();
    });
    document.addEventListener('click',event=>{
      if(!panel?.classList.contains('open')) return;
      if(!header.contains(event.target)) closeMenu();
    });

    let up=document.querySelector('.back-top');
    if(!up){
      up=document.createElement('button');
      up.className='back-top';
      up.type='button';
      up.textContent='↑';
      up.setAttribute('aria-label','بازگشت به بالای صفحه');
      document.body.append(up);
      up.addEventListener('click',()=>scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
    }
    const state=()=>{
      header.classList.toggle('is-scrolled',scrollY>50);
      up.classList.toggle('visible',scrollY>window.innerHeight*.85);
    };
    window.addEventListener('scroll',state,{passive:true});
    window.addEventListener('hashchange',()=>setActive(header));
    state();
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
