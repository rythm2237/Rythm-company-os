import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function assertLocalDocker(endpoint) {
  if (!/^unix:\/\/\//.test(endpoint) && !/^npipe:\/\/\/\/\.\/pipe\/[a-zA-Z0-9_.-]+$/.test(endpoint)) throw new Error('Only a local Unix socket or Windows named pipe Docker endpoint is allowed');
}
export function assertContainer(name) {
  if (!/^supabase_db_w01-[a-z0-9-]+$/.test(name)) throw new Error('Only supabase_db_w01-* disposable containers are allowed');
}
export function verifyFiles(root, manifest) {
  const required = ['schema.sql', 'dependencies.sql', 'permissions.sql', 'attest.sql'];
  for (const file of required) {
    const expected = manifest.files?.[file];
    if (!/^[a-f0-9]{64}$/.test(expected ?? '')) throw new Error(`Missing reviewed checksum: ${file}`);
    const actual = createHash('sha256').update(readFileSync(join(root, file))).digest('hex');
    if (actual !== expected) throw new Error(`Bundle checksum mismatch: ${file}`);
  }
  if (manifest.purpose !== 'W01_PRIVATE_LOCAL_RESTORE') throw new Error('Not a W01 local restore bundle');
}

const preflight = `DO $guard$
DECLARE n int;
BEGIN
 IF current_database()<>'postgres' THEN RAISE EXCEPTION 'Expected initialized local postgres database'; END IF;
 IF current_setting('server_version_num')::int / 10000 <> 17 THEN RAISE EXCEPTION 'PostgreSQL 17 is required'; END IF;
 IF to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL THEN RAISE EXCEPTION 'Real Supabase Auth dependencies missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated' AND NOT rolbypassrls AND NOT rolsuper) THEN RAISE EXCEPTION 'Invalid authenticated role'; END IF;
 SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public';
 IF n<>0 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public') THEN RAISE EXCEPTION 'Public schema is not pristine; no reset is allowed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='crm_private') THEN RAISE EXCEPTION 'CRM schema already exists; no reset is allowed'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users) THEN RAISE EXCEPTION 'Auth database is not empty'; END IF;
 IF to_regclass('storage.objects') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM storage.objects' INTO n; IF n<>0 THEN RAISE EXCEPTION 'Storage is not empty'; END IF; END IF;
 IF to_regclass('vault.secrets') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM vault.secrets' INTO n; IF n<>0 THEN RAISE EXCEPTION 'Vault is not empty'; END IF; END IF;
 IF to_regclass('cron.job') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM cron.job' INTO n; IF n<>0 THEN RAISE EXCEPTION 'Cron jobs exist'; END IF; END IF;
 IF to_regclass('net.http_request_queue') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM net.http_request_queue' INTO n; IF n<>0 THEN RAISE EXCEPTION 'Outbound requests exist'; END IF; END IF;
END $guard$;`;

export function main(argv) {
  const opts = {};
  for (let i=0; i<argv.length; i++) {
    if (argv[i]==='--restore') opts.restore=true;
    else if (argv[i]==='--container' || argv[i]==='--bundle') { const k=argv[i].slice(2); if (!argv[i+1] || argv[i+1].startsWith('--')) throw new Error('Missing argument'); opts[k]=argv[++i]; }
    else throw new Error('Usage: node w01-local-restore.mjs --container supabase_db_w01-local-restore [--bundle DIR --restore]');
  }
  const container=opts.container ?? 'supabase_db_w01-local-restore';
  assertContainer(container);
  if (process.env.DOCKER_HOST) assertLocalDocker(process.env.DOCKER_HOST);
  const docker = (args, input) => {
    const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:8*1024*1024,timeout:180000});
    if (r.error || r.status!==0) throw new Error(`Docker command failed (${args[0]}): ${r.error?.message ?? r.stderr.trim()}`);
    return r.stdout.trim();
  };
  const contexts=JSON.parse(docker(['context','inspect']));
  assertLocalDocker(contexts[0]?.Endpoints?.docker?.Host ?? '');
  const state=JSON.parse(docker(['inspect','--format','{{json .State}}',container]));
  if (!state.Running) throw new Error('W01 database container is not running');
  const psqlArgs=['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=terse'];
  const readSql=`SELECT jsonb_build_object('server',current_setting('server_version'),'database',current_database(),'schemas',(SELECT jsonb_agg(nspname ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('public','auth','extensions','vault','cron','net','crm_private')),'public_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),'auth_available',to_regprocedure('auth.uid()') IS NOT NULL,'extensions',(SELECT jsonb_agg(extname ORDER BY extname) FROM pg_extension));`;
  const inventory=JSON.parse(docker([...psqlArgs,'-A','-t','-q','-c',readSql]));
  console.log(JSON.stringify({container,...inventory,w01:'NOT_ACCEPTED'},null,2));
  if (!opts.restore) return;
  const root=resolve(opts.bundle ?? dirname(fileURLToPath(import.meta.url)));
  const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
  verifyFiles(root,manifest);
  // Before any mutation: refuse existing application objects, identities or jobs.
  docker([...psqlArgs,'-q'],preflight);
  // No external database, provider, cron or webhook can be contacted by restored code.
  const networks=JSON.parse(docker(['inspect','--format','{{json .NetworkSettings.Networks}}',container]));
  for (const network of Object.keys(networks)) docker(['network','disconnect',network,container]);
  const remaining=JSON.parse(docker(['inspect','--format','{{json .NetworkSettings.Networks}}',container]));
  if (Object.keys(remaining).length) throw new Error('Network isolation failed');
  for (const file of ['schema.sql','dependencies.sql','permissions.sql','attest.sql']) docker(['cp',join(root,file),`${container}:/tmp/w01-${file}`]);
  const result={container,source_sha256:manifest.files['schema.sql'],network:'disconnected',schema_parity:'NOT_VERIFIED',tenant_matrix:'NOT_RUN',http_auth:'NOT_RUN',preview_isolation:'NOT_VERIFIED',w01:'NOT_ACCEPTED'};
  try {
    // psql owns one transaction covering the preflight, extensions, private schema,
    // public dump, permissions and exact catalog assertions. No partial success.
    docker([...psqlArgs,'-q','--single-transaction','-c',`${preflight}\nDROP SCHEMA public RESTRICT;`,
      '-f','/tmp/w01-dependencies.sql','-f','/tmp/w01-schema.sql','-f','/tmp/w01-permissions.sql','-f','/tmp/w01-attest.sql']);
    result.schema_parity=manifest.origin==='synthetic-ci-fixture' ? 'HARNESS_FIXTURE_ONLY' : 'PASS_WITH_DOCUMENTED_SCOPE';
    console.log('Restore committed; catalog scope matched. W01 tenant/HTTP/Preview gates remain unverified.');
  } catch (error) {
    result.error=String(error.message).slice(0,2000);
    throw error;
  } finally {
    for (const file of ['schema.sql','dependencies.sql','permissions.sql','attest.sql']) docker(['exec',container,'rm','-f',`/tmp/w01-${file}`]);
    writeFileSync(join(root,'w01-local-result.json'),JSON.stringify(result,null,2)+'\n');
  }
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode=1; }
}
