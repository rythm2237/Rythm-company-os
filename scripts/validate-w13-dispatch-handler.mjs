import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

// Execute the genuine dispatch route with entirely synthetic, offline upstreams.
// This is controlled upstream 502 injection in a mock environment, not hosted staging.
const requireForBundle=createRequire(process.cwd()+"/package.json");
const secret="W13_SYNTHETIC_CRON_SECRET_0123456789_abcdefghijklmnop";
const previousSecret=process.env.CRON_SECRET;
process.env.CRON_SECRET=secret;

let unlockTask=()=>{};
let taskStarted=()=>{};
const state={
  leaseOwner:null,
  healthFailuresRemaining:1,
  healthRpcAttempts:0,
  taskActions:0,
  meetingActions:0,
  gatewayActions:0,
  statuses:[],
  logs:[],
  taskBarrier:null,
};
globalThis.w13Fake=state;

const workerModules={
  "@/lib/projects/project-work-v2":
    "export async function dispatchProjectWorkV2(){globalThis.w13Fake.taskActions++;globalThis.w13Fake.taskStarted();await globalThis.w13Fake.taskBarrier;return [{id:'synthetic-task'}];}",
  "@/lib/projects/project-autonomous-meetings":
    "export async function dispatchAutonomousProjectMeetings(){globalThis.w13Fake.meetingActions++;return [{id:'synthetic-meeting'}];}",
  "@/lib/projects/project-tool-execution":
    "export async function dispatchApprovedProjectToolExecutions(){globalThis.w13Fake.gatewayActions++;return [{id:'synthetic-governed-action'}];} export async function reconcileDispatchedProjectProposals(){return [];}",
  "@/lib/projects/project-proposal-execution":
    "export async function dispatchApprovedProjectProposalActions(){return [];}",
  "@/lib/projects/project-supervisor":
    "export async function superviseProjectExecutions(){return [];}",
  "@/lib/projects/project-knowledge":
    "export async function dispatchProjectKnowledge(){return [];}",
  "@/lib/projects/project-completion":
    "export async function reconcileProjectCompletionRuntime(){return {observationWindows:0,projectsEvaluated:0,normalizedTasks:0,generatedReports:0};}",
  "@/lib/projects/project-completion-continuation":
    "export async function ensureProjectLifecycleContinuation(){return [];}",
  "@/lib/projects/continuous-program-review-worker":
    "export async function processContinuousProgramReviews(){return [];}",
  "@/lib/integrations/connection-setup-agent":
    "export async function dispatchConnectionSetupSessions(){return [];}",
  "@/lib/integrations/connections/google-connection-reconciliation":
    "export async function reconcileGoogleConnections(){return [];}",
  "@/lib/supabase/server":
    "export function createServerSupabaseClient(){return globalThis.w13Fake.db;}",
};
const db={
  from(){throw new Error("UNEXPECTED_DB_TABLE_IN_SYNTHETIC_DISPATCH");},
  async rpc(name,params){
    if(name==="acquire_project_dispatch_lease_v1"){
      const available=state.leaseOwner===null;
      if(available)state.leaseOwner=params.p_trace_id;
      return {data:available,error:null};
    }
    if(name==="complete_project_dispatch_lease_v1"){
      const owner=state.leaseOwner===params.p_trace_id;
      if(owner){state.leaseOwner=null;state.statuses.push(params.p_status);}
      return {data:owner,error:null};
    }
    if(name==="refresh_project_execution_health_v1"){
      state.healthRpcAttempts++;
      if(state.healthFailuresRemaining>0){
        state.healthFailuresRemaining--;
        return {data:null,error:{status:502,code:"PGRST000",message:"TENANT_B_PRIVATE_CUSTOMER_CONTENT"},status:502};
      }
    }
    return {data:0,error:null,status:200};
  },
};
state.db=db;

