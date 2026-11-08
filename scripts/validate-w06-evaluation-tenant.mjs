import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

// Real RYTHM evaluations page. Stub only caller identity, privileged Supabase,
// UI and expensive model/assessment side effects. Never use a real tenant.
const scenarios = ["A-101","A-102","A-103","A-104","A-105","A-106","B-001","T-001"];
const state = { auth:null, rows:[], queries:[], providerCalls:0 };
globalThis.w06EvaluationScope = state;
const db = {
  from(table){
    const filters = [];
    let selection = "";
    const q = {
      select(columns){selection=columns;return q;},
      eq(key,value){filters.push([key,value]);return q;},
      in(){return q;},order(){return q;},limit(){return q;},
      async maybeSingle(){
        state.queries.push({table,filters:[...filters],selection});
        if(table==="agent_evaluation_batches"||table==="agent_asset_profiles")return {data:null,error:null};
        return {data:null,error:null};
      },
      then(resolve,reject){
        const promise = Promise.resolve().then(()=>{
          state.queries.push({table,filters:[...filters],selection});
          if(table==="agents"){
            const rows=state.rows.filter(r=>filters.every(([k,v])=>r[k]===v));
            return {data:selection==="agent_code"?rows.map(({agent_code})=>({agent_code})):rows,error:null};
          }
          return {data:[],error:null};
        });
        return promise.then(resolve,reject);
      },
    };
    return q;
  },
  async rpc(){return {data:{eligible:false},error:null};},
};
state.db=db;
const shims={
  "@/lib/auth/organization-context": "export async function requireOwnerOrganizationContext(){const s=globalThis.w06EvaluationScope;if(!s.auth)throw Error('OWNER_ORGANIZATION_REQUIRED');return s.auth;}",
  "@/lib/supabase/server": "export function createServerSupabaseClient(){return globalThis.w06EvaluationScope.db;}",
  "@/lib/evaluation/runtime":"export async function runAgentEvaluationFleet(){globalThis.w06EvaluationScope.providerCalls++;throw Error('PROVIDER_DISALLOWED');}",
  "@/lib/evaluation/promotion":"export async function runSeniorPromotionEvaluation(){globalThis.w06EvaluationScope.providerCalls++;throw Error('PROVIDER_DISALLOWED');}",
  "@/lib/evaluation/harness":"export const BASE_EVALUATION_SCENARIOS="+JSON.stringify(scenarios.map(agentCode=>({agentCode})))+";",
  "@/components/ui/Button":"export const SubmitButton=props=>props.children;",
  "next/cache":"export const revalidatePath=()=>{};",
  "next/navigation":"export const redirect=path=>{throw Error('REDIRECT:'+path)};",
};
try{
  const built=await build({entryPoints:["app/(app)/evaluations/page.tsx"],bundle:true,write:false,platform:"node",format:"cjs",packages:"external",jsx:"automatic",logLevel:"silent",plugins:[{
    name:"w06-isolated-tenant-authorization",
    setup(b){
      b.onResolve({filter:/^(@\/|next\/(cache|navigation)$)/},args=>shims[args.path]?{path:args.path,namespace:"w06"}:null);
      b.onLoad({filter:/.*/,namespace:"w06"},args=>({contents:shims[args.path],loader:"js"}));
    }
  }]});
  const mod={exports:{}};
  new Function("require","module","exports",built.outputFiles[0].text)(
    createRequire(process.cwd()+"/package.json"),mod,mod.exports);
  const page=()=>mod.exports.default({searchParams:Promise.resolve({})});
  const reset=()=>{state.queries=[];state.providerCalls=0;};
  state.auth=null;
  reset();
  await assert.rejects(page(),/OWNER_ORGANIZATION_REQUIRED/);
  assert.equal(state.queries.length,0,"anonymous/revoked owner must not call service-role");

  const ownerA={user:{id:"owner-A"},organizationId:"A",role:"owner"};
  state.auth=ownerA;
  state.rows=scenarios.map((agent_code,i)=>({id:"foreign-agent-"+i,organization_id:"B",agent_code,display_name:"PRIVATE_TENANT_B",name:"PRIVATE_TENANT_B"}));
  reset();
  await assert.rejects(page(),/your company does not have a complete 8-Agent Fleet/);
  assert.equal(state.providerCalls,0,"missing own Fleet must not run any external provider");
  assert.deepEqual(state.queries.map(q=>q.filters.find(([key])=>key==="organization_id")?.[1]),["A"],
    "foreign-only canonical Fleet lookup must be scoped before privilege");

  state.rows=[
    ...state.rows,
    ...scenarios.map((agent_code,i)=>({id:"own-agent-"+i,organization_id:"A",agent_code,display_name:"OWN_AGENT_"+i,name:"OWN_AGENT_"+i})),
  ];
  reset();
  const output=await page();
  assert.equal(output.type,"main");
  const leaks=JSON.stringify(output);
  assert.doesNotMatch(leaks,/PRIVATE_TENANT_B|foreign-agent-/);
  assert.match(leaks,/OWN_AGENT_/);
  assert.equal(state.providerCalls,0);
  for(const query of state.queries.filter(q=>q.table==="agents"||q.table==="agent_evaluation_batches")){
    assert(query.filters.some(([key,val])=>key==="organization_id"&&val==="A"),
      "all privileged agent/evaluation queries must scope to A");
  }
  console.log("PASS W06 real Evaluation page: unauthenticated blocked before service role; owner A cannot discover/run canonical B fleet; own A renders; B names never returned; no provider calls.");
}finally{delete globalThis.w06EvaluationScope;}
