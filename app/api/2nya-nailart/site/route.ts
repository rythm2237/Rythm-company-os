import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


const HEADER_MARKUP = `<header class="top donya-top">
  <div class="wrap nav donya-nav">
    <button class="nav-search" type="button" aria-label="جستجو" title="جستجو">⌕</button>
    <button class="book nav-book" data-book><span>رزرو وقت</span><span class="nav-calendar" aria-hidden="true">▦</span></button>
    <nav class="desktop-nav" aria-label="ناوبری اصلی">
      <a class="active" href="/">صفحه اصلی</a>
      <a href="#services">خدمات ما</a>
      <a href="#portfolio">نمونه‌کارها</a>
      <a href="#booking">رزرو وقت</a>
      <a href="/nail-care">مقالات و راهنمای زیبایی</a>
      <a href="#about">درباره ما</a>
      <a href="https://www.instagram.com/2nya._nailart/" target="_blank" rel="noopener">تماس با ما</a>
    </nav>
    <a class="donya-brand" href="/" aria-label="Donya Nail Art - صفحه اصلی">
      <div class="donya-brand-copy"><b>Donya Nail Art</b><span>هنر ناخن، جلوه‌ای از زیبایی تو</span></div>
      <img src="/2nya-media/donya-logo.webp" alt="لوگوی Donya Nail Art">
    </a>
  </div>
</header>`;

const HERO_MARKUP = `<section class="hero donya-hero" aria-labelledby="hero-title">
  <div class="wrap donya-hero-layout">
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
          <button class="is-active" data-phone-dot="0" aria-label="اسلاید ۱"></button><button data-phone-dot="1" aria-label="اسلاید ۲"></button><button data-phone-dot="2" aria-label="اسلاید ۳"></button><button data-phone-dot="3" aria-label="اسلاید ۴"></button><button data-phone-dot="4" aria-label="اسلاید ۵"></button>
        </div>
      </div>
      <span class="phone-caption">Beauty lives in details ♡</span>
    </div>

    <div class="hero-center-copy">
      <div class="hero-eyebrow"><span></span>هنر ناخن، جلوه‌ای از زیبایی تو</div>
      <h1 id="hero-title">ناخن‌هایی که فقط<br>زیبا نیستند،<br><em>داستان شما</em> را روایت می‌کنند.</h1>
      <p>در <strong>Donya Nail Art</strong> با ترکیبی بی‌نظیر از ظرافت، خلاقیت و جدیدترین تکنیک‌ها، استایلی منحصربه‌فرد برای شما خلق می‌کنیم.<br>زیبایی در جزئیات است…</p>
      <div class="hero-actions"><a class="btn ghost" href="#portfolio"><span>مشاهده نمونه‌کارها</span><span aria-hidden="true">▧</span></a><button class="btn primary" data-book><span>رزرو وقت</span><span aria-hidden="true">▦</span></button></div>
      <div class="hero-trust"><span>♡ <b>مشاوره تخصصی<br>و پشتیبانی</b></span><span>◇ <b>کیفیت و ظرافت<br>در هر جزئیات</b></span><span>♢ <b>استفاده از مواد<br>با کیفیت و ایمن</b></span><span>⌁ <b>محیط آرام<br>و دلنشین</b></span></div>
    </div>

    <aside class="hero-brand-mark" aria-label="Donya Nail Art">
      <img src="/2nya-media/donya-logo.webp" alt="لوگوی Donya Nail Art">
      <b>Donya Nail Art</b>
      <span>هنر ناخن، جلوه‌ای از زیبایی تو</span>
      <i>♡</i>
    </aside>
  </div>
</section>`;

