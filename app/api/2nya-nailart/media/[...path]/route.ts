import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import heroPoster from '@/lib/2nya-nailart/media/hero-poster';
import heroVideo from '@/lib/2nya-nailart/media/video';
import p1 from '@/lib/2nya-nailart/media/p1';
import p2 from '@/lib/2nya-nailart/media/p2';
import p3 from '@/lib/2nya-nailart/media/p3';
import p4 from '@/lib/2nya-nailart/media/p4';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const images: Record<string, string> = {
  'hero-poster.webp': heroPoster,
  'portfolio-01.webp': p1,
  'portfolio-02.webp': p2,
  'portfolio-03.webp': p3,
  'portfolio-04.webp': p4,
  // Keep every existing portfolio slot populated while the remaining original
  // source files are migrated to permanent object storage.
  'portfolio-05.webp': p1,
  'portfolio-06.webp': p2,
  'portfolio-07.webp': p3,
  'portfolio-08.webp': p4,
  'img-red-foil.webp': p1,
  'img-flower-yellow.webp': p2,
  'img-black-rose.webp': p3,
  'img-pink-glitter.webp': p4,
  'img-nude-flower.webp': p1,
  'img-cat-black.webp': p2,
  'img-brown-abstract.webp': p3,
  'img-red-white-art.webp': p4,
};

function assetName(request: NextRequest) {
  const marker = '/api/2nya-nailart/media/';
  const pathname = new URL(request.url).pathname;
  const index = pathname.indexOf(marker);
  return decodeURIComponent(index >= 0 ? pathname.slice(index + marker.length) : pathname.split('/').pop() || '');
}

function cached(body: BodyInit, contentType: string, status = 200, extra: Record<string, string> = {}) {
  return new NextResponse(body, {
    status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...extra,
    },
  });
}

export async function GET(request: NextRequest) {
  const name = assetName(request);

  if (name === 'logo.webp') {
    const file = await readFile(path.join(process.cwd(), 'public', '2nya-nailart', 'assets', 'logo.webp'));
    return cached(file, 'image/webp');
  }

  const image = images[name];
  if (image) return cached(Buffer.from(image, 'base64'), 'image/webp');

  if (name === 'hero.mp4') {
    const buffer = Buffer.from(heroVideo, 'base64');
    const range = request.headers.get('range');
    if (!range) {
      return cached(buffer, 'video/mp4', 200, {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(buffer.length),
      });
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return new NextResponse(null, { status: 416 });
    const start = match[1] ? Number(match[1]) : 0;
    const requestedEnd = match[2] ? Number(match[2]) : buffer.length - 1;
    const end = Math.min(requestedEnd, buffer.length - 1);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= buffer.length) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${buffer.length}` },
      });
    }
    const chunk = buffer.subarray(start, end + 1);
    return cached(chunk, 'video/mp4', 206, {
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
      'Content-Length': String(chunk.length),
    });
  }

  return NextResponse.json({ ok: false, error: 'Asset not found' }, { status: 404 });
}
