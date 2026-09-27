(()=>{
  const VERSION='20260927-1';
  const NAV_CSS=`/2nya-nailart/navigation.css?v=${VERSION}`;
  const FIT_CSS='/2nya-nailart/viewport-fit.css?v=20260925-1';
  const NAV_ITEMS=[
    {href:'/',label:'خانه',key:'home'},
    {href:'/services',label:'خدمات',key:'services'},
    {href:'/training',label:'آموزش',key:'training'},
    {href:'/portfolio',label:'نمونه‌کارها',key:'portfolio'},
    {href:'/nail-care',label:'مراقبت ناخن',key:'nail-care'},
    {href:'/about',label:'درباره دنیا',key:'about'},
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
    if(path==='/about') return 'about';
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

  const b64Key=value=>{
    const s=(value||'').replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(s+'='.repeat((4-s.length%4)%4));
    return Uint8Array.from(raw,c=>c.charCodeAt(0));
  };

  const enableCustomerPush=async booking=>{
    if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw new Error('اعلان روی این مرورگر پشتیبانی نمی‌شود.');
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('اجازه ارسال اعلان داده نشد.');
    const keyResponse=await fetch('/api/2nya-nailart/push-key',{cache:'no-store'}),keyData=await keyResponse.json();
    if(!keyResponse.ok||!keyData?.public_key)throw new Error('فعال‌سازی اعلان در دسترس نیست.');
    const reg=await navigator.serviceWorker.ready;
    const old=await reg.pushManager.getSubscription();
    if(old){const oldKey=old.options?.applicationServerKey?Array.from(new Uint8Array(old.options.applicationServerKey)).join(','):'';const newKey=Array.from(b64Key(keyData.public_key)).join(',');if(oldKey&&oldKey!==newKey)await old.unsubscribe();}
    const subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64Key(keyData.public_key)});
    const r=await fetch('/api/2nya-nailart/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'push_subscribe',id:booking.appointment_id,token:booking.management_token,subscription:subscription.toJSON()})}),j=await r.json();
    if(!r.ok||!j.ok)throw new Error(j.error||'فعال‌سازی اعلان انجام نشد.');
    return true;
  };

  const enhanceBooking=()=>{
    if(!document.querySelector('#modal')||typeof renderDates!=='function'||typeof chooseDate!=='function'||typeof submitBooking!=='function')return;

    renderDates=async function(){
      state.date=null;state.slot=null;
      const box=qs('#dates'),times=qs('#times'),step=qs('[data-step="1"]');
      if(!box||!times||!state.service)return;
      box.style.display='';
      step?.querySelector('h2')&&(step.querySelector('h2').textContent='چه روزی مناسب است؟');
      step?.querySelector('p')&&(step.querySelector('p').textContent='فقط روزهایی نمایش داده می‌شوند که زمان آزاد دارند.');
      box.innerHTML='<span class="muted">در حال پیدا کردن روزهای آزاد…</span>';
      times.innerHTML='';
      updateNext();
      try{
        const r=await fetch(`/api/2nya-nailart/availability?service_id=${encodeURIComponent(state.service.id)}&days=28`,{cache:'no-store'}),j=await r.json();
        if(!r.ok||!j.ok)throw new Error();
        if(!j.dates?.length){box.innerHTML='<span class="muted">در ۲۸ روز آینده وقت آزادی وجود ندارد.</span>';return;}
        box.innerHTML=j.dates.map(x=>{const d=new Date(`${x.date}T12:00:00`);return `<button class="date" data-available-date="${x.date}"><b>${toFa(d.getDate())}</b><br><small>${new Intl.DateTimeFormat('fa-IR',{weekday:'short'}).format(d)}</small></button>`}).join('');
        qsa('[data-available-date]').forEach(btn=>btn.onclick=()=>chooseDate(btn.dataset.availableDate,btn));
      }catch{box.innerHTML='<span class="muted">دریافت روزهای آزاد ناموفق بود.</span>';}
    };

    chooseDate=async function(iso,btn){
      state.date=iso;state.slot=null;updateNext();
      const box=qs('#dates'),times=qs('#times'),step=qs('[data-step="1"]');
      qsa('.date').forEach(x=>x.classList.remove('sel'));btn?.classList.add('sel');
      if(box)box.style.display='none';
      step?.querySelector('h2')&&(step.querySelector('h2').textContent='چه ساعتی مناسب است؟');
      step?.querySelector('p')&&(step.querySelector('p').textContent=`زمان‌های آزاد ${faDate(new Date(`${iso}T12:00:00`))}`);
      times.innerHTML='<button type="button" class="btn ghost" id="changeBookingDay" style="margin-bottom:14px">← تغییر روز</button><div class="muted">در حال دریافت ساعت‌های آزاد…</div>';
      qs('#changeBookingDay').onclick=()=>renderDates();
      try{
        const r=await fetch(`/api/2nya-nailart/availability?date=${encodeURIComponent(iso)}&service_id=${encodeURIComponent(state.service.id)}`,{cache:'no-store'}),j=await r.json();
        if(!r.ok||!j.ok)throw new Error();
        const change='<button type="button" class="btn ghost" id="changeBookingDay" style="margin-bottom:14px">← تغییر روز</button>';
        times.innerHTML=change+(j.slots.length?`<div class="times-only">${j.slots.map(x=>`<button class="time" data-start="${x.start_at}">${x.label}</button>`).join('')}</div>`:'<span class="muted">برای این روز ساعت آزادی وجود ندارد.</span>');
        qs('#changeBookingDay').onclick=()=>renderDates();
        qsa('[data-start]').forEach(x=>x.onclick=()=>{state.slot={start_at:x.dataset.start,label:x.textContent};qsa('[data-start]').forEach(y=>y.classList.remove('sel'));x.classList.add('sel');updateNext()});
      }catch{times.innerHTML='<button type="button" class="btn ghost" id="changeBookingDay" style="margin-bottom:14px">← تغییر روز</button><span class="muted">دریافت ساعت‌های آزاد ناموفق بود.</span>';qs('#changeBookingDay').onclick=()=>renderDates();updateNext();}
    };

    submitBooking=async function(){
      const btn=qs('#next');btn.disabled=true;btn.textContent='در حال ثبت…';qs('#result').innerHTML='';
      try{
        const r=await fetch('/api/2nya-nailart/book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service_id:state.service.id,start_at:state.slot.start_at,name:qs('#name').value,phone:qs('#phone').value,instagram:qs('#ig').value,email:qs('#email').value,notes:qs('#notes').value})}),j=await r.json();
        if(!r.ok||!j.ok)throw new Error(j.error||'ثبت درخواست وقت انجام نشد.');
        qs('#result').innerHTML=`<div class="success"><h3>درخواست وقت ثبت شد ✓</h3><p>این زمان تا بررسی دنیا در حالت <b>انتظار برای تأیید</b> است.</p><p>کد درخواست: <b dir="ltr">${esc(j.reference||'')}</b></p>${j.management_url?`<p><a href="${j.management_url}">مشاهده و مدیریت درخواست</a></p>`:''}<button type="button" class="btn primary" id="customerPushOptIn">اعلان نتیجه درخواست روی موبایل</button><div id="customerPushMsg" class="muted" style="margin-top:8px"></div></div>`;
        btn.style.display='none';qs('#back').style.display='none';
        const pushBtn=qs('#customerPushOptIn');
        if(pushBtn)pushBtn.onclick=async()=>{pushBtn.disabled=true;const msg=qs('#customerPushMsg');msg.textContent='در حال فعال‌سازی…';try{await enableCustomerPush(j);msg.textContent='اعلان فعال شد. بعد از تأیید یا رد درخواست، روی این دستگاه پیام دریافت می‌کنید.';pushBtn.remove();}catch(error){msg.textContent=error.message||'فعال‌سازی اعلان انجام نشد.';pushBtn.disabled=false;}};
      }catch(error){qs('#result').innerHTML=`<div class="empty">${esc(error.message)}</div>`;btn.disabled=false;btn.textContent='ثبت نهایی رزرو';}
    };
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
    const scrollState=()=>{
      header.classList.toggle('is-scrolled',scrollY>50);
      up.classList.toggle('visible',scrollY>window.innerHeight*.85);
    };
    window.addEventListener('scroll',scrollState,{passive:true});
    window.addEventListener('hashchange',()=>setActive(header));
    scrollState();
    enhanceBooking();
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
