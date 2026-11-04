import {build} from 'esbuild';
import {createRequire} from 'node:module';

// Actual worker, real staging context reads, controlled claim payload only.
// Provider calls and all writes are intercepted: no global queue is claimed,
// no customer job is processed, no model call or execution side effect occurs.
export async function workerBoundaryMatrix({b,admin,seeds,record,agentFixtures}){
 const state={calls:[],writes:[]};globalThis.w03WorkerBoundary=state;
 try{
  const built=await build({entryPoints:['lib/projects/project-work-v2.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'w03-provider-boundary',setup(build){
   build.onResolve({filter:/^@\/lib\/(ai\/request-gateway|runtime-config|projects\/project-completion)$/},a=>({path:a.path,namespace:'w03-worker'}));
   build.onLoad({filter:/.*/,namespace:'w03-worker'},a=>({loader:'js',contents:a.path.endsWith('request-gateway')
    ?"export async function executeAiRequest(input){globalThis.w03WorkerBoundary.calls.push(input);throw Error('W03_PROVIDER_BOUNDARY_STOP')}"
    :a.path.endsWith('runtime-config')?"export function getRuntimeConfig(){return {openAIConfigured:true,dryRunModel:'w03-intercepted-provider',agentTimeoutMs:1}}"
    :"export async function evaluateProjectCompletion(){return null}"}));
  }}]});
  const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(process.cwd()+'/package.json'),mod,mod.exports);
  const noop={then(resolve){return Promise.resolve({data:null,error:null}).then(resolve);},eq(){return this;},in(){return this;},select(){return this;},single(){return Promise.resolve({data:null,error:null});},maybeSingle(){return Promise.resolve({data:null,error:null});}};
  for(const org of b.companies){
   const task=seeds.get(org.key).find(r=>r[0]==='project_task_runs')[1];
   for(const target of b.companies){
    const cases=[['project',{project_id:target.projectId}]];
    if(target.id!==org.id&&agentFixtures)cases.push(['agent',{assigned_agent_id:agentFixtures.get(target.key).id}],['action',{action_item_id:seeds.get(target.key).find(r=>r[0]==='action_items')[1].id}],['execution',{execution_id:seeds.get(target.key).find(r=>r[0]==='project_executions')[1].id}]);
    for(const [kind,patch] of cases){
    const claimed={...task,lease_owner:'w03-intercepted',attempt_count:1,max_attempts:1,assigned_agent_id:null,...patch};state.calls=[];state.writes=[];
    const service={rpc:async(name)=>({data:name==='claim_project_task_runs_v1'?[claimed]:0,error:null}),from(table){
     const real=admin.from(table);return new Proxy(real,{get(obj,key){if(['insert','update','upsert','delete'].includes(key))return payload=>{state.writes.push({table,operation:key,payload});return noop;};const value=obj[key];return typeof value==='function'?value.bind(obj):value;}});
    }};
    await mod.exports.dispatchProjectWorkV2(service,'w03-controlled-claim');
    const own=target.id===org.id;
    try{record('background-worker',own?'own-context-positive':'foreign-'+kind+'-provider-boundary',org.key,target.key,own?state.calls.length===1&&state.calls[0].prompt.includes('W03-SENTINEL-'+org.key):state.calls.length===0,`intercepted-provider-calls-${state.calls.length};real-staging-reads;controlled-claim;writes-intercepted`);}catch{/* preserve all independent results */}
    }
   }
  }
 }finally{delete globalThis.w03WorkerBoundary;}
}
