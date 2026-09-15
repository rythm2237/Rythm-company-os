import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dispatchProjectWork } from "@/lib/projects/project-operating-system";
import { dispatchProjectKnowledge } from "@/lib/projects/project-knowledge";
import { dispatchAutonomousProjectMeetings } from "@/lib/projects/project-autonomous-meetings";
import { dispatchApprovedProjectProposalActions } from "@/lib/projects/project-proposal-execution";
import { dispatchApprovedProjectToolExecutions, reconcileDispatchedProjectProposals } from "@/lib/projects/project-tool-execution";
import { dispatchConnectionSetupSessions } from "@/lib/integrations/connection-setup-agent";

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
  catch(error){
    const message=error instanceof Error?error.message:"Unknown dispatcher error";
    console.error(`project_dispatch_${step}_failed`,message);
    errors.push({step,error:message});
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
    if(health.error){console.error("project_health_refresh_failed",health.error.message);errors.push({step:"health",error:health.error.message});}
    if(meetingRecovery.error){console.error("project_meeting_recovery_failed",meetingRecovery.error.message);errors.push({step:"meeting_recovery",error:meetingRecovery.error.message});}

    const [knowledgeResults,connectionSetupResults]=await Promise.all([
      isolated("knowledge",()=>dispatchProjectKnowledge(service,{claimLimit:4}),errors,[]),
      isolated("connection_setup",()=>dispatchConnectionSetupSessions(service,{limit:2}),errors,[]),
    ]);
    const proposalResults=await isolated("proposal_bridge",()=>dispatchApprovedProjectProposalActions(),errors,[]);
    const proposalConvergence=await isolated("proposal_convergence",()=>reconcileDispatchedProjectProposals(),errors,[]);
    const [taskResults,meetingResults]=await Promise.all([
      isolated("tasks",()=>dispatchProjectWork(service),errors,[]),
      isolated("meetings",()=>dispatchAutonomousProjectMeetings(service),errors,[]),
    ]);
    const toolResults=await isolated("external_actions",()=>dispatchApprovedProjectToolExecutions(),errors,[]);
    const terminal=await service.rpc("reconcile_project_execution_terminal_states_v1");
    if(terminal.error){console.error("project_terminal_reconciliation_failed",terminal.error.message);errors.push({step:"terminal_reconciliation",error:terminal.error.message});}

    return NextResponse.json({
      ok:true,degraded:errors.length>0,errors,
      processed:knowledgeResults.length+connectionSetupResults.length+taskResults.length+meetingResults.length+proposalResults.length+proposalConvergence.length+toolResults.length,
      healthEvents:Number(health.data??0),recoveredMeetings:Number(meetingRecovery.data??0),terminalExecutions:Number(terminal.data??0),
      knowledge:knowledgeResults,connectionSetup:connectionSetupResults,tasks:taskResults,meetings:meetingResults,proposals:proposalResults,proposalConvergence,externalActions:toolResults,
    });
  }catch(error){
    console.error("project_dispatch_failed",error);
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Project dispatcher failed."},{status:500});
  }
}