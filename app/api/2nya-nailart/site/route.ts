import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HERO_MARKUP = `<section class="hero" aria-labelledby="hero-title">
  <div class="hero-device-shell" aria-hidden="true">
    <div class="hero-device-frame">
      <div class="hero-device-screen">
        <video id="heroVideo" class="hero-main" autoplay muted loop playsinline preload="metadata" poster="/assets/hero-poster.webp" aria-label="ویدیوی نمونه کار 2nya Nail Art">
          <source src="/2nya-media/hero-main-v5.mp4" type="video/mp4">
        </video>
      </div>
      <span class="hero-device-notch" aria-hidden="true"></span>
      <span class="hero-device-dot" aria-hidden="true"></span>
    </div>
    <div class="hero-device-caption"><span></span>طراحی واقعی ناخن</div>
  </div>
  <div class="hero-vignette" aria-hidden="true"></div>
  <div class="wrap hero-copy">
    <span class="pill"><i></i> رزرو آنلاین وقت خدمات ناخن</span>
    <h1 id="hero-title">ناخن‌هایی که فقط زیبا نیستند؛ امضای استایل شما هستند.</h1>
    <p>نمونه‌کارهای واقعی 2nya Nail Art را ببینید، سرویس موردنظر را انتخاب کنید و فقط از بین زمان‌های واقعاً آزاد، وقت خودتان را رزرو کنید.</p>
    <div class="actions hero-actions"><button class="btn primary" data-book>رزرو وقت</button><a class="btn ghost" href="#portfolio">مشاهده نمونه‌کارها</a></div>
  </div>
</section>`;

const HERO_DESIGN = `<style id="2nya-hero-v5">
.hero{min-height:min(820px,92svh)!important;position:relative!important;overflow:hidden!important;isolation:isolate!important;display:block!important;background:radial-gradient(circle at 18% 48%,rgba(177,116,74,.16),transparent 30%),radial-gradient(circle at 76% 18%,rgba(116,21,48,.24),transparent 34%),linear-gradient(128deg,#10090b 0%,#1d0d12 48%,#090607 100%)!important}
.hero::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:linear-gradient(90deg,rgba(8,5,6,.12),rgba(8,5,6,.02) 40%,rgba(8,5,6,.2)),radial-gradient(circle at 18% 50%,rgba(234,191,139,.08),transparent 25%)}
.hero::after{content:"";position:absolute;width:520px;height:520px;left:-170px;bottom:-250px;border-radius:50%;border:1px solid rgba(218,173,115,.11);box-shadow:0 0 0 56px rgba(218,173,115,.025),0 0 0 112px rgba(218,173,115,.018);z-index:0;pointer-events:none}
.hero-vignette{position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(7,4,5,.06),rgba(7,4,5,.04) 38%,rgba(7,4,5,.30));pointer-events:none}
.hero-copy{position:relative!important;z-index:4!important;width:min(1180px,calc(100% - 56px))!important;max-width:none!important;margin:0 auto!important;padding:136px 0 104px!important;text-align:right!important;color:#fff!important}
.hero-copy>.pill,.hero-copy>h1,.hero-copy>p,.hero-copy>.hero-actions{max-width:640px!important}
.hero h1{font-size:clamp(3rem,4.25vw,3.85rem)!important;line-height:1.12!important;letter-spacing:-.035em!important;margin:18px 0 16px!important;text-wrap:balance!important}
.hero p{font-size:clamp(1rem,1.35vw,1.13rem)!important;line-height:2!important;max-width:590px!important;color:rgba(255,247,238,.78)!important}
.hero-actions{gap:12px!important;margin-top:26px!important}
.hero-device-shell{position:absolute;z-index:3;left:clamp(38px,7.5vw,132px);top:50%;transform:translateY(-47%);width:clamp(280px,27vw,350px);filter:drop-shadow(0 34px 45px rgba(0,0,0,.44))}
.hero-device-shell::before{content:"";position:absolute;inset:11% -19% 6%;border-radius:50%;z-index:-1;background:radial-gradient(circle,rgba(219,163,101,.20) 0%,rgba(108,27,49,.10) 45%,transparent 72%);filter:blur(22px)}
.hero-device-frame{position:relative;width:100%;aspect-ratio:510/908;padding:9px;border-radius:46px;background:linear-gradient(145deg,#2a2021 0%,#080607 42%,#23181a 100%);border:1px solid rgba(240,205,165,.34);box-shadow:inset 0 0 0 1px rgba(255,255,255,.04),0 28px 70px rgba(0,0,0,.42),0 0 0 1px rgba(123,70,51,.15)}
.hero-device-screen{position:absolute;inset:9px;overflow:hidden;border-radius:37px;background:#080607}
.hero-main{display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;object-fit:cover!important;object-position:center center!important;opacity:1!important;filter:none!important;transform:none!important;border-radius:0!important;background:#080607!important}
.hero-device-notch{position:absolute;z-index:5;top:17px;left:50%;transform:translateX(-50%);width:30%;height:20px;border-radius:999px;background:#090607;box-shadow:0 1px 0 rgba(255,255,255,.05)}
.hero-device-dot{position:absolute;z-index:6;top:23px;left:59%;width:6px;height:6px;border-radius:50%;background:#161113;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.hero-device-caption{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:15px;color:rgba(255,240,221,.62);font-size:.78rem;font-weight:650}.hero-device-caption span{width:6px;height:6px;border-radius:50%;background:#d9a66d;box-shadow:0 0 12px rgba(217,166,109,.8)}
.hero.is-video-error .hero-main{opacity:0!important}.hero.is-video-stalled .hero-main{opacity:.92!important}
@media(max-width:1040px) and (min-width:801px){.hero-device-shell{left:34px;width:270px}.hero-copy{width:calc(100% - 48px)!important}.hero-copy>.pill,.hero-copy>h1,.hero-copy>p,.hero-copy>.hero-actions{max-width:55%!important}.hero h1{font-size:clamp(2.55rem,4.7vw,3.25rem)!important}}
@media(max-width:800px){.hero{min-height:84svh!important;height:84svh!important;max-height:900px!important;background:#10090b!important;display:flex!important;align-items:flex-end!important}.hero::before,.hero::after{display:none!important}.hero-device-shell,.hero-device-frame,.hero-device-screen{display:contents!important}.hero-device-notch,.hero-device-dot,.hero-device-caption{display:none!important}.hero-main{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;object-position:50% 48%!important;opacity:.94!important;filter:saturate(.94) contrast(1.02)!important;z-index:0!important}.hero-vignette{z-index:1!important;background:linear-gradient(180deg,rgba(9,5,6,.34) 0%,rgba(9,5,6,.08) 27%,rgba(9,5,6,.32) 56%,rgba(9,5,6,.90) 100%)!important}.hero-copy{z-index:3!important;width:calc(100% - 36px)!important;margin:0 auto!important;padding:110px 0 max(88px,calc(70px + env(safe-area-inset-bottom)))!important;text-shadow:0 2px 18px rgba(0,0,0,.35)!important}.hero-copy>.pill,.hero-copy>h1,.hero-copy>p,.hero-copy>.hero-actions{max-width:100%!important}.hero h1{font-size:clamp(2.12rem,9.7vw,2.68rem)!important;line-height:1.17!important;letter-spacing:-.025em!important;max-width:10.8em!important;margin-top:14px!important}.hero p{font-size:.96rem!important;line-height:1.9!important;max-width:34em!important;color:rgba(255,250,244,.88)!important}.hero-actions{margin-top:21px!important;gap:10px!important}.hero-actions .btn{min-height:48px!important;padding:12px 18px!important}.brand img{width:40px!important;height:40px!important}}
@media(max-width:430px){.hero{min-height:84svh!important;height:84svh!important}.hero h1{font-size:clamp(2.12rem,10vw,2.42rem)!important}.hero-copy{width:calc(100% - 30px)!important;padding-bottom:max(92px,calc(72px + env(safe-area-inset-bottom)))!important}}
@media(prefers-reduced-motion:reduce){.hero-device-shell{filter:none!important}.hero-main{display:none!important}.hero-device-screen{background:#120b0d url('/assets/hero-poster.webp') center/cover no-repeat!important}}
</style>`;

