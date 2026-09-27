import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

export async function GET() {
  const dir = path.join(process.cwd(), 'public', '2nya-nailart', 'logo-parts');
  const parts = await Promise.all(
    Array.from({ length: 6 }, (_, i) => readFile(path.join(dir, `p${i}.txt`), 'utf8')),
  );
  const image = Buffer.from(parts.join(''), 'base64');
  return new NextResponse(image, {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(image.byteLength),
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
