import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HERO_MARKUP = `<section class="hero editorial-hero" aria-labelledby="hero-title">
  <div class="wrap hero-layout">
    <div class="hero-media" aria-label="نمونه‌کارهای 2nya Nail Art">
      <div class="hero-thumbs" role="tablist" aria-label="انتخاب رسانه">
        <button class="media-thumb is-active" type="button" role="tab" aria-selected="true" data-slide="0" aria-label="ویدیوی نمونه‌کار"><img src="/assets/hero-poster.webp" alt="" aria-hidden="true"></button>
        <button class="media-thumb" type="button" role="tab" aria-selected="false" data-slide="1" aria-label="نمونه‌کار یک"><img src="/assets/portfolio-01.webp" alt="" aria-hidden="true"></button>
        <button class="media-thumb" type="button" role="tab" aria-selected="false" data-slide="2" aria-label="نمونه‌کار دو"><img src="/assets/portfolio-02.webp" alt="" aria-hidden="true"></button>
        <button class="media-thumb" type="button" role="tab" aria-selected="false" data-slide="3" aria-label="نمونه‌کار سه"><img src="/assets/portfolio-03.webp" alt="" aria-hidden="true"></button>
        <button class="media-thumb" type="button" role="tab" aria-selected="false" data-slide="4" aria-label="نمونه‌کار چهار"><img src="/assets/portfolio-04.webp" alt="" aria-hidden="true"></button>
      </div>
      <div class="hero-device-shell">
        <div class="hero-device-frame" id="heroSlider" tabindex="0" aria-roledescription="carousel" aria-label="گالری نمونه‌کار 2nya Nail Art">
          <div class="hero-device-screen">
            <div class="media-slide is-active" data-media-slide="0">
              <video id="heroVideo" class="hero-main" autoplay muted loop playsinline preload="metadata" poster="/assets/hero-poster.webp" aria-label="ویدیوی نمونه‌کار 2nya Nail Art">
                <source src="/2nya-media/hero-main-v5.mp4" type="video/mp4">
              </video>
            </div>
            <div class="media-slide" data-media-slide="1"><img src="/assets/portfolio-01.webp" alt="نمونه طراحی ناخن 2nya Nail Art ۱"></div>
            <div class="media-slide" data-media-slide="2"><img loading="lazy" src="/assets/portfolio-02.webp" alt="نمونه طراحی ناخن 2nya Nail Art ۲"></div>
            <div class="media-slide" data-media-slide="3"><img loading="lazy" src="/assets/portfolio-03.webp" alt="نمونه طراحی ناخن 2nya Nail Art ۳"></div>
            <div class="media-slide" data-media-slide="4"><img loading="lazy" src="/assets/portfolio-04.webp" alt="نمونه طراحی ناخن 2nya Nail Art ۴"></div>
          </div>
          <button class="slider-arrow slider-prev" type="button" aria-label="رسانه قبلی">‹</button>
          <button class="slider-arrow slider-next" type="button" aria-label="رسانه بعدی">›</button>
        </div>
        <div class="media-counter" aria-live="polite"><span id="mediaIndex">۱</span><span aria-hidden="true">/</span><span>۵</span></div>
      </div>
    </div>
    <div class="hero-copy">
      <span class="hero-kicker">2nya Nail Art · طراحی شخصی‌سازی‌شده</span>
      <h1 id="hero-title">ناخن‌هایی که فقط زیبا نیستند؛<br>داستان شما را روایت می‌کنند.</h1>
      <p>در 2nya Nail Art با ترکیب ظرافت، سلیقه و اجرای حرفه‌ای، طراحی‌ای متناسب با استایل شما خلق می‌شود.</p>
      <div class="actions hero-actions"><button class="btn primary" data-book>رزرو وقت</button><a class="btn ghost" href="#portfolio">مشاهده نمونه‌کارها</a></div>
      <div class="trust-row" aria-label="ویژگی‌های تجربه 2nya Nail Art">
        <span><i aria-hidden="true">✦</i> توجه به جزئیات</span>
        <span><i aria-hidden="true">◇</i> طراحی متناسب با استایل شما</span>
        <span><i aria-hidden="true">○</i> رزرو آنلاین ساده</span>
      </div>
    </div>
  </div>
</section>`;

