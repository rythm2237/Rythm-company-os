import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceDir = path.join(root, 'scripts', '2nya-contact-bg');
const outDir = path.join(root, 'public', '2nya-nailart');

const targets = [
  {
    name: 'desktop',
    chunks: ['desktop-00.b64', 'desktop-01.b64', 'desktop-02.b64', 'desktop-03.b64'],
    lengths: [8000, 8000, 8000, 5140],
    sha256: 'b08f0c3b4263258c9bd949b1ec3406809b94c46f8a0dba61a806684e24dffe5b',
    output: 'contact-bg-desktop-20260928.webp',
  },
  {
    name: 'mobile',
    chunks: ['mobile-00.b64', 'mobile-01.b64', 'mobile-02.b64', 'mobile-03.b64'],
    lengths: [8000, 8000, 8000, 6448],
    sha256: '1de2fb65597cf3135cac7945f5f88003ecf6b324d15bb231be209929cbf26429',
    output: 'contact-bg-mobile-20260928.webp',
  },
];

await mkdir(outDir, { recursive: true });

for (const target of targets) {
  const parts = [];
  for (let index = 0; index < target.chunks.length; index += 1) {
    const raw = (await readFile(path.join(sourceDir, target.chunks[index]), 'utf8')).replace(/\s+/g, '');
    const expectedLength = target.lengths[index];
    if (raw.length < expectedLength) {
      throw new Error(`${target.name} chunk ${index} is too short: ${raw.length} < ${expectedLength}`);
    }
    parts.push(raw.slice(0, expectedLength));
  }

  const payload = parts.join('');
  const bytes = Buffer.from(payload, 'base64');
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== target.sha256) {
    throw new Error(`${target.name} background integrity mismatch: ${actualHash}`);
  }

  await writeFile(path.join(outDir, target.output), bytes);
  console.log(`Materialized ${target.output} (${bytes.length} bytes)`);
}
