// CI-only helper semantics + PL/pgSQL syntax validation. Not the full app matrix.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const sql=readFileSync('scripts/qa/w01-tenant-matrix.sql','utf8');
const helper=sql.match(/-- W01_HELPERS_BEGIN[^\n]*\n([\s\S]*?)-- W01_HELPERS_END/)[1];
const functionBodies=[...sql.matchAll(/DO \$(guard|seed|matrix|finish)\$([\s\S]*?)\$\1\$;/g)];
assert.equal(functionBodies.length,4);
const parseOnly=functionBodies.map(([,name,body])=>`CREATE FUNCTION w01_test.parse_${name}() RETURNS void LANGUAGE plpgsql AS $parser$${body}$parser$;`).join('\n');
// Exercise the ACTUAL seed update against the domain in the tracked migration,
// not a duplicated list of accepted status values in the test implementation.
const migration=readFileSync('supabase/migrations/20260820203000_communication_center_mvp.sql','utf8');
const transportDDL=migration.match(/create table if not exists public\.communication_provider_connections \([\s\S]*?\n\);/i)[0]
 .replaceAll('public.communication_provider_connections','w01_test.communication_provider_connections')
 .replaceAll('public.organizations','w01_test.organizations');
const transportUpdate=sql.match(/^UPDATE public\.communication_provider_connections[^;]*;/m)[0]
 .replaceAll('public.communication_provider_connections','w01_test.communication_provider_connections');
const fixture=`BEGIN;\n${helper}\n${parseOnly}
CREATE TABLE w01_test.organizations(id uuid PRIMARY KEY);
INSERT INTO w01_test.organizations VALUES('00000000-0000-0000-0000-000000000001');
${transportDDL}
INSERT INTO w01_test.communication_provider_connections(organization_id,provider_code,display_name,status,inbound_enabled,outbound_enabled)
VALUES('00000000-0000-0000-0000-000000000001','rythm_managed','Synthetic transport','connected',true,true);
${transportUpdate}
DO $transport$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM w01_test.communication_provider_connections WHERE status='disabled' AND NOT inbound_enabled AND NOT outbound_enabled) THEN RAISE EXCEPTION 'Synthetic transport was not disabled'; END IF;
END $transport$;
CREATE TABLE w01_test.fixture(id int PRIMARY KEY,value int);
INSERT INTO w01_test.fixture VALUES(1,10);
GRANT SELECT,INSERT,UPDATE,DELETE ON w01_test.fixture TO authenticated;
DO $selftest$ BEGIN
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM w01_test.denied('unexpected write detected and undone','INSERT INTO w01_test.fixture VALUES(2,20)');
 PERFORM w01_test.denied('zero row update denied','UPDATE w01_test.fixture SET value=99 WHERE id=999',true);
 PERFORM w01_test.allowed('positive update','UPDATE w01_test.fixture SET value=11 WHERE id=1');
 EXECUTE 'RESET ROLE';
 IF (SELECT passed FROM w01_test.results WHERE label='unexpected write detected and undone') IS DISTINCT FROM false THEN RAISE EXCEPTION 'Allowed attack was hidden'; END IF;
 IF (SELECT count(*) FROM w01_test.results WHERE passed)<>2 THEN RAISE EXCEPTION 'Positive/negative assertion helper mismatch'; END IF;
 IF (SELECT count(*) FROM w01_test.fixture)<>1 THEN RAISE EXCEPTION 'Unexpected mutation was not rolled back'; END IF;
 IF (SELECT value FROM w01_test.fixture WHERE id=1)<>11 THEN RAISE EXCEPTION 'Positive mutation missing'; END IF;
END $selftest$;
ROLLBACK;`;
const result=spawnSync('docker',['exec','-i','supabase_db_w01-ci-restore','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q'],{input:fixture,encoding:'utf8',timeout:90000});
assert.equal(result.status,0,result.stderr);
console.log('PASS: transport seed runs against tracked migration CHECK; matrix PL/pgSQL bodies syntax-validated; invoker-role helpers detect and undo allowed attacks and preserve positive controls. Full app matrix NOT EXECUTED in CI.');