const HEADER_MARKUP = `<header class="top"><div class="wrap nav"><a class="brand" href="/" aria-label="2nya Nail Art - صفحه اصلی"><img src="/assets/logo.webp" alt="لوگوی 2nya Nail Art"><div><b>2nya Nail Art</b><span>ظرافت در هر جزئیات</span></div></a><nav class="desktop-nav" aria-label="ناوبری اصلی"><a href="/">صفحه اصلی</a><a href="#services">خدمات ما</a><a href="#portfolio">نمونه‌کارها</a><a href="/nail-care">راهنمای مراقبت</a><a href="#about">درباره ما</a></nav><button class="book" data-book>رزرو وقت</button></div></header>`;

const EDITORIAL_DESIGN = `<style id="2nya-editorial-v1">
:root{--ink:#1f1416!important;--paper:#f7f1ea!important;--wine:#5a1f3d!important;--wine2:#3e152a!important;--gold:#b88a5a!important;--muted:#756861!important;--line:rgba(70,42,30,.12)!important;--cream:#fff9f4;--nude:#e9d5c4;--surface:#efe3d8}
html{background:var(--paper)}body{background:var(--paper)!important;color:var(--ink)!important}.wrap{width:min(1180px,calc(100% - 40px))}.top{position:absolute!important;padding:18px 0!important}.nav{min-height:68px;padding:8px 10px 8px 14px;border:1px solid var(--line);border-radius:24px;background:rgba(255,249,244,.94);box-shadow:0 14px 45px rgba(70,42,30,.08);backdrop-filter:blur(14px)}.brand{color:var(--ink)!important}.brand img{width:48px;height:48px;border-radius:16px;border:1px solid var(--line)!important}.brand b{font-family:Estedad;font-weight:700}.brand span{display:block;color:var(--muted);font-size:.74rem}.desktop-nav{display:flex;align-items:center;gap:21px;margin-inline:auto}.desktop-nav a{color:#4d3b37;text-decoration:none;font-size:.88rem;font-weight:600;transition:.2s}.desktop-nav a:hover{color:var(--wine)}.nav .book{background:var(--wine)!important;color:#fff!important;min-height:44px;padding:10px 19px!important;box-shadow:0 8px 22px rgba(90,31,61,.15)}
.editorial-hero{min-height:760px!important;padding:112px 0 64px!important;display:flex!important;align-items:center!important;background:radial-gradient(circle at 10% 20%,rgba(184,138,90,.13),transparent 25%),radial-gradient(circle at 82% 70%,rgba(233,213,196,.42),transparent 30%),linear-gradient(135deg,#fff9f4 0%,#f7f1ea 56%,#efe3d8 100%)!important;color:var(--ink)!important;overflow:hidden!important}.editorial-hero:before{content:"";position:absolute;left:-120px;bottom:-200px;width:480px;height:480px;border:1px solid rgba(184,138,90,.20);border-radius:50%;box-shadow:0 0 0 55px rgba(184,138,90,.035),0 0 0 110px rgba(184,138,90,.02)}.hero-layout{display:grid;grid-template-columns:minmax(420px,.95fr) minmax(480px,1.05fr);gap:clamp(46px,7vw,94px);align-items:center}.hero-media{direction:ltr;display:flex;align-items:center;justify-content:center;gap:18px;min-width:0}.hero-thumbs{width:72px;display:flex;flex-direction:column;gap:10px}.media-thumb{width:72px;aspect-ratio:1;border:1px solid transparent;border-radius:18px;padding:4px;background:rgba(255,249,244,.7);overflow:hidden;opacity:.66;transition:.2s}.media-thumb img{display:block;width:100%;height:100%;object-fit:cover;border-radius:13px}.media-thumb.is-active{opacity:1;border-color:var(--gold);box-shadow:0 0 0 3px rgba(184,138,90,.11)}.hero-device-shell{width:clamp(300px,26vw,354px);position:relative}.hero-device-frame{position:relative;aspect-ratio:510/908;padding:9px;border-radius:47px;background:linear-gradient(145deg,#332729,#100b0c 55%,#2d2021);border:1px solid rgba(184,138,90,.48);box-shadow:0 30px 65px rgba(65,40,31,.20),0 0 0 8px rgba(255,255,255,.35);outline:none}.hero-device-frame:focus-visible{box-shadow:0 0 0 4px rgba(90,31,61,.22),0 30px 65px rgba(65,40,31,.20)}.hero-device-screen{position:absolute;inset:9px;border-radius:38px;overflow:hidden;background:#150d10}.media-slide{position:absolute;inset:0;opacity:0;pointer-events:none;transition:opacity .28s ease}.media-slide.is-active{opacity:1;pointer-events:auto}.media-slide img,.hero-main{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}.hero-main{position:static!important;max-width:none!important;background:#150d10!important}.slider-arrow{position:absolute;z-index:5;top:50%;width:40px;height:40px;border:1px solid rgba(255,255,255,.26);border-radius:50%;background:rgba(24,14,16,.58);color:#fff;font-size:1.65rem;display:grid;place-items:center;transform:translateY(-50%);backdrop-filter:blur(8px)}.slider-prev{left:18px}.slider-next{right:18px}.media-counter{position:absolute;right:18px;bottom:18px;z-index:6;display:flex;gap:5px;direction:ltr;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(20,12,14,.6);color:#fff;font-size:.76rem;backdrop-filter:blur(8px)}.hero-copy{padding:0!important;color:var(--ink)!important;max-width:620px!important;text-align:right!important}.hero-kicker{display:inline-flex;color:var(--wine);font-size:.84rem;font-weight:800;letter-spacing:.01em;margin-bottom:17px}.editorial-hero h1{font-size:clamp(3rem,4.25vw,3.85rem)!important;line-height:1.2!important;letter-spacing:-.035em!important;font-weight:700!important;margin:0 0 20px!important;color:var(--ink)!important;text-wrap:balance}.editorial-hero p{font-size:1.05rem!important;line-height:2!important;color:var(--muted)!important;max-width:560px!important;margin:0}.hero-actions{margin-top:28px!important;gap:11px!important}.hero-actions .btn{min-height:54px;padding:13px 25px!important}.hero-actions .primary{background:var(--wine)!important;color:#fff!important;box-shadow:0 12px 28px rgba(90,31,61,.17)}.hero-actions .ghost{background:transparent!important;border:1px solid rgba(90,31,61,.24)!important;color:var(--wine)!important}.trust-row{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:28px;padding-top:22px;border-top:1px solid var(--line);color:#665650;font-size:.82rem}.trust-row span{display:inline-flex;gap:7px;align-items:center}.trust-row i{font-style:normal;color:var(--gold);font-size:1rem}
section{padding:78px 0}.services-section{background:#fff9f4}.services-section .head{align-items:end}.services-section .head h2,.portfolio .head h2,.about h2{font-size:clamp(2rem,4vw,3.5rem)!important}.services{grid-template-columns:repeat(3,1fr)!important;gap:14px!important}.service{position:relative;min-height:330px!important;border:1px solid var(--line)!important;border-radius:28px!important;padding:170px 20px 20px!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-end!important;background:#fff!important;box-shadow:0 15px 45px rgba(70,42,30,.06)}.service:before{content:"";position:absolute;inset:0 0 auto;height:150px;background-size:cover;background-position:center}.service:nth-child(3n+1):before{background-image:url('/assets/portfolio-02.webp')}.service:nth-child(3n+2):before{background-image:url('/assets/portfolio-03.webp')}.service:nth-child(3n):before{background-image:url('/assets/portfolio-04.webp')}.service h3{font-family:Estedad;font-size:1.22rem!important;margin-bottom:5px!important}.service small{min-height:48px;line-height:1.8}.service button{margin-top:14px!important;background:var(--wine)!important;min-height:46px!important}.care-teaser{padding:30px 0 80px!important;background:#fff9f4}.care-card{position:relative;overflow:hidden;display:grid;grid-template-columns:1.25fr auto;gap:30px;align-items:center;padding:clamp(28px,5vw,54px);border:1px solid var(--line);border-radius:32px;background:linear-gradient(135deg,#efe3d8,#f8eee7 55%,#fff9f4);box-shadow:0 20px 55px rgba(70,42,30,.06)}.care-card:after{content:"✦";position:absolute;left:5%;top:-42px;color:rgba(184,138,90,.13);font-size:9rem;line-height:1}.care-card h2{font-size:clamp(2rem,4vw,3.35rem);line-height:1.25;margin:5px 0 12px}.care-card p{color:var(--muted);margin:0;max-width:680px}.care-card .btn{background:var(--wine);color:#fff;white-space:nowrap}.portfolio{background:#3e152a!important;color:#fff!important}.portfolio .eyebrow{color:#e9cda9!important}.portfolio .muted{color:rgba(255,249,244,.72)!important}.grid{gap:14px!important}.shot{border-radius:28px!important;background:#2e1721!important}.shot img{transition:transform .4s ease}.about{gap:58px!important}.about-card{background:linear-gradient(145deg,#5a1f3d,#3e152a)!important;border-radius:32px!important;box-shadow:0 22px 50px rgba(62,21,42,.15)}.footer{background:#2d1720!important}.modal{background:rgba(31,20,22,.62)!important;backdrop-filter:blur(6px)}.sheet{background:#fff9f4!important;border:1px solid rgba(255,255,255,.35);box-shadow:0 -24px 70px rgba(31,20,22,.18)}.sheet-head{background:rgba(255,249,244,.96)}.body{background:#f7f1ea}.opt,.time,.field input,.field textarea,.summary,.success{background:#fff9f4!important}.opt.sel,.time.sel{border-color:var(--wine)!important;box-shadow:0 0 0 3px rgba(90,31,61,.10)!important}.date.sel,.steps i.on{background:var(--wine)!important}.sheet-actions{background:linear-gradient(180deg,rgba(247,241,234,0),#f7f1ea 22%)!important}.sheet-actions .btn{background:var(--wine)!important}.sheet-actions .back{background:#e9d5c4!important;color:var(--ink)!important}.sticky{background:var(--wine)!important;box-shadow:0 12px 35px rgba(90,31,61,.26)!important}.btn:focus-visible,.book:focus-visible,.media-thumb:focus-visible,.slider-arrow:focus-visible,.service button:focus-visible{outline:3px solid rgba(184,138,90,.58);outline-offset:3px}
@media(max-width:1000px){.desktop-nav{display:none}.hero-layout{grid-template-columns:minmax(330px,.88fr) minmax(390px,1.12fr);gap:36px}.hero-thumbs{width:60px}.media-thumb{width:60px}.hero-device-shell{width:290px}.editorial-hero h1{font-size:clamp(2.6rem,5vw,3.35rem)!important}}
@media(max-width:800px){.wrap{width:min(100% - 34px,1180px)}.top{position:relative!important;padding:10px 0!important;background:#fff9f4}.nav{min-height:58px;border-radius:20px;padding:6px 8px}.brand img{width:42px!important;height:42px!important}.brand span{display:none!important}.nav .book{min-height:40px;padding:8px 14px!important}.editorial-hero{min-height:0!important;padding:18px 0 58px!important;display:block!important}.hero-layout{display:flex;flex-direction:column;gap:34px}.hero-media{width:100%;flex-direction:column;gap:12px}.hero-device-shell{width:min(86vw,350px)}.hero-thumbs{order:2;width:100%;flex-direction:row;justify-content:center;overflow-x:auto;padding:3px 0 7px}.media-thumb{flex:0 0 60px;width:60px;border-radius:15px}.hero-device-frame{border-radius:42px}.hero-device-screen{border-radius:33px}.hero-copy{order:2;max-width:100%!important}.hero-kicker{margin-bottom:12px}.editorial-hero h1{font-size:clamp(2.15rem,9.4vw,2.7rem)!important;line-height:1.3!important;letter-spacing:-.025em!important}.editorial-hero h1 br{display:none}.editorial-hero p{font-size:.98rem!important;line-height:1.95!important}.hero-actions{display:grid!important;grid-template-columns:1fr!important;width:100%}.hero-actions .btn{width:100%}.trust-row{display:grid;grid-template-columns:1fr;gap:9px;margin-top:24px}.services{grid-template-columns:1fr!important}.service{min-height:320px!important}.care-teaser{padding:18px 0 60px!important}.care-card{grid-template-columns:1fr;gap:22px;border-radius:26px;padding:28px 22px}.care-card .btn{width:100%}.portfolio{padding-top:60px!important}.grid{grid-template-columns:1fr 1fr!important}.shot:first-child{grid-column:1/-1!important;min-height:410px!important}.about{grid-template-columns:1fr!important}.sticky{display:block!important}.sheet{height:94svh!important}.modal.open .sticky{display:none!important}}
@media(max-width:430px){.wrap{width:min(100% - 30px,1180px)}.hero-device-shell{width:min(88vw,338px)}.media-thumb{flex-basis:56px;width:56px}.slider-arrow{width:38px;height:38px}.editorial-hero h1{font-size:clamp(2.08rem,9.9vw,2.5rem)!important}.editorial-hero{padding-bottom:52px!important}.service{padding-inline:18px!important}.shot{min-height:190px!important}.shot:first-child{min-height:360px!important}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.media-slide,.shot img{transition:none!important}.hero-main{display:none!important}.media-slide[data-media-slide="0"]{background:#150d10 url('/assets/hero-poster.webp') center/cover no-repeat}.slider-arrow{transition:none}}
</style>`;

