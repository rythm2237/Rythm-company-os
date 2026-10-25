import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertContainer, assertLocalDocker } from './w01-local-restore.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const container='supabase_db_w01-local-restore';
const sourceSha='99178a9f3a21c1a88ab33cdf5a74526ffffd310ad39faecf454a971a7d6ffa64';
const sqlSha='ea184c15c744b3b67fbfcc39dfa1f82810783515cf9503ad1551bdf6b9de29ac';
const sqlPath=join(root,'w01-tenant-matrix.sql');
const resultPath=join(root,'w01-tenant-result.json');
const docker=(args,input)=>{
 const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:4*1024*1024,timeout:180000});
 if(r.error || r.status!==0) throw new Error(r.error?.message??r.stderr.trim());
 return r.stdout.trim();
};
try {
 assertContainer(container);
 if(process.env.DOCKER_HOST) assertLocalDocker(process.env.DOCKER_HOST);
 assertLocalDocker(JSON.parse(docker(['context','inspect']))[0]?.Endpoints?.docker?.Host??'');
 const previous=JSON.parse(readFileSync(join(root,'w01-local-result.json'),'utf8'));
 if(previous.source_sha256!==sourceSha || previous.schema_parity!=='PASS_WITH_DOCUMENTED_SCOPE') throw new Error('A successful authoritative schema restore result is required');
 if(Object.keys(JSON.parse(docker(['inspect','--format','{{json .NetworkSettings.Networks}}',container]))).length) throw new Error('The W01 database must remain disconnected from Docker networks');
 if(createHash('sha256').update(readFileSync(sqlPath)).digest('hex')!==sqlSha) throw new Error('Tenant SQL checksum mismatch');
 docker(['cp',sqlPath,`${container}:/tmp/w01-tenant-matrix.sql`]);
 const args=['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=terse','-A','-t','-q'];
 const run=spawnSync('docker',[...args,'-f','/tmp/w01-tenant-matrix.sql'],{encoding:'utf8',maxBuffer:4*1024*1024,timeout:180000});
 // A failed psql connection also rolls back its open fixture transaction.
 const report=(run.stdout??'').split('\n').filter(l=>l.startsWith('{')).map(l=>JSON.parse(l)).find(x=>x.suite==='W01_DB_TENANT_MATRIX');
 const cleanup=JSON.parse(docker([...args,'-c',"SELECT jsonb_build_object('organizations',(SELECT count(*) FROM public.organizations),'auth_users',(SELECT count(*) FROM auth.users),'helper_schema_absent',to_regnamespace('w01_test') IS NULL,'cron_jobs',(SELECT count(*) FROM cron.job),'vault_secrets',(SELECT count(*) FROM vault.secrets),'outbound_queue',(SELECT count(*) FROM net.http_request_queue));"]));
 const clean=cleanup.organizations===0 && cleanup.auth_users===0 && cleanup.helper_schema_absent && cleanup.cron_jobs===0 && cleanup.vault_secrets===0 && cleanup.outbound_queue===0;
 const pass=run.status===0 && report?.failed===0 && report?.checks===report?.checks_expected && clean;
 const result={container,source_sha256:sourceSha,tenant_sql_sha256:sqlSha,tenant_matrix:pass?'PASS_DB_ROLE_SCOPE':'FAIL',report:report??null,cleanup,http_auth:'NOT_RUN',preview_isolation:'NOT_VERIFIED',w01:'NOT_ACCEPTED'};
 if(run.status!==0) result.error=String(run.error?.message??run.stderr??'').slice(0,2000);
 writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
 docker(['exec',container,'rm','-f','/tmp/w01-tenant-matrix.sql']);
 if(!pass) process.exitCode=1;
} catch(error) {
 console.error(error.message);
 process.exitCode=1;
}
