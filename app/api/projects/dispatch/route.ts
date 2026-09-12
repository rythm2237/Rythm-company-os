import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dispatchProjectWork } from "@/lib/projects/project-operating-system";
import { dispatchProjectKnowledge } from "@/lib/projects/project-knowledge";
import { dispatchAutonomousProjectMeetings } from "@/lib/projects/project-autonomous-meetings";
import { dispatchApprovedProjectProposalActions } from "@/lib/projects/project-proposal-execution";
import { dispatchApprovedProjectToolExecutions } from "@/lib/projects/project-tool-execution";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET?.trim();
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({ok:false,error:"Unauthorized scheduler request."},{status:401});
  const service=createServerSupabaseClient();
  if(!service)return NextResponse.json({ok:false,error:"Project dispatcher is unavailable."},{status:503});
  try{
    const health=await service.rpc("refresh_project_execution_health_v1");
    if(health.error)console.error("project_health_refresh_failed",health.error.message);
    // Knowledge ingestion runs first so tasks claimed in this cycle can use newly indexed project files.
    const knowledgeResults=await dispatchProjectKnowledge(service,{claimLimit:4});
    // Proposal continuation state must converge before task claiming. Otherwise an approved proposal
    // could be claimed as generic AI work before its external action is durably handed to the Gateway.
    const proposalResults=await dispatchApprovedProjectProposalActions();
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
      processed:knowledgeResults.length+taskResults.length+meetingResults.length+proposalResults.length+toolResults.length,
      healthEvents:Number(health.data??0),
      terminalExecutions:Number(terminal.data??0),
      knowledge:knowledgeResults,
      tasks:taskResults,
      meetings:meetingResults,
      proposals:proposalResults,
      externalActions:toolResults,
    });
  }catch(error){
    console.error("project_dispatch_failed",error);
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Project dispatcher failed."},{status:500});
  }
}