const oldLogs={error:console.error,warn:console.warn,info:console.info};
const capture=(...items)=>state.logs.push(items.map(String).join(" "));
console.error=capture;
console.warn=capture;
console.info=capture;
try{
  const compiled=await build({
    entryPoints:["app/api/projects/dispatch/route.ts"],
    bundle:true,write:false,platform:"node",format:"cjs",packages:"external",logLevel:"silent",
    plugins:[{
      name:"w13-synthetic-boundary",
      setup(b){
        b.onResolve({filter:/^@\//},args=>workerModules[args.path]?{path:args.path,namespace:"w13"}:null);
        b.onLoad({filter:/.*/,namespace:"w13"},args=>({contents:workerModules[args.path],loader:"js"}));
      },
    }],
  });
  const mod={exports:{}};
  new Function("require","module","exports",compiled.outputFiles[0].text)(
    requireForBundle,mod,mod.exports);
  const GET=mod.exports.GET;
  const request=(authorized=true)=>new Request("http://localhost/api/projects/dispatch",{
    headers:authorized?{authorization:"Bearer "+secret}:{},
  });
  assert.equal((await GET(request(false))).status,401);
  assert.equal(state.healthRpcAttempts,0,"unauthorized user must not reach upstream");

  state.taskBarrier=new Promise(resolve=>{unlockTask=resolve;});
  const started=new Promise(resolve=>{taskStarted=resolve;});
  state.taskStarted=()=>taskStarted();
  const first=GET(request());
  await started;
  // This request overlaps the first handler while it already owns the lease.
  const duplicate=await GET(request());
  assert.equal(duplicate.status,202);
  assert.equal((await duplicate.json()).skipped,"already_running");
  assert.equal(state.taskActions,1,"no second task execution on overlapping request");
  unlockTask();
  const firstResponse=await first;
  assert.equal(firstResponse.status,200);
  const firstBody=await firstResponse.json();
  assert.equal(firstBody.ok,true);
  assert.equal(state.healthRpcAttempts,2,"transient 502 must retry once");
  assert.equal(state.taskActions,1);
  assert.equal(state.gatewayActions,1);
  assert.equal(state.meetingActions,1);
  assert.equal(firstResponse.headers.get("X-Trace-Id"),firstBody.traceId);
  assert.equal(state.statuses[0],"healthy");

  state.taskBarrier=Promise.resolve();
  state.taskStarted=()=>{};
  state.healthFailuresRemaining=3;
  const degraded=await GET(request());
  assert.equal(degraded.status,503);
  const body=await degraded.json();
  assert.equal(body.ok,false);
  assert.equal(body.degraded,true);
  assert.ok(body.failedSteps.includes("health"));
  assert.equal(state.healthRpcAttempts,5,"transient failures capped at three tries in second tick");
  assert.equal(state.taskActions,2,"a failed maintenance call must not replay task");
  assert.equal(state.gatewayActions,2);
  assert.equal(state.meetingActions,2);
  assert.equal(state.statuses[1],"degraded");
  assert.equal(state.leaseOwner,null);
  assert.equal(state.logs.join("\n").includes("TENANT_B_PRIVATE_CUSTOMER_CONTENT"),false);
  assert.equal(JSON.stringify(body).includes("TENANT_B_PRIVATE_CUSTOMER_CONTENT"),false);
  const alert=state.logs.find(line=>line.includes("project_dispatch_alert"));
  assert.ok(alert,"Vercel server log must contain sanitized error alert");
  assert.ok(alert.includes(body.traceId),"error alert must carry request trace ID");
  console.info=oldLogs.info;
  console.info("W13 PASS: real handler synthetic 502 retry, 503 degraded, concurrent request 202, trace-only error, no duplicate actions");
}finally{
  console.error=oldLogs.error;
  console.warn=oldLogs.warn;
  console.info=oldLogs.info;
  if(previousSecret===undefined)delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET=previousSecret;
  delete globalThis.w13Fake;
}
