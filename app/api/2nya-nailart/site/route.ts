import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADER_MARKUP = `<header class="top donya-top">
  <div class="donya-nav-shell">
    <a class="donya-brand" href="/" aria-label="Donya Nail Art - صفحه اصلی">
      <img src="/2nya-media/donya-logo.webp" alt="لوگوی Donya Nail Art">
      <span class="donya-brand-copy"><b>Donya Nail Art</b><small>هنر ناخن، جلوه‌ای از زیبایی تو</small></span>
    </a>
    <nav class="desktop-nav" aria-label="ناوبری اصلی">
      <a class="active" href="/">صفحه اصلی</a>
      <a href="#services">خدمات ما</a>
      <a href="#portfolio">نمونه‌کارها</a>
      <a href="#booking">رزرو وقت</a>
      <a href="/nail-care">راهنمای زیبایی</a>
      <a href="#about">درباره ما</a>
      <a href="https://www.instagram.com/2nya._nailart/" target="_blank" rel="noopener">تماس با ما</a>
    </nav>
    <button class="book nav-book" data-book><span>رزرو وقت</span><span aria-hidden="true">▦</span></button>
    <button class="nav-search" type="button" aria-label="جستجو" title="جستجو">⌕</button>
  </div>
</header>`;

const HERO_MARKUP = `<section class="hero donya-hero" aria-labelledby="hero-title">
  <video class="mobile-hero-video" autoplay muted loop playsinline preload="metadata" poster="/assets/hero-poster.webp">
    <source src="/2nya-media/hero-main-v5.mp4" type="video/mp4">
  </video>
  <div class="donya-hero-layout">
    <div class="phone-gallery" aria-label="اسلایدر نمونه‌کارهای Donya Nail Art">
      <div class="phone-shell" id="donyaPhone" tabindex="0" aria-roledescription="carousel">
        <div class="phone-screen">
          <div class="phone-slide is-active" data-phone-slide="0"><video id="heroVideo" autoplay muted loop playsinline preload="metadata" poster="/assets/hero-poster.webp"><source src="/2nya-media/hero-main-v5.mp4" type="video/mp4"></video></div>
          <div class="phone-slide" data-phone-slide="1"><img src="/assets/portfolio-01.webp" alt="نمونه طراحی ناخن Donya ۱"></div>
          <div class="phone-slide" data-phone-slide="2"><img loading="lazy" src="/assets/portfolio-02.webp" alt="نمونه طراحی ناخن Donya ۲"></div>
          <div class="phone-slide" data-phone-slide="3"><img loading="lazy" src="/assets/portfolio-03.webp" alt="نمونه طراحی ناخن Donya ۳"></div>
          <div class="phone-slide" data-phone-slide="4"><img loading="lazy" src="/assets/portfolio-04.webp" alt="نمونه طراحی ناخن Donya ۴"></div>
        </div>
        <button class="phone-arrow prev" type="button" aria-label="قبلی">‹</button>
        <button class="phone-arrow next" type="button" aria-label="بعدی">›</button>
        <div class="phone-dots" aria-label="انتخاب اسلاید">
          <button class="is-active" data-phone-dot="0" aria-label="اسلاید ۱"></button>
          <button data-phone-dot="1" aria-label="اسلاید ۲"></button>
          <button data-phone-dot="2" aria-label="اسلاید ۳"></button>
          <button data-phone-dot="3" aria-label="اسلاید ۴"></button>
          <button data-phone-dot="4" aria-label="اسلاید ۵"></button>
        </div>
      </div>
      <span class="phone-caption">Beauty lives in details ♡</span>
    </div>

    <div class="hero-center-copy">
      <div class="hero-eyebrow"><span></span>هنر ناخن، جلوه‌ای از زیبایی تو</div>
      <h1 id="hero-title">ناخن‌هایی که فقط<br>زیبا نیستند،<br><em>داستان شما</em> را روایت می‌کنند.</h1>
      <p>در <strong>Donya Nail Art</strong> با ترکیبی بی‌نظیر از ظرافت، خلاقیت و جدیدترین تکنیک‌ها، استایلی منحصربه‌فرد برای شما خلق می‌کنیم.<br>زیبایی در جزئیات است…</p>
      <div class="hero-actions">
        <a class="btn ghost" href="#portfolio"><span>مشاهده نمونه‌کارها</span><span aria-hidden="true">▧</span></a>
        <button class="btn primary" data-book><span>رزرو وقت</span><span aria-hidden="true">▦</span></button>
      </div>
      <div class="hero-trust">
        <span>♡ <b>مشاوره تخصصی<br>و پشتیبانی</b></span>
        <span>◇ <b>کیفیت و ظرافت<br>در هر جزئیات</b></span>
        <span>♢ <b>استفاده از مواد<br>با کیفیت و ایمن</b></span>
        <span>⌁ <b>محیط آرام<br>و دلنشین</b></span>
      </div>
    </div>
  </div>
</section>`;

