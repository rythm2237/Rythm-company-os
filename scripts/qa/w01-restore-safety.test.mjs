import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertContainer, assertLocalDocker, verifyFiles } from './w01-local-restore.mjs';
import { reviewDump } from './w01-dump-review.mjs';
import { joinFunctionDefinitions } from './w01-function-ddl.mjs';

test('Catalog function exports are individually terminated before concatenation', () => {
  const a='CREATE OR REPLACE FUNCTION crm_private.a() RETURNS integer LANGUAGE sql AS $function$SELECT 1$function$\n';
  const b='CREATE OR REPLACE FUNCTION crm_private.b() RETURNS integer LANGUAGE sql AS $function$SELECT 2$function$\n';
  assert.equal(joinFunctionDefinitions([a,b]),a.trimEnd()+';\n\n'+b.trimEnd()+';\n');
  assert.equal(joinFunctionDefinitions([a.trimEnd()+';']),a.trimEnd()+';\n');
  assert.throws(()=>joinFunctionDefinitions(['SELECT 1']));
});

test('Docker controller refuses remote hosts and invalid target names', () => {
  for (const s of ['tcp://localhost:2375','ssh://user@server','https://docker','npipe:////server/pipe/docker','']) assert.throws(()=>assertLocalDocker(s));
  for (const s of ['unix:///var/run/docker.sock','npipe:////./pipe/dockerDesktopLinuxEngine']) assert.doesNotThrow(()=>assertLocalDocker(s));
  for (const s of ['supabase_db_production','postgres','supabase_db_w01-test; echo bad','supabase_db_w01-../x']) assert.throws(()=>assertContainer(s));
  assert.doesNotThrow(()=>assertContainer('supabase_db_w01-local-restore'));
});
test('Incomplete and changed bundles fail before any database mutation', () => {
  const root=mkdtempSync(join(tmpdir(),'w01-safety-'));
  try {
    const files={};
    for (const file of ['schema.sql','dependencies.sql','permissions.sql','attest.sql']) { writeFileSync(join(root,file),'-- synthetic fixture\n'); files[file]=createHash('sha256').update('-- synthetic fixture\n').digest('hex'); }
    const manifest={purpose:'W01_PRIVATE_LOCAL_RESTORE',files};
    assert.doesNotThrow(()=>verifyFiles(root,manifest));
    assert.throws(()=>verifyFiles(root,{...manifest,purpose:'other'}));
    assert.throws(()=>verifyFiles(root,{...manifest,files:{}}));
    writeFileSync(join(root,'permissions.sql'),'GRANT ALL ON SCHEMA public TO PUBLIC;');
    assert.throws(()=>verifyFiles(root,manifest));
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test('Public-only dump does not claim private trigger or ACL parity', () => {
  const r=reviewDump(Buffer.from('CREATE SCHEMA public;\nCREATE TABLE public.fixture(id uuid);\nCREATE TRIGGER x BEFORE INSERT ON public.fixture FOR EACH ROW EXECUTE FUNCTION crm_private.guard();\n'));
  assert.deepEqual(r.unresolvedTriggerSchemas,['crm_private']);
  assert.equal(r.grantStatements,0);
  assert.equal(r.extensionStatements,0);
  assert.equal(r.tables,1);
  assert.match(r.scope,/does not attest/);
});
