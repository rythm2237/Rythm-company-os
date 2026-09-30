import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProjectCompletionExplanation } from "@/lib/projects/project-completion";

export const dynamic="force-dynamic";
export const runtime="nodejs";

type Action="evaluate"|"generate_closeout"|"finalize_closeout"|"record_metric"|"record_acceptance";
type AcceptanceDisposition="accepted"|"accepted_with_conditions"|"rejected"|"waived";

async function ownedProject(projectId:string){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok)return {ok:false as const,response:NextResponse.json({ok:false,error:auth.error},{status:auth.status})};
  const project=await auth.supabase.from("projects")
    .select("id,organization_id,project_code,name,status,lifecycle_state,completion_policy_id,work_progress,deliverable_progress,implementation_progress,verification_progress,outcome_progress,acceptance_progress,closeout_progress,overall_project_progress,completion_eligible,next_required_action,completion_blocking_reasons,completion_evaluator_version,completion_evaluated_at")
    .eq("id",projectId).eq("organization_id",auth.organizationId).maybeSingle();
  if(!project.data)return {ok:false as const,response:NextResponse.json({ok:false,error:"Project not found."},{status:404})};
  return {ok:true as const,auth,project:project.data};
}

export async function GET(request:Request){
  const projectId=new URL(request.url).searchParams.get("projectId")?.trim()??"";
  if(!projectId)return NextResponse.json({ok:false,error:"projectId is required."},{status:400});
  const context=await ownedProject(projectId);if(!context.ok)return context.response;
  const {auth,project}=context;
  const [explanation,criteria,observations,report,metrics,policy]=await Promise.all([
    getProjectCompletionExplanation(auth.supabase,projectId),
    auth.supabase.from("project_completion_criteria").select("id,dimension,criterion_key,description,required,state,failure_reason,waiver_reason,residual_risk,acceptance_disposition,acceptance_conditions,metadata,updated_at").eq("project_id",projectId).order("dimension").order("created_at"),
    auth.supabase.from("project_observation_windows").select("id,status,observation_start,observation_end,required_duration_days,sufficient_data,metadata,updated_at").eq("project_id",projectId).neq("status","cancelled").order("created_at",{ascending:false}),
    auth.supabase.from("project_closeout_reports").select("id,status,report_data,generated_at,reviewed_at,accepted_at,closure_date,updated_at").eq("project_id",projectId).order("generated_at",{ascending:false}).limit(1).maybeSingle(),
    auth.supabase.from("project_metric_measurements").select("id,metric_name,measurement_kind,source,measurement_start,measurement_end,value,value_text,unit,segmentation,confidence,created_at").eq("project_id",projectId).order("metric_name").order("created_at"),
    project.completion_policy_id?auth.supabase.from("project_completion_policies").select("id,code,name,acceptance_authority,customer_signoff_required,acceptance_waiver_allowed").eq("id",project.completion_policy_id).maybeSingle():Promise.resolve({data:null,error:null}),
  ]);
  return NextResponse.json({ok:true,project,explanation,criteria:criteria.data??[],observations:observations.data??[],report:report.data??null,metrics:metrics.data??[],policy:policy.data??null});
}

