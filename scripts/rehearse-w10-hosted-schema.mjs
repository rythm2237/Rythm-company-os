// Offline-only replay of a read-only hosted catalog export. Never connects to a server.
// Private catalog inputs are not committed or printed. No customer rows are accepted.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const pgliteModule=process.env.W10_PGLITE_MODULE??'@electric-sql/pglite';
const {PGlite}=await import(pgliteModule);
const [snapshotPath,extraPath,queryPath,outputPath]=process.argv.slice(2);
if(!outputPath)throw new Error('Usage: node script snapshot.json extra.json catalog-query.sql summary.json');
const snapshot=JSON.parse(await readFile(snapshotPath,'utf8'));
const extra=JSON.parse(await readFile(extraPath,'utf8'));
const query=await readFile(queryPath,'utf8');
const qi=s=>'"'+String(s).replaceAll('"','""')+'"';
const ql=s=>"'"+String(s).replaceAll("'","''")+"'";
const rel=o=>qi(o.schema)+'.'+qi(o.name);
const target=o=>qi(o.schema)+'.'+qi(o.name)+'('+o.identity_args+')';
const extensions=Object.fromEntries(['pgcrypto','uuid-ossp','btree_gist'].map(name=>[name,{name,setup:async()=>({bundlePath:new URL(name+'.tar.gz',import.meta.resolve(pgliteModule))})}]));
const db=new PGlite({extensions});
let phase='bootstrap';let currentObject='';let failed=false;
const summary={source:'live production schema catalog, no customer data',engine:'PGlite/PostgreSQL',stages:[],network_calls:0,customer_rows_copied:0,provider_calls:0};
async function exec(sql,label=''){currentObject=label;return db.exec(sql);}
async function stage(name,work){phase=name;console.log('W10 hosted-schema phase: '+name);await work();summary.stages.push({name,status:'PASS'});}
try{
 await stage('bootstrap',async()=>{
  assert.equal(extra.unhandled_types?.length??0,0,'Exporter does not support custom domains/standalone composites');
  assert.equal(extra.table_kinds?.length??0,0,'Exporter does not support partitioned/foreign/materialized relations');
  summary.engine_version=(await db.query('select version() as version')).rows[0].version;
  summary.engine_version_num=Number((await db.query("select current_setting('server_version_num') as version")).rows[0].version);
  assert.equal(Math.floor(summary.engine_version_num/10000),17,'Rehearsal must use PostgreSQL 17 like the hosted source');
  await exec("set check_function_bodies=false; set search_path=public; create schema if not exists auth; create schema if not exists storage; create schema if not exists extensions; create schema if not exists crm_private;");
  for(const r of extra.roles){
   if((await db.query('select 1 from pg_roles where rolname=$1',[r.name])).rows.length)continue;
   await exec(`create role ${qi(r.name)} NOLOGIN ${r.inherit?'INHERIT':'NOINHERIT'} ${r.bypassrls?'BYPASSRLS':'NOBYPASSRLS'}`,'role '+r.name);
  }
  for(const m of extra.memberships??[])await exec(`grant ${qi(m.role)} to ${qi(m.member)}${m.admin?' with admin option':''}`,'membership');
  for(const name of Object.keys(extensions))await exec(`create extension if not exists ${qi(name)} with schema extensions`,'extension '+name);
  for(const t of snapshot.enums)await exec(`create type ${rel(t)} as enum (${t.labels.map(ql).join(',')})`,'enum '+t.name);
 });
 const identitySequences=new Set((extra.sequence_ownership??[]).filter(s=>s.kind==='i').map(s=>s.sequence_schema+'.'+s.sequence));
 await stage('tables-and-sequences',async()=>{
  for(const s of snapshot.sequences.filter(s=>!identitySequences.has(s.schema+'.'+s.name)))await exec(`create sequence ${rel(s)} as ${s.type} start with ${s.start} increment by ${s.increment} minvalue ${s.min} maxvalue ${s.max} cache ${s.cache} ${s.cycle?'cycle':'no cycle'}`,'sequence '+s.name);
  for(const t of snapshot.tables){
   const cols=t.columns.map(c=>qi(c.name)+' '+c.type+(c.collation?' collate '+c.collation:'')+(c.identity?` generated ${c.identity==='a'?'always':'by default'} as identity`:c.generated?` generated always as (${c.default}) stored`:'')+(c.not_null?' not null':''));
   await exec(`create table ${rel(t)} (${cols.join(',')})`,'table '+t.schema+'.'+t.name);
  }
  for(const s of snapshot.sequences)await exec(`alter sequence ${rel(s)} start with ${s.start} increment by ${s.increment} minvalue ${s.min} maxvalue ${s.max} cache ${s.cache} ${s.cycle?'cycle':'no cycle'}`,'sequence options '+s.name);
 });
 await stage('functions-and-defaults',async()=>{
  for(const f of snapshot.functions)await exec(f.definition,'function '+f.schema+'.'+f.name);
  for(const t of snapshot.tables)for(const c of t.columns)if(c.default&&!c.identity&&!c.generated)await exec(`alter table ${rel(t)} alter column ${qi(c.name)} set default ${c.default}`,'default '+t.name+'.'+c.name);
  for(const s of (extra.sequence_ownership??[]).filter(s=>s.kind==='a'))await exec(`alter sequence ${qi(s.sequence_schema)}.${qi(s.sequence)} owned by ${qi(s.table_schema)}.${qi(s.table)}.${qi(s.column)}`,'sequence owner');
 });
 await stage('views-constraints-and-indexes',async()=>{
  let remaining=[...snapshot.views];
  for(let attempt=0;remaining.length&&attempt<snapshot.views.length+1;attempt++){
   const next=[];
   for(const v of remaining)try{await exec(`create view ${rel(v)}${v.options?.length?' with ('+v.options.join(',')+')':''} as ${v.definition}`,'view '+v.name);}catch(e){if(attempt===snapshot.views.length)throw e;next.push(v);}
   remaining=next;
  }
  assert.equal(remaining.length,0,'All source views must be restored');
  for(const c of snapshot.constraints.filter(c=>c.kind!=='f'))await exec(`alter table ${qi(c.schema)}.${qi(c.table)} add constraint ${qi(c.name)} ${c.definition}`,'constraint '+c.table+'.'+c.name);
  for(const i of snapshot.indexes)await exec(i.definition,'index '+i.name);
  for(const c of snapshot.constraints.filter(c=>c.kind==='f'))await exec(`alter table ${qi(c.schema)}.${qi(c.table)} add constraint ${qi(c.name)} ${c.definition}`,'constraint '+c.table+'.'+c.name);
 });
 await stage('policies-triggers-and-owners',async()=>{
  for(const p of snapshot.policies)await exec(`create policy ${qi(p.policyname)} on ${qi(p.schemaname)}.${qi(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(r=>r==='public'?'PUBLIC':qi(r)).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''}`,'policy '+p.policyname);
  for(const t of snapshot.triggers){
   await exec(t.definition,'trigger '+t.name);
   if(t.enabled!=='O')await exec(`alter table ${qi(t.schema)}.${qi(t.table)} ${t.enabled==='D'?'disable':'enable '+(t.enabled==='A'?'always':'replica')} trigger ${qi(t.name)}`,'trigger state');
  }
  for(const t of snapshot.tables){
   if(t.rls)await exec(`alter table ${rel(t)} enable row level security`,'RLS '+t.name);
   if(t.force_rls)await exec(`alter table ${rel(t)} force row level security`,'force RLS '+t.name);
   await exec(`alter table ${rel(t)} owner to ${qi(t.owner)}`,'owner '+t.name);
  }
  for(const v of snapshot.views)await exec(`alter view ${rel(v)} owner to ${qi(v.owner)}`,'view owner');
  for(const f of snapshot.functions)await exec(`alter function ${target(f)} owner to ${qi(f.owner)}`,'function owner');
  for(const [schema,owner]of new Map(extra.schema_acls.map(a=>[a.schema,a.owner])))await exec(`alter schema ${qi(schema)} owner to ${qi(owner)}`,'schema owner');
 });
 await stage('actual-grants-and-default-acls',async()=>{
  for(const schema of ['public','auth','storage','crm_private','extensions'])await exec(`revoke all on schema ${qi(schema)} from public`,'schema ACL');
  for(const a of extra.schema_acls??[])await exec(`grant ${a.privilege} on schema ${qi(a.schema)} to ${a.grantee==='PUBLIC'?'PUBLIC':qi(a.grantee)}${a.grantable?' with grant option':''}`,'schema grant');
  for(const f of snapshot.functions)await exec(`revoke all on function ${target(f)} from public`,'function revoke');
  for(const a of snapshot.function_acls)await exec(`grant ${a.privilege} on function ${target(a)} to ${a.grantee==='PUBLIC'?'PUBLIC':qi(a.grantee)}${a.grantable?' with grant option':''}`,'function ACL');
  for(const a of snapshot.relation_acls)await exec(`grant ${a.privilege} on ${a.kind==='S'?'sequence':'table'} ${rel(a)} to ${a.grantee==='PUBLIC'?'PUBLIC':qi(a.grantee)}${a.grantable?' with grant option':''}`,'relation ACL');
  for(const a of snapshot.column_acls??[])await exec(`grant ${a.privilege} (${qi(a.column)}) on table ${rel(a)} to ${a.grantee==='PUBLIC'?'PUBLIC':qi(a.grantee)}${a.grantable?' with grant option':''}`,'column ACL');
  const kinds={r:'TABLES',S:'SEQUENCES',f:'FUNCTIONS',T:'TYPES'};
  for(const a of extra.default_acls??[])await exec(`alter default privileges for role ${qi(a.owner)} in schema ${qi(a.schema)} grant ${a.privilege} on ${kinds[a.kind]} to ${a.grantee==='PUBLIC'?'PUBLIC':qi(a.grantee)}${a.grantable?' with grant option':''}`,'default ACL');
 });
 function canonical(value,key=''){
  if(Array.isArray(value)){const array=value.map(v=>canonical(v));return ['columns','labels'].includes(key)?array:array.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v,k)]));
  return value;
 }
 async function supportingAcls(){
  const actual=(await db.query(`select jsonb_build_object(
   'schema_acls',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'owner',pg_get_userbyid(n.nspowner),'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'privilege',x.privilege_type,'grantable',x.is_grantable)) from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x where n.nspname in ('public','auth','storage','crm_private','extensions')),
   'default_acls',(select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'kind',d.defaclobjtype,'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'privilege',x.privilege_type,'grantable',x.is_grantable)) from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace cross join lateral aclexplode(d.defaclacl) x where n.nspname in ('public','auth','storage'))
  ) as acls`)).rows[0].acls;
  return ['schema_acls','default_acls'].map(key=>{assert.deepEqual(canonical(actual[key]),canonical(extra[key]),'Exact source '+key);return {kind:key,equal:true,count:extra[key].length};});
 }
 await stage('catalog-equality-before-migrations',async()=>{
  const actual=(await db.query(query)).rows[0].snapshot;
  summary.catalog_counts={};summary.catalog_comparisons=[];
  for(const [key,expected]of Object.entries(snapshot)){
   summary.catalog_counts[key]=expected?.length??0;
   const e=JSON.stringify(canonical(expected)),a=JSON.stringify(canonical(actual[key]));
   const same=e===a;summary.catalog_comparisons.push({kind:key,equal:same,expected_count:expected?.length??0,actual_count:actual[key]?.length??0});
   if(!same){
    const es=canonical(expected),as=canonical(actual[key]);
    const diff=es.filter(x=>!as.some(y=>JSON.stringify(x)===JSON.stringify(y)));
    console.error('Catalog mismatch kind='+key+' missing_or_different='+diff.length);
    await writeFile(outputPath+'.private-diff.json',JSON.stringify({key,expected:diff,actual:as.filter(x=>!es.some(y=>JSON.stringify(x)===JSON.stringify(y)))},null,2));
   }
   assert.equal(same,true,'Exact source catalog equality required for '+key);
  }
  summary.catalog_sha256=createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex');
  summary.supporting_acl_comparisons=await supportingAcls();
 });
 const mappings=[['advertising_account_manager','b2b_marketing'],['advertising_content_specialist','content_marketing'],['advertising_copywriter','content_marketing'],['advertising_performance_marketing','performance_marketing'],['advertising_strategy_director','b2b_marketing']];
 await stage('synthetic-product-fixtures',async()=>{
  for(const key of new Set(mappings.map(m=>m[1])))await db.query("insert into public.role_specializations(role_family,specialization_key,title,version,active) values('marketing',$1,'W10 synthetic specialization','1.0',true)",[key]);
  for(const [index,[key]]of mappings.entries())await db.query("insert into public.agent_templates(template_key,version,name,role,role_code,purpose,system_instructions_template,role_family,default_specializations) values($1,'1.0','W10 synthetic template','Specialist',$2,'Synthetic replay','No external actions','marketing',array[]::text[])",[key,'W10-'+index]);
 });
 await stage('ten-forward-migrations',async()=>{
  const manifest=JSON.parse(await readFile('docs/security/evidence/w10-2026-11-19-migration-manifest.json','utf8'));
  assert.equal(manifest.payloads.length,10);summary.migrations=[];
  for(const entry of manifest.payloads){
   const sql=await readFile(entry.path,'utf8');assert.equal(createHash('sha256').update(sql).digest('hex'),entry.sha256,'Reviewed migration payload checksum');
   await exec(sql,'migration '+entry.path);summary.migrations.push({path:entry.path,sha256:entry.sha256,status:'PASS'});
  }
  for(const [key,specialization]of mappings){const row=(await db.query('select default_specializations from public.agent_templates where template_key=$1 and version=$2',[key,'1.0'])).rows[0];assert.deepEqual(row.default_specializations,[specialization]);}
  const acl=(await db.query("select has_function_privilege('authenticated','public.assign_project_specialist_v1(uuid,uuid,integer)','execute') as owner_assign,has_function_privilege('anon','public.assign_project_specialist_v1(uuid,uuid,integer)','execute') as anon_assign,has_function_privilege('service_role','public.complete_project_task_work_v1(uuid,uuid,uuid,text,jsonb,jsonb)','execute') as worker_complete,has_function_privilege('authenticated','public.complete_project_task_work_v1(uuid,uuid,uuid,text,jsonb,jsonb)','execute') as user_complete")).rows[0];
  assert.deepEqual(acl,{owner_assign:true,anon_assign:false,worker_complete:true,user_complete:false});summary.new_rpc_acl=acl;
 });
 await stage('installed-schema-role-and-lifecycle-smoke',async()=>{
  await exec(await readFile('scripts/w10-hosted-schema-role-smoke.sql','utf8'),'synthetic actual-schema smoke');
 });
 await stage('inverse-migration-rehearsal',async()=>{
  await exec(await readFile('docs/security/w10-release-schema-rollback-20261119.sql','utf8'),'captured inverse SQL');
  const actual=(await db.query(query)).rows[0].snapshot;
  summary.inverse_catalog_comparisons=[];
  for(const [key,expected]of Object.entries(snapshot)){
   const same=JSON.stringify(canonical(expected))===JSON.stringify(canonical(actual[key]));summary.inverse_catalog_comparisons.push({kind:key,equal:same});
   if(!same)await writeFile(outputPath+'.private-inverse-diff.json',JSON.stringify({key,expected,actual:actual[key]},null,2));
   assert.equal(same,true,'Inverse must restore actual pre-W10 source catalog: '+key);
  }
  for(const [key]of mappings)assert.deepEqual((await db.query('select default_specializations from public.agent_templates where template_key=$1',[key])).rows[0].default_specializations,[]);
  summary.inverse_supporting_acl_comparisons=await supportingAcls();
  assert.equal(Number((await db.query('select count(*) from auth.users')).rows[0].count),0,'Synthetic identity transaction rolled back');
  assert.equal(Number((await db.query('select count(*) from public.organizations')).rows[0].count),0,'Synthetic tenant transaction rolled back');
 });
 await writeFile(outputPath,JSON.stringify(summary,null,2)+'\n');
 console.log('PASS W10 hosted application-schema clone, ten forward migrations, real-role smoke and inverse catalog equality; no production/customer/provider changes');
}catch(error){
 failed=true;
 summary.failure={phase,object:currentObject,message:String(error.message).slice(0,500)};
 await writeFile(outputPath,JSON.stringify(summary,null,2)+'\n');
 console.error('FAIL W10 hosted-schema '+phase+' '+currentObject+': '+String(error.message).slice(0,300));process.exitCode=1;
}finally{await db.close();if(failed)process.exitCode=1;}
