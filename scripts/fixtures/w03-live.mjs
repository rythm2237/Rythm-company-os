import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {buildW03Blueprint} from './w03-blueprint.mjs';
import {extendedMatrix} from './w03-extended.mjs';
import {routeWave} from './w03-route-wave.mjs';
import {oauthBoundaryMatrix} from '../validate-w03-oauth-boundary.mjs';
import {validationRuntimeMatrix} from './w03-validation-runtime.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const b=buildW03Blueprint(),url=process.env.W03_STAGING_SUPABASE_URL;
assert.equal(url,'https://viqjdgohtxqkrdgwtull.supabase.co');
assert.notEqual(process.env.VERCEL_ENV,'production');
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,process.env.W03_STAGING_SERVICE_ROLE_KEY,opts);
const checks=[];let phase='startup',server;
const record=(surface,operation,actor,target,ok,detail='')=>{checks.push({surface,operation,actor,target,ok,detail});assert.ok(ok,`${surface}/${operation}/${actor}/${target}/${detail}`);};
const unwrap=(r,label)=>{if(r.error)throw Error(label+':'+r.error.code);return r.data;};
const clients=new Map(),cookies=new Map(),seeds=new Map();
const api='http://localhost:3103';
async function http(actor,path,options={}){return fetch(api+path,{...options,redirect:'manual',headers:{cookie:cookies.get(actor),origin:api,...options.headers}});}
try{
 phase='login';
 for(const u of b.users){
  const c=createClient(url,process.env.W03_STAGING_ANON_KEY,opts);
  const s=unwrap(await c.auth.signInWithPassword({email:u.email,password:process.env.W03_TEST_PASSWORD}),'login');
  assert.ok(s.session?.access_token);clients.set(u.key,{client:c,user:s.user});
  const text='base64-'+Buffer.from(JSON.stringify(s.session)).toString('base64url');
  const name='sb-viqjdgohtxqkrdgwtull-auth-token';
  cookies.set(u.key,Array.from({length:Math.ceil(text.length/3000)},(_,i)=>name+'.'+i+'='+text.slice(i*3000,(i+1)*3000)).join('; '));
 }
 phase='server';
 const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:process.env.W03_STAGING_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:process.env.W03_STAGING_SERVICE_ROLE_KEY,RYTHM_AGENT_EXECUTION_ENABLED:'false',RYTHM_EXTERNAL_ACTIONS_ENABLED:'false',OPENAI_API_KEY:'',ANTHROPIC_API_KEY:'',GEMINI_API_KEY:'',NEXT_TELEMETRY_DISABLED:'1'};
 if(process.argv.includes('--routes-only'))Object.assign(env,{NODE_OPTIONS:((process.env.NODE_OPTIONS??'')+' --import '+pathToFileURL(resolve('scripts/fixtures/w03-egress-guard.mjs')).href).trim(),W03_EGRESS_LOG:resolve('.w03-evidence/egress.jsonl'),CRON_SECRET:'W03_SYNTHETIC_CRON',CLOUDFLARE_EMAIL_WORKER_SECRET:'W03_SYNTHETIC_INGEST',RESEND_WEBHOOK_SECRET:'whsec_VzAzX1NZTlRIRVRJQw=='});
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','localhost','--port','3103'],{env,stdio:'ignore'});
 for(let i=0;i<90;i++){try{await fetch(api+'/api/crm/leads');break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 phase='seed';
 for(const org of b.companies){
  const {client:c,user}=clients.get(org.key+'_owner');
  unwrap(await c.rpc('set_active_organization',{target_org_id:org.id}),'active');
  for(const capability of ['contract.create','contract.read','contract.update','finance.create','finance.read','finance.update'])unwrap(await c.from('crm_access_grants').insert({organization_id:org.id,principal_type:'user',principal_id:user.id,capability,resource_type:'company',resource_id:org.id,granted_by:user.id}),'grant');
  // W01 schema restore intentionally has no global completion-policy reference rows.
  // Keep the fixture policy tenant-bound, with all default evidence/acceptance gates enabled.
  const completionPolicy=randomUUID();
  unwrap(await admin.from('project_completion_policies').insert({id:completionPolicy,organization_id:org.id,code:'w03_synthetic',name:'W03 synthetic isolation fixture',acceptance_authority:'project_owner'}),'seed fixture completion policy');
  unwrap(await c.from('projects').update({completion_policy_id:completionPolicy}).eq('organization_id',org.id).eq('id',org.projectId),'bind fixture completion policy');
  const customer=randomUUID(),executionId=randomUUID();
  const rows=[
   ['projects',{id:org.projectId,organization_id:org.id}],
   ['project_executions',{id:executionId,organization_id:org.id,project_id:org.projectId,execution_no:1,status:'cancelled'}],
   ['project_task_runs',{id:randomUUID(),organization_id:org.id,project_id:org.projectId,execution_id:executionId,task_key:'W03-synthetic',title:'W03-SENTINEL-'+org.key,idempotency_key:'W03-'+randomUUID(),status:'cancelled'}],
   ['crm_accounts',{id:customer,organization_id:org.id,name:'W03-SENTINEL-'+org.key}],
   ['project_contracts',{id:randomUUID(),organization_id:org.id,customer_id:customer,contract_number:'W03-'+org.key,contract_value:1}],
   ['finance_invoices',{id:randomUUID(),organization_id:org.id,customer_id:customer,internal_reference:'W03-'+org.key,total:1}],
   ['company_memory',{id:randomUUID(),organization_id:org.id,memory_type:'test',title:'W03-SENTINEL-'+org.key,content:{synthetic:true},source_type:'test'}],
   ['company_knowledge',{id:randomUUID(),organization_id:org.id,title:'W03-SENTINEL-'+org.key,content:'synthetic knowledge',created_by:user.id}],
   ['project_decision_memory',{id:randomUUID(),organization_id:org.id,project_id:org.projectId,decision:'W03-SENTINEL-'+org.key,decision_maker_type:'test'}],
   ['action_items',{id:randomUUID(),organization_id:org.id,title:'W03-SENTINEL-'+org.key}],
   ['notifications',{id:randomUUID(),organization_id:org.id,user_id:user.id,category:'test',title:'W03-SENTINEL-'+org.key}],
  ];
  for(const [table,row] of rows){if(table!=='projects')unwrap(await (['crm_accounts','project_contracts','finance_invoices'].includes(table)?c:admin).from(table).insert(row),'seed '+table);}
  const form=new FormData();form.set('projectId',org.projectId);form.set('category','other');form.append('files',new Blob(['W03-FILE-'+org.key],{type:'text/plain'}),'synthetic.txt');
  const uploaded=await http(org.key+'_owner','/api/projects/files',{method:'POST',body:form});
  record('files','own-upload',org.key,org.key,uploaded.status===200,'status-'+uploaded.status);
  const doc=(await uploaded.json()).files[0];
  const metadata=unwrap(await admin.from('project_documents').select('*').eq('id',doc.id).single(),'metadata');
  rows.push(['project_documents',{id:doc.id,organization_id:org.id,project_id:org.projectId,category:'other',file_name:'synthetic.txt',storage_path:metadata.storage_path}]);
  seeds.set(org.key,rows);
  for(const [table,row] of rows){const own=await c.from(table).select('id').eq('id',row.id);record(table,'owner-positive-read',org.key,org.key,!own.error&&own.data?.length===1);}
  const downloaded=await http(org.key+'_owner','/api/crm/documents/'+doc.id);record('files','own-download',org.key,org.key,downloaded.status===200&&(await downloaded.text())==='W03-FILE-'+org.key);
 }
 if(process.argv.includes('--oauth-only')){
  phase='validation-runtime';await validationRuntimeMatrix({b,clients,admin,http,record,unwrap});
  phase='oauth-real-auth-rls';await oauthBoundaryMatrix({b,clients,admin,http,record,unwrap});
 }else if(process.argv.includes('--routes-only')){
  phase='remaining-route-wave';await routeWave({b,clients,admin,http,record,unwrap,seeds});
 }else if(process.argv.includes('--extended-only')){
  phase='extended-matrix';await extendedMatrix({b,clients,admin,http,record,unwrap,seeds});
  assert.ok(checks.every(x=>x.ok),'Extended matrix has failing cases');
 }else{
 phase='workspace-memory';
 const workspaceSeeds=new Map();
 for(const org of b.companies){
  const actor=org.key+'_owner';
  const projects=await http(actor,'/api/ai-workspace/resources/projects');
  record('workspace-memory','projects-positive',actor,org.key,projects.status===200,'status-'+projects.status);
  const project=(await projects.json()).items[0];assert.ok(project?.id);
  const created=await http(actor,'/api/ai-workspace/resources/memories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id,title:'W03-MEMORY-'+org.key,content:'synthetic memory'})});
  record('workspace-memory','own-create',actor,org.key,created.status===201,'status-'+created.status);
  const memory=(await created.json()).item;assert.ok(memory?.id);workspaceSeeds.set(org.key,{projectId:project.id,memoryId:memory.id});
 }
 for(const u of b.users){
  const listed=await http(u.key,'/api/ai-workspace/resources/memories');
  record('workspace-memory','own-list',u.key,'personal',listed.status===200,'status-'+listed.status);
  const ownData=await listed.text();
  if(u.key.endsWith('_owner'))record('workspace-memory','own-payload',u.key,u.key[0],ownData.includes('W03-MEMORY-'+u.key[0]));
  for(const org of b.companies){
   if(u.key===org.key+'_owner')continue;
   const seed=workspaceSeeds.get(org.key);
   record('workspace-memory','foreign-read',u.key,org.key,!ownData.includes('W03-MEMORY-'+org.key));
   const directRead=await clients.get(u.key).client.from('aiw_memories').select('id').eq('id',seed.memoryId);
   record('workspace-memory','direct-READ',u.key,org.key,directRead.error?.code==='42501');
   const directUpdate=await clients.get(u.key).client.from('aiw_memories').update({title:'W03-denied'}).eq('id',seed.memoryId).select('id');
   record('workspace-memory','direct-UPDATE',u.key,org.key,directUpdate.error?.code==='42501');
   const directDelete=await clients.get(u.key).client.from('aiw_memories').delete().eq('id',seed.memoryId).select('id');
   record('workspace-memory','direct-DELETE',u.key,org.key,directDelete.error?.code==='42501');
   const foreignMemory=unwrap(await admin.from('aiw_memories').select('workspace_id').eq('id',seed.memoryId).single(),'memory fixture workspace');
   const directInsert=await clients.get(u.key).client.from('aiw_memories').insert({id:randomUUID(),workspace_id:foreignMemory.workspace_id,project_id:seed.projectId,scope:'project',title:'W03-forged',content:'synthetic'}).select('id');
   record('workspace-memory','direct-INSERT',u.key,org.key,directInsert.error?.code==='42501');
   const forged=await http(u.key,'/api/ai-workspace/resources/memories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:seed.projectId,title:'W03-FORGED',content:'synthetic foreign project reference'})});
   record('workspace-memory','foreign-project-insert',u.key,org.key,forged.status===404,'status-'+forged.status);
   const forbiddenRows=unwrap(await admin.from('aiw_memories').select('id').eq('created_by',clients.get(u.key).user.id).eq('project_id',seed.projectId),'foreign memory poststate');
   record('workspace-memory','no-foreign-association',u.key,org.key,forbiddenRows.length===0);
   const removed=await http(u.key,'/api/ai-workspace/resources/memories?id='+seed.memoryId,{method:'DELETE'});
   const remaining=unwrap(await admin.from('aiw_memories').select('id').eq('id',seed.memoryId).single(),'workspace memory sentinel');
   record('workspace-memory','foreign-delete-noop',u.key,org.key,removed.status===200&&remaining.id===seed.memoryId);
  }
 }
 phase='negative-matrix';
 for(const u of b.users){
  const {client:c}=clients.get(u.key);console.log(JSON.stringify({actor:u.key,checksCompleted:checks.length}));
  const home=b.memberships.find(m=>m.userKey===u.key);
  unwrap(await c.rpc('set_active_organization',{target_org_id:b.companies.find(x=>x.key===home.companyKey).id}),'actor context');
  for(const table of ['project_contracts','finance_invoices']){const r=await c.from(table).select('id').eq('organization_id',b.companies.find(x=>x.key===home.companyKey).id);const expected=u.key.endsWith('_owner')||(table==='finance_invoices'&&u.key.endsWith('_finance_authorized'))?1:0;record(table,'same-tenant-role',u.key,home.companyKey,!r.error&&r.data?.length===expected);}
  const own=await http(u.key,'/api/crm/leads');record('api-auth','session-positive',u.key,home.companyKey,own.status===200,'status-'+own.status);
  for(const org of b.companies){
   if(b.memberships.some(m=>m.userKey===u.key&&m.companyKey===org.key))continue;
   const forgedProject=await c.from('projects').insert({id:randomUUID(),organization_id:org.id,project_code:'W03-forged-'+randomUUID(),name:'W03 forged project',status:'planning',engagement_type:'internal',primary_manager_user_id:clients.get(org.key+'_project_manager').user.id,created_by_user_id:clients.get(u.key).user.id}).select('id');record('projects','INSERT',u.key,org.key,forgedProject.error?.code==='42501'||(forgedProject.error?.code==='P0001'&&forgedProject.error.message==='Project ownership permission required'),forgedProject.error?.code??'');
   const switched=await c.rpc('set_active_organization',{target_org_id:org.id});record('role-switch','foreign-denied',u.key,org.key,!!switched.error);
   for(const [table,row] of seeds.get(org.key)){
    const read=await c.from(table).select('id').eq('id',row.id);record(table,'READ',u.key,org.key,!read.error&&read.data?.length===0);
    const update=await c.from(table).update({id:row.id}).eq('id',row.id).select('id');record(table,'UPDATE',u.key,org.key,update.error?.code==='42501'||(!update.error&&update.data?.length===0),update.error?.code??'');
    const del=await c.from(table).delete().eq('id',row.id).select('id');record(table,'DELETE',u.key,org.key,del.error?.code==='42501'||(!del.error&&del.data?.length===0),del.error?.code??'');
    if(table!=='projects'){
     const forged={...row,id:randomUUID()};for(const key of ['name','title','internal_reference','contract_number','task_key','idempotency_key'])if(key in forged)forged[key]='W03-forged-'+randomUUID();if('execution_no' in forged)forged.execution_no=2;if('storage_path' in forged)forged.storage_path=org.id+'/'+org.projectId+'/'+randomUUID()+'-synthetic.txt';const insert=await c.from(table).insert(forged).select('id');record(table,'INSERT',u.key,org.key,insert.error?.code==='42501',insert.error?.code??'');
    }
    const remain=unwrap(await admin.from(table).select('id').eq('id',row.id).single(),'sentinel remains');assert.equal(remain.id,row.id);
   }
   for(const [path,options] of [
    ['/api/projects/live?projectId='+org.projectId,{}],
    ['/api/projects/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:org.projectId,action:'pause'})}],
    ['/api/crm/documents/'+seeds.get(org.key).find(x=>x[0]==='project_documents')[1].id,{}],
    ['/api/privacy/export?organizationId='+org.id,{}],
    ['/api/projects/completion?projectId='+org.projectId,{}],
    ['/api/projects/roadmap?projectId='+org.projectId,{}],
    ...['run','analyze','roadmap','completion','connections','approval-advice','approval-discussion'].map(route=>['/api/projects/'+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:org.projectId,action:route==='roadmap'?'request_changes':'evaluate',roadmapId:randomUUID(),integrationId:randomUUID(),resourceRef:'synthetic',approvalId:randomUUID(),message:'synthetic',content:'synthetic'})}]),
   ]){const r=await http(u.key,path,options);record('http-api','foreign-object',u.key,org.key,[403,404].includes(r.status),path.split('?')[0]+' status-'+r.status);}
   const deniedForm=new FormData();deniedForm.set('projectId',org.projectId);deniedForm.set('category','other');deniedForm.append('files',new Blob(['W03-denied'],{type:'text/plain'}),'denied.txt');const deniedUpload=await http(u.key,'/api/projects/files',{method:'POST',body:deniedForm});record('files','foreign-upload',u.key,org.key,[403,404].includes(deniedUpload.status));
   const doc=seeds.get(org.key).find(x=>x[0]==='project_documents')[1];
   const write=await c.storage.from('project-files').upload(org.id+'/'+org.projectId+'/'+randomUUID()+'-denied.txt',new Blob(['denied'],{type:'text/plain'}));record('storage','foreign-write',u.key,org.key,!!write.error);
   const rpc=await c.rpc('crm_agent_customer_context',{p_organization_id:org.id,p_customer_id:seeds.get(org.key).find(x=>x[0]==='crm_accounts')[1].id,p_agent_id:randomUUID(),p_user_id:clients.get(u.key).user.id,p_include_contracts:true,p_include_finance:true});record('privileged-rpc','agent-context-denied',u.key,org.key,!!rpc.error);
   const file=await c.storage.from('project-files').download(doc.storage_path);record('storage','foreign-bytes',u.key,org.key,!!file.error);
   const signed=await c.storage.from('project-files').createSignedUrl(doc.storage_path,30);record('storage','foreign-signed-url',u.key,org.key,!!signed.error);
  }
  const dispatch=await http(u.key,'/api/projects/dispatch',{headers:{authorization:'Bearer '+(await c.auth.getSession()).data.session.access_token}});record('background-job','user-token-denied',u.key,home.companyKey,dispatch.status===401);
  const exported=await http(u.key,'/api/crm/customers/export');
  if(u.key.endsWith('_owner')){const data=await exported.text();record('export','own-positive',u.key,home.companyKey,exported.status===200&&data.includes('W03-SENTINEL-'+home.companyKey));for(const o of b.companies.filter(o=>o.key!==home.companyKey))record('export','no-foreign',u.key,o.key,!data.includes('W03-SENTINEL-'+o.key));}
  else record('export','nonowner-denied',u.key,home.companyKey,exported.status===403);
 }
 phase='shared-switch';
 for(const org of b.companies.slice(0,2)){const c=clients.get('shared').client;assert.equal(unwrap(await c.rpc('set_active_organization',{target_org_id:org.id}),'shared switch'),org.id);const r=await http('shared','/api/crm/leads');record('role-switch','shared-context', 'shared',org.key,r.status===200);const memberships=unwrap(await c.rpc('list_my_organizations'),'shared roles');record('role-switch','role-bound', 'shared',org.key,memberships.find(m=>m.organization_id===org.id)?.membership_role===(org.key==='A'?'executive':'operator'));}
 phase='extended-matrix';await extendedMatrix({b,clients,admin,http,record,unwrap,seeds});
 assert.ok(checks.every(x=>x.ok),'Combined matrix has failing cases');
 }
 phase='finished';
}catch(e){checks.push({phase,ok:false,error:String(e.message).replace(/eyJ\S+/g,'[redacted]')});process.exitCode=1;}
finally{server?.kill();mkdirSync('.w03-evidence',{recursive:true});writeFileSync('.w03-evidence/result.json',JSON.stringify({phase,checks,pass:checks.filter(x=>x.ok).length,fail:checks.filter(x=>!x.ok).length,scope:'Real staging REST RLS and local Next HTTP; not published preview parity or complete API inventory'},null,2));console.log(JSON.stringify({phase,pass:checks.filter(x=>x.ok).length,fail:checks.filter(x=>!x.ok).length,last:checks.at(-1)}));}
