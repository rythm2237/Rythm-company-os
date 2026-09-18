import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'lib/2nya-nailart/media/donya-bg-base64');
const outputPath = path.join(root, 'public/2nya-media/donya-bg-v3.webp');

const names = (await fs.readdir(sourceDir))
  .filter((name) => /^\d{2}\.txt$/.test(name))
  .sort();

if (names.length !== 6) {
  throw new Error(`Donya background source is incomplete: expected 6 chunks, found ${names.length}`);
}

const base64 = (await Promise.all(
  names.map((name) => fs.readFile(path.join(sourceDir, name), 'utf8')),
)).join('').trim();

if (base64.length !== 80664) {
  throw new Error(`Donya background base64 length mismatch: ${base64.length}`);
}

const output = Buffer.from(base64, 'base64');
const riff = output.subarray(0, 4).toString('ascii');
const webp = output.subarray(8, 12).toString('ascii');

if (output.length < 50000 || riff !== 'RIFF' || webp !== 'WEBP') {
  throw new Error(`Donya background materialization failed: ${output.length} bytes, ${riff}/${webp}`);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, output);

console.log(`Donya background materialized: ${output.length} bytes`);
