// W09: real local Supabase DB + Storage round trip, synthetic fixtures only.
// Run on a disposable Linux Docker host, no cloud credentials required.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

const hash = b => createHash("sha256").update(b).digest("hex");
const root = mkdtempSync(join(tmpdir(), "w09-drill-"));
chmodSync(root, 0o700);
const env = { PATH: process.env.PATH, HOME: process.env.HOME, CI: "true" };
if (process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY === "ghcr.io") env.SUPABASE_INTERNAL_IMAGE_REGISTRY = "ghcr.io";
let phase = "preflight";
const stacks = [];
const log = [];
const stamp = () => new Date().toISOString();
const record = (event, extra={}) => {
  phase=event;
  log.push({ event, utc: stamp(), ...extra });
  console.log("W09 phase: "+event);
  writeFileSync(join(root,"drill-log.json"), JSON.stringify(log,null,2), {mode:0o600});
};
function run(bin,args,cwd=root,input) {
  const r=spawnSync(bin,args,{cwd,env,input,maxBuffer:64*1024*1024,timeout:600000});
  if(r.status!==0 || r.error) throw Error(bin+" "+args[0]+" failed (exit "+r.status+"); inspect locally, do not publish credential-bearing output");
  return r.stdout;
}
const sql = (s,query) => run("docker",["exec","-i",s.db,"psql","-X","-U","postgres","-d","postgres","-Atq","-v","ON_ERROR_STOP=1"],s.dir,query).toString().trim();
function localStatus(s) {
  const raw=run("supabase",["status","-o","env"],s.dir).toString();
  const val=k=>raw.match(new RegExp("^"+k+'="?([^"\\r\\n]+)"?$',"m"))?.[1];
  const url=val("API_URL"), key=val("SERVICE_ROLE_KEY")||val("SECRET_KEY"), anon=val("ANON_KEY")||val("PUBLISHABLE_KEY");
  assert.ok(url==="http://127.0.0.1:54321"||url==="http://localhost:54321","local API allowlist");
  assert.ok(key&&anon,"local keys missing");
  return {url:"http://127.0.0.1:54321",key,anon};
}
function start(name) {
  const dir=join(root,name);
  mkdirSync(dir,{mode:0o700});
  const s={dir,name,db:"supabase_db_"+name};
  stacks.push(s);
  run("supabase",["init","--yes"],dir);
  // Explicitly prohibit a linked project and require an isolated generated project id.
  const config=readFileSync(join(dir,"supabase","config.toml"),"utf8");
  assert.match(config,new RegExp('project_id\\s*=\\s*"'+name+'"'));
  run("supabase",["start"],dir);
  const actual=run("docker",["ps","--filter","name=^/"+s.db+"$","--format","{{.Names}}"],dir).toString().trim();
  assert.equal(actual,s.db);
  Object.assign(s,localStatus(s));
  return s;
}
function stop(s) {
  run("supabase",["stop","--no-backup"],s.dir);
  s.stopped=true;
}
async function request(s,path,{method="GET",body,anon=false,contentType="application/json"}={}) {
  assert.equal(s.url,"http://127.0.0.1:54321","request must remain local");
  assert.ok(path.startsWith("/storage/v1/"),"only local Storage API");
  const key=anon?s.anon:s.key;
  const bytes=body===undefined?undefined:Buffer.from(body);
  // A new TCP connection per operation; no stale pooled socket after source teardown.
  // Native HTTP does not follow redirects, and the host/port are pinned.
  return await new Promise((resolve,reject)=>{
    const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":contentType,Connection:"close"};
    if(bytes) headers["Content-Length"]=bytes.length;
    const req=httpRequest({hostname:"127.0.0.1",port:54321,path,method,agent:false,headers},res=>{
      const chunks=[]; let size=0;
      res.on("data",chunk=>{ size+=chunk.length; if(size>2*1024*1024){req.destroy(Error("synthetic response too large"));return;} chunks.push(chunk); });
      res.on("error",reject);
      res.on("end",()=>resolve({status:res.statusCode,ok:res.statusCode>=200&&res.statusCode<300,arrayBuffer:async()=>Buffer.concat(chunks)}));
    });
    req.setTimeout(30000,()=>req.destroy(Error("local Storage timeout")));
    req.on("error",e=>reject(Error("local Storage transport "+(e.code||e.message||"error"))));
    req.end(bytes);
  });
}
async function waitForStorage(s) {
  let reason="not ready";
  for(let attempt=0;attempt<20;attempt++){
    try { const res=await request(s,"/storage/v1/bucket"); if(res.ok)return; reason="HTTP "+res.status; }
    catch(e){reason=e.message;}
    await delay(1000);
  }
  throw Error("local Storage readiness failed: "+reason);
}
async function ok(s,path,opts) {
  const res=await request(s,path,opts);
  assert.ok(res.ok,"local storage operation failed: "+res.status);
  return Buffer.from(await res.arrayBuffer());
}
const bucket="w09-private";
const pathA="tenant-a/fixture.txt",pathB="tenant-b/fixture.txt",latePath="tenant-a/after-backup.txt";
const objectPath=p=>"/storage/v1/object/"+bucket+"/"+p;
const readPath=p=>"/storage/v1/object/authenticated/"+bucket+"/"+p;
const payloads=new Map([[pathA,Buffer.from("W09 synthetic tenant A\n")],[pathB,Buffer.from("W09 synthetic tenant B\n")]]);
const rowsQuery="select coalesce(json_agg(t order by id),'[]'::json) from (select id,tenant,object_path,sha256 from w09_fixture.records) t;";
async function createBucket(s) {
  await ok(s,"/storage/v1/bucket",{method:"POST",body:JSON.stringify({id:bucket,name:bucket,public:false})});
}
async function upload(s,p,bytes) {
  await ok(s,objectPath(p),{method:"POST",body:bytes,contentType:"application/octet-stream"});
}
async function verifyPrivate(s,p,expected) {
  const bytes=await ok(s,readPath(p));
  assert.equal(hash(bytes),hash(expected),"restored file byte hash");
  for (const path of [readPath(p),"/storage/v1/object/public/"+bucket+"/"+p]) {
    const denied=await request(s,path,{anon:true});
    assert.ok([400,401,403,404].includes(denied.status),"anonymous private download must fail");
  }
}
function checkRls(s,tenant) {
  const n=sql(s,"set role authenticated; set w09.tenant='"+tenant+"'; select count(*) from w09_fixture.records;");
  assert.equal(n,"1","tenant sees only own fixture");
}
try {
  for(const name of ["SUPABASE_ACCESS_TOKEN","SUPABASE_DB_PASSWORD","SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEY","DATABASE_URL"]) {
    assert.ok(!process.env[name],"Refuse cloud/database credential environment: "+name);
  }
  run("supabase",["--version"]);
  run("docker",["version"]);
  const context=JSON.parse(run("docker",["context","inspect"]).toString());
  assert.match(context[0]?.Endpoints?.docker?.Host||"",/^unix:\/\/\//,"refuse nonlocal Docker context");
  const occupied=run("docker",["ps","-a","--format","{{.Names}}"]).toString();
  assert.ok(!occupied.includes("supabase_"),"Use a clean disposable Docker host");
  const suffix=randomUUID().slice(0,8);
  record("starting_source");
  const source=start("w09-source-"+suffix);
  record("source_storage_readiness");
  await waitForStorage(source);
  record("source_ready");
  sql(source,"create schema w09_fixture; create table w09_fixture.records(id integer primary key, tenant text not null, object_path text not null, sha256 text not null); alter table w09_fixture.records enable row level security; grant usage on schema w09_fixture to authenticated; grant select on w09_fixture.records to authenticated; create policy tenant_read on w09_fixture.records for select to authenticated using (tenant=current_setting('w09.tenant',true));");
  record("source_fixture_setup");
  await createBucket(source);
  let id=0;
  for(const [p,b] of payloads) {
    await upload(source,p,b);
    sql(source,"insert into w09_fixture.records values("+(++id)+",'"+p.split("/")[0]+"','"+p+"','"+hash(b)+"');");
    await verifyPrivate(source,p,b);
  }
  const expected=JSON.parse(sql(source,rowsQuery));
  const backupAt=Date.now();
  // Full synthetic application schema, data, grants and policies. Not a production DB dump.
  const dump=run("docker",["exec",source.db,"pg_dump","-U","postgres","-d","postgres","-Fc","-n","w09_fixture"],source.dir);
  assert.ok(dump.length>0);
  writeFileSync(join(root,"database.dump"),dump,{mode:0o600});
  const fileManifest=[];
  for(const [p,b] of payloads) {
    const actual=await ok(source,readPath(p));
    assert.equal(hash(actual),hash(b));
    const filename="object-"+fileManifest.length+".bin";
    writeFileSync(join(root,filename),actual,{mode:0o600});
    fileManifest.push({path:p,filename,sha256:hash(actual),bytes:actual.length});
  }
  const manifest={backupAt:new Date(backupAt).toISOString(),databaseSha256:hash(dump),rows:expected,files:fileManifest};
  writeFileSync(join(root,"manifest.json"),JSON.stringify(manifest,null,2),{mode:0o600});
  record("backup_completed",{rows:expected.length,objects:fileManifest.length});
  // One acknowledged post-backup change; deliberate loss at restore point.
  const late=Buffer.from("after snapshot");
  await upload(source,latePath,late);
  sql(source,"insert into w09_fixture.records values(3,'tenant-a','"+latePath+"','"+hash(late)+"');");
  assert.equal(JSON.parse(sql(source,rowsQuery)).length,3);
  const incidentAt=Date.now();
  record("simulated_incident",{sourceRows:3,sourceObjects:3});
  stop(source);
  record("starting_target");
  const target=start("w09-target-"+suffix);
  record("target_storage_readiness");
  await waitForStorage(target);
  assert.notEqual(source.db,target.db);
  assert.equal(sql(target,"select coalesce(to_regnamespace('w09_fixture')::text,'');"),"");
  assert.equal(sql(target,"select count(*) from storage.buckets where id='w09-private';"),"0");
  record("clean_target_ready");
  const restoredDump=readFileSync(join(root,"database.dump"));
  assert.equal(hash(restoredDump),manifest.databaseSha256);
  run("docker",["exec","-i",target.db,"pg_restore","-U","postgres","-d","postgres","--exit-on-error"],target.dir,restoredDump);
  record("restore_storage_bytes");
  await createBucket(target);
  for(const f of manifest.files) {
    const bytes=readFileSync(join(root,f.filename));
    assert.equal(hash(bytes),f.sha256);
    assert.equal(bytes.length,f.bytes);
    await upload(target,f.path,bytes);
    await verifyPrivate(target,f.path,bytes);
  }
  assert.deepEqual(JSON.parse(sql(target,rowsQuery)),manifest.rows);
  assert.equal(sql(target,"select public from storage.buckets where id='w09-private';"),"f");
  assert.equal(sql(target,"select count(*) from storage.objects where bucket_id='w09-private';"),"2");
  for(const tenant of ["tenant-a","tenant-b"]) checkRls(target,tenant);
  assert.equal(sql(target,"select count(*) from w09_fixture.records where id=3;"),"0");
  const absent=await request(target,readPath(latePath));
  assert.ok([400,404].includes(absent.status),"post-backup file should be absent");
  const result={status:"PASS_SYNTHETIC_LOCAL",rtoMs:Date.now()-incidentAt,recoveryPointAgeMs:incidentAt-backupAt,restoredRows:2,restoredPrivateObjects:2,expectedLostRows:1,expectedLostObjects:1,anonymousDenials:4,rlsChecks:2};
  record("validated",result);
  stop(target);
  record("target_disposed");
  console.log(JSON.stringify(result)); // Safe public CI summary; no paths, tokens or customer data.
} catch(e) {
  const failedPhase=phase;
  record("failure",{phase:failedPhase,reason:e.message});
  console.error("W09 drill failed in "+failedPhase+": "+e.message);
  process.exitCode=1;
} finally {
  for(const s of stacks.reverse()) if(!s.stopped) {
    try { stop(s); } catch { console.error("Local cleanup failed: inspect disposable Docker host"); process.exitCode=1; }
  }
  // Keep only private log if explicitly requested on an operator-controlled host.
  // CI never uploads it. All backup payloads are synthetic and removed.
  if(process.env.W09_KEEP_PRIVATE_LOG==="1" && !process.env.GITHUB_ACTIONS) {
    const destination=join(process.cwd(),"w09-private-drill-"+randomUUID()+".json");
    writeFileSync(destination,JSON.stringify(log,null,2),{mode:0o600,flag:"wx"});
    console.log("Private drill log saved to operator working directory.");
  }
  rmSync(root,{recursive:true,force:true});
}
