import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// This is inventory, not a SQL parser or permission to execute an arbitrary file.
export function reviewDump(bytes) {
  const sql = bytes.toString('utf8');
  const count = (pattern) => [...sql.matchAll(pattern)].length;
  const definedSchemas = [...sql.matchAll(/^CREATE SCHEMA ([a-z_][a-z0-9_]*);$/gm)].map(m => m[1]);
  const triggerSchemas = [...new Set([...sql.matchAll(/EXECUTE FUNCTION ([a-z_][a-z0-9_]*)\./g)].map(m => m[1]))];
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    tables: count(/^CREATE TABLE /gm), functions: count(/^CREATE FUNCTION /gm),
    policies: count(/^CREATE POLICY /gm), triggers: count(/^CREATE TRIGGER /gm),
    rlsStatements: count(/^ALTER TABLE .* ENABLE ROW LEVEL SECURITY;/gm),
    grantStatements: count(/^GRANT /gm), extensionStatements: count(/^CREATE EXTENSION /gm),
    definedSchemas,
    unresolvedTriggerSchemas: triggerSchemas.filter(s => !definedSchemas.includes(s)),
    scope: 'text inventory only; does not attest restore, ACL, dependencies or tenant access',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node w01-dump-review.mjs /private/schema.sql');
  console.log(JSON.stringify(reviewDump(readFileSync(process.argv[2])), null, 2));
}
