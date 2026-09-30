import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProjectProgressSnapshot } from "@/lib/projects/project-progress";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Resolution = "approved" | "rejected";

async function projectContext(projectId:string){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok)return {ok:false as const,response:NextResponse.json({ok:false,error:auth.error},{status:auth.status})};
  const project=await auth.supabase.from("projects").select("id,name,project_code,status,stage,progress_percent,lifecycle_state,overall_project_progress,work_progress,deliverable_progress,implementation_progress,verification_progress,outcome_progress,acceptance_progress,closeout_progress,completion_eligible,next_required_action,last_heartbeat_at,updated_at").eq("id",projectId).eq("organization_id",auth.organizationId).maybeSingle();
  if(!project.data)return {ok:false as const,response:NextResponse.json({ok:false,error:"Project not found."},{status:404})};
  return {ok:true as const,auth,project:project.data};
}

export async function GET(request:Request){
  const projectId=new URL(request.url).searchParams.get("projectId")?.trim()??"";
  if(!projectId)return NextResponse.json({ok:false,error:"projectId is required."},{status:400});
  const context=await projectContext(projectId);if(!context.ok)return context.response;
  const {auth,project}=context;
  const [executionResult,tasksResult,approvalsResult,activityResult,agentsResult,progressSnapshot]=await Promise.all([
    auth.supabase.from("project_executions").select("id,execution_no,status,started_at,last_heartbeat_at,updated_at").eq("project_id",projectId).eq("organization_id",auth.organizationId).order("execution_no",{ascending:false}).limit(1).maybeSingle(),
    auth.supabase.from("project_task_runs").select("id,execution_id,task_key,title,status,priority,assigned_agent_id,waiting_on_approval_id,outcome_status,implementation_status,verification_status,next_required_action,started_at,completed_at,updated_at,agents(agent_code,display_name,name)").eq("project_id",projectId).eq("organization_id",auth.organizationId).order("priority").order("created_at"),
    auth.supabase.from("approval_requests").select("id,subject_type,subject_id,title,summary,risk_level,status,conditions,created_at,expires_at").eq("project_id",projectId).eq("organization_id",auth.organizationId).eq("status","pending").order("created_at",{ascending:false}),
    auth.supabase.from("project_activity_events").select("id,event_type,headline,detail,importance,agent_id,created_at").eq("project_id",projectId).eq("organization_id",auth.organizationId).order("created_at",{ascending:false}).limit(12),
    auth.supabase.from("project_agents").select("agent_id,status,assignment_role,agents(agent_code,display_name,name,role_title)").eq("project_id",projectId).eq("organization_id",auth.organizationId),
    getProjectProgressSnapshot(auth.supabase,auth.organizationId,{id:project.id,status:project.status,updated_at:project.updated_at}),
  ]);
  const allTasks=tasksResult.data??[];
  const latestExecutionId=executionResult.data?.id;
  const tasks=latestExecutionId?allTasks.filter((task:any)=>task.execution_id===latestExecutionId):allTasks;
  const approvals=approvalsResult.data??[];
  const activity=activityResult.data??[];
  const counts={running:progressSnapshot.runningTasks,queued:progressSnapshot.queuedTasks,waitingApproval:progressSnapshot.awaitingApproval,waitingOther:progressSnapshot.blockedTasks,completed:progressSnapshot.completedTasks,failed:progressSnapshot.failedTasks,total:progressSnapshot.totalTasks};
  return NextResponse.json({ok:true,project:{...project,progress_percent:progressSnapshot.overallProjectProgress,lifecycle_state:progressSnapshot.lifecycleState??project.lifecycle_state},progressSnapshot,execution:executionResult.data??null,counts,tasks:tasks.slice(0,24),approvals,activity,agents:agentsResult.data??[],serverTime:new Date().toISOString()});
}

export async function POST(request:Request){
  let body:{projectId?:string;approvalId?:string;resolution?:Resolution;responseNote?:string};
  try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"Invalid request."},{status:400});}
  const projectId=String(body.projectId??"").trim();
  const approvalId=String(body.approvalId??"").trim();
  const resolution=body.resolution;
  let responseNote=String(body.responseNote??"").trim();
  if(!projectId||!approvalId||!resolution||!["approved","rejected"].includes(resolution))return NextResponse.json({ok:false,error:"Invalid approval resolution."},{status:400});
  if(resolution==="rejected"&&responseNote.length<3)return NextResponse.json({ok:false,error:"Add a short reason before rejecting this request."},{status:400});
  if(resolution==="approved"&&responseNote.length<3)responseNote="Approved by CEO from Project Operating System.";

  const context=await projectContext(projectId);if(!context.ok)return context.response;
  const {auth}=context;
  const approvalResult=await auth.supabase.from("approval_requests").select("id,subject_type,subject_id,title,risk_level,status,expires_at").eq("id",approvalId).eq("project_id",projectId).eq("organization_id",auth.organizationId).maybeSingle();
  const approval=approvalResult.data;
  if(!approval)return NextResponse.json({ok:false,error:"Approval request not found."},{status:404});
  if(approval.status!=="pending")return NextResponse.json({ok:false,error:"This approval is no longer pending."},{status:409});
  const now=new Date();
  if(approval.expires_at&&new Date(approval.expires_at)<=now)return NextResponse.json({ok:false,error:"This approval request has expired."},{status:409});
  const resolvedAt=now.toISOString();

  let taskStatus:string|null=null;
  if(approval.subject_type==="project_task"){
    const taskResult=await auth.supabase.from("project_task_runs").select("id,status").eq("project_id",projectId).eq("organization_id",auth.organizationId).eq("waiting_on_approval_id",approvalId).maybeSingle();
    if(taskResult.error)return NextResponse.json({ok:false,error:`Task lookup failed: ${taskResult.error.message}`},{status:409});
    const task=taskResult.data;
    if(!task||task.status!=="waiting_for_approval")return NextResponse.json({ok:false,error:"The approval is no longer linked to an active project task. Refresh the page and try again."},{status:409});
  }

  const resolved=await auth.supabase.from("approval_requests").update({status:resolution,response_note:responseNote,resolved_at:resolvedAt,approver_user_id:auth.user.id}).eq("id",approvalId).eq("project_id",projectId).eq("organization_id",auth.organizationId).eq("status","pending").select("id,status").maybeSingle();
  if(resolved.error||!resolved.data)return NextResponse.json({ok:false,error:resolved.error?.message??"Approval could not be resolved."},{status:409});
  if(approval.subject_type==="project_task")taskStatus=resolution==="approved"?"queued":"blocked";

  await Promise.all([
    auth.supabase.from("audit_events").insert({organization_id:auth.organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:`approval.${resolution}`,object_type:"approval_request",object_id:approvalId,risk_level:approval.risk_level,payload:{title:approval.title,resolution,response_note:responseNote,human_authority:"Human CEO / Owner",source:"project_operating_view",resolved_at:resolvedAt}}),
    auth.supabase.from("project_activity_events").insert({organization_id:auth.organizationId,project_id:projectId,event_type:`approval.${resolution}`,headline:`CEO ${resolution}: ${approval.title}`,detail:responseNote,importance:resolution==="approved"?"major":"attention"}),
  ]);

  if(resolution==="approved"){
    const service=createServerSupabaseClient();
    if(service){
      const dispatched=await service.rpc("dispatch_project_os_from_database_v1");
      if(dispatched.error)console.warn("project_approval_dispatch_trigger_failed",dispatched.error.message);
    }
  }
  return NextResponse.json({ok:true,resolution,taskStatus});
}
