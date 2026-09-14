import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { startProjectExecutionWithoutGlobalGate } from "@/lib/projects/project-execution-start";
import { createProjectRoadmapDraft, getApprovedProjectRoadmap, getLatestProjectRoadmap } from "@/lib/projects/project-roadmap";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

export async function POST(request:Request){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  let projectId="";
  try{projectId=String(((await request.json()) as {projectId?:string}).projectId??"").trim();}catch{return NextResponse.json({ok:false,error:"projectId is required."},{status:400});}
  if(!projectId)return NextResponse.json({ok:false,error:"projectId is required."},{status:400});
  const owned=await auth.supabase.from("projects").select("id").eq("id",projectId).eq("organization_id",auth.organizationId).maybeSingle();
  if(!owned.data)return NextResponse.json({ok:false,error:"Project not found."},{status:404});
  const service=createServerSupabaseClient();
  if(!service)return NextResponse.json({ok:false,error:"Project execution service is unavailable."},{status:503});
  try{
    const active=await service.from("project_executions").select("id,execution_no,status").eq("organization_id",auth.organizationId).eq("project_id",projectId).in("status",["queued","running","paused"]).order("execution_no",{ascending:false}).limit(1).maybeSingle();
    if(active.data)return NextResponse.json({ok:true,mode:"execution_started",execution:active.data});

    const approved=await getApprovedProjectRoadmap(service,auth.organizationId,projectId);
    if(!approved){
      const current=await getLatestProjectRoadmap(service,auth.organizationId,projectId);
      const roadmap=current&&["draft","in_review"].includes(current.status)?current:await createProjectRoadmapDraft(service,auth.organizationId,projectId,auth.user.id);
      await service.from("audit_events").insert({organization_id:auth.organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:"project.roadmap.requested",object_type:"project",object_id:projectId,risk_level:"low",payload:{roadmap_id:roadmap?.id,roadmap_version:roadmap?.version,status:roadmap?.status}});
      return NextResponse.json({ok:true,mode:"roadmap_review",roadmap});
    }

    const execution=await startProjectExecutionWithoutGlobalGate(service,auth.organizationId,projectId,auth.user.id);
    await service.from("audit_events").insert({organization_id:auth.organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:"project.execution.authorized",object_type:"project",object_id:projectId,risk_level:"medium",payload:{execution_id:execution.id,execution_no:execution.execution_no,task_count:"taskCount" in execution?execution.taskCount:null,roadmap_id:approved.id,roadmap_version:approved.version,global_readiness_gate:false}});
    return NextResponse.json({ok:true,mode:"execution_started",execution,roadmap:{id:approved.id,version:approved.version,status:approved.status}});
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to run project.";
    return NextResponse.json({ok:false,error:message},{status:500});
  }
}
