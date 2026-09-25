import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGES = {
  services: 'services.html',
  training: 'training.html',
  'nail-care': 'nail-care.html',
  contact: 'contact.html',
} as const;

type PageName = keyof typeof PAGES;

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

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get('name') as PageName | null;
  if (!name || !(name in PAGES)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'public', '2nya-nailart', PAGES[name]);
  const html = await readFile(filePath, 'utf8');
  const tagged = tagBody(html, name);
  const page = tagged.replace(
    '</head>',
    '<link rel="stylesheet" href="/2nya-nailart/viewport-fit.css?v=20260925-1"></head>',
  );

  return new NextResponse(page, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
