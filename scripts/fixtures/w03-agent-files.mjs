import {randomUUID} from 'node:crypto';
import sharp from 'sharp';

export async function agentFileMatrix({b,clients,admin,http,record,unwrap,seeds,agentFixtures}){
 const fixtures=new Map();const test=(...args)=>{try{record(...args);}catch{/* preserve independent failures */}};
 for(const org of b.companies){
  const {client:c,user}=clients.get(org.key+'_owner'),agent=agentFixtures.get(org.key);
  const text='W03 private agent bytes '+org.key;const path=org.id+'/'+agent.id+'/'+randomUUID()+'.txt';
  unwrap(await c.storage.from('agent-attachments').upload(path,new Blob([text]),{contentType:'text/plain'}),'own agent storage upload');
  const file={id:randomUUID(),organization_id:org.id,agent_id:agent.id,uploaded_by:user.id,filename:'W03-private-'+org.key+'.txt',size_bytes:Buffer.byteLength(text),storage_path:path};
  unwrap(await c.from('agent_attachments').insert(file),'own agent attachment metadata');
  const memory={id:randomUUID(),organization_id:org.id,agent_id:agent.id,source_attachment_id:file.id,title:'W03-private-memory-'+org.key,content:'Synthetic private memory '+org.key,created_by:user.id};
  unwrap(await c.from('agent_memories').insert(memory),'own agent memory');
  const transaction={id:randomUUID(),organization_id:org.id,customer_id:seeds.get(org.key).find(r=>r[0]==='crm_accounts')[1].id,transaction_type:'expense',status:'void',description:'W03 zero-value synthetic ledger',amount:0};
  unwrap(await c.from('finance_transactions').insert(transaction),'own zero-value ledger');
  const logoPath=org.id+'/'+randomUUID()+'.webp';const logo=await sharp({create:{width:1,height:1,channels:4,background:{r:org.key.charCodeAt(0),g:2,b:3,alpha:1}}}).webp().toBuffer();
  unwrap(await c.storage.from('company-logos').upload(logoPath,logo,{contentType:'image/webp'}),'own logo storage upload');
  unwrap(await c.from('organization_branding').insert({organization_id:org.id,logo_path:logoPath}),'own branding');
  const logoResponse=await http(org.key+'_owner','/api/company-logo/'+org.id);
  record('company-logo','own-http-positive',org.key,org.key,logoResponse.status===200&&Buffer.from(await logoResponse.arrayBuffer()).equals(logo));
  fixtures.set(org.key,{file,memory,transaction,text,logoPath,logo});
 }
 for(let batch=0;batch<b.users.length;batch+=3)await Promise.all(b.users.slice(batch,batch+3).map(async user=>{
  const c=clients.get(user.key).client;console.log(JSON.stringify({agentFileActor:user.key}));
  const home=b.memberships.find(m=>m.userKey===user.key),own=fixtures.get(home.companyKey),ownOrg=b.companies.find(o=>o.key===home.companyKey);
  for(const org of b.companies){
   const f=fixtures.get(org.key);const allowed=b.memberships.some(m=>m.userKey===user.key&&m.companyKey===org.key);
   for(const [table,row] of [['agent_memories',f.memory],['agent_attachments',f.file],['finance_transactions',f.transaction]]){
    const read=await c.from(table).select('id').eq('id',row.id);
    const expected=allowed&&(table!=='finance_transactions'||user.key===org.key+'_owner'||user.key===org.key+'_finance_authorized')?1:0;
    test('agent-ledger-rest',table+'-READ',user.key,org.key,!read.error&&read.data?.length===expected);
    if(allowed)continue;
    const insert={...row,id:randomUUID()};if(table==='agent_attachments')insert.storage_path=org.id+'/'+randomUUID()+'.txt';
    const inserted=await c.from(table).insert(insert).select('id');test('agent-ledger-rest',table+'-INSERT',user.key,org.key,inserted.error?.code==='42501',inserted.error?.code??'INSERT-ACCEPTED');
    const update=await c.from(table).update({id:row.id}).eq('id',row.id).select('id');test('agent-ledger-rest',table+'-UPDATE',user.key,org.key,update.error?.code==='42501'||!update.error&&update.data?.length===0);
    const removed=await c.from(table).delete().eq('id',row.id).select('id');test('agent-ledger-rest',table+'-DELETE',user.key,org.key,removed.error?.code==='42501'||!removed.error&&removed.data?.length===0);
    const remaining=unwrap(await admin.from(table).select('id').eq('id',row.id).single(),'foreign agent/ledger sentinel remains');test('agent-ledger-rest',table+'-sentinel',user.key,org.key,remaining.id===row.id);
   }
   if(allowed)continue;
   for(const [bucket,path,original] of [['agent-attachments',f.file.storage_path,Buffer.from(f.text)],['company-logos',f.logoPath,f.logo]]){
    for(const [op,run] of [
     ['READ',()=>c.storage.from(bucket).download(path)],['SIGNED-URL',()=>c.storage.from(bucket).createSignedUrl(path,30)],
     ['INSERT',()=>c.storage.from(bucket).upload(org.id+'/'+randomUUID()+(bucket==='company-logos'?'.webp':'.txt'),original,{contentType:bucket==='company-logos'?'image/webp':'text/plain'})],
     ['UPDATE',()=>c.storage.from(bucket).update(path,original,{contentType:bucket==='company-logos'?'image/webp':'text/plain'})],['DELETE',()=>c.storage.from(bucket).remove([path])],
    ]){const r=await run();test('private-agent-logo-storage',bucket+'-'+op,user.key,org.key,!!r.error||op==='DELETE'&&r.data?.length===0);}
    const bytes=unwrap(await admin.storage.from(bucket).download(path),'private bytes remain');test('private-agent-logo-storage',bucket+'-bytes-unchanged',user.key,org.key,Buffer.from(await bytes.arrayBuffer()).equals(original));
   }
   const logo=await http(user.key,'/api/company-logo/'+org.id);test('company-logo','foreign-http',user.key,org.key,logo.status===404,'status-'+logo.status);
   if(user.key.endsWith('_owner')){
    for(const [table,row,patch] of [['agent_memories',own.memory,{agent_id:f.memory.agent_id}],['agent_attachments',own.file,{agent_id:f.file.agent_id}],['agent_memories',own.memory,{source_attachment_id:f.file.id}]]){
     const updated=await c.from(table).update(patch).eq('id',row.id).select('id');test('agent-parent-reference',table+'-UPDATE-'+Object.keys(patch)[0],user.key,org.key,updated.error?.code==='23503',updated.error?.code??'UPDATE-ACCEPTED');
     const forged={...row,...patch,id:randomUUID(),organization_id:ownOrg.id};if(table==='agent_attachments')forged.storage_path=ownOrg.id+'/'+randomUUID()+'.txt';
     const inserted=await c.from(table).insert(forged).select('id');test('agent-parent-reference',table+'-INSERT-'+Object.keys(patch)[0],user.key,org.key,inserted.error?.code==='23503',inserted.error?.code??'INSERT-ACCEPTED');
    }
   }
  }
 }));
}
