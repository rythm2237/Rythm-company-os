import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {generateKeyPairSync,createHmac} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';

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
globalThis.fetch=async()=>{state.providerCalls++;throw Error('W03_PROVIDER_INTERCEPTED');};
const checks=[];
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
 }
 console.log(JSON.stringify({suite:'W03 OAuth actual handlers / synthetic DB and auth',pass:checks.length,fail:0}));
}finally{
 mkdirSync('.w03-evidence',{recursive:true});writeFileSync('.w03-evidence/oauth-isolated.json',JSON.stringify({scope:'Isolated actual route handlers; synthetic auth/DB; real signing and cookies; provider intercepted before I/O',checks},null,2));
 globalThis.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];Object.assign(process.env,originalEnv);delete globalThis.w03OAuth;
}
