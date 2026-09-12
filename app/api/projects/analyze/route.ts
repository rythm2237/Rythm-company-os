import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { analyzeProjectOS } from "@/lib/projects/project-operating-system";
import { dispatchProjectKnowledge } from "@/lib/projects/project-knowledge";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

type TeamRecommendation={agent_id?:unknown;reason?:unknown;allocation_percent?:unknown};

function allocation(value:unknown){
  const parsed=Number(value);
  if(!Number.isFinite(parsed))return 20;
  return Math.max(5,Math.min(80,Math.round(parsed)));
}

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
    // Project Analysis must consume the project's files, not merely their filenames.
    // The same durable ingestion worker is used by background dispatch and explicit analysis.
    const knowledge=await dispatchProjectKnowledge(service,{projectId,claimLimit:8});
    const result=await analyzeProjectOS(service,auth.organizationId,projectId);

    // Materialize only existing, enabled company agents recommended by analysis.
    // This assigns workload; it never creates agents or bypasses plan/entitlement provisioning.
    const recommendations=(Array.isArray(result.team)?result.team:[]) as TeamRecommendation[];
    const existing=await service.from("project_agents").select("agent_id").eq("organization_id",auth.organizationId).eq("project_id",projectId);
    const existingIds=new Set((existing.data??[]).map(row=>String(row.agent_id)));
    const existingCapacity=await service.from("project_agent_capacity").select("agent_id").eq("organization_id",auth.organizationId).eq("project_id",projectId);
    const capacityIds=new Set((existingCapacity.data??[]).map(row=>String(row.agent_id)));
    let assigned=0;
    for(const raw of recommendations){
      const agentId=String(raw.agent_id??"").trim();
      if(!agentId)continue;
      if(!existingIds.has(agentId)){
        const inserted=await service.from("project_agents").insert({
          organization_id:auth.organizationId,
          project_id:projectId,
          agent_id:agentId,
          assignment_role:"Recommended project team member",
          status:"assigned",
          authority_scope:{project_execution:true,external_actions:false,governed_execution_required:true,recommendation_reason:String(raw.reason??"").slice(0,1200)},
          assigned_at:new Date().toISOString(),
        }).select("agent_id").maybeSingle();
        if(inserted.data){existingIds.add(agentId);assigned+=1;}
      }
      if(!capacityIds.has(agentId)){
        const capacityRow=await service.from("project_agent_capacity").insert({
          organization_id:auth.organizationId,
          project_id:projectId,
          agent_id:agentId,
          allocation_percent:allocation(raw.allocation_percent),
          priority:3,
        }).select("agent_id").maybeSingle();
        if(capacityRow.data)capacityIds.add(agentId);
      }
    }
    if(recommendations.length){
      await service.from("project_activity_events").insert({
        organization_id:auth.organizationId,
        project_id:projectId,
        event_type:"project.team.recommended",
        headline:"Project team prepared",
        detail:`${recommendations.length} existing company agent${recommendations.length===1?"":"s"} recommended; ${assigned} new project assignment${assigned===1?"":"s"} created.`,
        importance:"normal",
        metadata:{recommended_agent_ids:recommendations.map(item=>String(item.agent_id??"")).filter(Boolean),new_assignments:assigned},
      });
    }
    await service.from("audit_events").insert({
      organization_id:auth.organizationId,
      actor_type:"user",
      actor_user_id:auth.user.id,
      event_type:"project.analysis.completed",
      object_type:"project",
      object_id:projectId,
      risk_level:"low",
      payload:{readiness:result.readiness,correlation_id:result.correlationId,knowledge_ingestions:knowledge.length,team_recommendations:recommendations.length,new_team_assignments:assigned},
    });
    return NextResponse.json({ok:true,...result,knowledgeIngested:knowledge.filter(item=>item.status==="completed").length,teamAssigned:assigned});
  }catch(error){
    console.error("project_analysis_failed",{projectId,error:error instanceof Error?error.message:"unknown"});
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Project analysis failed."},{status:500});
  }
}