const DESIGN = `<style id="donya-exact-hero-v3">
:root{--donya-wine:#7e1039;--donya-wine-dark:#551028;--donya-rose:#b84864;--donya-gold:#bf7a32;--donya-ink:#29161c;--donya-paper:#fff8f3;--donya-line:rgba(91,47,43,.16)}
html,body{background:#fff7f1!important;color:var(--donya-ink)!important}.wrap{width:min(1510px,calc(100% - 52px))!important;margin-inline:auto!important}
.donya-top{position:absolute!important;z-index:60!important;inset:0 0 auto!important;padding:48px 0 0!important;background:transparent!important}.donya-nav{min-height:74px!important;display:grid!important;grid-template-columns:58px 172px minmax(650px,1fr) 245px!important;gap:12px!important;align-items:center!important;padding:7px 12px!important;border:1px solid rgba(255,255,255,.84)!important;border-radius:35px!important;background:rgba(255,248,244,.91)!important;box-shadow:0 18px 55px rgba(94,55,42,.13)!important;backdrop-filter:blur(18px)!important;-webkit-backdrop-filter:blur(18px)!important;direction:ltr!important}.nav-search{width:48px;height:48px;border:1px solid rgba(89,45,37,.20);border-radius:50%;background:rgba(255,250,247,.85);font-size:1.75rem;line-height:1;color:#432c2b}.nav-book{height:54px!important;border:0!important;border-radius:999px!important;background:linear-gradient(135deg,var(--donya-wine),#6b0d31)!important;color:#fff!important;font-weight:850!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:16px!important;box-shadow:0 9px 24px rgba(126,16,57,.22)!important}.nav-calendar{font-size:1.25rem}.desktop-nav{display:flex!important;align-items:center!important;justify-content:center!important;gap:clamp(16px,1.85vw,32px)!important;direction:rtl!important;white-space:nowrap!important}.desktop-nav a{color:#372329!important;text-decoration:none!important;font-size:.91rem!important;font-weight:700!important;padding:21px 0 14px!important;border-bottom:2px solid transparent!important}.desktop-nav a:hover,.desktop-nav a.active{color:var(--donya-wine)!important;border-bottom-color:var(--donya-wine)!important}.donya-brand{justify-self:end;display:flex;align-items:center;gap:12px;color:#311d20;text-decoration:none;direction:ltr}.donya-brand img{width:68px!important;height:88px!important;object-fit:contain!important;border:0!important;border-radius:0!important;background:transparent!important}.donya-brand-copy{direction:ltr;text-align:left;line-height:1.15}.donya-brand-copy b{font-family:Georgia,'Times New Roman',serif;font-size:1.38rem;font-weight:700}.donya-brand-copy span{display:block;margin-top:6px;font-size:.68rem;color:#5f4642;direction:rtl}
.donya-hero{position:relative!important;min-height:760px!important;padding:138px 0 36px!important;display:flex!important;align-items:center!important;overflow:hidden!important;isolation:isolate!important;background-image:linear-gradient(90deg,rgba(255,248,243,.03) 0%,rgba(255,248,243,.13) 18%,rgba(255,248,243,.48) 39%,rgba(255,248,243,.20) 60%,rgba(255,248,243,.02) 100%),url('/2nya-media/donya-bg.webp')!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important}.donya-hero:before{content:"";position:absolute;inset:0;z-index:0;background:linear-gradient(180deg,rgba(255,249,245,.10),rgba(255,249,245,.03) 72%,rgba(255,249,245,.25));pointer-events:none}.donya-hero-layout{position:relative;z-index:2;display:grid;grid-template-columns:360px minmax(580px,720px) 250px;justify-content:space-between;align-items:center;gap:36px;direction:ltr}.hero-center-copy{direction:rtl;text-align:center;align-self:center;padding-top:18px}.hero-eyebrow{display:flex;justify-content:center;align-items:center;gap:18px;font-weight:800;color:#41272b;font-size:1rem}.hero-eyebrow span{width:84px;height:1px;background:#8e6362}.hero-center-copy h1{font-family:Estedad,Vazirmatn,sans-serif!important;font-size:clamp(2.65rem,4.35vw,4.25rem)!important;line-height:1.28!important;letter-spacing:-.045em!important;margin:18px auto 16px!important;color:#2a1016!important;font-weight:850!important;max-width:690px}.hero-center-copy h1 em{font-style:normal;color:#ad3f55}.hero-center-copy p{margin:0 auto;max-width:680px;color:#423638;font-size:1.03rem;line-height:1.95}.hero-center-copy strong{font-family:Georgia,'Times New Roman',serif}.hero-actions{justify-content:center!important;gap:18px!important;margin-top:22px!important}.hero-actions .btn{min-width:222px!important;min-height:56px!important;border-radius:999px!important;font-size:.95rem!important;gap:13px!important;display:inline-flex!important}.hero-actions .primary{background:linear-gradient(135deg,var(--donya-wine),#650d30)!important;color:#fff!important;box-shadow:0 12px 28px rgba(126,16,57,.18)!important}.hero-actions .ghost{background:rgba(255,248,243,.52)!important;border:1.5px solid #744541!important;color:#2f1d20!important;backdrop-filter:blur(7px)!important}.hero-trust{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:27px auto 0;max-width:700px;border-top:1px solid rgba(97,53,45,.14);padding-top:22px;color:#6c1d37}.hero-trust span{display:flex;align-items:center;justify-content:center;gap:10px;padding:0 14px;border-left:1px solid rgba(97,53,45,.15);font-size:1.35rem}.hero-trust span:last-child{border-left:0}.hero-trust b{font-size:.75rem;color:#39272a;line-height:1.55;font-weight:700}.hero-brand-mark{direction:ltr;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;align-self:center}.hero-brand-mark img{width:165px;height:235px;object-fit:contain;filter:sepia(.05) saturate(1.2)}.hero-brand-mark b{font-family:Georgia,'Times New Roman',serif;font-size:1.75rem;font-weight:500;color:#5a2721;margin-top:-22px}.hero-brand-mark span{font-size:.76rem;color:#6a443e;margin-top:4px;direction:rtl}.hero-brand-mark i{font-style:normal;color:var(--donya-gold);font-size:1.35rem;margin-top:8px}
.phone-gallery{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center}.phone-shell{position:relative;width:250px;aspect-ratio:9/18.6;padding:8px;border-radius:40px;background:linear-gradient(145deg,#3b2225,#0d0809 52%,#2e191d);border:1px solid rgba(189,122,70,.65);box-shadow:0 28px 70px rgba(73,43,38,.26),0 0 0 8px rgba(255,255,255,.48);outline:none}.phone-shell:before{content:"";position:absolute;z-index:6;top:13px;left:50%;transform:translateX(-50%);width:78px;height:18px;border-radius:999px;background:#0b0809}.phone-screen{position:absolute;inset:8px;border-radius:32px;overflow:hidden;background:#12090d}.phone-slide{position:absolute;inset:0;opacity:0;pointer-events:none;transition:opacity .3s}.phone-slide.is-active{opacity:1;pointer-events:auto}.phone-slide img,.phone-slide video{width:100%;height:100%;object-fit:cover;display:block}.phone-arrow{position:absolute;z-index:8;top:50%;transform:translateY(-50%);width:34px;height:34px;border:1px solid rgba(255,255,255,.34);border-radius:50%;background:rgba(30,13,18,.50);color:#fff;font-size:1.4rem;display:grid;place-items:center}.phone-arrow.prev{left:15px}.phone-arrow.next{right:15px}.phone-dots{position:absolute;z-index:8;left:50%;bottom:17px;transform:translateX(-50%);display:flex;gap:5px}.phone-dots button{width:6px;height:6px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.45)}.phone-dots button.is-active{width:18px;border-radius:999px;background:#fff}.phone-caption{margin-top:18px;font-family:'Brush Script MT','Segoe Script',cursive;color:#b86b70;font-size:1.45rem;transform:rotate(-5deg)}
body>main>section:not(.donya-hero){position:relative;z-index:3}.portfolio{background:#6a1534!important;padding-top:72px!important}.portfolio .head h2{font-size:clamp(2.1rem,4vw,3.65rem)!important}.grid{gap:14px!important}.shot{border-radius:24px!important}.service{position:relative!important;overflow:hidden!important;min-height:210px!important;padding:108px 18px 18px!important;border-radius:20px!important;background:#fff9f5!important;border:1px solid rgba(115,65,52,.13)!important;box-shadow:0 14px 40px rgba(88,51,42,.07)!important}.service:before{content:"";position:absolute;inset:0 0 auto;height:96px;background-size:cover;background-position:center}.service:nth-child(4n+1):before{background-image:url('/assets/portfolio-01.webp')}.service:nth-child(4n+2):before{background-image:url('/assets/portfolio-02.webp')}.service:nth-child(4n+3):before{background-image:url('/assets/portfolio-03.webp')}.service:nth-child(4n):before{background-image:url('/assets/portfolio-04.webp')}.services{grid-template-columns:repeat(4,1fr)!important;gap:14px!important}.service button{background:var(--donya-wine)!important}.about-card{background:linear-gradient(145deg,#7e1039,#511027)!important}.footer{background:#34101f!important}.sticky{background:var(--donya-wine)!important}.modal .sheet-actions .btn{background:var(--donya-wine)!important}.steps i.on,.date.sel{background:var(--donya-wine)!important}
@media(max-width:1280px){.donya-nav{grid-template-columns:52px 148px minmax(520px,1fr) 205px!important}.desktop-nav{gap:15px!important}.desktop-nav a{font-size:.79rem!important}.donya-brand-copy b{font-size:1.12rem}.donya-brand img{width:58px!important;height:76px!important}.donya-hero-layout{grid-template-columns:300px minmax(520px,650px) 205px;gap:20px}.phone-shell{width:220px}.hero-brand-mark img{width:135px;height:200px}.hero-brand-mark b{font-size:1.42rem}.hero-center-copy h1{font-size:clamp(2.45rem,4.25vw,3.65rem)!important}}
@media(max-width:1000px){.donya-nav{grid-template-columns:52px 140px 1fr 74px!important}.desktop-nav{display:none!important}.donya-brand-copy{display:none}.donya-brand{justify-self:end}.donya-brand img{width:60px!important;height:74px!important}.donya-hero{min-height:800px!important}.donya-hero-layout{grid-template-columns:250px 1fr;grid-template-areas:'phone copy';gap:34px}.hero-brand-mark{display:none}.phone-gallery{grid-area:phone}.hero-center-copy{grid-area:copy}.hero-trust{grid-template-columns:repeat(2,1fr);row-gap:14px}.services{grid-template-columns:repeat(2,1fr)!important}}
@media(max-width:800px){.wrap{width:min(100% - 26px,1510px)!important}.donya-top{padding-top:10px!important}.donya-nav{min-height:62px!important;grid-template-columns:46px 116px 1fr 58px!important;border-radius:23px!important;padding:4px 7px!important;background:rgba(255,248,244,.90)!important}.nav-search{width:42px;height:42px}.nav-book{height:44px!important;font-size:.8rem!important;gap:7px!important}.donya-brand img{width:50px!important;height:60px!important}.donya-hero{min-height:auto!important;padding:92px 0 48px!important;background-position:center!important}.donya-hero-layout{display:flex;flex-direction:column;gap:26px}.hero-center-copy{order:1;padding-top:12px}.phone-gallery{order:2}.hero-center-copy h1{font-size:clamp(2.08rem,9.8vw,2.72rem)!important;line-height:1.35!important;margin-top:14px!important}.hero-center-copy p{font-size:.92rem}.hero-eyebrow{font-size:.78rem}.hero-eyebrow span{width:48px}.hero-actions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:9px!important}.hero-actions .btn{min-width:0!important;width:100%!important;min-height:50px!important;padding:10px!important;font-size:.84rem!important}.hero-trust{grid-template-columns:repeat(2,1fr);margin-top:20px;padding-top:16px}.hero-trust span{font-size:1.05rem;padding:5px 8px}.hero-trust b{font-size:.68rem}.phone-shell{width:min(66vw,270px)}.phone-caption{font-size:1.25rem}.services{grid-template-columns:1fr!important}}
@media(max-width:430px){.donya-nav{grid-template-columns:42px 105px 1fr 48px!important}.nav-search{width:38px;height:38px}.nav-book{height:40px!important}.donya-brand img{width:44px!important;height:54px!important}.hero-actions{grid-template-columns:1fr!important}.hero-trust{grid-template-columns:1fr 1fr}.phone-shell{width:min(72vw,255px)}}
@media(prefers-reduced-motion:reduce){.phone-slide{transition:none}.phone-slide video{display:none}.phone-slide[data-phone-slide="0"]{background:#160b10 url('/assets/hero-poster.webp') center/cover no-repeat}}
</style>`;

