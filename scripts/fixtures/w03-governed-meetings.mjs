import {build} from 'esbuild';
import {createRequire} from 'node:module';

// Supplemental actual-handler tests, NOT deployed HTTP or flag parity evidence.
// Real staging Auth and user-scoped PostgREST remain active. Only the context
// adapter and runtime/provider boundary are replaced. The active zero-budget
// entitlement exists only in memory; no database entitlement or CEO gate changes.
export async function governedMeetingMatrix({b,clients,fixtures,record,unwrap}){
 const state={context:null,providerCalls:0};globalThis.w03GovernedMeetings=state;
 try{
  const handlers=new Map();
  for(const route of ['deliberate','summarize','legal-triage','legal-review']){
   const built=await build({entryPoints:[`app/api/meetings/${route}/route.ts`],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'w03-governed-boundary',setup(build){
    build.onResolve({filter:/^@\/lib\/(auth\/api-organization-context|runtime-config|ai\/request-gateway)$/},a=>({path:a.path,namespace:'w03-meeting'}));
    build.onLoad({filter:/.*/,namespace:'w03-meeting'},a=>({loader:'js',contents:a.path.endsWith('api-organization-context')
     ?"export async function resolveOwnerApiOrganizationContext(){return globalThis.w03GovernedMeetings.context}"
     :a.path.endsWith('runtime-config')?"export function getRuntimeConfig(){return {agentExecutionEnabled:true,externalActionsEnabled:false,openAIConfigured:true,dryRunModel:'w03-intercepted-provider'}}"
     :"export async function executeAiRequest(){globalThis.w03GovernedMeetings.providerCalls++;throw Error('W03_FORBIDDEN_PROVIDER_BOUNDARY')}"}));
   }}]});
   const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(process.cwd()+'/package.json'),mod,mod.exports);handlers.set(route,mod.exports.POST);
  }
  for(const user of b.users){
   const {client:c}=clients.get(user.key);const auth=unwrap(await c.auth.getUser(),'meeting authenticated user');
   const membership=b.memberships.find(m=>m.userKey===user.key),org=b.companies.find(o=>o.key===membership.companyKey);
   const member=unwrap(await c.from('organization_members').select('role,membership_status').eq('organization_id',org.id).eq('user_id',auth.user.id).single(),'meeting role');
   state.context=member.role==='owner'&&member.membership_status==='active'?{ok:true,supabase:c,user:auth.user,organizationId:org.id,entitlement:{status:'active',ai_budget_limit:0,starts_at:null,ends_at:null}}:{ok:false,status:403,error:'Owner authorization required.'};
   for(const target of b.companies){
    if(b.memberships.some(m=>m.userKey===user.key&&m.companyKey===target.key)&&target.id!==org.id)continue;
    const session=fixtures.get(target.key).meetingSession;
    for(const [route,handler] of handlers){
     const response=await handler(new Request(`http://fixture.test/api/meetings/${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:session.id})}));
     const expected=member.role!=='owner'?403:target.id===org.id?409:404;
     try{record('governed-meeting-handler',route,user.key,target.key,response.status===expected&&state.providerCalls===0,`status-${response.status};real-auth-rls;in-memory-runtime-entitlement;no-provider`);}catch{/* collect independent handler results */}
    }
   }
  }
 }finally{delete globalThis.w03GovernedMeetings;}
}
