import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOAD_MARKER = "if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});load().catch(()=>showLogin());";
const CALENDAR_CSS = '<link rel="stylesheet" href="/2nya-nailart/admin-calendar.css?v=20260926-1">';

export async function GET() {
  try {
    const publicDir = path.join(process.cwd(), 'public', '2nya-nailart');
    const [html, calendarJs] = await Promise.all([
      readFile(path.join(publicDir, 'admin.html'), 'utf8'),
      readFile(path.join(publicDir, 'admin-calendar.js'), 'utf8'),
    ]);

    if (!html.includes(LOAD_MARKER)) {
      console.error('2nya_admin_calendar_injection_marker_missing');
      return new NextResponse('Admin page is temporarily unavailable.', { status: 503 });
    }

    const withStyles = html.replace('</head>', `${CALENDAR_CSS}</head>`);
    const page = withStyles.replace(LOAD_MARKER, `${calendarJs}\n${LOAD_MARKER}`);

    return new NextResponse(page, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (error) {
    console.error('2nya_admin_page_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return new NextResponse('Admin page is temporarily unavailable.', { status: 503 });
  }
}
