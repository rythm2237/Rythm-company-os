import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dispatchProjectWorkV2 } from "@/lib/projects/project-work-v2";
import { dispatchProjectKnowledge } from "@/lib/projects/project-knowledge";
import { dispatchAutonomousProjectMeetings } from "@/lib/projects/project-autonomous-meetings";
import { dispatchApprovedProjectProposalActions } from "@/lib/projects/project-proposal-execution";
import { dispatchApprovedProjectToolExecutions, reconcileDispatchedProjectProposals } from "@/lib/projects/project-tool-execution";
import { superviseProjectExecutions } from "@/lib/projects/project-supervisor";
import { reconcileProjectCompletionRuntime } from "@/lib/projects/project-completion";
import { ensureProjectLifecycleContinuation } from "@/lib/projects/project-completion-continuation";
import { processContinuousProgramReviews } from "@/lib/projects/continuous-program-review-worker";
import { dispatchConnectionSetupSessions } from "@/lib/integrations/connection-setup-agent";
import { reconcileGoogleConnections } from "@/lib/integrations/connections/google-connection-reconciliation";
import { dispatchDiagnostic, retryIdempotentRpc, type DispatchHealth } from "@/lib/projects/project-dispatch-resilience";
import { recordPilotSignal } from "@/lib/observability/pilot";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

function secureEqual(left:string,right:string){
  const a=Buffer.from(left),b=Buffer.from(right);
  return a.length===b.length&&timingSafeEqual(a,b);
}

async function authorizeDispatcher(request:Request,service:NonNullable<ReturnType<typeof createServerSupabaseClient>>){
  const authorization=request.headers.get("authorization")??"";
  const prefix="Bearer ";
  if(!authorization.startsWith(prefix))return false;
  const token=authorization.slice(prefix.length).trim();
  if(token.length<24)return false;
  const legacySecret=process.env.CRON_SECRET?.trim();
  if(legacySecret&&secureEqual(token,legacySecret))return true;
  const config=await retryIdempotentRpc(()=>service.from("project_scheduler_config").select("dispatcher_secret_hash,enabled").eq("id",true).maybeSingle());
  if(config.error)throw new Error("DISPATCH_AUTH_UPSTREAM_UNAVAILABLE");
  if(!config.data?.enabled||!config.data.dispatcher_secret_hash)return false;
  const presentedHash=createHash("sha256").update(token).digest("hex");
  return secureEqual(presentedHash,String(config.data.dispatcher_secret_hash));
}

type StepError={step:string;error:string};
type DispatchContext={traceId:string;deadline:number};
function reportFailure(ctx:DispatchContext,errors:StepError[],step:string,code="STEP_FAILED"){
  errors.push({step,error:code});
  console.error("project_dispatch_alert",dispatchDiagnostic(ctx.traceId,step,code));
  recordPilotSignal({traceId:ctx.traceId,surface:"background_jobs",severity:"P1",outcome:"degraded",code:"UPSTREAM_UNAVAILABLE",httpStatus:503});
}
async function isolated<T>(step:string,work:()=>Promise<T>,errors:StepError[],fallback:T,ctx:DispatchContext):Promise<T>{
  // Do not launch new mutating work near the function deadline.
  // Never Promise.race an already running worker: its DB lease must be honored.
  if(Date.now()>=ctx.deadline){
    reportFailure(ctx,errors,step,"BUDGET_DEFERRED");
    return fallback;
  }
  const started=Date.now();
  try{
    const result=await work();
    console.info("project_dispatch_step",JSON.stringify({traceId:ctx.traceId,step,durationMs:Date.now()-started,status:"completed"}));
    return result;
  }catch{
    reportFailure(ctx,errors,step);
    return fallback;
  }
}