const DESIGN = `<style id="donya-desktop-background-v4">
:root{--donya-wine:#7b1038;--donya-wine-dark:#541027;--donya-rose:#b44762;--donya-gold:#bd7935;--donya-ink:#2b171c;--donya-paper:#fff8f3;--donya-line:rgba(91,47,43,.14)}
html,body{background:#fff8f3!important;color:var(--donya-ink)!important}
.donya-top{position:absolute!important;z-index:60!important;inset:0 0 auto!important;padding:28px 0 0!important;background:transparent!important}
.donya-nav-shell{width:min(1460px,calc(100% - 96px));margin:0 auto;min-height:74px;display:grid;grid-template-columns:240px minmax(660px,1fr) 165px 52px;gap:12px;align-items:center;padding:8px 12px;border:1px solid rgba(255,255,255,.84);border-radius:36px;background:rgba(255,249,246,.91);box-shadow:0 18px 50px rgba(93,57,45,.12);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);direction:ltr}
.donya-brand{display:flex;align-items:center;gap:12px;min-width:0;color:#321d21;text-decoration:none}.donya-brand img{width:72px!important;height:76px!important;object-fit:contain!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}.donya-brand-copy{display:flex;flex-direction:column;line-height:1.06}.donya-brand-copy b{font-family:Georgia,'Times New Roman',serif;font-size:1.35rem;font-weight:700;white-space:nowrap}.donya-brand-copy small{margin-top:6px;font-size:.65rem;color:#70554e;direction:rtl;white-space:nowrap}
.desktop-nav{display:flex;align-items:center;justify-content:center;gap:clamp(14px,1.55vw,28px);direction:rtl;white-space:nowrap}.desktop-nav a{color:#3a282b!important;text-decoration:none!important;font-size:.88rem!important;font-weight:750!important;padding:20px 0 14px!important;border-bottom:2px solid transparent!important}.desktop-nav a:hover,.desktop-nav a.active{color:var(--donya-wine)!important;border-bottom-color:var(--donya-wine)!important}
.nav-book{height:52px!important;border:0!important;border-radius:999px!important;background:linear-gradient(135deg,var(--donya-wine),#68102f)!important;color:#fff!important;font-weight:850!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:12px!important;box-shadow:0 10px 24px rgba(123,16,56,.18)!important}.nav-search{width:46px;height:46px;border:1px solid rgba(89,45,37,.20);border-radius:50%;background:rgba(255,250,247,.88);font-size:1.55rem;color:#432c2b}
.donya-hero{position:relative!important;height:min(100vh,56.3vw)!important;min-height:760px!important;display:block!important;padding:0!important;overflow:hidden!important;isolation:isolate!important;background:url('/2nya-media/donya-bg-v3.webp') center top/cover no-repeat!important}.donya-hero:before{content:"";position:absolute;z-index:0;inset:0;background:radial-gradient(ellipse at 61% 48%,rgba(255,249,246,.46) 0%,rgba(255,249,246,.24) 28%,rgba(255,249,246,.04) 57%,transparent 72%);pointer-events:none}
.donya-hero-layout{position:relative;z-index:2;width:100%;height:100%;display:grid;grid-template-columns:31vw 255px minmax(520px,650px) 1fr;align-items:center;direction:ltr;padding-top:116px}
.phone-gallery{grid-column:2;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translateY(28px)}.phone-shell{position:relative;width:238px;aspect-ratio:9/18.7;padding:8px;border-radius:39px;background:linear-gradient(145deg,#3a2327,#0d090a 52%,#29171b);border:1px solid rgba(184,116,69,.7);box-shadow:0 28px 62px rgba(77,47,42,.25),0 0 0 7px rgba(255,255,255,.54);outline:none}.phone-shell:before{content:"";position:absolute;z-index:6;top:13px;left:50%;transform:translateX(-50%);width:75px;height:18px;border-radius:999px;background:#0b0809}.phone-screen{position:absolute;inset:8px;border-radius:31px;overflow:hidden;background:#12090d}.phone-slide{position:absolute;inset:0;opacity:0;pointer-events:none;transition:opacity .3s}.phone-slide.is-active{opacity:1;pointer-events:auto}.phone-slide img,.phone-slide video{width:100%;height:100%;object-fit:cover;display:block}.phone-arrow{position:absolute;z-index:8;top:50%;transform:translateY(-50%);width:34px;height:34px;border:1px solid rgba(255,255,255,.34);border-radius:50%;background:rgba(30,13,18,.48);color:#fff;font-size:1.4rem;display:grid;place-items:center}.phone-arrow.prev{left:14px}.phone-arrow.next{right:14px}.phone-dots{position:absolute;z-index:8;left:50%;bottom:17px;transform:translateX(-50%);display:flex;gap:5px}.phone-dots button{width:6px;height:6px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.45)}.phone-dots button.is-active{width:18px;border-radius:999px;background:#fff}.phone-caption{margin-top:18px;font-family:'Brush Script MT','Segoe Script',cursive;color:#a8666a;font-size:1.35rem;transform:rotate(-5deg);text-shadow:0 2px 8px rgba(255,255,255,.8)}
.hero-center-copy{grid-column:3;direction:rtl;text-align:center;justify-self:start;align-self:center;width:min(100%,620px);margin-left:28px;padding-top:32px}.hero-eyebrow{display:flex;justify-content:center;align-items:center;gap:16px;font-weight:800;color:#41272b;font-size:.94rem}.hero-eyebrow span{width:76px;height:1px;background:#9c7771}.hero-center-copy h1{font-family:Estedad,Vazirmatn,sans-serif!important;font-size:clamp(2.55rem,3.5vw,4rem)!important;line-height:1.28!important;letter-spacing:-.045em!important;margin:16px auto 14px!important;color:#2a1016!important;font-weight:850!important;max-width:620px;text-shadow:0 1px 0 rgba(255,255,255,.45)}.hero-center-copy h1 em{font-style:normal;color:#ad3f55}.hero-center-copy p{margin:0 auto;max-width:610px;color:#4a3b3d;font-size:1rem;line-height:1.95}.hero-center-copy strong{font-family:Georgia,'Times New Roman',serif}
.hero-actions{justify-content:center!important;gap:15px!important;margin-top:20px!important;display:flex!important}.hero-actions .btn{min-width:205px!important;min-height:54px!important;border-radius:999px!important;font-size:.92rem!important;gap:12px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}.hero-actions .primary{background:linear-gradient(135deg,var(--donya-wine),#650d30)!important;color:#fff!important;box-shadow:0 12px 28px rgba(126,16,57,.18)!important}.hero-actions .ghost{background:rgba(255,250,247,.72)!important;border:1.5px solid #80544e!important;color:#2f1d20!important;backdrop-filter:blur(7px)!important}
.hero-trust{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:24px auto 0;max-width:620px;border-top:1px solid rgba(97,53,45,.15);padding-top:18px;color:#6c1d37}.hero-trust span{display:flex;align-items:center;justify-content:center;gap:8px;padding:0 10px;border-left:1px solid rgba(97,53,45,.15);font-size:1.15rem}.hero-trust span:last-child{border-left:0}.hero-trust b{font-size:.7rem;color:#39272a;line-height:1.55;font-weight:700}.mobile-hero-video{display:none}
body>main>section:not(.donya-hero){position:relative;z-index:3}.portfolio{background:#641632!important}.portfolio .head h2{font-size:clamp(2.1rem,4vw,3.65rem)!important}.grid{gap:14px!important}.shot{border-radius:24px!important}.services{grid-template-columns:repeat(4,1fr)!important;gap:14px!important}.service{border-radius:20px!important}.service button{background:var(--donya-wine)!important}.about-card{background:linear-gradient(145deg,#7e1039,#511027)!important}.footer{background:#34101f!important}.sticky{background:var(--donya-wine)!important}.modal .sheet-actions .btn{background:var(--donya-wine)!important}.steps i.on,.date.sel{background:var(--donya-wine)!important}
@media(max-width:1380px){.donya-nav-shell{width:min(1320px,calc(100% - 54px));grid-template-columns:205px minmax(560px,1fr) 150px 48px}.donya-brand img{width:64px!important;height:68px!important}.donya-brand-copy b{font-size:1.15rem}.desktop-nav{gap:14px}.desktop-nav a{font-size:.79rem!important}.donya-hero-layout{grid-template-columns:29vw 225px minmax(500px,590px) 1fr}.phone-shell{width:215px}.hero-center-copy{margin-left:18px}.hero-center-copy h1{font-size:clamp(2.4rem,3.65vw,3.45rem)!important}.hero-center-copy p{font-size:.94rem}.hero-trust{max-width:580px}}
@media(max-width:1080px){.donya-nav-shell{width:calc(100% - 32px);grid-template-columns:170px 1fr 135px 46px}.desktop-nav{display:none}.donya-brand-copy small{display:none}.donya-hero{height:auto!important;min-height:780px!important;background-position:center top!important}.donya-hero-layout{grid-template-columns:260px 1fr;gap:28px;padding:120px 34px 46px}.phone-gallery{grid-column:1}.hero-center-copy{grid-column:2;margin:0;width:100%;padding-top:8px}.hero-trust{grid-template-columns:repeat(2,1fr);row-gap:12px}.services{grid-template-columns:repeat(2,1fr)!important}}
@media(max-width:800px){.donya-top{padding-top:10px!important}.donya-nav-shell{min-height:60px;width:calc(100% - 20px);grid-template-columns:58px 1fr 116px;border-radius:22px;padding:4px 7px}.nav-search{display:none}.desktop-nav{display:none}.donya-brand{grid-column:1/3}.donya-brand img{width:48px!important;height:52px!important}.donya-brand-copy b{font-size:1rem}.donya-brand-copy small{display:none}.nav-book{height:42px!important;font-size:.78rem!important}.donya-hero{min-height:88svh!important;height:88svh!important;background:#1b1113!important;padding:0!important;display:flex!important;align-items:flex-end!important}.donya-hero:before{z-index:1;background:linear-gradient(180deg,rgba(19,10,12,.18),rgba(19,10,12,.17) 44%,rgba(19,10,12,.82) 100%)}.mobile-hero-video{display:block;position:absolute;z-index:0;inset:0;width:100%;height:100%;object-fit:cover}.donya-hero-layout{display:block;width:100%;height:auto;padding:0 20px 44px}.phone-gallery{display:none}.hero-center-copy{position:relative;z-index:3;width:100%;max-width:650px;margin:0 auto;padding:0;color:#fff;text-align:center}.hero-eyebrow{color:#fff;font-size:.78rem}.hero-eyebrow span{background:rgba(255,255,255,.6)}.hero-center-copy h1{font-size:clamp(2.15rem,10vw,3.15rem)!important;color:#fff!important;line-height:1.35!important;text-shadow:0 3px 22px rgba(0,0,0,.25)!important}.hero-center-copy h1 em{color:#ffd7df}.hero-center-copy p{color:rgba(255,255,255,.88);font-size:.9rem;line-height:1.8}.hero-actions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:9px!important}.hero-actions .btn{min-width:0!important;width:100%!important;min-height:48px!important;padding:10px!important;font-size:.82rem!important}.hero-actions .ghost{color:#fff!important;border-color:rgba(255,255,255,.58)!important;background:rgba(24,12,15,.22)!important}.hero-actions .primary{background:#fff!important;color:var(--donya-wine)!important}.hero-trust{display:none}.services{grid-template-columns:1fr!important}}
@media(max-width:430px){.donya-nav-shell{grid-template-columns:52px 1fr 106px}.donya-brand img{width:44px!important;height:48px!important}.hero-actions{grid-template-columns:1fr!important}.donya-hero-layout{padding-inline:15px}}
@media(prefers-reduced-motion:reduce){.phone-slide{transition:none}.mobile-hero-video,.phone-slide video{display:none}.donya-hero{background:url('/2nya-media/donya-bg-v3.webp') center/cover no-repeat!important}.phone-slide[data-phone-slide="0"]{background:#160b10 url('/assets/hero-poster.webp') center/cover no-repeat}}
</style>`;

