import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { startProjectExecution } from "@/lib/projects/project-operating-system";

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
    const execution=await startProjectExecution(service,auth.organizationId,projectId,auth.user.id);
    await service.from("audit_events").insert({organization_id:auth.organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:"project.execution.authorized",object_type:"project",object_id:projectId,risk_level:"medium",payload:{execution_id:execution.id,execution_no:execution.execution_no,task_count:"taskCount" in execution?execution.taskCount:null}});
    return NextResponse.json({ok:true,execution});
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to run project.";
    return NextResponse.json({ok:false,error:message},{status:/clarification|readiness|safe start/i.test(message)?409:500});
  }
}
