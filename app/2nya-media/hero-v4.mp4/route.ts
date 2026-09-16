import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cachedVideo: Buffer | null = null;

async function getVideo() {
  if (cachedVideo) return cachedVideo;
  const encoded = await readFile(
    path.join(process.cwd(), 'public', '2nya-media', 'hero-v4.b64'),
    'utf8',
  );
  cachedVideo = Buffer.from(encoded.trim(), 'base64');
  return cachedVideo;
}

export async function GET(request: NextRequest) {
  const video = await getVideo();
  const total = video.length;
  const range = request.headers.get('range');
  const commonHeaders = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
  };

  if (!range) {
    return new Response(video, {
      status: 200,
      headers: {
        ...commonHeaders,
        'Content-Length': String(total),
      },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    return new Response(null, {
      status: 416,
      headers: {
        ...commonHeaders,
        'Content-Range': `bytes */${total}`,
      },
    });
  }

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : total - 1;

  if (!match[1] && match[2]) {
    const suffix = Number(match[2]);
    start = Math.max(total - suffix, 0);
    end = total - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= total || start > end) {
    return new Response(null, {
      status: 416,
      headers: {
        ...commonHeaders,
        'Content-Range': `bytes */${total}`,
      },
    });
  }

  const chunk = video.subarray(start, end + 1);
  return new Response(chunk, {
    status: 206,
    headers: {
      ...commonHeaders,
      'Content-Length': String(chunk.length),
      'Content-Range': `bytes ${start}-${end}/${total}`,
    },
  });
}
