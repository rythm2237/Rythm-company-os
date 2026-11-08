import { createHash, timingSafeEqual } from "node:crypto";
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
  const config=await service.from("project_scheduler_config").select("dispatcher_secret_hash,enabled").eq("id",true).maybeSingle();
  if(config.error||!config.data?.enabled||!config.data.dispatcher_secret_hash)return false;
  const presentedHash=createHash("sha256").update(token).digest("hex");
  return secureEqual(presentedHash,String(config.data.dispatcher_secret_hash));
}

type StepError={step:string;error:string};
async function isolated<T>(step:string,work:()=>Promise<T>,errors:StepError[],fallback:T):Promise<T>{
  try{return await work();}
  catch{
    console.error("project_dispatch_step_failed",step);
    errors.push({step,error:"STEP_FAILED"});
    return fallback;
  }
}

export async function GET(request:Request){
  const service=createServerSupabaseClient();
  if(!service)return NextResponse.json({ok:false,error:"Project dispatcher is unavailable."},{status:503});
  if(!(await authorizeDispatcher(request,service)))return NextResponse.json({ok:false,error:"Unauthorized scheduler request."},{status:401});
  const errors:StepError[]=[];
  try{
    const [health,meetingRecovery]=await Promise.all([
      service.rpc("refresh_project_execution_health_v1"),
      service.rpc("recover_stale_project_autonomous_meeting_jobs_v1"),
    ]);
    if(health.error){console.error("project_dispatch_step_failed","health");errors.push({step:"health",error:"STEP_FAILED"});}
    if(meetingRecovery.error){console.error("project_dispatch_step_failed","meeting_recovery");errors.push({step:"meeting_recovery",error:"STEP_FAILED"});}

    const supervisorBefore=await isolated("supervisor_pre",()=>superviseProjectExecutions(service),errors,[]);

    const [knowledgeResults,connectionSetupResults]=await Promise.all([
      isolated("knowledge",()=>dispatchProjectKnowledge(service,{claimLimit:4}),errors,[]),
      isolated("connection_setup",()=>dispatchConnectionSetupSessions(service,{limit:2}),errors,[]),
    ]);
    const proposalResults=await isolated("proposal_bridge",()=>dispatchApprovedProjectProposalActions(),errors,[]);
    const proposalConvergence=await isolated("proposal_convergence",()=>reconcileDispatchedProjectProposals(),errors,[]);
    const [taskResults,meetingResults]=await Promise.all([
      isolated("tasks",()=>dispatchProjectWorkV2(service),errors,[]),
      isolated("meetings",()=>dispatchAutonomousProjectMeetings(service),errors,[]),
    ]);

    const supervisorAfter=await isolated("supervisor_post",()=>superviseProjectExecutions(service),errors,[]);
    const toolResults=await isolated("external_actions",()=>dispatchApprovedProjectToolExecutions(),errors,[]);
    const terminal=await service.rpc("reconcile_project_execution_terminal_states_v1");
    if(terminal.error){console.error("project_dispatch_step_failed","terminal_reconciliation");errors.push({step:"terminal_reconciliation",error:"STEP_FAILED"});}

    const runtimeCriteria=await service.rpc("ensure_project_completion_runtime_v1");
    if(runtimeCriteria.error){console.error("project_dispatch_step_failed","completion_runtime_sync");errors.push({step:"completion_runtime_sync",error:"STEP_FAILED"});}
    const startedObservations=await service.rpc("start_eligible_project_observations_v1");
    if(startedObservations.error){console.error("project_dispatch_step_failed","observation_start");errors.push({step:"observation_start",error:"STEP_FAILED"});}

    const completion=await isolated("completion",()=>reconcileProjectCompletionRuntime(service),errors,{observationWindows:0,projectsEvaluated:0,normalizedTasks:0,generatedReports:0});
    const lifecycleContinuation=await isolated("completion_continuation",()=>ensureProjectLifecycleContinuation(service),errors,[]);
    // Feature gated until the database migration and lifecycle reconciliation are approved.
    // Creates durable review intents only; actual evidence gathering and proposals remain governed.
    let continuousReviewsQueued=0;
    let continuousReviewResults:Awaited<ReturnType<typeof processContinuousProgramReviews>>=[];
    if(process.env.CONTINUOUS_PROGRAM_ENGINE_ENABLED==="true"){
      const claimed=await service.rpc("claim_due_continuous_program_reviews_v1",{p_limit:10});
      if(claimed.error){
        console.error("project_dispatch_step_failed","continuous_reviews");
        errors.push({step:"continuous_reviews",error:"STEP_FAILED"});
      }else continuousReviewsQueued=Array.isArray(claimed.data)?claimed.data.length:0;
      continuousReviewResults=await isolated("continuous_review_worker",()=>processContinuousProgramReviews(service,5),errors,[]);
    }

    // One-tenant operator-controlled read-only recheck. Reuses the authorized scheduler;
    // no new cron, OAuth scopes or credential exposure.
    const googleRepairOrganizationId = process.env.GOOGLE_CONNECTION_REPAIR_ORG_ID?.trim() ?? "";
    const googleRepairResults = process.env.GOOGLE_CONNECTION_REPAIR_ENABLED === "true" && googleRepairOrganizationId
      ? await isolated("google_connection_recheck",
          () => reconcileGoogleConnections(service, googleRepairOrganizationId), errors, [])
      : [];

    const completionHealth=await service.rpc("refresh_project_completion_health_v1");
    if(completionHealth.error){console.error("project_dispatch_step_failed","completion_health");errors.push({step:"completion_health",error:"STEP_FAILED"});}

    const supervisorResults=[...supervisorBefore,...supervisorAfter];
    // Only aggregate counters and stable failure labels cross the scheduler boundary.
    return NextResponse.json({
      ok:true,
      degraded:errors.length>0,
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
    },{headers:{"Cache-Control":"no-store"}});
  }catch{
    console.error("project_dispatch_failed");
    return NextResponse.json({ok:false,error:"Project dispatcher failed."},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
