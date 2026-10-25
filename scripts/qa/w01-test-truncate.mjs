// Real SQL-role regression in the credential-free disposable Supabase job.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const patch=readFileSync('scripts/qa/w01-revoke-client-truncate.sql','utf8');
const sql=`BEGIN;
SET LOCAL w01.allow_client_truncate_hardening='isolated-only';
GRANT ALL ON TABLE public.w01_fixture TO anon,authenticated,service_role;
GRANT TRUNCATE ON TABLE public.w01_fixture TO PUBLIC;
GRANT CREATE,USAGE ON SCHEMA public TO supabase_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT TRUNCATE ON TABLES TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
INSERT INTO public.w01_fixture(id) VALUES('00000000-0000-0000-0000-000000000001');
SAVEPOINT baseline_attack;
SET LOCAL ROLE authenticated;
DO $before$ BEGIN
 IF (SELECT count(*) FROM public.w01_fixture)<>0 THEN RAISE EXCEPTION 'Fixture must be RLS-hidden from authenticated'; END IF;
END $before$;
TRUNCATE public.w01_fixture;
RESET ROLE;
DO $before$ BEGIN
 IF (SELECT count(*) FROM public.w01_fixture)<>0 THEN RAISE EXCEPTION 'Baseline TRUNCATE did not bypass RLS'; END IF;
END $before$;
ROLLBACK TO SAVEPOINT baseline_attack;
RELEASE SAVEPOINT baseline_attack;
${patch}
DO $after$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.w01_fixture) THEN RAISE EXCEPTION 'Hardening removed data'; END IF;
 IF NOT has_table_privilege('service_role','public.w01_fixture','TRUNCATE') THEN RAISE EXCEPTION 'Backend TRUNCATE was revoked'; END IF;
 IF NOT has_table_privilege('authenticated','public.w01_fixture','UPDATE') THEN RAISE EXCEPTION 'Client DML changed'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN
  TRUNCATE public.w01_fixture;
  RAISE EXCEPTION 'Authenticated TRUNCATE remained possible';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
 EXECUTE 'SET LOCAL ROLE anon';
 BEGIN
  TRUNCATE public.w01_fixture;
  RAISE EXCEPTION 'Anonymous TRUNCATE remained possible';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
END $after$;
CREATE TABLE public.w01_future_postgres(id int);
SET LOCAL ROLE supabase_admin;
CREATE TABLE public.w01_future_admin(id int);
RESET ROLE;
DO $future$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['public.w01_future_postgres','public.w01_future_admin'] LOOP
  IF has_table_privilege('authenticated',t,'TRUNCATE') OR has_table_privilege('anon',t,'TRUNCATE') THEN RAISE EXCEPTION 'Future-table client TRUNCATE leaked: %',t; END IF;
  IF NOT has_table_privilege('service_role',t,'TRUNCATE') OR NOT has_table_privilege('authenticated',t,'SELECT') THEN RAISE EXCEPTION 'Future-table backend/DML default changed: %',t; END IF;
 END LOOP;
END $future$;
${patch}
ROLLBACK;`;
const r=spawnSync('docker',['exec','-i','supabase_db_w01-ci-restore','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=terse','-q'],{input:sql,encoding:'utf8',timeout:90000});
assert.equal(r.status,0,r.stderr);
console.log('PASS: baseline SQL TRUNCATE bypass reproduced and undone; authenticated/anon blocked after patch; data and backend/DML retained; global + schema defaults protected for postgres/supabase_admin; patch idempotent. No HTTP exploit claimed.');
