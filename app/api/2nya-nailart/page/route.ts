import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGES = {
  services: 'services.html',
  training: 'training.html',
  'nail-care': 'nail-care.html',
  about: 'about.html',
  contact: 'contact.html',
} as const;

type PageName = keyof typeof PAGES;

const NAV_ROOT = '<div id="donya-navigation-root" aria-label="ناوبری اصلی"></div>';
const NAV_CSS = '/2nya-nailart/navigation.css?v=20260928-2';
const INNER_LAYOUT_CSS = '/2nya-nailart/inner-page-layout.css?v=20260928-1';
const FIT_CSS = '/2nya-nailart/viewport-fit.css?v=20260925-1';
const NAV_JS = '/2nya-nailart/navigation.js?v=20260928-1';
const MOTION_JS = '/2nya-nailart/brand-motion.js?v=20260928-2';

function tagBody(html: string, pageName: PageName) {
  const classes = `donya-inner-page donya-page-${pageName}`;
  return html.replace(/<body([^>]*)>/i, (match, attrs: string) => {
    const classMatch = attrs.match(/\sclass=(['"])(.*?)\1/i);
    if (!classMatch) return `<body${attrs} class="${classes}">`;

    const quote = classMatch[1];
    const value = classMatch[2];
    const tokens = new Set(`${value} ${classes}`.trim().split(/\s+/));
    const replacement = ` class=${quote}${Array.from(tokens).join(' ')}${quote}`;
    return match.replace(classMatch[0], replacement);
  });
}

function replaceLegacyHeader(html: string) {
  return html.replace(
    /<header\b[^>]*class=(['"])[^'"]*\b(?:site-head|donya-top)\b[^'"]*\1[^>]*>[\s\S]*?<\/header>/i,
    NAV_ROOT,
  );
}

function ensureNavigationRoot(html: string) {
  if (html.includes('id="donya-navigation-root"')) return html;
  return html.replace(/<body([^>]*)>/i, (match) => `${match}${NAV_ROOT}`);
}

function ensureHeadAsset(html: string, needle: string, markup: string) {
  if (html.includes(needle)) return html;
  return html.replace('</head>', `${markup}</head>`);
}

function ensurePageAssets(html: string) {
  let page = html;
  page = ensureHeadAsset(page, 'navigation.css', `<link rel="stylesheet" href="${NAV_CSS}">`);
  page = ensureHeadAsset(page, 'inner-page-layout.css', `<link rel="stylesheet" href="${INNER_LAYOUT_CSS}">`);
  page = ensureHeadAsset(page, 'viewport-fit.css', `<link rel="stylesheet" href="${FIT_CSS}">`);
  page = ensureHeadAsset(page, 'navigation.js', `<script defer src="${NAV_JS}"></script>`);
  page = ensureHeadAsset(page, 'brand-motion.js', `<script defer src="${MOTION_JS}"></script>`);
  return page;
}

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get('name') as PageName | null;
  if (!name || !(name in PAGES)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'public', '2nya-nailart', PAGES[name]);
  const html = await readFile(filePath, 'utf8');
  const normalized = ensureNavigationRoot(replaceLegacyHeader(html));
  const tagged = tagBody(normalized, name);
  const page = ensurePageAssets(tagged);

  return new NextResponse(page, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