const PHONE_SCRIPT = `<script id="donya-phone-slider-v4">(()=>{const init=()=>{const shell=document.getElementById('donyaPhone');if(!shell)return;const slides=[...document.querySelectorAll('[data-phone-slide]')],dots=[...document.querySelectorAll('[data-phone-dot]')],video=document.getElementById('heroVideo');let index=0,startX=null;const show=n=>{index=(n+slides.length)%slides.length;slides.forEach((s,i)=>s.classList.toggle('is-active',i===index));dots.forEach((d,i)=>d.classList.toggle('is-active',i===index));if(video instanceof HTMLVideoElement){if(index===0){video.muted=true;video.play().catch(()=>{})}else video.pause()}};document.querySelector('.phone-arrow.prev')?.addEventListener('click',()=>show(index-1));document.querySelector('.phone-arrow.next')?.addEventListener('click',()=>show(index+1));dots.forEach(d=>d.addEventListener('click',()=>show(Number(d.dataset.phoneDot)||0)));shell.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')show(index-1);if(e.key==='ArrowRight')show(index+1)});shell.addEventListener('touchstart',e=>{startX=e.touches[0]?.clientX??null},{passive:true});shell.addEventListener('touchend',e=>{if(startX==null)return;const x=e.changedTouches[0]?.clientX??startX;if(Math.abs(x-startX)>42)show(index+(x<startX?1:-1));startX=null},{passive:true});show(0)};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init()})();</script>`;

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', '2nya-nailart', 'index.html');
  const html = await readFile(filePath, 'utf8');
  const heroPattern = /<section class="hero">[\s\S]*?<\/section>/;
  const headerPattern = /<header class="top">[\s\S]*?<\/header>/;
  const withHeader = headerPattern.test(html) ? html.replace(headerPattern, HEADER_MARKUP) : html;
  const withHero = heroPattern.test(withHeader) ? withHeader.replace(heroPattern, HERO_MARKUP) : withHeader;
  const brandSafe = withHero.replaceAll('2nya Nail Art', 'Donya Nail Art');
  const withStyles = brandSafe.replace('</head>', `${DESIGN}</head>`);
  const patched = withStyles.replace('</body>', `${PHONE_SCRIPT}</body>`);
  return new NextResponse(patched, {status: 200, headers: {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, max-age=0'}});
}
