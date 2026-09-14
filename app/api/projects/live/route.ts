import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Resolution = "approved" | "rejected";

async function projectContext(projectId:string){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok)return {ok:false as const,response:NextResponse.json({ok:false,error:auth.error},{status:auth.status})};
  const project=await auth.supabase.from("projects").select("id,name,project_code,status,stage,progress_percent,last_heartbeat_at").eq("id",projectId).eq("organization_id",auth.organizationId).maybeSingle();
  if(!project.data)return {ok:false as const,response:NextResponse.json({ok:false,error:"Project not found."},{status:404})};
  return {ok:true as const,auth,project:project.data};
}

export async function GET(request:Request){
  const projectId=new URL(request.url).searchParams.get("projectId")?.trim()??"";
  if(!projectId)return NextResponse.json({ok:false,error:"projectId is required."},{status:400});
  const context=await projectContext(projectId);if(!context.ok)return context.response;
  const {auth,project}=context;
  const [executionResult,tasksResult,approvalsResult,activityResult,agentsResult]=await Promise.all([
    auth.supabase.from("project_executions").select("id,execution_no,status,started_at,last_heartbeat_at,updated_at").eq("project_id",projectId).eq("organization_id",auth.organizationId).order("execution_no",{ascending:false}).limit(1).maybeSingle(),
    auth.supabase.from("project_task_runs").select("id,task_key,title,status,priority,assigned_agent_id,waiting_on_approval_id,started_at,completed_at,updated_at,agents(agent_code,display_name,name)").eq("project_id",projectId).eq("organization_id",auth.organizationId).order("priority").order("created_at"),
    auth.supabase.from("approval_requests").select("id,subject_type,subject_id,title,summary,risk_level,status,conditions,created_at,expires_at").eq("project_id",projectId).eq("organization_id",auth.organizationId).eq("status","pending").order("created_at",{ascending:false}),
    auth.supabase.from("project_activity_events").select("id,event_type,headline,detail,importance,agent_id,created_at").eq("project_id",projectId).eq("organization_id",auth.organizationId).order("created_at",{ascending:false}).limit(12),
    auth.supabase.from("project_agents").select("agent_id,status,assignment_role,agents(agent_code,display_name,name,role_title)").eq("project_id",projectId).eq("organization_id",auth.organizationId),
  ]);
  const tasks=tasksResult.data??[];
  const counts={running:tasks.filter((t:any)=>t.status==="running").length,queued:tasks.filter((t:any)=>["queued","retrying"].includes(t.status)).length,waitingApproval:tasks.filter((t:any)=>t.status==="waiting_for_approval").length,waitingOther:tasks.filter((t:any)=>["waiting_for_connection","waiting_for_data"].includes(t.status)).length,completed:tasks.filter((t:any)=>t.status==="completed").length,failed:tasks.filter((t:any)=>["failed","blocked"].includes(t.status)).length,total:tasks.length};
  return NextResponse.json({ok:true,project,execution:executionResult.data??null,counts,tasks:tasks.slice(0,24),approvals:approvalsResult.data??[],activity:activityResult.data??[],agents:agentsResult.data??[],serverTime:new Date().toISOString()});
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
  let releasedTaskId:string|null=null;
  if(approval.subject_type==="project_task"){
    const taskResult=await auth.supabase.from("project_task_runs").select("id,action_item_id,status").eq("project_id",projectId).eq("organization_id",auth.organizationId).eq("waiting_on_approval_id",approvalId).maybeSingle();
    if(taskResult.error)return NextResponse.json({ok:false,error:`Task lookup failed: ${taskResult.error.message}`},{status:409});
    const task=taskResult.data;
    if(!task)return NextResponse.json({ok:false,error:"The approval is no longer linked to an active project task. Refresh the page and try again."},{status:409});
    releasedTaskId=task.id;
    taskStatus=resolution==="approved"?"queued":"blocked";
    const taskUpdate=await auth.supabase.from("project_task_runs").update(resolution==="approved"?{status:"queued",waiting_on_approval_id:null,error_class:null,error_message:null,next_attempt_at:null,updated_at:resolvedAt}:{status:"blocked",waiting_on_approval_id:null,error_class:"approval_rejected",error_message:responseNote,next_attempt_at:null,updated_at:resolvedAt}).eq("id",task.id).eq("organization_id",auth.organizationId).eq("project_id",projectId).eq("status","waiting_for_approval").select("id,status").maybeSingle();
    if(taskUpdate.error||!taskUpdate.data)return NextResponse.json({ok:false,error:taskUpdate.error?.message??"The project task could not be released from its approval gate."},{status:409});
    if(task.action_item_id){
      const actionUpdate=await auth.supabase.from("action_items").update({status:resolution==="approved"?"open":"blocked"}).eq("id",task.action_item_id).eq("organization_id",auth.organizationId);
      if(actionUpdate.error){
        await auth.supabase.from("project_task_runs").update({status:"waiting_for_approval",waiting_on_approval_id:approvalId,updated_at:new Date().toISOString()}).eq("id",task.id).eq("organization_id",auth.organizationId);
        return NextResponse.json({ok:false,error:`Linked action could not be updated: ${actionUpdate.error.message}`},{status:409});
      }
    }
  }

  const resolved=await auth.supabase.from("approval_requests").update({status:resolution,response_note:responseNote,resolved_at:resolvedAt,approver_user_id:auth.user.id}).eq("id",approvalId).eq("project_id",projectId).eq("organization_id",auth.organizationId).eq("status","pending").select("id,status").maybeSingle();
  if(resolved.error||!resolved.data){
    if(releasedTaskId)await auth.supabase.from("project_task_runs").update({status:"waiting_for_approval",waiting_on_approval_id:approvalId,updated_at:new Date().toISOString()}).eq("id",releasedTaskId).eq("organization_id",auth.organizationId).eq("project_id",projectId);
    return NextResponse.json({ok:false,error:resolved.error?.message??"Approval could not be resolved."},{status:409});
  }

  await Promise.all([
    auth.supabase.from("audit_events").insert({organization_id:auth.organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:`approval.${resolution}`,object_type:"approval_request",object_id:approvalId,risk_level:approval.risk_level,payload:{title:approval.title,resolution,response_note:responseNote,human_authority:"Human CEO / Owner",source:"project_operating_view",resolved_at:resolvedAt}}),
    auth.supabase.from("project_activity_events").insert({organization_id:auth.organizationId,project_id:projectId,event_type:`approval.${resolution}`,headline:`CEO ${resolution}: ${approval.title}`,detail:responseNote,importance:resolution==="approved"?"major":"attention"}),
  ]);

  if(resolution==="approved"){
    const service=createServerSupabaseClient();
    if(service)void service.rpc("dispatch_project_os_from_database_v1").then(({error})=>{if(error)console.warn("project_approval_dispatch_trigger_failed",error.message);});
  }
  return NextResponse.json({ok:true,resolution,taskStatus});
}
