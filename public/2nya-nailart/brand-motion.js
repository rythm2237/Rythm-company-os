(()=>{
  if(window.__donyaBrandMotion)return;window.__donyaBrandMotion=true;
  const LOGO='/api/2nya-nailart/logo?v=20260927-3';
  const PORTRAIT='/2nya-nailart/donya-about-portrait.webp';
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const css=document.createElement('link');css.rel='stylesheet';css.href='/2nya-nailart/brand-motion.css?v=20260927-4';document.head.append(css);
  const logoSources=['/2nya-media/donya-logo.webp','/assets/logo.webp','/2nya-nailart/assets/logo.webp','/api/2nya-nailart/logo'];
  const isLogo=img=>{const src=img.getAttribute('src')||'';return logoSources.some(x=>src.includes(x))||/logo/i.test(img.className||'')||/لوگو/.test(img.alt||'')};
  function wrapLogo(img,index){
    if(!img||img.dataset.donyaLogo==='1')return;
    img.dataset.donyaLogo='1';img.src=LOGO;img.decoding='async';
    const parent=img.parentElement;if(!parent)return;
    let frame=parent.classList.contains('donya-logo-frame')?parent:null;
    if(!frame){frame=document.createElement('span');frame.className='donya-logo-frame';parent.insertBefore(frame,img);frame.append(img)}
    const prominent=parent.closest('.donya-brand,.contact-card,.contact-brand-mark,.footer-brand,.topin,.loginbox')||index<2;
    if(prominent)frame.classList.add('logo-shine');
  }
  function refreshLogos(){[...document.images].filter(isLogo).forEach(wrapLogo)}
  function syncManagerPortrait(){
    document.querySelectorAll('.about-photo img').forEach(img=>{
      if(img.dataset.donyaPortrait==='1')return;
      img.dataset.donyaPortrait='1';img.src=PORTRAIT;img.alt='دنیا وردی‌نژاد، مدیر Donya Nail Art';img.decoding='async';
    });
  }
  function removeLegacyLandingAbout(){
    const path=(location.pathname||'/').replace(/\/+$/,'')||'/';
    if(path!=='/')return;
    const duplicate=document.querySelector('#homeView > #about.about-section');
    if(duplicate)duplicate.remove();
  }
  function loadBookingCustomerUx(){
    if(!document.querySelector('#modal')||document.querySelector('script[data-donya-booking-customer-ux]'))return;
    const script=document.createElement('script');script.src='/2nya-nailart/booking-customer-ux.js?v=20260927-1';script.defer=true;script.dataset.donyaBookingCustomerUx='true';document.body.append(script);
  }
  const revealGroups=[
    ['.portfolio-top > *,.section-head > *','motion-title'],
    ['.portfolio-shell,.feature-card,.about-photo,.guide-feature > img','motion-scale'],
    ['.service-tile,.guide-benefit,.about-values > div',''],
    ['.about-copy > *,.guide-copy > *','motion-right'],
    ['.contact-panel > *','motion-left'],
    ['.service-copy > *','motion-right']
  ];
  function prepareReveal(){
    revealGroups.forEach(([selector,kind])=>document.querySelectorAll(selector).forEach((el,i)=>{
      if(el.dataset.motionReady)return;el.dataset.motionReady='1';el.classList.add('motion-reveal');
      if(kind)el.classList.add(kind);
      el.style.setProperty('--motion-delay',`${Math.min((i%6)*65,325)}ms`);
    }));
    if(reduced){document.querySelectorAll('.motion-reveal').forEach(el=>el.classList.add('is-visible'));return}
    const io=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');io.unobserve(entry.target)}}),{threshold:.14,rootMargin:'0px 0px -8% 0px'});
    document.querySelectorAll('.motion-reveal:not(.is-visible)').forEach(el=>io.observe(el));
  }
  function heroMotion(){const hero=document.querySelector('.donya-hero');if(!hero||reduced)return;hero.classList.add('hero-motion-ready');requestAnimationFrame(()=>requestAnimationFrame(()=>hero.classList.add('hero-motion-run')))}
  function init(){removeLegacyLandingAbout();refreshLogos();syncManagerPortrait();loadBookingCustomerUx();prepareReveal();heroMotion();const obs=new MutationObserver(()=>{removeLegacyLandingAbout();refreshLogos();syncManagerPortrait();loadBookingCustomerUx();prepareReveal()});obs.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
