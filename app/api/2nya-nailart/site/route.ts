import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HERO_DESIGN = `<style id="2nya-device-hero-v1">
/* 2nya responsive hero — desktop device showcase / mobile cinematic video */
.hero{
  min-height:min(860px,92svh)!important;
  position:relative!important;
  overflow:hidden!important;
  isolation:isolate!important;
  background:
    radial-gradient(circle at 18% 48%,rgba(177,116,74,.16),transparent 30%),
    radial-gradient(circle at 76% 18%,rgba(116,21,48,.24),transparent 34%),
    linear-gradient(128deg,#10090b 0%,#1d0d12 48%,#090607 100%)!important;
}
.hero::before{
  content:"";position:absolute;inset:0;z-index:0;pointer-events:none;
  background:linear-gradient(90deg,rgba(8,5,6,.12),rgba(8,5,6,.02) 40%,rgba(8,5,6,.2)),radial-gradient(circle at 18% 50%,rgba(234,191,139,.08),transparent 25%);
}
.hero::after{
  content:"";position:absolute;width:520px;height:520px;left:-170px;bottom:-250px;border-radius:50%;
  border:1px solid rgba(218,173,115,.11);box-shadow:0 0 0 56px rgba(218,173,115,.025),0 0 0 112px rgba(218,173,115,.018);z-index:0;pointer-events:none;
}
.hero-bg{display:none!important}
.hero-vignette{position:absolute!important;inset:0!important;z-index:1!important;background:linear-gradient(90deg,rgba(7,4,5,.06) 0%,rgba(7,4,5,.04) 38%,rgba(7,4,5,.30) 100%)!important;pointer-events:none!important}
.hero-copy{position:relative!important;z-index:4!important;width:min(1180px,calc(100% - 56px))!important;max-width:none!important;margin:0 auto!important;padding:142px 0 110px!important;text-align:right!important}
.hero-copy>.tag,.hero-copy>h1,.hero-copy>p,.hero-copy>.hero-actions{max-width:640px!important}
.hero h1{font-size:clamp(2.55rem,4.25vw,3.85rem)!important;line-height:1.12!important;letter-spacing:-.035em!important;margin-top:18px!important;text-wrap:balance!important}
.hero p{font-size:clamp(1rem,1.35vw,1.13rem)!important;line-height:2!important;max-width:590px!important;color:rgba(255,247,238,.78)!important}
.hero-actions{gap:12px!important;margin-top:26px!important}
.head h2,.about h2{font-size:clamp(2rem,3.7vw,3.15rem)!important;line-height:1.18!important}

.hero-device-shell{
  position:absolute;z-index:3;left:clamp(38px,7.5vw,132px);top:50%;transform:translateY(-47%);
  width:clamp(250px,27vw,350px);filter:drop-shadow(0 34px 45px rgba(0,0,0,.44));
}
.hero-device-shell::before{
  content:"";position:absolute;inset:11% -19% 6%;border-radius:50%;z-index:-1;
  background:radial-gradient(circle,rgba(219,163,101,.20) 0%,rgba(108,27,49,.10) 45%,transparent 72%);filter:blur(22px);
}
.hero-device-shell::after{
  content:"نمونه واقعی کار";position:absolute;right:calc(100% + 18px);top:17%;white-space:nowrap;
  font-size:.78rem;font-weight:700;letter-spacing:.02em;color:rgba(252,232,207,.75);
  padding:9px 13px;border:1px solid rgba(226,183,130,.20);border-radius:999px;background:rgba(22,12,15,.62);backdrop-filter:blur(10px);
}
.hero-device-frame{
  position:relative;width:100%;aspect-ratio:510/908;padding:9px;border-radius:46px;
  background:linear-gradient(145deg,#2a2021 0%,#080607 42%,#23181a 100%);
  border:1px solid rgba(240,205,165,.34);box-shadow:inset 0 0 0 1px rgba(255,255,255,.04),0 28px 70px rgba(0,0,0,.42),0 0 0 1px rgba(123,70,51,.15);
}
.hero-device-screen{position:absolute;inset:9px;overflow:hidden;border-radius:37px;background:#080607}
.hero-device-frame .hero-main{
  position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;
  object-fit:cover!important;object-position:center center!important;opacity:1!important;filter:none!important;transform:none!important;border-radius:0!important;
}
.hero-device-notch{
  position:absolute;z-index:5;top:17px;left:50%;transform:translateX(-50%);width:30%;height:20px;border-radius:999px;background:#090607;
  box-shadow:0 1px 0 rgba(255,255,255,.05);
}
.hero-device-dot{position:absolute;z-index:6;top:23px;left:59%;width:6px;height:6px;border-radius:50%;background:#161113;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.hero-device-caption{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:15px;color:rgba(255,240,221,.62);font-size:.78rem;font-weight:650}
.hero-device-caption::before{content:"";width:6px;height:6px;border-radius:50%;background:#d9a66d;box-shadow:0 0 12px rgba(217,166,109,.8)}

@media(max-width:1040px) and (min-width:801px){
  .hero-device-shell{left:34px;width:270px}.hero-copy{width:calc(100% - 48px)!important}.hero-copy>.tag,.hero-copy>h1,.hero-copy>p,.hero-copy>.hero-actions{max-width:55%!important}.hero h1{font-size:clamp(2.35rem,4.7vw,3.25rem)!important}.hero-device-shell::after{display:none}
}

@media(max-width:800px){
  .hero{min-height:86svh!important;max-height:940px!important;background:#10090b!important;display:flex!important;align-items:flex-end!important}
  .hero::before,.hero::after{display:none!important}
  .hero-device-shell,.hero-device-frame,.hero-device-screen{display:contents!important}
  .hero-device-notch,.hero-device-dot,.hero-device-caption{display:none!important}
  .hero-main{
    display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;
    object-fit:cover!important;object-position:center center!important;opacity:.94!important;filter:saturate(.92) contrast(1.02)!important;transform:none!important;z-index:0!important;
  }
  .hero-bg{display:none!important}
  .hero-vignette{display:block!important;z-index:1!important;background:
    linear-gradient(180deg,rgba(9,5,6,.28) 0%,rgba(9,5,6,.08) 28%,rgba(9,5,6,.34) 58%,rgba(9,5,6,.88) 100%)!important;
  }
  .hero-copy{z-index:3!important;width:calc(100% - 36px)!important;margin:0 auto!important;padding:118px 0 max(74px,calc(56px + env(safe-area-inset-bottom)))!important;text-shadow:0 2px 18px rgba(0,0,0,.35)!important}
  .hero-copy>.tag,.hero-copy>h1,.hero-copy>p,.hero-copy>.hero-actions{max-width:100%!important}
  .hero h1{font-size:clamp(2.05rem,9.7vw,2.8rem)!important;line-height:1.17!important;letter-spacing:-.025em!important;max-width:10.8em!important;margin-top:14px!important}
  .hero p{font-size:.96rem!important;line-height:1.9!important;max-width:34em!important;color:rgba(255,250,244,.86)!important}
  .hero-actions{margin-top:21px!important;gap:10px!important}
  .hero-actions .btn{min-height:48px!important;padding:12px 18px!important}
  .head h2,.about h2{font-size:clamp(1.8rem,7.8vw,2.55rem)!important}
  .brand img{width:40px!important;height:40px!important}
}
@media(max-width:430px){
  .hero{min-height:84svh!important}.hero h1{font-size:2.22rem!important}.hero-copy{width:calc(100% - 30px)!important;padding-bottom:max(72px,calc(54px + env(safe-area-inset-bottom)))!important}
  .shot:first-child{min-height:340px!important}.shot{min-height:185px!important}
}
@media(prefers-reduced-motion:reduce){.hero-main{animation:none!important}.hero-device-shell{filter:none!important}}
</style>`;

