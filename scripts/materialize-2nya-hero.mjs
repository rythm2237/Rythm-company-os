import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_URL = 'https://at.adobe.com/3O4We9WJ7dto7lFJ';
const EXPECTED_SIZE = 1280760;
const EXPECTED_SHA256 = 'a59800e6ba0e8db496915237c3e9d4eb665eeff0e43adbc316c166ad80f1ad93';
const OUTPUT = path.join(process.cwd(), 'public', '2nya-media', 'hero-main-v5.mp4');

const response = await fetch(SOURCE_URL, { redirect: 'follow' });
if (!response.ok) {
  throw new Error(`2nya hero media download failed: HTTP ${response.status}`);
}

const bytes = Buffer.from(await response.arrayBuffer());
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (bytes.length !== EXPECTED_SIZE) {
  throw new Error(`2nya hero media size mismatch: expected ${EXPECTED_SIZE}, got ${bytes.length}`);
}
if (sha256 !== EXPECTED_SHA256) {
  throw new Error(`2nya hero media checksum mismatch: expected ${EXPECTED_SHA256}, got ${sha256}`);
}

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, bytes);
console.log(`2nya hero media materialized: ${bytes.length} bytes, sha256=${sha256}`);
