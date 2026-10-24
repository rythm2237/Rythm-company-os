import { loadReusableCustomerCorrections } from "@/lib/projects/project-customer-context";
import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { analyzeProjectOS } from "@/lib/projects/project-operating-system";
import { assignProjectLead, type AssignmentRequirements } from "@/lib/projects/project-agent-assignment";
import { dispatchProjectKnowledge } from "@/lib/projects/project-knowledge";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

export async function POST(request:Request){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  let projectId="";
  try{projectId=String(((await request.json()) as {projectId?:string}).projectId??"").trim();}catch{return NextResponse.json({ok:false,error:"projectId is required."},{status:400});}
  if(!projectId)return NextResponse.json({ok:false,error:"projectId is required."},{status:400});
  const owned=await auth.supabase.from("projects").select("id,customer_id").eq("id",projectId).eq("organization_id",auth.organizationId).maybeSingle();
  if(!owned.data)return NextResponse.json({ok:false,error:"Project not found."},{status:404});
  const service=createServerSupabaseClient();
  if(!service)return NextResponse.json({ok:false,error:"Project analysis service is unavailable."},{status:503});
  try{
    // Project Analysis must consume the project's files, not merely their filenames.
    // The same durable ingestion worker is used by background dispatch and explicit analysis.
    const knowledge=await dispatchProjectKnowledge(service,{projectId,claimLimit:8});
    // The caller's RLS grants authorize the operational CRM fields; contracts and notes are excluded.
    const customer=owned.data.customer_id?await auth.supabase.from("crm_accounts").select("id,name,industry,country_code,website_url,updated_at").eq("organization_id",auth.organizationId).eq("id",owned.data.customer_id).maybeSingle():{data:null};
    const customerCorrections=owned.data.customer_id?await loadReusableCustomerCorrections(auth.supabase,{organizationId:auth.organizationId,customerId:owned.data.customer_id,projectId}):[];
    const result=await analyzeProjectOS(service,auth.organizationId,projectId,{customerContext:customer.data,customerCorrections});

    // AI proposes capabilities; structured eligibility and atomic reservations decide who can lead.
    const requirements=(result as typeof result & {assignmentRequirements?:AssignmentRequirements}).assignmentRequirements;
    const currentLead=await service.from("project_agents").select("agent_id").eq("organization_id",auth.organizationId).eq("project_id",projectId).eq("assignment_role","AI Project Lead").in("status",["assigned","active"]).maybeSingle();
    if(currentLead.error)throw new Error(currentLead.error.message);
    // Respect a chosen lead. Re-analysis must not silently replace the user's manual selection.
    const decision=requirements?await assignProjectLead(service,auth.organizationId,projectId,auth.user.id,{...requirements,mode:currentLead.data?"manual":"auto",agentId:currentLead.data?.agent_id}):null;
    const assigned=decision?.status==="assigned"?1:0;
    const recommendations=Array.isArray(result.team)?result.team:[];
    if(decision?.status==="blocked"){
      const event=await service.from("project_activity_events").insert({organization_id:auth.organizationId,project_id:projectId,event_type:"project.assignment.blocked",headline:"AI lead needs assignment",detail:decision.reason,importance:"attention",metadata:{capabilities:requirements?.skills??[]}});
      if(event.error)throw new Error(event.error.message);
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
    return NextResponse.json({ok:true,...result,knowledgeIngested:knowledge.filter(item=>item.status==="completed").length,teamAssigned:assigned,assignment:decision});
  }catch(error){
    console.error("project_analysis_failed",{projectId,error:error instanceof Error?error.message:"unknown"});
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Project analysis failed."},{status:500});
  }
}
