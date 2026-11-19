import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { dispatchDiagnostic, isTransientUpstreamFailure, retryIdempotentRpc } from "../lib/projects/project-dispatch-resilience";

async function main(){

const source=(file:string)=>fs.readFileSync(file,"utf8");
const route=source("app/api/projects/dispatch/route.ts");
const tasks=source("lib/projects/project-work-v2.ts");
const meetings=source("lib/projects/project-autonomous-meetings.ts");
const proposals=source("lib/projects/project-proposal-execution.ts");
const migration=source("supabase/migrations/20261119113000_project_dispatch_resilience.sql");

// Deterministic synthetic 502 / 503 / 504 + backoff tests. No network, AI, or external actions.
assert.equal(isTransientUpstreamFailure({status:502}),true);
assert.equal(isTransientUpstreamFailure({status:504}),true);
assert.equal(isTransientUpstreamFailure({code:"PGRST000"}),true);
assert.equal(isTransientUpstreamFailure({code:"28P01"}),false);
assert.equal(isTransientUpstreamFailure({status:401}),false);
let attempts=0;
const sleeps:number[]=[];
const recovered=await retryIdempotentRpc(async()=>{
  attempts++;
  return attempts<3?{data:null,error:{message:"sensitive-provider-body",code:"PGRST000"},status:502}:{data:1,error:null,status:200};
},{wait:async ms=>{sleeps.push(ms);}});
assert.equal(attempts,3);
assert.equal(recovered.data,1);
assert.deepEqual(sleeps,[120,240]);
attempts=0;
const denied=await retryIdempotentRpc(async()=>{attempts++;return {error:{status:401, message:"private"}};},{wait:async()=>{}});
assert.equal(attempts,1);
assert.equal(denied.error?.status,401);
attempts=0;
const exhausted=await retryIdempotentRpc(async()=>{attempts++;return {error:{status:502}};},{wait:async()=>{}});
assert.equal(attempts,3);
assert.equal(exhausted.error?.status,502);
const trace=randomUUID(), alert=dispatchDiagnostic(trace,"health","UPSTREAM_UNAVAILABLE");
assert.deepEqual(JSON.parse(alert),{traceId:trace,step:"health",errorCode:"UPSTREAM_UNAVAILABLE"});
assert.equal(alert.includes("sensitive-provider-body"),false);

// Structural queue integration guard: scheduler does NOT retry claims, AI, approvals or external action jobs.
assert.equal((route.match(/retryIdempotentRpc\(/g)??[]).length,2);
assert.ok(route.includes('const completionHealth=await service.rpc("refresh_project_completion_health_v1")'),"non-idempotent completion health must not retry");
assert.ok(route.includes('service.rpc("acquire_project_dispatch_lease_v1"'));
assert.ok(route.includes('service.rpc("complete_project_dispatch_lease_v1"'));
assert.ok(route.indexOf('await authorizeDispatcher(')<route.indexOf('acquire_project_dispatch_lease_v1'));
assert.ok(route.includes('dispatchProjectWorkV2(service,undefined,1)'));
assert.ok(route.includes('dispatchAutonomousProjectMeetings(service,undefined,1)'));
assert.ok(route.includes("dispatchApprovedProjectToolExecutions(1)"),"governed actions stay enabled but are bounded to one per tick");
assert.ok(route.includes('reportFailure(ctx,errors,"continuous_reviews")'));
assert.ok(route.includes('console.error("project_dispatch_alert"'));
assert.ok(tasks.includes('claim_project_task_runs_v1'));
assert.ok(meetings.includes('claim_project_autonomous_meeting_jobs_v1'));
assert.ok(proposals.includes("idempotencyKey:\`project-proposal:"));
assert.ok(!route.includes("console.error(\"project_dispatch_failed\")"));
assert.ok(migration.includes("enable row level security"));
assert.ok(migration.includes("grant execute on function public.acquire_project_dispatch_lease_v1(uuid,integer) to service_role"));

// Execute the real W13 SQL migration against a disposable, offline PostgreSQL emulator.
// This is NOT a deployed Supabase staging test, nor a live Vercel 502 injection.
const db=new PGlite();
try{
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(migration);
  const allowed=await db.query<{anonymous:boolean;authenticated:boolean;service:boolean}>(
    "select has_function_privilege('anon','public.acquire_project_dispatch_lease_v1(uuid,integer)','EXECUTE') as anonymous, has_function_privilege('authenticated','public.acquire_project_dispatch_lease_v1(uuid,integer)','EXECUTE') as authenticated, has_function_privilege('service_role','public.acquire_project_dispatch_lease_v1(uuid,integer)','EXECUTE') as service"
  );
  assert.deepEqual(allowed.rows[0],{anonymous:false,authenticated:false,service:true});

  const owner1=randomUUID(),owner2=randomUUID();
  const [claim1,claim2]=await Promise.all([
    db.query<{ok:boolean}>("select public.acquire_project_dispatch_lease_v1($1::uuid,360) as ok",[owner1]),
    db.query<{ok:boolean}>("select public.acquire_project_dispatch_lease_v1($1::uuid,360) as ok",[owner2]),
  ]);
  assert.equal(Number(claim1.rows[0].ok)+Number(claim2.rows[0].ok),1,"only one dispatcher owns the lease");
  const winner=claim1.rows[0].ok?owner1:owner2;
  const loser=winner===owner1?owner2:owner1;
  const notOwner=await db.query<{ok:boolean}>(
    "select public.complete_project_dispatch_lease_v1($1::uuid,'healthy',null,null) as ok",[loser]
  );
  assert.equal(notOwner.rows[0].ok,false,"a stale/foreign owner cannot clear the lease");
  const completed=await db.query<{ok:boolean}>(
    "select public.complete_project_dispatch_lease_v1($1::uuid,'degraded','health','UPSTREAM_UNAVAILABLE') as ok",[winner]
  );
  assert.equal(completed.rows[0].ok,true);
  const state=await db.query<{last_status:string;consecutive_failures:number;last_failed_step:string;last_error_code:string}>(
    "select last_status,consecutive_failures,last_failed_step,last_error_code from public.project_dispatch_runtime"
  );
  assert.deepEqual(state.rows[0],{last_status:"degraded",consecutive_failures:1,last_failed_step:"health",last_error_code:"UPSTREAM_UNAVAILABLE"});
  const failureEvents=await db.query<{trace_id:string;dispatch_status:string;failed_step:string;error_code:string}>(
    "select trace_id::text,dispatch_status,failed_step,error_code from public.project_dispatch_failure_events"
  );
  assert.deepEqual(failureEvents.rows,[{trace_id:winner,dispatch_status:"degraded",failed_step:"health",error_code:"UPSTREAM_UNAVAILABLE"}],
    "durable dispatch alert must be correlated and sanitized");
  const acl=await db.query<{allowed:boolean}>(
    "select has_table_privilege('anon','public.project_dispatch_failure_events','SELECT') as allowed"
  );
  assert.equal(acl.rows[0].allowed,false,"anonymous users must not see dispatch alert ledger");

  const next=randomUUID();
  assert.equal((await db.query<{ok:boolean}>("select public.acquire_project_dispatch_lease_v1($1::uuid,360) as ok",[next])).rows[0].ok,true);
  assert.equal((await db.query<{ok:boolean}>("select public.complete_project_dispatch_lease_v1($1::uuid,'healthy') as ok",[next])).rows[0].ok,true);
  const health=await db.query<{last_status:string;consecutive_failures:number;last_error_code:string|null}>(
    "select last_status,consecutive_failures,last_error_code from public.project_dispatch_runtime"
  );
  assert.deepEqual(health.rows[0],{last_status:"healthy",consecutive_failures:0,last_error_code:null});

  const expired=randomUUID();
  assert.equal((await db.query<{ok:boolean}>("select public.acquire_project_dispatch_lease_v1($1::uuid,360) as ok",[expired])).rows[0].ok,true);
  await db.exec("update public.project_dispatch_runtime set lease_expires_at=now()-interval '1 second'");
  const recovery=randomUUID();
  assert.equal((await db.query<{ok:boolean}>("select public.acquire_project_dispatch_lease_v1($1::uuid,360) as ok",[recovery])).rows[0].ok,true);
  assert.equal((await db.query<{ok:boolean}>("select public.complete_project_dispatch_lease_v1($1::uuid,'healthy') as ok",[expired])).rows[0].ok,false);
  assert.equal((await db.query<{ok:boolean}>("select public.complete_project_dispatch_lease_v1($1::uuid,'healthy') as ok",[recovery])).rows[0].ok,true);
}finally{
  await db.close();
}
console.log("W13 PASS: synthetic 502 retry, trace redaction, offline atomic lease, queue integration guards");

}
main().catch(error=>{console.error(error);process.exitCode=1;});