const EXPERIENCE_SCRIPT = `<script id="2nya-editorial-experience-v1">
(()=>{
  const init=()=>{
    const hero=document.querySelector('.editorial-hero');
    const slider=document.getElementById('heroSlider');
    const video=document.getElementById('heroVideo');
    const slides=[...document.querySelectorAll('[data-media-slide]')];
    const thumbs=[...document.querySelectorAll('[data-slide]')];
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let index=0,startX=null;
    const fa=n=>new Intl.NumberFormat('fa-IR').format(n);
    const playVideo=()=>{if(!(video instanceof HTMLVideoElement)||reduced)return;video.muted=true;video.defaultMuted=true;video.playsInline=true;const p=video.play();if(p&&typeof p.catch==='function')p.catch(()=>hero&&hero.classList.add('is-video-paused'));};
    const show=n=>{index=(n+slides.length)%slides.length;slides.forEach((el,i)=>el.classList.toggle('is-active',i===index));thumbs.forEach((el,i)=>{el.classList.toggle('is-active',i===index);el.setAttribute('aria-selected',String(i===index))});const c=document.getElementById('mediaIndex');if(c)c.textContent=fa(index+1);if(video instanceof HTMLVideoElement){if(index===0)playVideo();else video.pause();}};
    document.querySelector('.slider-prev')?.addEventListener('click',()=>show(index-1));
    document.querySelector('.slider-next')?.addEventListener('click',()=>show(index+1));
    thumbs.forEach((el,i)=>el.addEventListener('click',()=>show(i)));
    slider?.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();show(index-1)}if(e.key==='ArrowRight'){e.preventDefault();show(index+1)}});
    slider?.addEventListener('touchstart',e=>{startX=e.touches[0]?.clientX??null},{passive:true});
    slider?.addEventListener('touchend',e=>{if(startX==null)return;const end=e.changedTouches[0]?.clientX??startX;const d=end-startX;startX=null;if(Math.abs(d)>45)show(d>0?index-1:index+1)},{passive:true});
    if(video instanceof HTMLVideoElement){video.addEventListener('canplay',()=>{if(index===0)playVideo()});video.addEventListener('playing',()=>hero&&hero.classList.remove('is-video-paused'));video.addEventListener('error',()=>hero&&hero.classList.add('is-video-error'));}
    const services=document.querySelector('#services')?.closest('section');
    if(services){services.classList.add('services-section');services.id='services-section';const eyebrow=services.querySelector('.eyebrow');const title=services.querySelector('h2');const desc=services.querySelector('.head .muted');if(eyebrow)eyebrow.textContent='خدمات';if(title)title.textContent='خدمات و رزرو';if(desc)desc.textContent='سرویس موردنظر را انتخاب کنید و ادامه رزرو را در چند مرحله ساده انجام دهید.';hero?.after(services);const care=document.createElement('section');care.className='care-teaser';care.innerHTML='<div class="wrap"><div class="care-card"><div><span class="eyebrow">مراقبت بعد از خدمات</span><h2>راهنمای مراقبت از ناخن</h2><p>نکات علمی و کاربردی برای داشتن ناخن‌هایی سالم‌تر و زیباتر و نگهداری بهتر بعد از خدمات.</p></div><a class="btn" href="/nail-care">مطالعه راهنما</a></div></div>';services.after(care);}
    const about=document.querySelector('.about');if(about)about.id='about';
    show(0);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
</script>`;

