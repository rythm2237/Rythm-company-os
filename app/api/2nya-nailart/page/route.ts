import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGES = {
  services: 'services.html',
  training: 'training.html',
  'nail-care': 'nail-care-v2.html',
  about: 'about.html',
  contact: 'contact.html',
} as const;

type PageName = keyof typeof PAGES;

const NAV_ROOT = '<div id="donya-navigation-root" aria-label="ناوبری اصلی"></div>';

function tagBody(html: string, pageName: PageName) {
  const classes = `donya-inner-page donya-page-${pageName}`;
  return html.replace(/<body([^>]*)>/i, (match, attrs: string) => {
    const classMatch = attrs.match(/\sclass=(['"])(.*?)\1/i);
    if (!classMatch) return `<body${attrs} class="${classes}">`;

    const quote = classMatch[1];
    const value = classMatch[2];
    const replacement = ` class=${quote}${value} ${classes}${quote}`;
    return match.replace(classMatch[0], replacement);
  });
}

function installNavigationRoot(html: string) {
  if (html.includes('id="donya-navigation-root"')) return html;
  if (/<header\b[^>]*>[\s\S]*?<\/header>/i.test(html)) {
    return html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/i, NAV_ROOT);
  }
  return html.replace(/<body([^>]*)>/i, `<body$1>${NAV_ROOT}`);
}

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get('name') as PageName | null;
  if (!name || !(name in PAGES)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'public', '2nya-nailart', PAGES[name]);
  const html = await readFile(filePath, 'utf8');
  const tagged = tagBody(installNavigationRoot(html), name);
  const page = tagged.replace(
    '</head>',
    '<link rel="stylesheet" href="/2nya-nailart/navigation.css?v=20260925-4"><link rel="stylesheet" href="/2nya-nailart/viewport-fit.css?v=20260925-1"><script defer src="/2nya-nailart/navigation.js?v=20260925-4"></script></head>',
  );

  return new NextResponse(page, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
