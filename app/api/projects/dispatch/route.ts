import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dispatchProjectWork } from "@/lib/projects/project-operating-system";
import { dispatchProjectKnowledge } from "@/lib/projects/project-knowledge";
import { dispatchAutonomousProjectMeetings } from "@/lib/projects/project-autonomous-meetings";
import { dispatchApprovedProjectProposalActions } from "@/lib/projects/project-proposal-execution";
import { dispatchApprovedProjectToolExecutions, reconcileDispatchedProjectProposals } from "@/lib/projects/project-tool-execution";

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

  // Existing Vercel/Admin Automation CRON_SECRET remains a valid operational fallback.
  const legacySecret=process.env.CRON_SECRET?.trim();
  if(legacySecret&&secureEqual(token,legacySecret))return true;

  // Database scheduler plaintext exists only in Supabase Vault. The app receives only its hash.
  const config=await service.from("project_scheduler_config").select("dispatcher_secret_hash,enabled").eq("id",true).maybeSingle();
  if(config.error||!config.data?.enabled||!config.data.dispatcher_secret_hash)return false;
  const presentedHash=createHash("sha256").update(token).digest("hex");
  return secureEqual(presentedHash,String(config.data.dispatcher_secret_hash));
}

export async function GET(request:Request){
  const service=createServerSupabaseClient();
  if(!service)return NextResponse.json({ok:false,error:"Project dispatcher is unavailable."},{status:503});
  if(!(await authorizeDispatcher(request,service)))return NextResponse.json({ok:false,error:"Unauthorized scheduler request."},{status:401});
  try{
    const [health,meetingRecovery]=await Promise.all([
      service.rpc("refresh_project_execution_health_v1"),
      service.rpc("recover_stale_project_autonomous_meeting_jobs_v1"),
    ]);
    if(health.error)console.error("project_health_refresh_failed",health.error.message);
    if(meetingRecovery.error)console.error("project_meeting_recovery_failed",meetingRecovery.error.message);
    // Knowledge ingestion runs first so tasks claimed in this cycle can use newly indexed project files.
    const knowledgeResults=await dispatchProjectKnowledge(service,{claimLimit:4});
    // Proposal continuation state must converge before task claiming. Otherwise an approved proposal
    // could be claimed as generic AI work before its external action is durably handed to the Gateway.
    const proposalResults=await dispatchApprovedProjectProposalActions();
    // This immediately catches Gateway outcomes such as simulate/deny before the continuation can run.
    const proposalConvergence=await reconcileDispatchedProjectProposals();
    const [taskResults,meetingResults]=await Promise.all([
      dispatchProjectWork(service),
      dispatchAutonomousProjectMeetings(service),
    ]);
    // Run after the proposal bridge so newly authorized requests can execute in this same scheduler cycle.
    const toolResults=await dispatchApprovedProjectToolExecutions();
    // Reconcile all durable terminal states so cancelled optional work cannot strand a project.
    const terminal=await service.rpc("reconcile_project_execution_terminal_states_v1");
    if(terminal.error)console.error("project_terminal_reconciliation_failed",terminal.error.message);
    return NextResponse.json({
      ok:true,
      processed:knowledgeResults.length+taskResults.length+meetingResults.length+proposalResults.length+proposalConvergence.length+toolResults.length,
      healthEvents:Number(health.data??0),
      recoveredMeetings:Number(meetingRecovery.data??0),
      terminalExecutions:Number(terminal.data??0),
      knowledge:knowledgeResults,
      tasks:taskResults,
      meetings:meetingResults,
      proposals:proposalResults,
      proposalConvergence,
      externalActions:toolResults,
    });
  }catch(error){
    console.error("project_dispatch_failed",error);
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Project dispatcher failed."},{status:500});
  }
}
