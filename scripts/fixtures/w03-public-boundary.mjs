import {randomUUID} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';

// Public routes have an explicit public contract. A 400/503 is never treated
// as evidence of tenant authorization. Private CRM/email objects use real IDs.
export async function publicBoundaryMatrix({b,clients,admin,http,record,unwrap,seeds}){
 const json=body=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const fixtures=new Map();
 for(const o of b.companies){
  const owner=clients.get(o.key+'_owner').user.id;
  const ownerClient=clients.get(o.key+'_owner').client;
  for(const [code,sequence_no] of [['w03_qualified',801],['w03_proposal',802]])unwrap(await ownerClient.from('crm_pipeline_stages').insert({organization_id:o.id,code,name:'W03 synthetic '+code,sequence_no}),'pipeline fixture');
  const opportunity={id:randomUUID(),organization_id:o.id,account_id:seeds.get(o.key).find(r=>r[0]==='crm_accounts')[1].id,name:'W03 opportunity '+o.key,stage_code:'w03_qualified',created_by_user_id:owner};
  unwrap(await ownerClient.from('crm_opportunities').insert(opportunity),'opportunity fixture');
  const mailbox={id:randomUUID(),organization_id:o.id,local_part:'w03',address:'w03-'+o.id+'@example.test',display_name:'W03 synthetic inactive mailbox',purpose:'Isolation test only',is_active:false,approval_mode:'draft_only'};
  unwrap(await admin.from('communication_mailboxes').insert(mailbox),'inactive mailbox fixture');
  const thread={id:randomUUID(),organization_id:o.id,mailbox_id:mailbox.id,subject:'W03-MAIL-'+o.key};unwrap(await admin.from('communication_threads').insert(thread),'mail thread');
  const message={id:randomUUID(),organization_id:o.id,thread_id:thread.id,mailbox_id:mailbox.id,direction:'outbound',status:'draft',sender_email:mailbox.address,recipients:['w03-recipient@example.test'],subject:'W03-MAIL-'+o.key,body_text:'Synthetic. Do not send.'};
  unwrap(await admin.from('communication_messages').insert(message),'draft message');fixtures.set(o.key,{opportunity,message});
 }
 for(const u of b.users){
  const home=b.memberships.find(m=>m.userKey===u.key),org=b.companies.find(o=>o.key===home.companyKey),owner=u.key.endsWith('_owner');
  unwrap(await clients.get(u.key).client.rpc('set_active_organization',{target_org_id:org.id}),'public wave context');
  for(const target of b.companies.filter(o=>!b.memberships.some(m=>m.userKey===u.key&&m.companyKey===o.key))){
   const fixture=fixtures.get(target.key);
   const moved=await http(u.key,'/api/crm/opportunities/'+fixture.opportunity.id+'/stage',json({stage:'w03_proposal',version:1}));
   record('opportunity-stage-http','foreign-id-denied',u.key,target.key,moved.status===404,'status-'+moved.status);
   const mail=await http(u.key,'/api/communication/outbound/resend',json({messageId:fixture.message.id,organizationId:target.id}));
   record('outbound-email-http','foreign-id-or-role-denied',u.key,target.key,owner?mail.status===404:mail.status===307,'status-'+mail.status);
  }
  const queue=await http(u.key,'/api/communication/outbound/resend?organizationId='+b.companies.find(o=>o.id!==org.id).id);
  const queueText=await queue.text();record('outbound-email-http','queue-role-and-company',u.key,org.key,owner?queue.status===200&&!queueText.includes('W03-MAIL-'):queue.status===307,'draft fixtures never enter delivery queue');
  const own=fixtures.get(org.key);
  if(owner){
   const moved=await http(u.key,'/api/crm/opportunities/'+own.opportunity.id+'/stage',json({stage:'w03_proposal',version:1}));
   record('opportunity-stage-http','owner-positive-transition',u.key,org.key,moved.status===200,'status-'+moved.status);
   const safeDraft=await http(u.key,'/api/communication/outbound/resend',json({messageId:own.message.id}));
   record('outbound-email-http','own-unapproved-draft-denied',u.key,org.key,safeDraft.status===409,'Human approval gate retained');
  }
 }
 for(const o of b.companies){
  const f=fixtures.get(o.key),op=unwrap(await admin.from('crm_opportunities').select('stage_code,version').eq('id',f.opportunity.id).single(),'opportunity poststate'),mail=unwrap(await admin.from('communication_messages').select('status,sent_at').eq('id',f.message.id).single(),'mail poststate');
  record('opportunity-stage-http','only-own-transition-persisted','all',o.key,op.stage_code==='w03_proposal'&&op.version===2);
  record('outbound-email-http','no-delivery','all',o.key,mail.status==='draft'&&mail.sent_at===null);
 }
 for(const [path,status] of [['/api/health',200],['/api/status',200],['/api/system/deployment-version',200],['/api/2nya-nailart/bootstrap',200],['/api/2nya-nailart/portfolio',200],['/api/2nya-nailart/page?name=services',200],['/api/2nya-nailart/admin-page',200],['/api/2nya-nailart/site',200],['/api/2nya-nailart/logo',200],['/api/2nya-nailart/media/portfolio-01.webp',200],['/api/2nya-nailart/availability',400],['/api/2nya-nailart/manage?id='+randomUUID()+'&token=W03_INVALID',404]]){
  const r=await http(undefined,path);record('public-contract','declared-public-or-capability-contract','anonymous','public',r.status===status,path.split('?')[0]+' status-'+r.status);
 }
 for(const [path,body,status] of [['/api/2nya-nailart/book',{},400],['/api/2nya-nailart/contact-message',{},400],['/api/2nya-nailart/manage',{id:randomUUID(),token:'W03_INVALID',action:'cancel'},400],['/api/2nya-nailart/admin/login',{},400],['/api/2nya-nailart/admin/logout',{},200],['/api/analytics/public-events',{name:'W03_INVALID'},400]]){
  const r=await http(undefined,path,json(body));record('public-contract','input-or-capability-validation','anonymous','public',r.status===status,path+' status-'+r.status);
 }
 // These public endpoints hardcode a production read URL. The guard must stop
 // that I/O; their provider success path is explicitly NOT verified here.
 for(const path of ['/api/2nya-nailart/media-health','/api/2nya-nailart/push-key']){
  const r=await http(undefined,path);record('public-egress-sandbox','provider-unavailable-contract','anonymous','sandbox',r.status===503,path+';production-read-blocked;not-provider-success');
 }
 const receipt=await http('A_owner','/api/consumer/withdrawal',json({name:'W03 synthetic',email:'w03-synthetic@example.test',contractReference:'W03-'+randomUUID(),requester_user_id:clients.get('B_owner').user.id,organization_id:b.companies[1].id}));
 record('public-intake','synthetic-positive','A_owner','synthetic',receipt.status===201,'status-'+receipt.status);
 const data=await receipt.json();const row=unwrap(await admin.from('consumer_withdrawal_requests').select('requester_user_id,consumer_email').eq('id',data.receipt.id).single(),'withdrawal receipt poststate');
 record('public-intake','requester-derived-from-session','A_owner','B',row.requester_user_id===clients.get('A_owner').user.id&&row.consumer_email==='w03-synthetic@example.test');
 const directory=unwrap(await admin.auth.admin.listUsers({page:1,perPage:1000}),'existing synthetic invite identity preflight');
 for(const company of b.companies){
  const identity=clients.get(company.key+'_member'),email=b.users.find(u=>u.key===company.key+'_member').email,foreign=b.companies.find(o=>o.id!==company.id);
  if(!directory.users.some(u=>u.id===identity.user.id&&u.email===email))throw Error('Refuse invite unless existing synthetic account is in exact directory page used by handler');
  try{
   const r=await http(company.key+'_owner','/api/ai-workspace/company/invite',json({email,membershipRole:'operator',organizationId:foreign.id,userId:clients.get(foreign.key+'_owner').user.id}));
   record('company-invite','existing-own-member-positive',company.key+'_owner',company.key,r.status===200,'existing synthetic account only; no invitation email');
   const memberships=unwrap(await admin.from('organization_members').select('organization_id,role').eq('user_id',identity.user.id),'invite poststate');
   record('company-invite','forged-company-ignored',company.key+'_owner',foreign.key,memberships.length===1&&memberships[0].organization_id===company.id&&memberships[0].role==='operator');
  }finally{unwrap(await admin.from('aiw_company_member_access').update({enabled:false}).eq('organization_id',company.id).eq('user_id',identity.user.id),'disable synthetic company wallet access');}
 }
 for(const path of ['/api/meetings/deliberate','/api/meetings/summarize','/api/runtime/execute-validation']){const r=await http('A_owner',path,json({sessionId:randomUUID(),runId:randomUUID()}));record('disabled-runtime-http','environment-switch','A_owner','disabled',r.status===503,path+';status-'+r.status+';auth-tested-separately-in-governed-handler-matrix');}
 for(const path of ['/api/meetings/deliberate','/api/meetings/summarize']){const r=await http(undefined,path,json({sessionId:randomUUID()}));record('meeting-http-middleware','anonymous-denied','anonymous','private',r.status===401,path+';status-'+r.status);}
 const seo=await http('A_member','/api/seo/indexnow/submit',json({urls:['https://example.test/']}));record('seo-http','nonowner-denied','A_member','external',seo.status===403);
 const log='.w03-evidence/egress.jsonl';const blocked=existsSync(log)?readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
 record('egress','production-provider-requests-blocked','sandbox','production',blocked.length===3&&blocked.every(x=>x.blocked)&&blocked.filter(x=>x.host==='2nya-nailart.rythm-os.com').length===2&&blocked.filter(x=>x.host==='dezbacyuvsdrlpmmpjht.supabase.co').length===1,'blocked-hosts-'+JSON.stringify(blocked)+';expected two media reads and one push-key read;zero actual I/O');
}
