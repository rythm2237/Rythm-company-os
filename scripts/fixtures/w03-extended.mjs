import {randomUUID,createHash} from 'node:crypto';
import {workerBoundaryMatrix} from './w03-worker.mjs';
import {governedMeetingMatrix} from './w03-governed-meetings.mjs';

// Real staging Auth/REST/Storage and the actual local Next HTTP handlers.
// Chat uses an explicitly synthetic, zero-cost settled replay; no model is called.
export async function extendedMatrix({b,clients,admin,http,record,unwrap,seeds}){
 const fixtures=new Map();
 await workerBoundaryMatrix({b,admin,seeds,record});
 const provider=unwrap(await admin.from('integration_providers').select('provider_key').eq('provider_key','internal').maybeSingle(),'internal provider lookup');
 if(!provider)unwrap(await admin.from('integration_providers').insert({provider_key:'internal',display_name:'RYTHM Internal Control',category:'internal_control',enabled:false,kill_switch:true,supports_token:false}),'disabled internal reference seed');
 const test=(...args)=>{try{record(...args);}catch{/* collect all independent failures */}};
 const json=(body)=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 for(const org of b.companies){
  const actor=org.key+'_owner',owner=clients.get(actor).user.id;
  const session=await http(actor,'/api/ai-workspace/session');
  record('extended-session','positive',actor,org.key,session.status===200,'status-'+session.status);
  const personal=await session.json();
  const wallet=unwrap(await admin.from('usage_wallets').select('id').eq('personal_account_id',unwrap(await admin.from('aiw_accounts').select('id').eq('user_id',owner).single(),'personal account').id).eq('payer_type','personal').single(),'wallet');
  const conversation={id:randomUUID(),workspace_id:personal.workspace.id,project_id:personal.defaultProject.id,title:'W03-CONVERSATION-'+org.key};
  unwrap(await admin.from('aiw_conversations').insert(conversation),'conversation seed');
  unwrap(await admin.from('aiw_messages').insert({workspace_id:personal.workspace.id,conversation_id:conversation.id,role:'user',content:'W03-HISTORY-'+org.key}),'history seed');
  const text='W03 PRIVATE FILE '+org.key+' synthetic fixture only. No external provider.';
  const form=new FormData();form.set('projectId',personal.defaultProject.id);form.set('file',new File([text],'W03-private-'+org.key+'.txt',{type:'text/plain'}));
  const uploaded=await http(actor,'/api/ai-workspace/files',{method:'POST',body:form});
  record('workspace-files','own-upload',actor,org.key,uploaded.status===201,'status-'+uploaded.status);
  const fileId=(await uploaded.json()).file.id;
  const file=unwrap(await admin.from('aiw_files').select('*').eq('id',fileId).single(),'private file metadata');
  const bytes=unwrap(await admin.storage.from('ai-workspace-private').download(file.storage_path),'own fixture bytes');
  record('workspace-files','positive-bytes',actor,org.key,(await bytes.text())===text);
  const integration={id:randomUUID(),organization_id:org.id,provider_key:'internal',display_name:'W03 synthetic disabled integration',status:'disconnected',enabled:false};
  unwrap(await admin.from('organization_integrations').insert(integration),'integration seed');
  const execution={id:randomUUID(),organization_id:org.id,requested_by_user_id:owner,integration_id:integration.id,integration_key:'internal',tool:'internal.validation',capability_key:'validation.record.create',operation:'validation.record.create',risk_level:'medium',approval_mode:'human_only',status:'denied',idempotency_key:'w03-'+randomUUID(),correlation_id:randomUUID(),execution_mode:'simulate'};
  unwrap(await admin.from('tool_execution_requests').insert(execution),'tool execution seed');
  const meeting={id:randomUUID(),organization_id:org.id,project_id:org.projectId,title:'W03-MEETING-'+org.key,purpose:'synthetic boundary fixture',status:'running',created_by_user_id:owner};
  unwrap(await admin.from('meetings').insert(meeting),'meeting seed');
  const meetingSession={id:randomUUID(),organization_id:org.id,meeting_id:meeting.id,project_id:org.projectId,decision_question:'Synthetic W03 boundary?',status:'completed',budget_cap_usd:0,synthesis:'W03-SYNTHESIS-'+org.key};
  unwrap(await admin.from('meeting_agent_sessions').insert(meetingSession),'meeting session seed');
  unwrap(await admin.from('meeting_legal_reviews').insert({organization_id:org.id,meeting_id:meeting.id,session_id:meetingSession.id,status:'pending',executive_note:'W03-LEGAL-'+org.key}),'legal review seed');
  fixtures.set(org.key,{personal,wallet,conversation,file,text,integration,execution,meeting,meetingSession});
  const positiveProposal=await http(actor,'/api/executions',json({integrationId:integration.id,toolId:'internal.validation',capabilityKey:'validation.record.create',projectId:org.projectId,input:{},target:'w03-own-positive'}));
  record('execution-proposal','own-context-positive',actor,org.key,positiveProposal.status===200,'status-'+positiveProposal.status);
  for(const path of ['/api/meetings/continue-detached?meeting='+meeting.id,'/api/meetings/legal-triage?sessionId='+meetingSession.id,'/api/meetings/legal-review?sessionId='+meetingSession.id,'/api/executions']){
   const r=await http(actor,path);record('extended-http','owner-positive',actor,org.key,r.status===200,path.split('?')[0]+' status-'+r.status);
  }
  const pulse=await http(actor,'/api/project-pulse?project='+org.projectId);const pulseData=await pulse.json();
  record('project-pulse','own-project-positive',actor,org.key,pulse.status===200&&pulseData.project?.name);
 }
 for(let batch=0;batch<b.users.length;batch+=3){
 await Promise.all(b.users.slice(batch,batch+3).map(async u=>{
  console.log(JSON.stringify({extendedActor:u.key}));
  const c=clients.get(u.key).client,userId=clients.get(u.key).user.id;
  const home=b.memberships.find(m=>m.userKey===u.key),org=b.companies.find(o=>o.key===home.companyKey);
  unwrap(await c.rpc('set_active_organization',{target_org_id:org.id}),'extended actor active');
  const s=await http(u.key,'/api/ai-workspace/session');record('extended-session','actor-positive',u.key,home.companyKey,s.status===200);
  const own=await s.json();
  const account=unwrap(await admin.from('aiw_accounts').select('id').eq('user_id',userId).single(),'actor account');
  const wallet=unwrap(await admin.from('usage_wallets').select('id').eq('personal_account_id',account.id).eq('payer_type','personal').single(),'actor wallet');
  const requestKey='w03-replay-'+randomUUID();
  unwrap(await admin.from('ai_usage_requests').insert({id:randomUUID(),wallet_id:wallet.id,workspace_id:own.workspace.id,organization_id:org.id,user_id:userId,request_kind:'answer',routing_mode:'auto',prompt_profile:'normal',reserved_micros:0,actual_micros:0,status:'settled',internal_result:'W03-ANSWER-'+u.key,idempotency_key:own.workspace.id+':'+requestKey+':answer',client_request_key:requestKey}),'zero-cost replay seed');
  for(const target of b.companies){
   const f=fixtures.get(target.key);
   if(u.key!==target.key+'_owner'){
    const listed=await http(u.key,'/api/ai-workspace/files');const listedText=await listed.text();
    test('workspace-files','foreign-list',u.key,target.key,listed.status===200&&!listedText.includes('W03-private-'+target.key+'.txt'));
    const form=new FormData();form.set('projectId',f.personal.defaultProject.id);form.set('file',new File(['W03 denied upload '+randomUUID()+' synthetic content'],'forged.txt',{type:'text/plain'}));
    const posted=await http(u.key,'/api/ai-workspace/files',{method:'POST',body:form});
    test('workspace-files','foreign-project-upload',u.key,target.key,posted.status===404,'status-'+posted.status);
    const deleted=await http(u.key,'/api/ai-workspace/files?id='+f.file.id,{method:'DELETE'});
    test('workspace-files','foreign-delete',u.key,target.key,deleted.status===404,'status-'+deleted.status);
    for(const [operation,run] of [
     ['download',()=>c.storage.from('ai-workspace-private').download(f.file.storage_path)],
     ['signed-url',()=>c.storage.from('ai-workspace-private').createSignedUrl(f.file.storage_path,30)],
     ['overwrite',()=>c.storage.from('ai-workspace-private').update(f.file.storage_path,new Blob(['W03 forbidden overwrite']))],
     ['delete',()=>c.storage.from('ai-workspace-private').remove([f.file.storage_path])],
    ]){const r=await run();test('workspace-storage',operation,u.key,target.key,!!r.error||operation==='delete'&&r.data?.length===0);}
    const remaining=unwrap(await admin.storage.from('ai-workspace-private').download(f.file.storage_path),'private foreign bytes remain');
    test('workspace-files','foreign-bytes-unchanged',u.key,target.key,(await remaining.text())===f.text);
    const before=unwrap(await admin.from('aiw_messages').select('id').eq('conversation_id',f.conversation.id),'foreign history before');
    const chat=await http(u.key,'/api/ai-workspace/chat',json({prompt:'synthetic boundary check',requestKey,conversationId:f.conversation.id,workspaceId:f.personal.workspace.id,projectId:f.personal.defaultProject.id,organizationId:target.id,walletId:f.wallet.id}));
    const data=await chat.json();
    test('workspace-chat','foreign-conversation-replaced',u.key,target.key,chat.status===200&&data.message==='W03-ANSWER-'+u.key&&data.conversationId!==f.conversation.id,'status-'+chat.status);
    const after=unwrap(await admin.from('aiw_messages').select('id').eq('conversation_id',f.conversation.id),'foreign history after');
    test('workspace-chat','foreign-history-unchanged',u.key,target.key,after.length===before.length);
   }
   if(b.memberships.some(m=>m.userKey===u.key&&m.companyKey===target.key))continue;
   const pulse=await http(u.key,'/api/project-pulse?project='+target.projectId);const pulseData=await pulse.json();
   test('project-pulse','foreign-project-denied',u.key,target.key,pulse.status===403||pulse.status===200&&pulseData.project===null&&pulseData.event===null&&pulseData.nodes?.length===0,'status-'+pulse.status);
   for(const [path,options,statuses] of [
    ['/api/projects/live',json({projectId:target.projectId,approvalId:randomUUID(),resolution:'approved',responseNote:'W03 forbidden synthetic approval'}),[403,404]],
    ['/api/executions/'+f.execution.id,json({action:'execute'}),[403,404]],
    ['/api/executions/'+f.execution.id,json({action:'rollback'}),[403,404]],
    ['/api/meetings/continue-detached?meeting='+f.meeting.id,{},[403,404]],
    ['/api/meetings/continue-detached',json({meetingId:f.meeting.id}),[403,404]],
    ['/api/meetings/close',json({sessionId:f.meetingSession.id}),[403,404]],
    ['/api/meetings/ceo-contribute',json({sessionId:f.meetingSession.id,content:'synthetic contribution'}),[403,409]],
    ['/api/meetings/legal-triage?sessionId='+f.meetingSession.id,{},[403,404]],
    
    ['/api/privacy/requests',json({requestType:'access',scope:'organization',organizationId:target.id}),[403]],
   ]){const r=await http(u.key,path,options);test('extended-http','foreign-object',u.key,target.key,statuses.includes(r.status),path.split('?')[0]+' status-'+r.status);}
   const legal=await http(u.key,'/api/meetings/legal-review?sessionId='+f.meetingSession.id);const legalData=await legal.json();
   test('extended-http','foreign-legal-review',u.key,target.key,legal.status===403||legal.status===200&&legalData.review===null,'status-'+legal.status);
   const proposal=await http(u.key,'/api/executions',json({integrationId:f.integration.id,toolId:'internal.validation',capabilityKey:'validation.record.create',input:{}}));
   const pd=await proposal.json();test('execution-proposal','foreign-integration',u.key,target.key,proposal.status===403||proposal.status===400&&pd.error==='Integration is not available to this company.','status-'+proposal.status);
   if(u.key.endsWith('_owner')){
    const ownF=fixtures.get(home.companyKey);
    const substituted=await http(u.key,'/api/executions',json({integrationId:ownF.integration.id,toolId:'internal.validation',capabilityKey:'validation.record.create',projectId:target.projectId,input:{},target:'w03-synthetic'}));
    const rows=unwrap(await admin.from('tool_execution_requests').select('id').eq('organization_id',org.id).eq('project_id',target.projectId),'execution foreign project poststate');
    const substitutedData=await substituted.json();
    test('execution-proposal','foreign-project-reference',u.key,target.key,rows.length===0&&substituted.status===400&&substitutedData.error==='Execution context is not available to this company.','status-'+substituted.status);
    for(const [field,id,column] of [['meetingId',f.meeting.id,'meeting_id'],['sessionId',f.meetingSession.id,'session_id']]){
     const r=await http(u.key,'/api/executions',json({integrationId:ownF.integration.id,toolId:'internal.validation',capabilityKey:'validation.record.create',[field]:id,input:{}}));const data=await r.json();
     const persisted=unwrap(await admin.from('tool_execution_requests').select('id').eq('organization_id',org.id).eq(column,id),'foreign execution context poststate');
     test('execution-proposal','foreign-'+field,u.key,target.key,r.status===400&&data.error==='Execution context is not available to this company.'&&persisted.length===0,'status-'+r.status);
    }
    const rowsToTry=[
     ['project_decision_memory',{id:randomUUID(),organization_id:org.id,project_id:target.projectId,decision:'W03-forged-reference',decision_maker_type:'test'}],
     ['project_task_runs',{id:randomUUID(),organization_id:org.id,project_id:target.projectId,execution_id:seeds.get(org.key).find(r=>r[0]==='project_executions')[1].id,task_key:'W03-'+randomUUID(),title:'W03-forged-reference',idempotency_key:randomUUID(),status:'cancelled'}],
     ['project_documents',{id:randomUUID(),organization_id:org.id,project_id:target.projectId,category:'other',file_name:'W03-forged-reference.txt',storage_path:org.id+'/'+randomUUID()+'.txt'}],
    ];
    for(const [table,row] of rowsToTry){const r=await c.from(table).insert(row).select('id');test('cross-parent-reference',table,u.key,target.key,!!r.error&&(['42501','23503'].includes(r.error.code)||r.error.code==='P0001'&&r.error.message==='Document project unavailable'),r.error? r.error.code+':'+r.error.message:'INSERT-ACCEPTED');}
    for(const table of ['project_contracts','finance_invoices']){
     const ownRow=seeds.get(org.key).find(r=>r[0]===table)[1];
     const foreignCustomer=seeds.get(target.key).find(r=>r[0]==='crm_accounts')[1].id;
     const inserted={...ownRow,id:randomUUID(),customer_id:foreignCustomer};
     if(table==='project_contracts')inserted.contract_number='W03-forged-'+randomUUID();else inserted.internal_reference='W03-forged-'+randomUUID();
     const r=await c.from(table).insert(inserted).select('id');test('crm-cross-parent',table+'-INSERT',u.key,target.key,r.error?.code==='23503',r.error?.code??'INSERT-ACCEPTED');
     const changed=await c.from(table).update({customer_id:foreignCustomer}).eq('id',ownRow.id).select('id');
     const remaining=unwrap(await admin.from(table).select('customer_id').eq('id',ownRow.id).single(),'CRM parent poststate');
     test('crm-cross-parent',table+'-UPDATE',u.key,target.key,changed.error?.code==='23503'&&remaining.customer_id===ownRow.customer_id,changed.error?.code??'UPDATE-ACCEPTED');
    }
    for(const table of ['project_decision_memory','project_task_runs']){
     const ownRow=seeds.get(org.key).find(r=>r[0]===table)[1];
     const changed=await c.from(table).update({project_id:target.projectId}).eq('id',ownRow.id).select('id');
     const after=unwrap(await admin.from(table).select('project_id').eq('id',ownRow.id).single(),'cross parent update poststate');
     test('cross-parent-update',table,u.key,target.key,changed.error?.code==='23503'&&after.project_id===org.projectId,changed.error?.code??'UPDATE-ACCEPTED');
    }
   }
  }
  const ledger=await http(u.key,'/api/executions');const ledgerText=await ledger.text();
  test('execution-ledger','role-and-sentinels',u.key,home.companyKey,u.key.endsWith('_owner')?ledger.status===200&&b.companies.filter(o=>o.key!==org.key).every(o=>!ledgerText.includes(fixtures.get(o.key).execution.correlation_id)):ledger.status===403);
 }));
 }
 await governedMeetingMatrix({b,clients,fixtures,record,unwrap});
 // File dedup digests must remain private to each personal workspace.
 for(const [key,f] of fixtures){const row=unwrap(await admin.from('aiw_files').select('sha256').eq('id',f.file.id).single(),'file digest');test('workspace-files','digest-control',key,key,row.sha256===createHash('sha256').update(f.text).digest('hex'));}
}