const PHONE_SCRIPT = `<script id="donya-phone-slider-v3">(()=>{const init=()=>{const shell=document.getElementById('donyaPhone');if(!shell)return;const slides=[...document.querySelectorAll('[data-phone-slide]')],dots=[...document.querySelectorAll('[data-phone-dot]')],video=document.getElementById('heroVideo');let index=0,startX=null;const show=n=>{index=(n+slides.length)%slides.length;slides.forEach((s,i)=>s.classList.toggle('is-active',i===index));dots.forEach((d,i)=>d.classList.toggle('is-active',i===index));if(video instanceof HTMLVideoElement){if(index===0){video.muted=true;video.play().catch(()=>{})}else video.pause()}};document.querySelector('.phone-arrow.prev')?.addEventListener('click',()=>show(index-1));document.querySelector('.phone-arrow.next')?.addEventListener('click',()=>show(index+1));dots.forEach(d=>d.addEventListener('click',()=>show(Number(d.dataset.phoneDot)||0)));shell.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')show(index-1);if(e.key==='ArrowRight')show(index+1)});shell.addEventListener('touchstart',e=>{startX=e.touches[0]?.clientX??null},{passive:true});shell.addEventListener('touchend',e=>{if(startX==null)return;const x=e.changedTouches[0]?.clientX??startX;if(Math.abs(x-startX)>42)show(index+(x<startX?1:-1));startX=null},{passive:true});show(0)};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init()})();</script>`;

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
