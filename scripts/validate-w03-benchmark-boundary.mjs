import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

// Execute the real route; replace identity and persistence only. No provider calls.
const state={authorized:false,organizationId:'A',writes:[],rows:[]};
globalThis.w03Benchmark=state;
const db={from(table){const filters=[];let values;
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},ilike(){return q;},
 update(v){values=v;return q;},
 async maybeSingle(){return {data:table==='agents'?{id:'own-agent',agent_code:'GTM-STRAT-001',canonical_role:'Senior GTM Strategist',enabled:true}:null,error:null};},
 then(resolve,reject){return Promise.resolve().then(()=>{
  if(values){for(const row of state.rows.filter(r=>filters.every(([k,v])=>r[k]===v))){Object.assign(row,values);state.writes.push(row.id);}}
  return {data:[],error:null};
 }).then(resolve,reject);}};return q;}};
state.db=db;
try{
 const built=await build({entryPoints:['app/api/agents/[code]/benchmark/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'w03-boundaries',setup(b){
  const replacements={
   '@/lib/auth/organization-context':"export async function requireActiveOwnerOrganizationContext(){const s=globalThis.w03Benchmark;if(!s.authorized)throw Error('Authorization required');return {organizationId:s.organizationId,user:{id:'owner-A'},supabase:s.db}}",
   '@/lib/supabase/evaluation-admin':"export function createEvaluationAdminClient(){return globalThis.w03Benchmark.db}",
   '@/lib/ai/request-gateway':"export async function executeAiRequest(){throw Error('UNEXPECTED_PROVIDER_CALL')}",
   '@/lib/trusted-agent-knowledge':"export async function loadProfessionalRuntimeContext(){throw Error('UNEXPECTED_KNOWLEDGE_READ')}"
  };
  b.onResolve({filter:/^@\//},a=>replacements[a.path]?{path:a.path,namespace:'w03'}:null);
  b.onLoad({filter:/.*/,namespace:'w03'},a=>({contents:replacements[a.path],loader:'js'}));
 }}]});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(process.cwd()+'/package.json'),mod,mod.exports);
 const own='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
 const invoke=runId=>mod.exports.POST(new Request('http://localhost/api/agents/GTM-STRAT-001/benchmark',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({runId,finalize:true})}),{params:Promise.resolve({code:'GTM-STRAT-001'})});
 for(const authorized of [false,true]){
  state.authorized=authorized;state.rows=[{id:foreign,organization_id:'B',status:'running'},{id:own,organization_id:'A',status:'running'}];state.writes=[];
  const response=await invoke(foreign);assert.equal(response.status,500);
  assert.equal(state.rows[0].status,'running',`${authorized?'owner-A':'unauthenticated'} must not fail tenant B batch`);
  assert.equal(state.writes.length,0);
 }
 state.authorized=true;state.writes=[];await invoke(own);
 assert.equal(state.rows[1].status,'failed','Authorized own batch failure must still persist');
 assert.deepEqual(state.writes,[own]);
 console.log('PASS W03 real benchmark route: anonymous and tenant A cannot mutate B through error handler; own failure persists; no provider used.');
}finally{delete globalThis.w03Benchmark;}
