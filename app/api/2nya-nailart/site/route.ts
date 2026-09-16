import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOTFIX = `<style id="2nya-production-hotfix">
.hero h1{font-size:clamp(3rem,5.4vw,4.25rem)!important;line-height:1.08!important;letter-spacing:-.035em!important;max-width:760px!important}
.head h2,.about h2{font-size:clamp(2rem,4.1vw,3.35rem)!important;line-height:1.15!important}
.hero-copy{max-width:760px!important}
.hero-main{object-fit:contain!important;object-position:center center!important;image-rendering:auto!important}
.hero-bg{object-fit:cover!important;filter:blur(24px) brightness(.48) saturate(.9)!important;transform:scale(1.06)!important}
@media(max-width:800px){.hero{min-height:88svh!important}.hero h1{font-size:clamp(2.2rem,9.5vw,3rem)!important;line-height:1.18!important;max-width:11em!important}.head h2,.about h2{font-size:clamp(1.8rem,8vw,2.65rem)!important}.hero-copy{padding:112px 0 78px!important}.hero p{font-size:.96rem!important;line-height:1.9!important}.brand img{width:40px!important;height:40px!important}.hero-main{object-fit:contain!important;transform:none!important}}
@media(max-width:430px){.hero h1{font-size:2.35rem!important}.hero{min-height:86svh!important}.shot:first-child{min-height:340px!important}.shot{min-height:185px!important}}
</style>`;

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', '2nya-nailart', 'index.html');
  const html = await readFile(filePath, 'utf8');
  const withVideo = html.replaceAll('/assets/hero.mp4', '/2nya-media/hero-hq-v2.mp4?v=2');
  const patched = withVideo.includes('2nya-production-hotfix') ? withVideo : withVideo.replace('</head>', `${HOTFIX}</head>`);
  return new NextResponse(patched, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