export async function POST(request:Request){
  let body:{
    projectId?:string;action?:Action;reportId?:string;
    metricName?:string;measurementKind?:"baseline"|"outcome";source?:string;value?:number|null;valueText?:string;unit?:string;measurementStart?:string;measurementEnd?:string;confidence?:number;segmentation?:Record<string,unknown>;
    acceptanceDisposition?:AcceptanceDisposition;acceptanceConditions?:string[];acceptanceResidualRisk?:string;acceptanceNote?:string;
  };
  try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"Invalid request."},{status:400});}
  const projectId=String(body.projectId??"").trim();const action=body.action;
  if(!projectId||!action)return NextResponse.json({ok:false,error:"projectId and action are required."},{status:400});
  const context=await ownedProject(projectId);if(!context.ok)return context.response;
  const {auth,project}=context;
  const service=createServerSupabaseClient();
  if(!service)return NextResponse.json({ok:false,error:"Project completion service unavailable."},{status:503});

  if(action==="evaluate"){
    const evaluated=await service.rpc("evaluate_project_completion_v1",{p_project_id:projectId,p_trigger_event:"owner_requested_evaluation",p_source_type:"user",p_source_id:auth.user.id});
    if(evaluated.error)return NextResponse.json({ok:false,error:evaluated.error.message},{status:409});
    await service.rpc("ensure_project_final_acceptance_v1",{p_project_id:projectId});
    return NextResponse.json({ok:true,explanation:evaluated.data});
  }

  if(action==="record_acceptance"){
    if(project.lifecycle_state!=="ACCEPTANCE_PENDING")return NextResponse.json({ok:false,error:"Project is not awaiting final acceptance."},{status:409});
    const disposition=body.acceptanceDisposition;
    if(!disposition||!["accepted","accepted_with_conditions","rejected","waived"].includes(disposition))return NextResponse.json({ok:false,error:"A valid acceptance disposition is required."},{status:400});
    const conditions=(Array.isArray(body.acceptanceConditions)?body.acceptanceConditions:[]).map(value=>String(value).trim()).filter(Boolean).slice(0,20);
    if(disposition==="accepted_with_conditions"&&!conditions.length)return NextResponse.json({ok:false,error:"Accepted with conditions requires at least one explicit condition."},{status:400});
    const recorded=await service.rpc("record_project_acceptance_v1",{
      p_project_id:projectId,
      p_disposition:disposition,
      p_conditions:conditions,
      p_residual_risk:String(body.acceptanceResidualRisk??"").trim().slice(0,4000)||null,
      p_note:String(body.acceptanceNote??"").trim().slice(0,4000)||null,
      p_actor_user_id:auth.user.id,
    });
    if(recorded.error)return NextResponse.json({ok:false,error:recorded.error.message},{status:409});
    return NextResponse.json({ok:true,explanation:recorded.data});
  }

  if(action==="generate_closeout"){
    if(project.lifecycle_state!=="CLOSEOUT")return NextResponse.json({ok:false,error:"Final report can be generated when the project reaches Closeout."},{status:409});
    const existing=await service.from("project_closeout_reports").select("id,status").eq("project_id",projectId).in("status",["draft","review","final","accepted"]).order("generated_at",{ascending:false}).limit(1).maybeSingle();
    if(existing.data)return NextResponse.json({ok:true,reportId:existing.data.id,status:existing.data.status});
    const generated=await service.rpc("generate_project_closeout_report_v1",{p_project_id:projectId});
    if(generated.error)return NextResponse.json({ok:false,error:generated.error.message},{status:409});
    await service.rpc("evaluate_project_completion_v1",{p_project_id:projectId,p_trigger_event:"closeout_report_generated",p_source_type:"project_closeout_report",p_source_id:generated.data});
    return NextResponse.json({ok:true,reportId:generated.data,status:"draft"});
  }

  if(action==="finalize_closeout"){
    const reportId=String(body.reportId??"").trim();if(!reportId)return NextResponse.json({ok:false,error:"reportId is required."},{status:400});
    const report=await service.from("project_closeout_reports").select("id,organization_id,project_id,status").eq("id",reportId).eq("project_id",projectId).eq("organization_id",auth.organizationId).maybeSingle();
    if(!report.data)return NextResponse.json({ok:false,error:"Closeout report not found."},{status:404});
    const finalized=await service.rpc("finalize_project_closeout_report_v1",{p_report_id:reportId});
    if(finalized.error)return NextResponse.json({ok:false,error:finalized.error.message},{status:409});
    return NextResponse.json({ok:true,explanation:finalized.data});
  }

  if(action==="record_metric"){
    const metricName=String(body.metricName??"").trim();const source=String(body.source??"").trim();const kind=body.measurementKind;
    if(!metricName||!source||!kind||!["baseline","outcome"].includes(kind))return NextResponse.json({ok:false,error:"metricName, measurementKind and source are required."},{status:400});
    const confidence=typeof body.confidence==="number"?Math.max(0,Math.min(1,body.confidence)):null;
    const inserted=await auth.supabase.from("project_metric_measurements").insert({
      organization_id:auth.organizationId,project_id:projectId,metric_name:metricName,measurement_kind:kind,source,
      measurement_start:body.measurementStart||null,measurement_end:body.measurementEnd||null,
      value:typeof body.value==="number"?body.value:null,value_text:String(body.valueText??"").trim()||null,unit:String(body.unit??"").trim()||null,
      segmentation:body.segmentation??{},confidence,
    }).select("id").single();
    if(inserted.error)return NextResponse.json({ok:false,error:inserted.error.message},{status:409});
    await service.rpc("evaluate_project_completion_v1",{p_project_id:projectId,p_trigger_event:"metric_recorded",p_source_type:"project_metric_measurement",p_source_id:inserted.data.id});
    return NextResponse.json({ok:true,metricId:inserted.data.id});
  }

  return NextResponse.json({ok:false,error:"Unsupported action."},{status:400});
}
