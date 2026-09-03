import fs from 'node:fs';

const path = 'data/seo/referring-domain-authority.csv';
const expected = [
  'observed_on','source_domain','source_url','target_url','source_type','relationship','evidence_status','authority_vendor','authority_metric','authority_value','notes'
];

const raw = fs.readFileSync(path, 'utf8').trimEnd();
const lines = raw.split(/\r?\n/);
const header = lines[0]?.split(',') ?? [];

if (header.join(',') !== expected.join(',')) {
  throw new Error(`Unexpected M-06 register header: ${header.join(',')}`);
}

for (const [index, line] of lines.slice(1).entries()) {
  if (!line.trim()) continue;
  const columns = line.split(',');
  if (columns.length !== expected.length) {
    throw new Error(`M-06 row ${index + 2} has ${columns.length} columns; expected ${expected.length}. Use CSV-safe values without raw commas.`);
  }

  const row = Object.fromEntries(expected.map((key, i) => [key, columns[i].trim()]));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.observed_on)) throw new Error(`Invalid observed_on at row ${index + 2}`);
  if (!row.source_domain || !/^https:\/\//.test(row.source_url) || !/^https:\/\/rythm-os\.com(?:\/|$)/.test(row.target_url)) {
    throw new Error(`Row ${index + 2} must contain a source domain, HTTPS source URL, and canonical rythm-os.com target URL.`);
  }
  if (!row.source_type || !row.relationship || !row.evidence_status) {
    throw new Error(`Row ${index + 2} is missing source_type, relationship, or evidence_status.`);
  }
  if (row.authority_value && (!row.authority_vendor || !row.authority_metric)) {
    throw new Error(`Row ${index + 2} has an authority value without vendor and metric evidence.`);
  }
  if (!row.authority_value && (row.authority_vendor || row.authority_metric)) {
    throw new Error(`Row ${index + 2} has incomplete authority metric fields.`);
  }
}

console.log(`M-06 authority register valid: ${Math.max(0, lines.length - 1)} evidence row(s).`);