const ALL_PORTFOLIO_SLOTS = "const shots=['portfolio-01.webp','portfolio-02.webp','portfolio-03.webp','portfolio-04.webp','portfolio-05.webp','portfolio-06.webp','portfolio-07.webp','portfolio-08.webp'];";
const UNIQUE_PORTFOLIO_SLOTS = "const shots=['portfolio-01.webp','portfolio-02.webp','portfolio-03.webp','portfolio-04.webp'];";

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', '2nya-nailart', 'index.html');
  const html = await readFile(filePath, 'utf8');
  const heroPattern = /<section class="hero">[\s\S]*?<\/section>/;
  const headerPattern = /<header class="top">[\s\S]*?<\/header>/;
  const withHeader = headerPattern.test(html) ? html.replace(headerPattern, HEADER_MARKUP) : html;
  const withHero = heroPattern.test(withHeader) ? withHeader.replace(heroPattern, HERO_MARKUP) : withHeader;
  const withPortfolio = withHero.replace(ALL_PORTFOLIO_SLOTS, UNIQUE_PORTFOLIO_SLOTS);
  const withStyles = withPortfolio.replace('</head>', `${EDITORIAL_DESIGN}</head>`);
  const patched = withStyles.replace('</body>', `${EXPERIENCE_SCRIPT}</body>`);
  return new NextResponse(patched, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
