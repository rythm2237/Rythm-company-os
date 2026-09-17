import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HERO_URL = 'https://2nya-nailart.rythm-os.com/2nya-media/hero-main-v5.mp4';
const EXPECTED_SIZE = 1280760;

export async function GET() {
  try {
    const [head, range] = await Promise.all([
      fetch(HERO_URL, { method: 'HEAD', cache: 'no-store' }),
      fetch(HERO_URL, {
        headers: { Range: 'bytes=0-1023' },
        cache: 'no-store',
      }),
    ]);

    const chunk = Buffer.from(await range.arrayBuffer());
    const contentLength = Number(head.headers.get('content-length') || 0);
    const contentType = head.headers.get('content-type');
    const acceptRanges = range.headers.get('accept-ranges') || head.headers.get('accept-ranges');
    const contentRange = range.headers.get('content-range');
    const isMp4Header = chunk.length >= 12 && chunk.subarray(4, 8).toString('ascii') === 'ftyp';

    const ok =
      head.ok &&
      contentLength === EXPECTED_SIZE &&
      contentType?.startsWith('video/mp4') === true &&
      range.status === 206 &&
      acceptRanges === 'bytes' &&
      contentRange?.startsWith('bytes 0-1023/') === true &&
      chunk.length === 1024 &&
      isMp4Header;

    return NextResponse.json(
      {
        ok,
        head: {
          status: head.status,
          contentType,
          contentLength,
          acceptRanges: head.headers.get('accept-ranges'),
        },
        range: {
          status: range.status,
          contentType: range.headers.get('content-type'),
          acceptRanges,
          contentRange,
          chunkBytes: chunk.length,
          mp4Header: isMp4Header,
        },
        expectedSize: EXPECTED_SIZE,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'media health check failed' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
