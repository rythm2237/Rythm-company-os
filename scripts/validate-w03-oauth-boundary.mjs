import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {generateKeyPairSync,createHmac,randomUUID} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export async function oauthBoundaryMatrix(live=null){

// Real connect/callback handlers and real signing/cookie verification. Only auth,
// DB and provider I/O are replaced. This is isolated coverage, not live HTTP.
const state={context:null,rows:[],writes:[],providerCalls:0};globalThis.w03OAuth=state;
const db={from(table){const filters=[];let mutation=null;
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(){return q;},
 update(v){mutation=v;return q;},insert(v){mutation=v;return q;},upsert(v){mutation=v;return q;},
 async maybeSingle(){return {data:state.rows.find(r=>filters.every(([k,v])=>r[k]===v))??null,error:null};},
 async single(){if(mutation)state.writes.push({table,filters,mutation});return {data:state.rows.find(r=>filters.every(([k,v])=>r[k]===v))??null,error:null};},
 then(resolve,reject){return Promise.resolve().then(()=>{if(mutation)state.writes.push({table,filters,mutation});return {data:[],error:null};}).then(resolve,reject);}};return q;},
 async rpc(){throw Error('UNEXPECTED_VAULT_WRITE');}};
state.db=db;
const originalFetch=globalThis.fetch,originalEnv={...process.env};
const secret='W03_SYNTHETIC_OAUTH_SECRET_NOT_A_PROVIDER_CREDENTIAL';
for(const prefix of ['GOOGLE_WORKSPACE','GOOGLE','MICROSOFT_365','BING_WEBMASTER','LINKEDIN','GITHUB_APP','VERCEL_INTEGRATION','SUPABASE_OAUTH','CLOUDFLARE_OAUTH']){
 process.env[prefix+'_CLIENT_ID']='W03_TEST_CLIENT';process.env[prefix+'_CLIENT_SECRET']=secret;
}
process.env.GITHUB_APP_ID='123';process.env.GITHUB_APP_SLUG='w03-test';
process.env.GITHUB_APP_PRIVATE_KEY=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
process.env.VERCEL_INTEGRATION_SLUG='w03-test';process.env.CLOUDFLARE_OAUTH_SCOPES='account:read';
globalThis.fetch=async(input,init)=>{
 if(live&&new URL(typeof input==='string'?input:input.url??input.href).hostname==='viqjdgohtxqkrdgwtull.supabase.co')return originalFetch(input,init);
 state.providerCalls++;throw Error('W03_PROVIDER_INTERCEPTED');
};
const checks=[];
const liveIntegrationIds=[];
async function compile(path){
 const replacements={
  'server-only':'export {};',
  '@/lib/auth/organization-context':"export async function resolveOrganizationContext(){return globalThis.w03OAuth.context} export function isOrganizationEntitlementActive(e){return e?.active===true}",
  '@/lib/admin/authorization':"export async function getPlatformAdminContext(){return null}",
  '@/lib/integrations/service-runner':"export function createExecutionServiceClient(){return globalThis.w03OAuth.db}",
 };
 const built=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'w03-io-boundary',setup(b){b.onResolve({filter:/^(server-only|@\/)/},a=>replacements[a.path]?{path:a.path,namespace:'w03'}:null);b.onLoad({filter:/.*/,namespace:'w03'},a=>({contents:replacements[a.path],loader:'js'}));}}]});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(process.cwd()+'/package.json'),mod,mod.exports);return mod.exports;
}
const context=(organizationId='A',role='owner',user='shared-owner')=>({organizationId,role,user:{id:user},entitlement:{active:true},supabase:db});
const reset=()=>{state.writes=[];state.providerCalls=0;};
try{
 for(const slug of ['bing-webmaster','cloudflare','github','google-ads','google-analytics','google-business-profile','google-drive','google-search-console','google-workspace','linkedin-marketing','microsoft-365','supabase','vercel','youtube']){
  const provider=slug.replaceAll('-','_'),connect=await compile(`app/api/integrations/${slug}/connect/route.ts`),callback=await compile(`app/api/integrations/${slug}/callback/route.ts`);
  state.rows=[{id:'own-integration',organization_id:'A',provider_key:provider,display_name:'Google Workspace',connected_by_user_id:'shared-owner'},{id:'foreign-integration',organization_id:'B',provider_key:provider,display_name:'Google Workspace',connected_by_user_id:'shared-owner'}];
  const start=async id=>{const form=new FormData();form.set('integrationId',id);return connect.POST(new Request(`http://localhost/api/integrations/${slug}/connect`,{method:'POST',body:form}));};
  for(const [label,c,id] of [['anonymous',null,'own-integration'],['member',context('A','operator'),'own-integration'],['foreign-company',context(),'foreign-integration'],['inactive', {...context(),entitlement:{active:false}},'own-integration']]){
   state.context=c;reset();const r=await start(id);
   if(slug==='google-workspace'&&label==='foreign-company'){
    assert.ok(state.writes.every(w=>w.filters.some(([k,v])=>k==='organization_id'&&v==='A')||w.mutation.organization_id==='A'));
    checks.push({provider,operation:'connect-ignores-foreign-id-creates-own',ok:true});continue;
   }
   assert.equal(state.writes.length,0,`${slug} ${label} connect writes`);assert.equal(state.providerCalls,0);
   assert.equal(new URL(r.headers.get('location')).hostname,'localhost',`${slug} ${label} must not start authorization`);
   checks.push({provider,operation:'connect-'+label,ok:true});
  }
  state.context=context();reset();const started=await start('own-integration');
  const location=new URL(started.headers.get('location'));
  assert.notEqual(location.hostname,'localhost',`${slug} positive must start real signing/cookie flow: ${location}`);
  const signed=location.searchParams.get('state');assert.ok(signed,slug+' missing state');
  const jar=started.cookies.getAll();assert.ok(jar.length>=3);
  const cookie=jar.map(c=>c.name+'='+encodeURIComponent(c.value)).join('; ');
  checks.push({provider,operation:'connect-own-positive',ok:true});
  const call=async(c,s=signed,k=cookie)=>{
   state.context=c;reset();let r;
   try{r=await callback.GET(new Request(`http://localhost/api/integrations/${slug}/callback?code=W03_SYNTHETIC_CODE&state=${encodeURIComponent(s)}`,{headers:{cookie:k}}));}
   catch(e){if(!String(e).includes('W03_PROVIDER_INTERCEPTED'))throw e;}
   return r;
  };
  const encoded=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(signed.split('.')[0],'base64url')),issuedAt:Date.now()-11*60*1000})).toString('base64url');
  const expired=encoded+'.'+createHmac('sha256',secret).update(encoded).digest('base64url');
  const expiredCookie=jar.map(c=>c.name+'='+encodeURIComponent(c.value===signed?expired:c.value)).join('; ');
  for(const [label,c,s,k] of [['anonymous',null,signed,cookie],['cross-company-same-user',context('B'),signed,cookie],['different-user',context('A','owner','different-user'),signed,cookie],['role-revoked',context('A','operator'),signed,cookie],['entitlement-revoked',{...context(),entitlement:{active:false}},signed,cookie],['tampered',context(),signed+'x',cookie],['missing-cookie',context(),signed,''],[slug==='google-workspace'?'expired-cross-company':'expired-valid-signature',slug==='google-workspace'?context('B'):context(),expired,expiredCookie]]){
   await call(c,s,k);assert.equal(state.providerCalls,0,`${slug} ${label} provider called`);assert.equal(state.writes.length,0,`${slug} ${label} writes`);checks.push({provider,operation:'callback-'+label,ok:true});
  }
  await call(context());
  // GitHub can first redirect to installation without exchanging a code.
  if(slug!=='github')assert.equal(state.providerCalls,1,slug+' own callback must reach intercepted token endpoint');
  assert.ok(state.writes.every(w=>w.filters.some(([k,v])=>k==='organization_id'&&v==='A')||w.mutation.organization_id==='A'),slug+' error bookkeeping must stay in own company');
  checks.push({provider,operation:'callback-own-provider-intercept',ok:true});
  if(live){
   const {b,clients,admin,record,unwrap}=live;
   const catalog=unwrap(await admin.from('integration_providers').select('provider_key').eq('provider_key',provider).maybeSingle(),'OAuth catalog');
   if(!catalog)unwrap(await admin.from('integration_providers').insert({provider_key:provider,display_name:'W03 synthetic '+provider,category:'test',supports_oauth:true,supports_token:false,enabled:false}),'OAuth disabled catalog fixture');
   const integrations=new Map();
   for(const company of b.companies){
    const row={id:randomUUID(),organization_id:company.id,provider_key:provider,display_name:slug==='google-workspace'?'Google Workspace':'W03 OAuth '+provider,connected_by_user_id:clients.get(company.key+'_owner').user.id,auth_type:'oauth',enabled:false,status:'disconnected'};
    unwrap(await admin.from('organization_integrations').insert(row),'OAuth tenant fixture');liveIntegrationIds.push(row.id);integrations.set(company.key,row);
   }
   state.db=admin;
   for(const target of b.companies){
    const targetOwner=clients.get(target.key+'_owner');
    state.context={organizationId:target.id,role:'owner',user:targetOwner.user,supabase:targetOwner.client,entitlement:{active:true,status:'active',ai_budget_limit:0}};
    reset();const launch=await start(integrations.get(target.key).id),launchUrl=new URL(launch.headers.get('location'));
    record('oauth-real-auth-rls','own-connect-positive',target.key+'_owner',provider,launchUrl.hostname!=='localhost'&&state.providerCalls===0,'in-memory-active-zero-budget-entitlement;no-provider');
    const launchState=launchUrl.searchParams.get('state'),launchCookie=launch.cookies.getAll().map(c=>c.name+'='+encodeURIComponent(c.value)).join('; ');
    for(const user of b.users){
     const membership=b.memberships.find(m=>m.userKey===user.key),home=b.companies.find(o=>o.key===membership.companyKey),identity=clients.get(user.key);
     const actual=unwrap(await identity.client.from('organization_members').select('role,membership_status').eq('organization_id',home.id).eq('user_id',identity.user.id).single(),'OAuth real membership');
     assert.equal(actual.membership_status,'active');
     const c={organizationId:home.id,role:actual.role,user:identity.user,supabase:identity.client,entitlement:{active:true,status:'active',ai_budget_limit:0}};
     await call(c,launchState,launchCookie);
     const own=user.key===target.key+'_owner';
     record('oauth-real-auth-rls',own?'own-callback-provider-intercept':'foreign-identity-or-role-callback-denied',user.key,target.key+'/'+provider,own?(slug==='github'||state.providerCalls===1):state.providerCalls===0,'actual-token-and-RLS;context-adapter;provider-intercepted');
    }
    for(const user of b.users.filter(u=>u.key!==target.key+'_owner')){
     const membership=b.memberships.find(m=>m.userKey===user.key),home=b.companies.find(o=>o.key===membership.companyKey),identity=clients.get(user.key);
     state.context={organizationId:home.id,role:membership.dbRole,user:identity.user,supabase:identity.client,entitlement:{active:true,status:'active',ai_budget_limit:0}};
     reset();const denied=await start(integrations.get(target.key).id),url=new URL(denied.headers.get('location'));
     const ignored=slug==='google-workspace'&&membership.dbRole==='owner';
     record('oauth-real-auth-rls',ignored?'foreign-id-ignored-own-connection':'foreign-id-or-role-connect-denied',user.key,target.key+'/'+provider,ignored?url.hostname!=='localhost':url.hostname==='localhost','actual-token-and-RLS;context-adapter;no-provider');
    }
   }
   // Shared identity has different actual roles in A/B; verify each context.
   const shared=clients.get('shared');
   for(const company of b.companies.slice(0,2)){
    unwrap(await shared.client.rpc('set_active_organization',{target_org_id:company.id}),'OAuth shared switch');
    const member=unwrap(await shared.client.from('organization_members').select('role').eq('organization_id',company.id).eq('user_id',shared.user.id).single(),'OAuth switched role');
    state.context={organizationId:company.id,role:member.role,user:shared.user,supabase:shared.client,entitlement:{active:true}};
    reset();const denied=await start(integrations.get(company.key).id);
    record('oauth-real-auth-rls','shared-role-switch-denied','shared',company.key+'/'+provider,new URL(denied.headers.get('location')).hostname==='localhost'&&state.providerCalls===0,'role-'+member.role);
   }
   const restored=unwrap(await shared.client.rpc('set_active_organization',{target_org_id:b.companies[0].id}),'restore shared fixture home company');
   record('oauth-real-auth-rls','shared-home-restored','shared',provider,restored===b.companies[0].id,'next provider starts with the same actual company context');
   state.db=db;
   for(const company of b.companies){
    const row=unwrap(await admin.from('organization_integrations').select('organization_id,vault_secret_id,account_ref').eq('id',integrations.get(company.key).id).single(),'OAuth poststate');
    record('oauth-real-auth-rls','no-credential-or-company-reassignment','all',company.key+'/'+provider,row.organization_id===company.id&&row.vault_secret_id===null&&row.account_ref===null,'synthetic-rows-only');
   }
  }
 }
 console.log(JSON.stringify({suite:'W03 OAuth actual handlers / synthetic DB and auth',pass:checks.length,fail:0}));
}finally{
 if(live&&liveIntegrationIds.length)live.unwrap(await live.admin.from('organization_integrations').update({enabled:false,status:'disconnected'}).in('id',liveIntegrationIds),'disable exact synthetic OAuth connections');
 mkdirSync('.w03-evidence',{recursive:true});writeFileSync('.w03-evidence/oauth-isolated.json',JSON.stringify({scope:'Isolated actual route handlers; synthetic auth/DB; real signing and cookies; provider intercepted before I/O',checks},null,2));
 globalThis.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];Object.assign(process.env,originalEnv);delete globalThis.w03OAuth;
}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await oauthBoundaryMatrix();
