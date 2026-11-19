/**
 * W13: real hosted staging DB singleton lease + controlled upstream 502 injection.
 * All project workers, proposal bridges and external actions are synthetic shims.
 * Uses only an existing protected GitHub staging secret; never production credentials.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { createClient } from "@supabase/supabase-js";

const STAGING_REF = "viqjdgohtxqkrdgwtull";
const url = process.env.W13_STAGING_SUPABASE_URL;
const serviceKey = process.env.W13_STAGING_SERVICE_ROLE_KEY;
const anonKey = process.env.W13_STAGING_ANON_KEY;
assert.equal(process.env.W13_STAGING_REF, STAGING_REF, "must identify the authorized isolated staging project");
assert.equal(url, "https://" + STAGING_REF + ".supabase.co", "must never target production");
assert.ok(typeof serviceKey === "string" && serviceKey.length > 20, "missing protected staging service role key");
assert.ok(typeof anonKey === "string" && anonKey.length > 20, "missing staging publishable/anon key");
assert.equal(process.env.RYTHM_EXTERNAL_ACTIONS_ENABLED, "false");
assert.equal(process.env.RYTHM_AGENT_EXECUTION_ENABLED, "false");
const api = createClient(url, serviceKey, {auth:{persistSession:false,autoRefreshToken:false}});
const priorSecret=process.env.CRON_SECRET;
process.env.CRON_SECRET = "W13_LOCAL_SYNTHETIC_ONLY_" + randomUUID() + randomUUID();

const state={
  owner:null,
  taskRuns:0,
  meetingRuns:0,
  gatewayRuns:0,
  healthAttempts:0,
  remaining502:1,
  records:[],
  db:null,
  barrier:Promise.resolve(),
  signalStarted:()=>{},
};
globalThis.w13Hosted = state;

// Deliberately allow ONLY W13 lease RPCs to reach the hosted staging database.
// All other RPCs are a controlled non-mutating mock. No organization/task/customer data is selected.
state.db={
  from:()=>{throw Error("W13_NO_REAL_TABLE_ACCESS_ALLOWED");},
  rpc:async(name,args)=>{
    if(name==="acquire_project_dispatch_lease_v1"||name==="complete_project_dispatch_lease_v1"){
      return api.rpc(name,args);
    }
    if(name==="refresh_project_execution_health_v1"){
      state.healthAttempts++;
      if(state.remaining502>0){
        state.remaining502--;
        return {status:502,data:null,error:{status:502,code:"PGRST000",message:"TENANT_B_PRIVATE_DO_NOT_LOG"}};
      }
    }
    return {status:200,data:0,error:null};
  },
};

const stub={
  "@/lib/supabase/server":"export function createServerSupabaseClient(){return globalThis.w13Hosted.db;}",
  "@/lib/projects/project-work-v2":"export async function dispatchProjectWorkV2(){globalThis.w13Hosted.taskRuns++;globalThis.w13Hosted.signalStarted();await globalThis.w13Hosted.barrier;return [{id:'synthetic'}];}",
  "@/lib/projects/project-autonomous-meetings":"export async function dispatchAutonomousProjectMeetings(){globalThis.w13Hosted.meetingRuns++;return [{id:'synthetic'}];}",
  "@/lib/projects/project-knowledge":"export async function dispatchProjectKnowledge(){return [];}",
  "@/lib/projects/project-proposal-execution":"export async function dispatchApprovedProjectProposalActions(){return [];}",
  "@/lib/projects/project-tool-execution":"export async function reconcileDispatchedProjectProposals(){return [];} export async function dispatchApprovedProjectToolExecutions(){globalThis.w13Hosted.gatewayRuns++;return [{id:'synthetic'}];}",
  "@/lib/projects/project-supervisor":"export async function superviseProjectExecutions(){return [];}",
  "@/lib/projects/project-completion":"export async function reconcileProjectCompletionRuntime(){return {observationWindows:0,projectsEvaluated:0,normalizedTasks:0,generatedReports:0};}",
  "@/lib/projects/project-completion-continuation":"export async function ensureProjectLifecycleContinuation(){return [];}",
  "@/lib/projects/continuous-program-review-worker":"export async function processContinuousProgramReviews(){return [];}",
  "@/lib/integrations/connection-setup-agent":"export async function dispatchConnectionSetupSessions(){return [];}",
  "@/lib/integrations/connections/google-connection-reconciliation":"export async function reconcileGoogleConnections(){return [];}",
};

const original={error:console.error,info:console.info,warn:console.warn};
const logs=[];
function capture(...values){logs.push(values.map(String).join(" "));}
console.error=capture;console.info=capture;console.warn=capture;
try{
  // Verify hosted database healthy, fail closed before using the dispatch handler.
  const {error:readinessError}=await api.from("project_dispatch_runtime").select("last_status").limit(0);
  assert.equal(readinessError,null,"W13 migration not applied or service role lacks access");
  const pub=await fetch(url+"/rest/v1/rpc/acquire_project_dispatch_lease_v1",{
    method:"POST",
    headers:{apikey:anonKey,Authorization:"Bearer "+anonKey,"Content-Type":"application/json"},
    body:JSON.stringify({p_trace_id:randomUUID(),p_lease_seconds:360}),
    signal:AbortSignal.timeout(10000),
  });
  assert.ok([401,403,404].includes(pub.status),"anonymous role must not acquire protected lease");

  const b=await build({entryPoints:["app/api/projects/dispatch/route.ts"],bundle:true,write:false,platform:"node",format:"cjs",packages:"external",logLevel:"silent",plugins:[{
    name:"w13-hosted-fixtures",setup(builder){
      builder.onResolve({filter:/^@\//},args=>stub[args.path]?{path:args.path,namespace:"w13"}:null);
      builder.onLoad({filter:/.*/,namespace:"w13"},args=>({contents:stub[args.path],loader:"js"}));
    },
  }]});
  const requireInRepo=createRequire(process.cwd()+"/package.json");
  const loaded={exports:{}};
  new Function("require","module","exports",b.outputFiles[0].text)(requireInRepo,loaded,loaded.exports);
  const GET=loaded.exports.GET;
  const request=()=>new Request("http://localhost/api/projects/dispatch",{headers:{authorization:"Bearer "+process.env.CRON_SECRET}});
  const anonymous=await GET(new Request("http://localhost/api/projects/dispatch"));
  assert.equal(anonymous.status,401);
  assert.equal(state.healthAttempts,0,"unauthorized requests must never invoke an upstream");

  let begin;
  const began=new Promise(resolve=>{begin=resolve;});
  let finish;
  state.barrier=new Promise(resolve=>{finish=resolve;});
  state.signalStarted=()=>begin();
  const running=GET(request());
  await began;
  const concurrent=await GET(request());
  assert.equal(concurrent.status,202,"second concurrent request must skip");
  assert.equal((await concurrent.json()).skipped,"already_running");
  assert.equal(state.taskRuns,1,"concurrent calls must not duplicate tasks");
  finish();
  const recovered=await running;
  assert.equal(recovered.status,200);
  const recoveredBody=await recovered.json();
  assert.equal(recoveredBody.ok,true);
  assert.equal(state.healthAttempts,2,"single 502 must retry exactly once");
  assert.equal(state.taskRuns,1);
  assert.equal(state.gatewayRuns,1);
  assert.equal(state.meetingRuns,1);
  assert.equal(recovered.headers.get("X-Trace-Id"),recoveredBody.traceId);
  const firstHealth=await api.from("project_dispatch_runtime").select("last_status,consecutive_failures,active_trace_id").single();
  assert.equal(firstHealth.error,null);
  assert.equal(firstHealth.data.last_status,"healthy");
  assert.equal(firstHealth.data.active_trace_id,null);

  state.signalStarted=()=>{};
  state.barrier=Promise.resolve();
  state.remaining502=3;
  const failure=await GET(request());
  const failed=await failure.json();
  assert.equal(failure.status,503);
  assert.equal(failed.degraded,true);
  assert.ok(failed.failedSteps.includes("health"));
  assert.equal(state.healthAttempts,5,"bounded retry must stop at three");
  assert.equal(state.taskRuns,2,"a maintenance retry must not replay the synthetic task");
  assert.equal(state.gatewayRuns,2);
  const diagnostic=logs.find(x=>x.includes("project_dispatch_alert")&&x.includes(failed.traceId));
  assert.ok(diagnostic,"redacted error log must correlate to returned traceId");
  assert.ok(!diagnostic.includes("TENANT_B_PRIVATE_DO_NOT_LOG"));
  assert.ok(!logs.join("\n").includes("TENANT_B_PRIVATE_DO_NOT_LOG"));
  const stateAfter=await api.from("project_dispatch_runtime").select("last_status,consecutive_failures,active_trace_id").single();
  assert.equal(stateAfter.error,null);
  assert.equal(stateAfter.data.last_status,"degraded");
  assert.equal(stateAfter.data.consecutive_failures,1);
  assert.equal(stateAfter.data.active_trace_id,null);

  // Reset the staging-only status to healthy, leave no running lease or fixture.
  state.remaining502=0;
  const healthy=await GET(request());
  assert.equal(healthy.status,200);
  const final=await api.from("project_dispatch_runtime").select("last_status,consecutive_failures,active_trace_id").single();
  assert.equal(final.error,null);
  assert.equal(final.data.last_status,"healthy");
  assert.equal(final.data.consecutive_failures,0);
  assert.equal(final.data.active_trace_id,null);
}finally{
  console.error=original.error;console.info=original.info;console.warn=original.warn;
  if(priorSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=priorSecret;
  delete globalThis.w13Hosted;
}
console.log("W13 HOSTED STAGING PASS: real staging lease RPC, anon denied, synthetic upstream 502, 202 overlap, bounded retry, sanitized correlated trace, health recovery; no project/AI/external actions executed.");
