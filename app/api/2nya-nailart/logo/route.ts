import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

export async function GET() {
  const dir = path.join(process.cwd(), 'public', '2nya-nailart', 'logo-parts');
  const parts = await Promise.all(
    Array.from({ length: 6 }, (_, i) => readFile(path.join(dir, `p${i}.txt`), 'utf8')),
  );
  const source = Buffer.from(parts.join(''), 'base64');
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const neutralDark = max < 72 && max - min < 24;

    if (neutralDark) {
      const alpha = Math.max(0, Math.min(255, Math.round(((max - 8) / 64) * 255)));
      pixels[i + 3] = Math.min(pixels[i + 3], alpha);
    }
  }

  const image = await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .webp({ quality: 92, alphaQuality: 100, effort: 5 })
    .toBuffer();

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
