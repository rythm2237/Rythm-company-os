(()=>{
  if(window.__donyaBrandMotion)return;window.__donyaBrandMotion=true;
  const LOGO='/api/2nya-nailart/logo';
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const logoSources=['/2nya-media/donya-logo.webp','/assets/logo.webp','/2nya-nailart/assets/logo.webp'];
  const isLogo=img=>{const src=img.getAttribute('src')||'';return logoSources.some(x=>src.includes(x))||/logo/i.test(img.className||'')||/لوگو/.test(img.alt||'')};
  function wrapLogo(img,index){
    if(!img||img.dataset.donyaLogo==='1')return;
    img.dataset.donyaLogo='1';img.src=LOGO;img.decoding='async';
    const parent=img.parentElement;if(!parent)return;
    let frame=parent.classList.contains('donya-logo-frame')?parent:null;
    if(!frame){frame=document.createElement('span');frame.className='donya-logo-frame';parent.insertBefore(frame,img);frame.append(img)}
    const prominent=parent.closest('.donya-brand,.contact-card,.footer-brand,.topin,.loginbox')||index<2;
    if(prominent)frame.classList.add('logo-shine');
  }
  function refreshLogos(){[...document.images].filter(isLogo).forEach(wrapLogo)}
  const revealGroups=[
    ['.portfolio-top > *,.section-head > *','motion-title'],
    ['.portfolio-shell,.feature-card,.about-photo,.guide-feature > img','.motion-scale'],
    ['.service-tile,.guide-benefit,.about-values > div','.motion-reveal'],
    ['.about-copy > *,.guide-copy > *','.motion-right'],
    ['.contact-panel > *','.motion-left'],
    ['.service-copy > *','.motion-right']
  ];
  function prepareReveal(){
    let n=0;
    revealGroups.forEach(([selector,kind])=>document.querySelectorAll(selector).forEach((el,i)=>{
      if(el.dataset.motionReady)return;el.dataset.motionReady='1';el.classList.add('motion-reveal');
      if(kind&&kind!=='.motion-reveal')el.classList.add(kind.replace('.',''));
      el.style.setProperty('--motion-delay',`${Math.min((i%6)*65,325)}ms`);n++;
    }));
    if(reduced){document.querySelectorAll('.motion-reveal').forEach(el=>el.classList.add('is-visible'));return}
    const io=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('is-visible');io.unobserve(entry.target)}
    }),{threshold:.14,rootMargin:'0px 0px -8% 0px'});
    document.querySelectorAll('.motion-reveal:not(.is-visible)').forEach(el=>io.observe(el));
  }
  function heroMotion(){const hero=document.querySelector('.donya-hero');if(!hero||reduced)return;hero.classList.add('hero-motion-ready');requestAnimationFrame(()=>requestAnimationFrame(()=>hero.classList.add('hero-motion-run')))}
  function init(){refreshLogos();prepareReveal();heroMotion();const obs=new MutationObserver(()=>{refreshLogos();prepareReveal()});obs.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
