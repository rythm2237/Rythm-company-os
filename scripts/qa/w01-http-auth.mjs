// Private synthetic session input only. Never prints passwords, access tokens or refresh tokens.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const path=process.argv[2], s=JSON.parse(readFileSync(path,'utf8'));
assert.equal(s.url,'https://viqjdgohtxqkrdgwtull.supabase.co');
assert.match(s.publishable_key,/^sb_publishable_/);
assert.equal(s.actors.length,23);
assert(s.actors.every(a=>/^w01-[a-z-]+@example\.invalid$/.test(a.email)));
const checks=[],errors=[],tokens=new Map();
const check=(name,ok)=>{checks.push({name,passed:!!ok});};
async function pool(items,fn){const queue=[...items];await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length){const item=queue.shift();try{await fn(item);}catch(e){errors.push(String(e.message));}}}));}
async function req(route,token,method='GET',body){
 const headers={apikey:s.publishable_key};if(token)headers.Authorization='Bearer '+token;
 if(body!==undefined)headers['Content-Type']='application/json';
 const r=await fetch(s.url+route,{headers,method,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
 let data=null;try{data=await r.json();}catch{}
 return {status:r.status,data};
}
const rows=(table,token,filter='')=>req('/rest/v1/'+table+'?select=id'+filter,token);
const eq=(r,ids)=>r.status===200&&Array.isArray(r.data)&&JSON.stringify(r.data.map(x=>x.id).sort())===JSON.stringify([...ids].sort());
const denied=r=>r.status===401||r.status===403;
const rpcDenied=(r,message)=>denied(r)||(r.status===400&&r.data?.code==='P0001'&&r.data?.message===message);
try{
 assert.equal((await req('/auth/v1/health')).status,200,'Staging Auth health');
 const bad=await Promise.all([req('/auth/v1/user'),req('/auth/v1/user','not-a-jwt'),rows('organizations','not-a-jwt'),req('/auth/v1/token?grant_type=password',null,'POST',{email:s.actors[0].email,password:randomUUID()})]);
 bad.forEach((r,i)=>check('invalid authentication '+i,i===3?[400,401].includes(r.status):denied(r)));
 await pool(s.actors,async a=>{
  const r=await req('/auth/v1/token?grant_type=password',null,'POST',{email:a.email,password:s.password});
  assert.equal(r.status,200,'Password login '+a.tag+' status '+r.status);
  assert(r.data.access_token&&r.data.refresh_token,'Token pair '+a.tag);
  const claims=JSON.parse(Buffer.from(r.data.access_token.split('.')[1],'base64url').toString());
  assert.equal(claims.role,'authenticated');assert.equal(claims.sub,a.id);
  tokens.set(a.tag,r.data);check(a.tag+': real normal-user login',r.data.user?.id===a.id);
  console.log(JSON.stringify({progress:'login',actor:a.tag}));
 });
 assert.equal(tokens.size,23,'All 23 real logins required');
 await pool(s.actors,async a=>{
  const token=tokens.get(a.tag).access_token;
  const visible=a.company?s.companies.filter(c=>c.key===a.company):a.tag==='shared'?s.companies.filter(c=>c.key!=='C'):[];
  const requests=[req('/auth/v1/user',token),rows('organizations',token),rows('crm_accounts',token),rows('projects',token),rows('finance_invoices',token),rows('project_contracts',token),req('/rest/v1/rpc/list_my_organizations',token,'POST',{})];
  if(a.company){const c=visible[0];requests.push(req('/rest/v1/projects?select=budget_cap_usd&id=eq.'+c.project_id,token),req('/rest/v1/rpc/crm_project_budget',token,'POST',{p_organization_id:c.id,p_project_id:c.project_id}));}
  const r=await Promise.all(requests);
  check(a.tag+': Auth verifies token',r[0].status===200&&r[0].data?.id===a.id);
  check(a.tag+': organization RLS',eq(r[1],visible.map(c=>c.id)));
  check(a.tag+': customer RLS',eq(r[2],visible.map(c=>c.customer_id)));
  check(a.tag+': project RLS',eq(r[3],visible.map(c=>c.project_id)));
  check(a.tag+': financial rows',eq(r[4],a.persona==='finance'?[visible[0].invoice_id]:[]));
  check(a.tag+': independent contract rows',eq(r[5],a.persona==='executive'?[visible[0].contract_id]:[]));
  check(a.tag+': SECURITY DEFINER org RPC',r[6].status===200&&Array.isArray(r[6].data)&&JSON.stringify(r[6].data.map(x=>x.organization_id).sort())===JSON.stringify(visible.map(c=>c.id).sort()));
  if(a.company){
   const own=visible[0];check(a.tag+': raw budget column denied',denied(r[7]));
   check(a.tag+': budget RPC',a.persona==='finance'?r[8].status===200&&Number(r[8].data)===123.45:rpcDenied(r[8],'Explicit financial authorization required'));
   await Promise.all(s.companies.filter(c=>c.key!==a.company).map(async foreign=>{
    const out=await Promise.all([rows('crm_accounts',token,'&id=eq.'+foreign.customer_id),req('/rest/v1/rpc/set_active_organization',token,'POST',{target_org_id:foreign.id}),req('/rest/v1/intake_items?id=eq.'+foreign.item_id,token,'PATCH',{title:'W01 unexpected foreign mutation'})]);
    check(a.tag+': '+foreign.key+' foreign customer ID',eq(out[0],[]));
    check(a.tag+': '+foreign.key+' foreign context',rpcDenied(out[1],'Organization membership required'));
    check(a.tag+': '+foreign.key+' foreign PATCH response',denied(out[2])||out[2].status===204||(out[2].status===200&&out[2].data?.length===0));
   }));
   if(a.persona==='owner'){
    const id=randomUUID();
    const ins=await req('/rest/v1/intake_items',token,'POST',{id,organization_id:own.id,intake_key:'W01-http-'+id,item_type:'idea',title:'HTTP positive control',summary:'Synthetic test',category:'general',created_by_user_id:a.id});
    check(a.tag+': own INSERT',ins.status===201);
    const upd=await req('/rest/v1/intake_items?id=eq.'+id,token,'PATCH',{title:'HTTP own update'});
    const read=await req('/rest/v1/intake_items?select=title&id=eq.'+id,token);
    check(a.tag+': own UPDATE',upd.status===204&&read.data?.[0]?.title==='HTTP own update');
    check(a.tag+': own DELETE',(await req('/rest/v1/intake_items?id=eq.'+id,token,'DELETE')).status===204);
   }
  }
  console.log(JSON.stringify({progress:'HTTP_checks',actor:a.tag}));
 });
 await Promise.all(s.companies.map(async c=>{const r=await req('/rest/v1/intake_items?select=title&id=eq.'+c.item_id,tokens.get(c.key+'/owner').access_token);check(c.key+': independent final foreign PATCH control',r.status===200&&r.data?.[0]?.title==='W01 initial idea');}));
 const first=tokens.get(s.actors[0].tag),parts=first.access_token.split('.');
 parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
 const badSig=await Promise.all([req('/auth/v1/user',parts.join('.')),rows('organizations',parts.join('.'))]);
 badSig.forEach((r,i)=>check('signature tampering rejected '+i,denied(r)));
 const refresh=await req('/auth/v1/token?grant_type=refresh_token',null,'POST',{refresh_token:first.refresh_token});
 check('real refresh token works',refresh.status===200&&refresh.data?.user?.id===s.actors[0].id);
 if(refresh.status===200)tokens.set(s.actors[0].tag,refresh.data);
}catch(e){errors.push(String(e.message));}
finally{
 await pool([...tokens],async([tag,pair])=>{
  const r=await req('/auth/v1/logout?scope=global',pair.access_token,'POST');
  check(tag+': logout',[200,204].includes(r.status));
  const refresh=await req('/auth/v1/token?grant_type=refresh_token',null,'POST',{refresh_token:pair.refresh_token});
  check(tag+': logged-out refresh denied',[400,401].includes(refresh.status));
 });
 const failures=[...checks.filter(c=>!c.passed).map(c=>c.name),...errors];
 const report={suite:'W01_REAL_HTTP_AUTH',project_ref:'viqjdgohtxqkrdgwtull',actors:tokens.size,checks:checks.length,passed:checks.filter(c=>c.passed).length,failed:failures.length,failures,normal_user_tokens_only:true,setup_scope:'privileged SQL synthetic fixtures; not an admin API or signup test',expired_valid_signature_token:'NOT_RUN',fixture_cleanup:'REQUIRES_SEPARATE_SQL_ATTESTATION',status:failures.length?'FAIL':'PASS_TESTED_HTTP_SCOPE',w01:'NOT_ACCEPTED'};
 writeFileSync(path.replace(/\.json$/,'.result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2));process.exitCode=failures.length?1:0;
}
