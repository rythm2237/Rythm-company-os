import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { executeAiRequest } from "@/lib/ai/request-gateway";
import { buildProductionAgentPolicy, buildProductionTenantPolicy, effectiveRequestCostLimit } from "@/lib/ai/production-path-policy";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

const jsonError=(message:string,status:number)=>NextResponse.json({ok:false,error:message},{status});
const cleanList=(value:unknown)=>Array.isArray(value)?value.map(v=>String(v).trim()).filter(Boolean).slice(0,6):[];
const normalizeRecommendation=(value:unknown)=>{
  const raw=String(value??"ASK FOR MORE INFORMATION").trim().toUpperCase().replaceAll("_"," ");
  return ["APPROVE","REJECT","REQUEST REVISION","ASK FOR MORE INFORMATION","DEFER"].includes(raw)?raw:"ASK FOR MORE INFORMATION";
};

function parseAdvice(raw:string){
  let parsed:any=null;
  try{const match=raw.match(/\{[\s\S]*\}/);parsed=JSON.parse(match?.[0]??raw);}catch{}
  if(!parsed)return {recommendation:"ASK FOR MORE INFORMATION",confidence:"Low",summary:raw.slice(0,900)||"The advisor could not structure a reliable recommendation.",rationale:"Insufficient structured evidence was returned.",benefits:[],risks:[],missingInformation:["Review the decision details and ask the project team for clarification."],alternative:null,changeFactors:[],suggestedAction:"Open Ask / Discuss before making a final decision."};
  return {
    recommendation:normalizeRecommendation(parsed.recommendation),
    confidence:["High","Medium","Low"].includes(String(parsed.confidence))?String(parsed.confidence):"Medium",
    summary:String(parsed.summary??"").slice(0,1200),
    rationale:String(parsed.rationale??"").slice(0,1800),
    benefits:cleanList(parsed.benefits),risks:cleanList(parsed.risks),missingInformation:cleanList(parsed.missingInformation),
    alternative:parsed.alternative?String(parsed.alternative).slice(0,1000):null,
    changeFactors:cleanList(parsed.changeFactors),
    suggestedAction:String(parsed.suggestedAction??"Review the available evidence before deciding.").slice(0,1000),
  };
}

