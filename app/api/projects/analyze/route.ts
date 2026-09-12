import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { analyzeProjectOS } from "@/lib/projects/project-operating-system";

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
  if(!service)return NextResponse.json({ok:false,error:"Project analysis service is unavailable."},{status:503});
  try{
    const result=await analyzeProjectOS(service,auth.organizationId,projectId);
    await service.from("audit_events").insert({organization_id:auth.organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:"project.analysis.completed",object_type:"project",object_id:projectId,risk_level:"low",payload:{readiness:result.readiness,correlation_id:result.correlationId}});
    return NextResponse.json({ok:true,...result});
  }catch(error){
    console.error("project_analysis_failed",{projectId,error:error instanceof Error?error.message:"unknown"});
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Project analysis failed."},{status:500});
  }
}
