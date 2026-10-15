import {NextResponse} from "next/server";
import {resolveOwnerApiOrganizationContext} from "@/lib/auth/api-organization-context";
import {createServerSupabaseClient} from "@/lib/supabase/server";
export async function POST(request:Request){
 const auth=await resolveOwnerApiOrganizationContext();if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 let body:Record<string,unknown>;try{body=await request.json();}catch{return NextResponse.json({error:"Invalid request."},{status:400});}
 const projectId=String(body.projectId??"");const project=await auth.supabase.from("projects").select("id,lifecycle_type,status,lifecycle_state").eq("id",projectId).eq("organization_id",auth.organizationId).maybeSingle();
 if(!project.data)return NextResponse.json({error:"Project not found."},{status:404});
 const service=createServerSupabaseClient();if(!service)return NextResponse.json({error:"Lifecycle service unavailable."},{status:503});
 if(body.action==="lifecycle"){
  const type=String(body.lifecycleType??"");if(!["finite","campaign","continuous"].includes(type))return NextResponse.json({error:"Invalid lifecycle type."},{status:400});
  const result=await service.rpc("configure_project_program_v1",{p_project_id:projectId,p_organization_id:auth.organizationId,p_actor_id:auth.user.id,p_lifecycle_type:type});
  if(result.error)return NextResponse.json({error:result.error.message},{status:409});
 }else if(body.action==="schedule"){
  const interval=Number(body.intervalDays),observation=Number(body.observationDays);
  if(!Number.isInteger(interval)||interval<1||interval>366||!Number.isInteger(observation)||observation<0||observation>366)return NextResponse.json({error:"Invalid review interval or observation window."},{status:400});
  const configuration=body.configuration;if(!configuration||typeof configuration!=="object"||Array.isArray(configuration)||JSON.stringify(configuration).length>12000)return NextResponse.json({error:"Invalid configuration."},{status:400});
  const cfg=configuration as Record<string,unknown>;
  if(!Array.isArray(cfg.sources)||cfg.sources.length>30||cfg.sources.some(s=>typeof s!=="string"||s.length>160)||!cfg.kpi_thresholds||typeof cfg.kpi_thresholds!=="object"||Array.isArray(cfg.kpi_thresholds))return NextResponse.json({error:"Sources and KPI thresholds must be structured values."},{status:400});
  const result=await service.rpc("configure_program_schedule_v1",{p_project_id:projectId,p_organization_id:auth.organizationId,p_actor_id:auth.user.id,p_schedule_id:String(body.scheduleId??""),p_interval:interval,p_observation:observation,p_enabled:body.enabled===true,p_owner_id:body.ownerAgentId||null,p_configuration:{...cfg,approval_required:true,execution_permission:"propose_only"}});
  if(result.error)return NextResponse.json({error:result.error.message},{status:409});
 }else return NextResponse.json({error:"Unsupported configuration action."},{status:400});
 return NextResponse.json({ok:true});
}