export async function POST(request:Request){
  let body:{projectId?:string;approvalId?:string};
  try{body=await request.json();}catch{return jsonError("Invalid request.",400);}
  const projectId=String(body.projectId??"").trim();
  const approvalId=String(body.approvalId??"").trim();
  if(!projectId||!approvalId)return jsonError("projectId and approvalId are required.",400);

  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok)return jsonError(auth.error,auth.status);
  const {supabase,organizationId}=auth;
  const [projectResult,approvalResult]=await Promise.all([
    supabase.from("projects").select("id,name,project_code,description,objective,status,stage,autonomy_mode,budget_cap_usd,target_date,scope,success_criteria,constraints").eq("id",projectId).eq("organization_id",organizationId).maybeSingle(),
    supabase.from("approval_requests").select("id,project_id,subject_type,subject_id,title,summary,risk_level,status,conditions,created_at,expires_at,execution_expected_impact,execution_reversibility,execution_target,execution_tool,execution_operation").eq("id",approvalId).eq("project_id",projectId).eq("organization_id",organizationId).maybeSingle(),
  ]);
  const project=projectResult.data,approval=approvalResult.data;
  if(!project)return jsonError("Project not found.",404);
  if(!approval)return jsonError("Approval request not found.",404);
  if(approval.status!=="pending")return jsonError("This decision is no longer pending.",409);

  const config=getRuntimeConfig();
  if(!config.agentExecutionEnabled||!config.openAIConfigured||!config.dryRunModel)return jsonError("AI decision advice is not configured in this environment.",503);
  let tenantPolicy:ReturnType<typeof buildProductionTenantPolicy>;
  try{tenantPolicy=buildProductionTenantPolicy(auth.entitlement);}catch{return jsonError("The active organization does not have an active AI entitlement.",403);}

  const [taskResult,scopeResult,documentsResult,roadmapResult,decisionsResult,proposalsResult]=await Promise.all([
    supabase.from("project_task_runs").select("id,title,task_key,status,priority,dependencies,input,safe_result,error_class,error_message,roadmap_id,roadmap_phase_id,work_weight,assigned_agent_id").eq("organization_id",organizationId).eq("project_id",projectId).eq("waiting_on_approval_id",approvalId).maybeSingle(),
    supabase.from("project_scope_versions").select("version,included,excluded,assumptions,dependencies,deliverables,success_criteria,status").eq("organization_id",organizationId).eq("project_id",projectId).order("version",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("project_documents").select("file_name,category,extracted_summary,extraction_status").eq("organization_id",organizationId).eq("project_id",projectId).order("created_at",{ascending:false}).limit(6),
    supabase.from("project_roadmaps").select("id,version,status,title,objective,total_weight,approved_at").eq("organization_id",organizationId).eq("project_id",projectId).order("version",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("decisions").select("title,decision,status,rationale,created_at").eq("organization_id",organizationId).eq("project_id",projectId).order("created_at",{ascending:false}).limit(8),
    supabase.from("project_proposals").select("title,executive_summary,rationale,expected_impact,estimated_cost,risk_level,status,created_at").eq("organization_id",organizationId).eq("project_id",projectId).order("created_at",{ascending:false}).limit(8),
  ]);

  const docContext=(documentsResult.data??[]).filter((r:any)=>r.extracted_summary).map((r:any)=>`${r.category}: ${r.file_name}\n${String(r.extracted_summary).slice(0,1200)}`).join("\n\n");
  const contextPayload={project,approval,linkedTask:taskResult.data??null,latestScope:scopeResult.data??null,approvedRoadmap:roadmapResult.data??null,recentHumanDecisions:decisionsResult.data??[],recentProposals:proposalsResult.data??[],relevantDocumentSummaries:docContext||null};
  const systemInstructions=`You are the Independent Executive Decision Advisor inside RYTHM Company OS. Help the Human CEO make one specific pending project decision. You are not the requesting agent and must not simply agree with it. Evaluate the request independently against the project objective, approved roadmap, scope, contract/business constraints visible in context, budget, prior CEO decisions, evidence, dependencies, reversibility, cost, risk and alternatives. Never invent evidence. If information is missing, say so. Do not approve, reject, execute, spend, connect accounts, message externally or mutate project state. The Human CEO retains final authority. Choose exactly one recommendation: APPROVE, REJECT, REQUEST REVISION, ASK FOR MORE INFORMATION, or DEFER. Return only JSON with keys recommendation, confidence (High|Medium|Low), summary, rationale, benefits (array), risks (array), missingInformation (array), alternative (string|null), changeFactors (array), suggestedAction. Keep it concise and executive-friendly.`;

  try{
    const gateway=await executeAiRequest({
      organizationId,actor:{type:"user",userId:auth.user.id},context:{projectId},feature:"internal.unspecified",systemInstructions,
      prompt:`Review this pending decision independently.\n\n${JSON.stringify(contextPayload).slice(0,24000)}`,
      mode:"chat",maxOutputTokens:1500,timeoutMs:config.agentTimeoutMs,
      agentPolicy:buildProductionAgentPolicy({roleTitle:"Executive Decision Advisor",riskCeiling:"high",maxCostPerRequest:auth.entitlement?effectiveRequestCostLimit(auth.entitlement):undefined,maxOutputTokens:1500}),
      tenantPolicy,legacyFallback:{provider:"openai",model:config.dryRunModel,reason:"compatibility"},telemetryPolicy:"required",
    });
    const advice=parseAdvice(gateway.outputText.trim());
    await Promise.all([
      supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:"approval.ai_advice",object_type:"approval_request",object_id:approvalId,risk_level:"low",payload:{project_id:projectId,recommendation:advice.recommendation,confidence:advice.confidence,ai_correlation_id:gateway.correlationId,approval_status:"pending",source:"project_operating_view"}}),
      supabase.from("project_activity_events").insert({organization_id:organizationId,project_id:projectId,event_type:"approval.ai_advice",headline:`AI advice reviewed: ${approval.title}`,detail:`Recommendation: ${advice.recommendation}. Human approval remains pending.`,importance:"normal",correlation_id:gateway.correlationId}),
    ]);
    return NextResponse.json({ok:true,advice,correlationId:gateway.correlationId,approvalStatus:"pending"});
  }catch(error){
    console.error("project_approval_ai_advice_failed",{projectId,approvalId,error:error instanceof Error?error.message:String(error)});
    return jsonError(error instanceof Error?error.message:"AI advice could not be generated.",502);
  }
}
