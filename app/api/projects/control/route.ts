import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";

export const dynamic="force-dynamic";

type Body={projectId?:string;action?:string;clarificationId?:string;answer?:unknown;scopeId?:string;};
export async function POST(request:Request){
  const auth=await resolveOwnerApiOrganizationContext();if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  let body:Body;try{body=await request.json() as Body;}catch{return NextResponse.json({ok:false,error:"Invalid request."},{status:400});}
  const projectId=String(body.projectId??"").trim(),action=String(body.action??"").trim();
  const project=await auth.supabase.from("projects").select("id,status").eq("id",projectId).eq("organization_id",auth.organizationId).maybeSingle();
  if(!project.data)return NextResponse.json({ok:false,error:"Project not found."},{status:404});
  const now=new Date().toISOString();
  if(action==="answer_clarification"){
    const id=String(body.clarificationId??"").trim();if(!id)return NextResponse.json({ok:false,error:"Clarification is required."},{status:400});
    const result=await auth.supabase.from("project_clarification_requests").update({status:"answered",answer:{value:body.answer},answered_by_user_id:auth.user.id,answered_at:now}).eq("id",id).eq("project_id",projectId).eq("organization_id",auth.organizationId).eq("status","open").select("id").maybeSingle();
    if(!result.data)return NextResponse.json({ok:false,error:"Clarification could not be updated."},{status:409});
  }else if(action==="approve_scope"){
    const id=String(body.scopeId??"").trim();const result=await auth.supabase.from("project_scope_versions").update({status:"approved",approved_by_user_id:auth.user.id,approved_at:now}).eq("id",id).eq("project_id",projectId).eq("organization_id",auth.organizationId).in("status",["draft","needs_revision"]).select("id").maybeSingle();
    if(!result.data)return NextResponse.json({ok:false,error:"Scope could not be approved."},{status:409});
    await auth.supabase.from("projects").update({stage:"execution_readiness",updated_at:now}).eq("id",projectId).eq("organization_id",auth.organizationId);
  }else if(action==="pause"){
    await auth.supabase.from("project_executions").update({status:"paused",paused_at:now,updated_at:now}).eq("project_id",projectId).eq("organization_id",auth.organizationId).in("status",["queued","running"]);
    await auth.supabase.from("projects").update({status:"on_hold",stage:"paused",updated_at:now}).eq("id",projectId).eq("organization_id",auth.organizationId);
  }else if(action==="resume"){
    await auth.supabase.from("project_executions").update({status:"running",paused_at:null,updated_at:now}).eq("project_id",projectId).eq("organization_id",auth.organizationId).eq("status","paused");
    await auth.supabase.from("projects").update({status:"active",stage:"execution",updated_at:now}).eq("id",projectId).eq("organization_id",auth.organizationId);
  }else if(action==="cancel"){
    await auth.supabase.from("project_executions").update({status:"cancelled",cancelled_at:now,updated_at:now}).eq("project_id",projectId).eq("organization_id",auth.organizationId).in("status",["queued","running","paused"]);
    await auth.supabase.from("project_task_runs").update({status:"cancelled",updated_at:now}).eq("project_id",projectId).eq("organization_id",auth.organizationId).not("status","in",'(completed,cancelled)');
    await auth.supabase.from("projects").update({status:"cancelled",stage:"cancelled",updated_at:now}).eq("id",projectId).eq("organization_id",auth.organizationId);
  }else return NextResponse.json({ok:false,error:"Unsupported project control action."},{status:400});
  await auth.supabase.from("audit_events").insert({organization_id:auth.organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:`project.control.${action}`,object_type:"project",object_id:projectId,risk_level:action==="cancel"?"high":"low",payload:{clarification_id:body.clarificationId??null,scope_id:body.scopeId??null}});
  return NextResponse.json({ok:true});
}
