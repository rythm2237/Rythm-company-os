import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';

export async function validationRuntimeMatrix({b,clients,admin,record,unwrap}){
 const state={client:null,providerCalls:0};globalThis.w03ValidationRuntime=state;
 try{
  const built=await build({entryPoints:['app/api/runtime/execute-validation/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'w03-runtime-boundary',setup(build){
   const replacement={
    '@/lib/supabase/auth-server':'export async function createAuthServerClient(){return globalThis.w03ValidationRuntime.client}',
    '@/lib/runtime-config':"export function getRuntimeConfig(){return {agentExecutionEnabled:true,externalActionsEnabled:false,openAIConfigured:true,dryRunModel:'w03-intercepted'}}",
    openai:"export default class OpenAI{constructor(){globalThis.w03ValidationRuntime.providerCalls++;throw Error('UNEXPECTED_PROVIDER_CALL')}}"
   };
   build.onResolve({filter:/^(openai|@\/)/},a=>replacement[a.path]?{path:a.path,namespace:'w03'}:null);
   build.onLoad({filter:/.*/,namespace:'w03'},a=>({contents:replacement[a.path],loader:'js'}));
  }}]});
  const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(process.cwd()+'/package.json'),mod,mod.exports);
  const runs=new Map();
  for(const o of b.companies){
   const agent={id:randomUUID(),organization_id:o.id,agent_code:'W03-RUNTIME-'+randomUUID(),name:'W03 paused runtime fixture',role_title:'Synthetic test',purpose:'Tenant boundary only',enabled:false,agent_status:'paused'};
   unwrap(await admin.from('agents').insert(agent),'runtime agent');
   const run={id:randomUUID(),organization_id:o.id,agent_id:agent.id,trigger_type:'manual',input_summary:'W03 synthetic cancelled; never execute',status:'cancelled',idempotency_key:'w03-'+randomUUID()};
   unwrap(await admin.from('agent_runs').insert(run),'cancelled runtime run');runs.set(o.key,run);
  }
  for(const u of b.users){
   const c=clients.get(u.key).client;state.client=c;
   const auth=unwrap(await c.auth.getUser(),'runtime actual identity');
   const membership=unwrap(await c.from('organization_members').select('organization_id').eq('user_id',auth.user.id).eq('role','owner').maybeSingle(),'runtime owner membership');
   for(const target of b.companies){
    const response=await mod.exports.POST(new Request('http://localhost/api/runtime/execute-validation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({runId:runs.get(target.key).id})}));
    const expected=!membership?403:membership.organization_id===target.id?409:404;
    record('validation-runtime-real-auth-rls','run-boundary',u.key,target.key,response.status===expected&&state.providerCalls===0,'actual-auth-RLS;in-memory-enabled-runtime;status-'+response.status);
   }
  }
  for(const o of b.companies){const r=unwrap(await admin.from('agent_runs').select('status,cost_usd').eq('id',runs.get(o.key).id).single(),'runtime poststate');record('validation-runtime-real-auth-rls','sentinel-unchanged','all',o.key,r.status==='cancelled'&&Number(r.cost_usd)===0);}
 }finally{delete globalThis.w03ValidationRuntime;}
}