export async function GET(request:Request){
  const traceId=randomUUID(); // never trust caller-supplied tracing identifiers
  const ctx:DispatchContext={traceId,deadline:Date.now()+240_000};
  const headers={"Cache-Control":"no-store","X-Trace-Id":traceId};
  const service=createServerSupabaseClient();
  if(!service){
    console.error("project_dispatch_alert",dispatchDiagnostic(traceId,"client","UNAVAILABLE"));
    recordPilotSignal({traceId,surface:"background_jobs",severity:"P0",outcome:"failed",code:"DISPATCH_UNAVAILABLE",httpStatus:503});
    return NextResponse.json({ok:false,error:"Project dispatcher is unavailable.",traceId},{status:503,headers});
  }
  try{
    if(!(await authorizeDispatcher(request,service)))
      return NextResponse.json({ok:false,error:"Unauthorized scheduler request.",traceId},{status:401,headers});
  }catch{
    console.error("project_dispatch_alert",dispatchDiagnostic(traceId,"authorization","UPSTREAM_UNAVAILABLE"));
    recordPilotSignal({traceId,surface:"background_jobs",severity:"P0",outcome:"failed",code:"UPSTREAM_UNAVAILABLE",httpStatus:503});
    return NextResponse.json({ok:false,error:"Dispatcher authorization service unavailable.",traceId},{status:503,headers});
  }
  // Global DB lease: a failed/unapplied W13 migration must fail closed.
  let lease;
  try{lease=await service.rpc("acquire_project_dispatch_lease_v1",{p_trace_id:traceId,p_lease_seconds:360});}
  catch{lease={data:null,error:true};}
  if(lease.error){
    console.error("project_dispatch_alert",dispatchDiagnostic(traceId,"lease","UPSTREAM_UNAVAILABLE"));
    recordPilotSignal({traceId,surface:"background_jobs",severity:"P0",outcome:"failed",code:"DISPATCH_UNAVAILABLE",httpStatus:503});
    return NextResponse.json({ok:false,error:"Dispatch lease unavailable.",traceId},{status:503,headers});
  }
  if(lease.data!==true)
    return NextResponse.json({ok:true,skipped:"already_running",traceId},{status:202,headers});
  const errors:StepError[]=[];
  let healthStatus:DispatchHealth="failed";
  let failedStep="dispatch",errorCode="UNEXPECTED_FAILURE";
  try{
    const [health,meetingRecovery]=await Promise.all([
      retryIdempotentRpc(()=>service.rpc("refresh_project_execution_health_v1"),{onRetry:(attempt)=>console.warn("project_dispatch_retry",JSON.stringify({traceId,step:"health",attempt}))}),
      service.rpc("recover_stale_project_autonomous_meeting_jobs_v1"),
    ]);
    if(health.error)reportFailure(ctx,errors,"health");
    if(meetingRecovery.error)reportFailure(ctx,errors,"meeting_recovery");

    const supervisorBefore=await isolated("supervisor_pre",()=>superviseProjectExecutions(service,4),errors,[],ctx);

    const [knowledgeResults,connectionSetupResults]=await Promise.all([
      isolated("knowledge",()=>dispatchProjectKnowledge(service,{claimLimit:1}),errors,[],ctx),
      isolated("connection_setup",()=>dispatchConnectionSetupSessions(service,{limit:1}),errors,[],ctx),
    ]);
    const proposalResults=await isolated("proposal_bridge",()=>dispatchApprovedProjectProposalActions(1),errors,[],ctx);
    const proposalConvergence=await isolated("proposal_convergence",()=>reconcileDispatchedProjectProposals(2),errors,[],ctx);
    const [taskResults,meetingResults]=await Promise.all([
      isolated("tasks",()=>dispatchProjectWorkV2(service,undefined,1),errors,[],ctx),
      isolated("meetings",()=>dispatchAutonomousProjectMeetings(service,undefined,1),errors,[],ctx),
    ]);

    const supervisorAfter=await isolated("supervisor_post",()=>superviseProjectExecutions(service,4),errors,[],ctx);
    const toolResults=await isolated("external_actions",()=>dispatchApprovedProjectToolExecutions(1),errors,[],ctx);
    const terminal=await service.rpc("reconcile_project_execution_terminal_states_v1");
    if(terminal.error)reportFailure(ctx,errors,"terminal_reconciliation");

    const runtimeCriteria=await service.rpc("ensure_project_completion_runtime_v1");
    if(runtimeCriteria.error)reportFailure(ctx,errors,"completion_runtime_sync");
    const startedObservations=await service.rpc("start_eligible_project_observations_v1");
    if(startedObservations.error)reportFailure(ctx,errors,"observation_start");

    const completion=await isolated("completion",()=>reconcileProjectCompletionRuntime(service),errors,{observationWindows:0,projectsEvaluated:0,normalizedTasks:0,generatedReports:0},ctx);
    const lifecycleContinuation=await isolated("completion_continuation",()=>ensureProjectLifecycleContinuation(service,3),errors,[],ctx);
    // Feature gated until the database migration and lifecycle reconciliation are approved.
    // Creates durable review intents only; actual evidence gathering and proposals remain governed.
    let continuousReviewsQueued=0;
    let continuousReviewResults:Awaited<ReturnType<typeof processContinuousProgramReviews>>=[];
    if(process.env.CONTINUOUS_PROGRAM_ENGINE_ENABLED==="true"){
      const claimed=await service.rpc("claim_due_continuous_program_reviews_v1",{p_limit:10});
      if(claimed.error){
        reportFailure(ctx,errors,"continuous_reviews");
      }else continuousReviewsQueued=Array.isArray(claimed.data)?claimed.data.length:0;
      continuousReviewResults=await isolated("continuous_review_worker",()=>processContinuousProgramReviews(service,1),errors,[],ctx);
    }

    // One-tenant operator-controlled read-only recheck. Reuses the authorized scheduler;
    // no new cron, OAuth scopes or credential exposure.
    const googleRepairOrganizationId = process.env.GOOGLE_CONNECTION_REPAIR_ORG_ID?.trim() ?? "";
    const googleRepairResults = process.env.GOOGLE_CONNECTION_REPAIR_ENABLED === "true" && googleRepairOrganizationId
      ? await isolated("google_connection_recheck",
          () => reconcileGoogleConnections(service, googleRepairOrganizationId), errors, [], ctx)
      : [];

    // This RPC resolves and reinserts health rows; retrying it could duplicate audit activity.
    const completionHealth=await service.rpc("refresh_project_completion_health_v1");
    if(completionHealth.error)reportFailure(ctx,errors,"completion_health");

    const supervisorResults=[...supervisorBefore,...supervisorAfter];
    // Only aggregate counters and stable failure labels cross the scheduler boundary.
    healthStatus=errors.length?"degraded":"healthy";
    failedStep=errors[0]?.step??"";
    errorCode=errors[0]?.error??"";
    return NextResponse.json({
      ok:errors.length===0,
      degraded:errors.length>0,
      traceId,
      failedSteps:errors.map(({step})=>step),
      processed:knowledgeResults.length+connectionSetupResults.length+taskResults.length+meetingResults.length+proposalResults.length+proposalConvergence.length+toolResults.length+supervisorResults.length+lifecycleContinuation.length,
      healthEvents:Number(health.data??0),
      completionHealthEvents:Number(completionHealth.data??0),
      recoveredMeetings:Number(meetingRecovery.data??0),
      terminalExecutions:Number(terminal.data??0),
      criteriaSynced:Number(runtimeCriteria.data??0),
      observationsStarted:Number(startedObservations.data??0),
      continuousReviewsQueued,
      continuousReviewsProcessed:continuousReviewResults.length,
      googleConnectionsChecked:googleRepairResults.length,
      completionEvaluations:completion.projectsEvaluated,
    },{status:errors.length?503:200,headers});
  }catch{
    console.error("project_dispatch_alert",dispatchDiagnostic(traceId,"dispatch","UNEXPECTED_FAILURE"));
    recordPilotSignal({traceId,surface:"background_jobs",severity:"P0",outcome:"failed",code:"DISPATCH_UNAVAILABLE",httpStatus:503});
    return NextResponse.json({ok:false,error:"Project dispatcher failed.",traceId},{status:503,headers});
  }finally{
    try{
      const completed=await service.rpc("complete_project_dispatch_lease_v1",{
        p_trace_id:traceId,p_status:healthStatus,p_failed_step:failedStep,p_error_code:errorCode,
      });
      if(completed.error||completed.data!==true)
        console.error("project_dispatch_alert",dispatchDiagnostic(traceId,"lease_completion","UPSTREAM_UNAVAILABLE"));
    }catch{
      console.error("project_dispatch_alert",dispatchDiagnostic(traceId,"lease_completion","UPSTREAM_UNAVAILABLE"));
    }
  }
}
