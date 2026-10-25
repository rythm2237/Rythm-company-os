// Exercises transaction rollback on REAL, empty Supabase Docker, never Production.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const container='supabase_db_w01-ci-restore';
const root=mkdtempSync(join(tmpdir(),'w01-fixture-'));
const psql=sql=>{
  const r=spawnSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-A','-t','-q'],{input:sql,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr); return r.stdout.trim();
};
try {
  const files={
    'schema.sql':'CREATE SCHEMA public; CREATE TABLE public.w01_fixture(id uuid primary key, owner_id uuid references auth.users(id)); ALTER TABLE public.w01_fixture ENABLE ROW LEVEL SECURITY;',
    'dependencies.sql':"CREATE SCHEMA crm_private; CREATE FUNCTION crm_private.w01_fixture_owner(id uuid) RETURNS boolean LANGUAGE sql STABLE AS 'SELECT auth.uid() = id';",
    'permissions.sql':'GRANT USAGE ON SCHEMA public TO authenticated; GRANT SELECT ON public.w01_fixture TO authenticated;',
    'attest.sql':"DO $$ BEGIN RAISE EXCEPTION 'W01 intentional fixture mismatch'; END $$;",
  };
  const save=()=>{
    const manifest={purpose:'W01_PRIVATE_LOCAL_RESTORE',origin:'synthetic-ci-fixture',files:{}};
    for (const [file,text] of Object.entries(files)) { writeFileSync(join(root,file),text); manifest.files[file]=createHash('sha256').update(text).digest('hex'); }
    writeFileSync(join(root,'manifest.json'),JSON.stringify(manifest));
  };
  const run=()=>spawnSync(process.execPath,['scripts/qa/w01-local-restore.mjs','--container',container,'--bundle',root,'--restore'],{encoding:'utf8',timeout:240000});
  save();
  const failed=run();
  assert.equal(failed.status,1,failed.stdout+failed.stderr);
  assert.match(failed.stderr,/W01 intentional fixture mismatch/);
  assert.equal(psql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public';"),'0');
  assert.equal(psql("SELECT to_regnamespace('crm_private') IS NULL;"),'t');
  assert.equal(JSON.parse(readFileSync(join(root,'w01-local-result.json'))).schema_parity,'NOT_VERIFIED');
  files['attest.sql']="DO $$ BEGIN IF to_regclass('public.w01_fixture') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN RAISE EXCEPTION 'Real dependencies missing'; END IF; END $$;";
  save();
  const good=run();
  assert.equal(good.status,0,good.stdout+good.stderr);
  const result=JSON.parse(readFileSync(join(root,'w01-local-result.json')));
  assert.equal(result.schema_parity,'HARNESS_FIXTURE_ONLY');
  assert.equal(result.w01,'NOT_ACCEPTED');
  assert.equal(psql("SELECT count(*) FROM public.w01_fixture;"),'0');
  // A rerun must refuse the populated schema; never reset or overwrite it.
  const rerun=run();
  assert.equal(rerun.status,1);
  assert.match(rerun.stderr,/Public schema is not pristine/);
  assert.equal(psql("SELECT to_regclass('public.w01_fixture') IS NOT NULL;"),'t');
  console.log('PASS: real Supabase dependency boot, atomic rollback, valid synthetic restore, network disconnection and non-pristine rerun denial. HARNESS ONLY; production schema and tenant matrix NOT TESTED.');
} finally { rmSync(root,{recursive:true,force:true}); }
