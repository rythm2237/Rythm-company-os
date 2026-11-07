import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function routeWave({b,clients,admin,http,record,unwrap}){
 const json=body=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const batches=new Map();
 for(const o of b.companies){
  const batch={id:randomUUID(),organization_id:o.id,requested_by:clients.get(o.key+'_owner').user.id,model:'W03_NO_PROVIDER',suite_version:'w03_synthetic',status:'running'};
  unwrap(await admin.from('agent_evaluation_batches').insert(batch),'benchmark sentinel');batches.set(o.key,batch);
 }
 const noMutation=async(actor,o)=>{
  const r=await http(actor,'/api/agents/GTM-STRAT-001/benchmark',json({runId:batches.get(o.key).id,finalize:true}));
  const row=unwrap(await admin.from('agent_evaluation_batches').select('status,completed_at,error_message').eq('id',batches.get(o.key).id).single(),'benchmark poststate');
  record('benchmark-error-boundary','unavailable-no-mutation',actor??'anonymous',o.key,r.status===500&&row.status==='running'&&row.completed_at===null&&row.error_message===null,'status-'+r.status);
 };
 for(const o of b.companies)await noMutation(undefined,o);
 const oauth=['bing-webmaster','cloudflare','github','google-ads','google-analytics','google-business-profile','google-drive','google-search-console','google-workspace','linkedin-marketing','microsoft-365','supabase','vercel','youtube'];
 for(const u of b.users){
  const home=b.memberships.find(m=>m.userKey===u.key),org=b.companies.find(o=>o.key===home.companyKey);
  unwrap(await clients.get(u.key).client.rpc('set_active_organization',{target_org_id:org.id}),'route active org');
  console.log(JSON.stringify({routeWaveActor:u.key}));
  for(const o of b.companies)await noMutation(u.key,o);
  for(const [path,method] of [['/api/2nya-nailart/admin','GET'],['/api/2nya-nailart/admin','POST'],['/api/2nya-nailart/admin/gallery','GET'],['/api/2nya-nailart/admin/gallery','POST'],['/api/2nya-nailart/admin/gallery','DELETE'],['/api/2nya-nailart/admin-messages','GET'],['/api/2nya-nailart/admin-messages','POST']]){
   const r=await http(u.key,path,method==='GET'?{method}:{...json({action:'delete_service',id:randomUUID(),organization_id:b.companies[1].id}),method});
   record('separate-product-admin','saas-token-denied',u.key,'2nya',r.status===403,path+' '+method+' status-'+r.status);
  }
  const adminCode=await http(u.key,'/api/admin/ai-workspace/guest-codes',json({organizationId:b.companies[1].id,label:'W03',initialCreditMicros:0}));
  record('platform-admin','tenant-role-denied',u.key,'platform',adminCode.status===403,'guest-codes');
  const adminConnect=await http(u.key,'/api/admin/integrations/google-search-console/connect',{method:'POST'});
  record('platform-admin','tenant-role-denied',u.key,'platform',adminConnect.status===303&&new URL(adminConnect.headers.get('location')).pathname==='/login','gsc-connect');
  const dispatch=await http(u.key,'/api/admin/automation/dispatch',{headers:{authorization:'Bearer '+(await clients.get(u.key).client.auth.getSession()).data.session.access_token}});
  record('platform-admin','user-token-not-cron',u.key,'platform',dispatch.status===401);
  for(const slug of oauth){
   const form=new FormData();form.set('integrationId',randomUUID());form.set('organizationId',b.companies.find(o=>o.key!==org.key).id);
   const r=await http(u.key,`/api/integrations/${slug}/connect`,{method:'POST',body:form});
   record('oauth-live','pending-entitlement-no-authorization',u.key,slug,r.status===303&&new URL(r.headers.get('location')).hostname==='localhost','status-'+r.status);
   const c=await http(u.key,`/api/integrations/${slug}/callback?code=W03_SYNTHETIC&state=W03_INVALID`);
   record('oauth-live','invalid-state',u.key,slug,c.status===303&&new URL(c.headers.get('location')).hostname==='localhost','status-'+c.status);
  }
  const foreign=b.companies.find(o=>o.key!==org.key);
  const connection=await http(u.key,'/api/integrations/connection-agent/status?sessionId='+randomUUID()+'&organizationId='+foreign.id);
  record('connection-status','unavailable-session',u.key,foreign.key,connection.status===200&&(await connection.json()).session===null);
  const bootstrap=await http(u.key,'/api/bootstrap-status?organizationId='+foreign.id);
  const owner=u.key.endsWith('_owner');const bootstrapData=await bootstrap.text();
  record('bootstrap','role-and-company-bound',u.key,foreign.key,owner?bootstrap.status===200&&bootstrapData.includes(org.slug)&&!bootstrapData.includes(foreign.slug):[403,404].includes(bootstrap.status),'status-'+bootstrap.status);
  if(!owner){const invite=await http(u.key,'/api/ai-workspace/company/invite',json({email:b.users.find(x=>x.key===foreign.key+'_member').email,role:'executive',organizationId:foreign.id}));record('company-invite','nonowner-denied',u.key,foreign.key,invite.status===403,'status-'+invite.status);}
  for(const path of ['/api/communication/inbound/cloudflare','/api/communication/inbound/resend']){
   const r=await http(u.key,path,json({organization_id:foreign.id,to:'w03-nobody@example.test',from:'w03@example.test',rawBase64:'VzAz'}));record('inbound-signatures','user-token-cannot-ingest',u.key,foreign.key,r.status===401,path+' status-'+r.status);
  }
  const webhook=await http(u.key,'/api/billing/webhook',json({id:'w03',type:'checkout.session.completed',data:{object:{metadata:{organization_id:foreign.id}}}}));record('billing-signature','user-token-cannot-activate',u.key,foreign.key,webhook.status===400);
  for(const path of ['/api/billing/checkout','/api/billing/portal']){const r=await http(u.key,path,json({organizationId:foreign.id}));record('disabled-capability','assisted-billing',u.key,foreign.key,r.status===409,path);}
 }
 for(const target of ['http://127.0.0.1/private','https://viqjdgohtxqkrdgwtull.supabase.co/storage/v1/object/authenticated/project-files/private','https://images.unsplash.com.evil.invalid/image']){
  const r=await http(undefined,'/api/agent-avatar?url='+encodeURIComponent(target));record('avatar-proxy','private-host-denied','anonymous','private',r.status===403);
 }
 const guest=await http(undefined,'/api/ai-workspace/guest/activate',json({code:'W03_NONEXISTENT_'+randomUUID()}));record('guest','unknown-code-denied','anonymous','synthetic',guest.status===403);
 const logout=await http(undefined,'/api/ai-workspace/guest/logout',{method:'POST'});record('guest','invalid-session-logout','anonymous','synthetic',logout.status===200);
 for(const o of b.companies){const row=unwrap(await admin.from('agent_evaluation_batches').select('status').eq('id',batches.get(o.key).id).single(),'final batch');record('benchmark-error-boundary','final-sentinel','all',o.key,row.status==='running');}
 assert.ok(batches.size===3);
}