const HERO_SCRIPT = `<script id="2nya-hero-playback-v5">
(()=>{
  const init=()=>{
    const hero=document.querySelector('.hero');
    const video=document.getElementById('heroVideo');
    if(!hero||!(video instanceof HTMLVideoElement)) return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    video.muted=true;video.defaultMuted=true;video.playsInline=true;video.loop=true;
    let interactionRetryUsed=false;
    const set=(name,on=true)=>hero.classList.toggle(name,on);
    const tryPlay=()=>{if(reduced)return;const p=video.play();if(p&&typeof p.catch==='function')p.catch(()=>set('is-video-paused',true));};
    video.addEventListener('loadedmetadata',()=>set('is-video-metadata'));
    video.addEventListener('canplay',()=>{set('is-video-stalled',false);tryPlay()});
    video.addEventListener('playing',()=>{set('is-video-paused',false);set('is-video-stalled',false);set('is-video-error',false)});
    video.addEventListener('stalled',()=>set('is-video-stalled'));
    video.addEventListener('error',()=>set('is-video-error'));
    const retry=()=>{if(interactionRetryUsed||reduced)return;interactionRetryUsed=true;tryPlay();document.removeEventListener('pointerdown',retry);document.removeEventListener('touchstart',retry)};
    document.addEventListener('pointerdown',retry,{passive:true,once:true});
    document.addEventListener('touchstart',retry,{passive:true,once:true});
    tryPlay();
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
  const withHero = heroPattern.test(html) ? html.replace(heroPattern, HERO_MARKUP) : html;
  const withPortfolio = withHero.replace(ALL_PORTFOLIO_SLOTS, UNIQUE_PORTFOLIO_SLOTS);
  const withStyles = withPortfolio.replace('</head>', `${HERO_DESIGN}</head>`);
  const patched = withStyles.replace('</body>', `${HERO_SCRIPT}</body>`);
  return new NextResponse(patched, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}