const HERO_SCRIPT = `<script id="2nya-device-hero-script">
(()=>{
  const init=()=>{
    const hero=document.querySelector('.hero');
    const video=hero?.querySelector('.hero-main');
    if(!hero||!video||hero.querySelector('.hero-device-shell')) return;
    const shell=document.createElement('div'); shell.className='hero-device-shell'; shell.setAttribute('aria-label','ویدیوی نمونه کار 2nya Nail Art');
    const frame=document.createElement('div'); frame.className='hero-device-frame';
    const screen=document.createElement('div'); screen.className='hero-device-screen';
    const notch=document.createElement('span'); notch.className='hero-device-notch'; notch.setAttribute('aria-hidden','true');
    const dot=document.createElement('span'); dot.className='hero-device-dot'; dot.setAttribute('aria-hidden','true');
    const caption=document.createElement('div'); caption.className='hero-device-caption'; caption.textContent='طراحی واقعی ناخن';
    video.parentNode?.insertBefore(shell,video);
    shell.appendChild(frame); frame.appendChild(screen); screen.appendChild(video); frame.appendChild(notch); frame.appendChild(dot); shell.appendChild(caption);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
</script>`;

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', '2nya-nailart', 'index.html');
  const html = await readFile(filePath, 'utf8');
  const withVideo = html.replaceAll('/assets/hero.mp4', '/2nya-media/hero-hq-v3.mp4?v=device-hero-1');
  const withStyles = withVideo.includes('2nya-device-hero-v1') ? withVideo : withVideo.replace('</head>', `${HERO_DESIGN}</head>`);
  const patched = withStyles.includes('2nya-device-hero-script') ? withStyles : withStyles.replace('</body>', `${HERO_SCRIPT}</body>`);
  return new NextResponse(patched, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
