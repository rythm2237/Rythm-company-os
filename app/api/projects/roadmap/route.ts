import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { approveProjectRoadmap, getLatestProjectRoadmap } from "@/lib/projects/project-roadmap";
import { getProjectProgressSnapshot } from "@/lib/projects/project-progress";
import { startProjectExecutionWithoutGlobalGate } from "@/lib/projects/project-execution-start";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

type Body={projectId?:string;roadmapId?:string;action?:"approve_and_start"|"request_changes";feedback?:string};

export async function GET(request:Request){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  const projectId=new URL(request.url).searchParams.get("projectId")?.trim()??"";
  if(!projectId)return NextResponse.json({ok:false,error:"projectId is required."},{status:400});
  const project=await auth.supabase.from("projects").select("id,status,updated_at").eq("organization_id",auth.organizationId).eq("id",projectId).maybeSingle();
  if(!project.data)return NextResponse.json({ok:false,error:"Project not found."},{status:404});
  const service=createServerSupabaseClient();if(!service)return NextResponse.json({ok:false,error:"Project service is unavailable."},{status:503});
  try{
    const [roadmap,progress]=await Promise.all([getLatestProjectRoadmap(service,auth.organizationId,projectId),getProjectProgressSnapshot(service,auth.organizationId,project.data)]);
    return NextResponse.json({ok:true,roadmap,progress});
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Unable to load roadmap."},{status:500});}
}

export async function POST(request:Request){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  let body:Body;try{body=await request.json() as Body;}catch{return NextResponse.json({ok:false,error:"Invalid request."},{status:400});}
  const projectId=String(body.projectId??"").trim();const roadmapId=String(body.roadmapId??"").trim();
  if(!projectId||!roadmapId)return NextResponse.json({ok:false,error:"projectId and roadmapId are required."},{status:400});
  const owned=await auth.supabase.from("projects").select("id").eq("organization_id",auth.organizationId).eq("id",projectId).maybeSingle();if(!owned.data)return NextResponse.json({ok:false,error:"Project not found."},{status:404});
  const service=createServerSupabaseClient();if(!service)return NextResponse.json({ok:false,error:"Project service is unavailable."},{status:503});
  try{
    if(body.action==="request_changes"){
      const current=await getLatestProjectRoadmap(service,auth.organizationId,projectId);if(!current||current.id!==roadmapId)throw new Error("Roadmap is not the current review version.");
      await service.from("project_roadmaps").update({status:"rejected",updated_at:new Date().toISOString()}).eq("organization_id",auth.organizationId).eq("project_id",projectId).eq("id",roadmapId);
      await service.from("project_proposals").insert({organization_id:auth.organizationId,project_id:projectId,proposal_type:"roadmap_change",title:`Revise roadmap v${current.version}`,executive_summary:"Manager requested changes before project execution.",rationale:String(body.feedback??"").trim()||"Roadmap requires revision before it can become the execution baseline.",decision_required_from:"project_team",status:"needs_revision",risk_level:"low"});
      await service.from("projects").update({stage:"roadmap_revision",updated_at:new Date().toISOString()}).eq("organization_id",auth.organizationId).eq("id",projectId);
      await service.from("project_activity_events").insert({organization_id:auth.organizationId,project_id:projectId,event_type:"project.roadmap.revision_requested",headline:`Changes requested for roadmap v${current.version}`,detail:String(body.feedback??"").trim()||"Manager requested roadmap revision before execution.",importance:"attention"});
      return NextResponse.json({ok:true,mode:"revision_requested"});
    }
    if(body.action!=="approve_and_start")return NextResponse.json({ok:false,error:"Unsupported roadmap action."},{status:400});
    const roadmap=await approveProjectRoadmap(service,auth.organizationId,projectId,roadmapId,auth.user.id);if(!roadmap)throw new Error("Unable to approve roadmap.");
    const execution=await startProjectExecutionWithoutGlobalGate(service,auth.organizationId,projectId,auth.user.id);
    await service.from("audit_events").insert({organization_id:auth.organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:"project.roadmap.approved_and_execution_started",object_type:"project",object_id:projectId,risk_level:"medium",payload:{roadmap_id:roadmap.id,roadmap_version:roadmap.version,execution_id:execution.id,execution_no:execution.execution_no}});
    return NextResponse.json({ok:true,mode:"execution_started",roadmap:{id:roadmap.id,version:roadmap.version,status:roadmap.status},execution});
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Unable to update roadmap."},{status:500});}
}
