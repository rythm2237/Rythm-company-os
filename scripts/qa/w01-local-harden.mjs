import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { assertContainer, assertLocalDocker } from './w01-local-restore.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const container='supabase_db_w01-local-restore';
const sourceSha='99178a9f3a21c1a88ab33cdf5a74526ffffd310ad39faecf454a971a7d6ffa64';
const patchSha='4d60bf5cf2e75e6246d560fe4645e45d038849262d47ffd94555852d74e270f7';
const beforeAcl={count:5939,md5:'0d2aba5da97a004371fe116693dbf30c'};
const resultPath=join(root,'w01-hardening-result.json');
const result={container,source_sha256:sourceSha,patch_sha256:patchSha,status:'NOT_APPLIED',patch_committed:false,w01:'NOT_ACCEPTED',scope:'Local QA privilege candidate; Production not modified'};
const docker=(args,input)=>{
 const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
 if(r.error || r.status!==0) throw new Error(r.error?.message??r.stderr.trim());
 return r.stdout.trim();
};
const psql=['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=terse','-q','-A','-t'];
let copied=false;
try {
 assertContainer(container);
 if(process.env.DOCKER_HOST) assertLocalDocker(process.env.DOCKER_HOST);
 assertLocalDocker(JSON.parse(docker(['context','inspect']))[0]?.Endpoints?.docker?.Host??'');
 if(Object.keys(JSON.parse(docker(['inspect','--format','{{json .NetworkSettings.Networks}}',container]))).length) throw new Error('W01 database must stay disconnected from Docker networks');
 const prior=JSON.parse(readFileSync(join(root,'w01-local-result.json'),'utf8'));
 if(prior.source_sha256!==sourceSha || prior.schema_parity!=='PASS_WITH_DOCUMENTED_SCOPE') throw new Error('Prior authoritative schema restore is required');
 const patch=readFileSync(join(root,'w01-revoke-client-truncate.sql'));
 if(createHash('sha256').update(patch).digest('hex')!==patchSha) throw new Error('Hardening SQL checksum mismatch');
 const expectedBytes=readFileSync(join(root,'hardening-expectations.json'));
 if(createHash('sha256').update(expectedBytes).digest('hex')!=='133e4b725b586ad5dc0d8436e61883bac3af529350b0de68b1e197e2b3361c90') throw new Error('Hardening manifest checksum mismatch');
 const expected=JSON.parse(expectedBytes.toString('utf8'));
 if(expected.dump_sha256!==sourceSha || expected.inventory?.effective_acl?.md5!=='7fea1828e79dde41c9d99f0ad6bae922' || expected.inventory?.effective_acl?.count!==5753) throw new Error('Unexpected hardening catalog manifest');
 const queryBytes=readFileSync(join(root,'w01-schema-inventory.sql'));
 if(createHash('sha256').update(queryBytes).digest('hex')!=='758f925f65f315e70291cde3817f7d8a5d17323b43e80ab09d9d15175c4164c6') throw new Error('Catalog query checksum mismatch');
 const query=queryBytes.toString('utf8');
 if(!query.includes('AS inventory FROM buckets;')) throw new Error('Unsupported inventory query');
 const readInventory=()=>JSON.parse(docker([...psql,'-c',"BEGIN READ ONLY; SET LOCAL search_path='';\n"+query+'\nCOMMIT;']));
 const before=readInventory();
 const original=structuredClone(expected.inventory); original.effective_acl=beforeAcl;
 const originalMatch=isDeepStrictEqual(before,original);
 if(!originalMatch && !isDeepStrictEqual(before,expected.inventory)) throw new Error('Unexpected local schema/privilege drift; no patch applied');
 if(originalMatch) {
  const previousMatrix=JSON.parse(readFileSync(join(root,'w01-tenant-result.json'),'utf8'));
  if(previousMatrix.report?.checks!==1000 || previousMatrix.report?.passed!==999 || previousMatrix.report?.failed!==1 || previousMatrix.report?.failures?.[0]?.case!=='DB privilege: authenticated cannot TRUNCATE tenant preferences') throw new Error('Expected reviewed 999/1000 baseline result is missing');
 }
 const guard="DO $guard$ BEGIN IF current_database()<>'postgres' OR session_user<>'postgres' OR EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM public.organizations) OR EXISTS(SELECT 1 FROM cron.job) OR EXISTS(SELECT 1 FROM vault.secrets) OR to_regnamespace('w01_test') IS NOT NULL THEN RAISE EXCEPTION 'Empty isolated restore required'; END IF; END $guard$;";
 const body=query.replace('AS inventory FROM buckets;','INTO observed FROM buckets;');
 const attest="SET LOCAL search_path=''; DO $attest$ DECLARE observed jsonb; BEGIN\n"+body+"\nIF observed IS DISTINCT FROM '"+JSON.stringify(expected.inventory).replaceAll("'","''")+"'::jsonb THEN RAISE EXCEPTION 'Unexpected catalog change; patch rolled back'; END IF; END $attest$;";
 docker(['cp',join(root,'w01-revoke-client-truncate.sql'),`${container}:/tmp/w01-revoke-client-truncate.sql`]); copied=true;
 docker([...psql,'--single-transaction','-c',guard+" SET LOCAL client_min_messages='error'; SET LOCAL w01.allow_client_truncate_hardening='isolated-only';",'-f','/tmp/w01-revoke-client-truncate.sql','-c',attest]);
 result.patch_committed=true;
 const after=readInventory();
 if(!isDeepStrictEqual(after,expected.inventory)) throw new Error('Post-commit catalog verification failed');
 const checks=JSON.parse(docker([...psql,'-c',"SELECT jsonb_build_object('client_truncate_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (has_table_privilege('anon',c.oid,'TRUNCATE') OR has_table_privilege('authenticated',c.oid,'TRUNCATE'))),'future_client_truncate_defaults',(SELECT count(*) FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE d.defaclobjtype='r' AND d.defaclnamespace IN (0,'public'::regnamespace::oid) AND a.privilege_type='TRUNCATE' AND a.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid))); "]));
 if(checks.client_truncate_tables!==0 || checks.future_client_truncate_defaults!==0) throw new Error('Client TRUNCATE boundary incomplete');
 Object.assign(result,{status:'PASS_LOCAL_TRUNCATE_HARDENING',effective_acl_before:before.effective_acl,effective_acl_after:after.effective_acl,all_other_catalog_buckets_unchanged:true,backend_and_dml_privileges_preserved:true,...checks});
 writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
 docker(['exec',container,'rm','-f','/tmp/w01-revoke-client-truncate.sql']); copied=false;
 // Re-run the UNCHANGED 1,000-case matrix after the reviewed local privilege fix.
 const run=spawnSync(process.execPath,[join(root,'w01-local-tenant.mjs')],{stdio:'inherit',timeout:180000});
 process.exitCode=run.status??1;
} catch(error) {
 result.status='ERROR';result.error=String(error.message).slice(0,2000);
 writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n');
 console.error(JSON.stringify(result,null,2));process.exitCode=1;
} finally {
 if(copied) { try { docker(['exec',container,'rm','-f','/tmp/w01-revoke-client-truncate.sql']); } catch { /* Best-effort cleanup after a failed Docker command. */ } }
}
