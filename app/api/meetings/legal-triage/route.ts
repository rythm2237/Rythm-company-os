import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { executeAiRequest } from "@/lib/ai/request-gateway";
import { buildProductionAgentPolicy, buildProductionTenantPolicy, effectiveRequestCostLimit } from "@/lib/ai/production-path-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status});
const cleanJson=(value:string)=>value.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```$/i,"").trim();
const timestamp=(value:string|null|undefined)=>value?new Date(value).getTime():Number.NaN;
const triageMatchesClosure=(triagedAt:string|null|undefined,basisClosedAt:string|null|undefined,closedAt:string|null|undefined)=>{
  const triaged=timestamp(triagedAt);
  const basis=timestamp(basisClosedAt);
  const closed=timestamp(closedAt);
  return Number.isFinite(triaged)&&Number.isFinite(basis)&&Number.isFinite(closed)&&triaged>=closed&&basis===closed;
};
const reasonContradictsClosure=(value:string)=>[
  /\bremains?\s+open\b/i,
  /\bis\s+still\s+open\b/i,
  /\bhas\s+not\s+received\b.*\bclosure\b/i,
  /\bawait(?:ing|s)\b.*\bclosure\b/i,
  /\bnot\s+(?:yet\s+)?closed\b/i,
].some(pattern=>pattern.test(value));

type ParsedTriage={legal_review_recommended?:boolean;reason?:string};
function parseTriage(raw:string):ParsedTriage|null{
  if(!raw) return null;
  try{return JSON.parse(cleanJson(raw)) as ParsedTriage;}catch{return null;}
}

async function context(){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok) return {error:fail(auth.error,auth.status)} as const;
  return {supabase:auth.supabase,user:auth.user,organizationId:auth.organizationId,entitlement:auth.entitlement} as const;
}

export async function GET(request:Request){
  const auth=await context();
  if("error" in auth) return auth.error;
  const sessionId=new URL(request.url).searchParams.get("sessionId")?.trim()??"";
  if(!sessionId) return fail("sessionId is required.",400);
  const {data:session}=await auth.supabase.from("meeting_agent_sessions").select("id,meeting_id,status,legal_triage_status,legal_triage_reason,legal_triaged_at,legal_triage_basis_closed_at").eq("id",sessionId).eq("organization_id",auth.organizationId).maybeSingle();
  if(!session) return fail("Meeting session not found.",404);
  const {data:meeting}=await auth.supabase.from("meetings").select("status,ended_at").eq("id",session.meeting_id).eq("organization_id",auth.organizationId).maybeSingle();
  if(!meeting) return fail("Linked meeting not found.",404);

  const closureBound=meeting.status==="completed"&&triageMatchesClosure(session.legal_triaged_at,session.legal_triage_basis_closed_at,meeting.ended_at);
  if(!closureBound){
    const reason=meeting.status==="completed"
      ?"Legal relevance triage must be recomputed against the confirmed Human CEO / Chair closure snapshot."
      :"Awaiting explicit Human CEO / Chair closure before legal relevance triage.";
    return NextResponse.json({
      ok:true,
      status:"pending",
      reason,
      triagedAt:null,
      sessionStatus:session.status,
      meetingStatus:meeting.status,
      meetingClosedAt:meeting.ended_at,
      staleStoredTriage:session.legal_triage_status!=="pending"||Boolean(session.legal_triaged_at)||Boolean(session.legal_triage_basis_closed_at),
    });
  }

  return NextResponse.json({ok:true,status:session.legal_triage_status,reason:session.legal_triage_reason,triagedAt:session.legal_triaged_at,sessionStatus:session.status,meetingStatus:meeting.status,meetingClosedAt:meeting.ended_at,staleStoredTriage:false});
}

export async function POST(request:Request){
  const config=getRuntimeConfig();
  if(!config.agentExecutionEnabled) return fail("Agent execution is disabled by environment policy.",503);
  if(config.externalActionsEnabled) return fail("Legal triage refuses to run while external actions are enabled.",503);
  if(!config.openAIConfigured||!config.dryRunModel) return fail("OpenAI runtime is not configured.",503);
  const model=config.dryRunModel;

  const auth=await context();
  if("error" in auth) return auth.error;
  let sessionId="";
  try{sessionId=String(((await request.json()) as {sessionId?:string}).sessionId??"").trim();}
  catch{return fail("A JSON body with sessionId is required.",400);}
  if(!sessionId) return fail("sessionId is required.",400);

  const {supabase,user,organizationId,entitlement}=auth;
  let tenantPolicy:ReturnType<typeof buildProductionTenantPolicy>;
  try{tenantPolicy=buildProductionTenantPolicy(entitlement);}
  catch{return fail("The active organization does not have an active AI entitlement.",403);}
  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,project_id,status,decision_question,language,synthesis,recommendation,decision_options,total_input_tokens,total_output_tokens,estimated_cost_usd,budget_cap_usd,legal_triage_status,legal_triage_reason,legal_triaged_at,legal_triage_basis_closed_at").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session) return fail("Meeting session not found.",404);
  if(session.status!=="completed") return fail("Legal triage runs after the latest agent synthesis is completed.",409);

  const {data:meeting}=await supabase.from("meetings").select("id,title,purpose,agenda,status,ended_at").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();
  if(!meeting) return fail("Linked meeting not found.",404);
  if(meeting.status!=="completed"||!meeting.ended_at) return fail("The Human CEO / Chair must explicitly close the meeting before legal relevance triage begins.",409);

  const closureBound=triageMatchesClosure(session.legal_triaged_at,session.legal_triage_basis_closed_at,meeting.ended_at);
  if(session.legal_triage_status!=="pending"&&closureBound){
    return NextResponse.json({ok:true,status:session.legal_triage_status,reason:session.legal_triage_reason,triagedAt:session.legal_triaged_at,cached:true,meetingClosedAt:meeting.ended_at});
  }

  const {data:orchestrator}=await supabase.from("agents").select("id,agent_code,role_title,enabled").eq("organization_id",organizationId).eq("agent_code","B-001").maybeSingle();
  if(!orchestrator||!orchestrator.enabled) return fail("Enabled B-001 Executive Orchestrator is required for governed legal triage.",409);

  const {data:messages}=await supabase.from("meeting_agent_messages").select("round_no,message_type,content,agents(agent_code)").eq("session_id",sessionId).eq("organization_id",organizationId).neq("message_type","system").order("turn_index");
  const transcript=(messages??[]).map((row:any)=>`${Array.isArray(row.agents)?row.agents[0]?.agent_code:row.agents?.agent_code??(row.message_type==="ceo_contribution"?"HUMAN CEO":"SYSTEM")} (${row.message_type}, round ${row.round_no}): ${row.content}`).join("\n\n").slice(-22000);
  const governanceFact=`GOVERNANCE FACT: The Human CEO / Chair explicitly CLOSED this meeting at ${meeting.ended_at}. Treat this as authoritative runtime state. Do not state or imply that the meeting remains open, is awaiting closure, or has not received closure confirmation.`;
  const userText=`${governanceFact}\nMeeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nDecision question: ${session.decision_question}\nAgenda: ${Array.isArray(meeting.agenda)?meeting.agenda.map(String).join(" | "):""}\nSynthesis: ${session.synthesis??""}\nRecommendation: ${session.recommendation??""}\nDecision options: ${JSON.stringify(session.decision_options??[])}\n\nTranscript:\n${transcript}`;
  const systemText=`You are B-001, RYTHM Executive Orchestrator. Perform only legal/regulatory relevance triage after the Human CEO/Chair has explicitly closed a governed meeting. You are NOT giving legal advice. Decide whether the proposed decision plausibly touches law, regulation, contractual obligations, privacy/data protection, AI regulation, consumer protection, payments/tax implications, intellectual property, employment, advertising claims, online-platform obligations, cross-border operations, licensing, or similar legal exposure. If there is meaningful uncertainty, recommend legal review. Do not recommend legal review for ordinary product/UI/operational matters with no plausible legal effect. The supplied meeting-closure fact is authoritative and must not be contradicted. Return STRICT JSON only: {"legal_review_recommended":boolean,"reason":"one concise sentence"}. Respond in ${session.language}.`;

  try{
    const remainingBudget=Math.max(0,Number(session.budget_cap_usd??0)-Number(session.estimated_cost_usd??0));
    const gateway=await executeAiRequest({
      organizationId,
      actor:{type:"agent",userId:user.id,agentId:orchestrator.id},
      context:{meetingId:meeting.id,meetingSessionId:sessionId,projectId:session.project_id},
      feature:"boardroom.legal_triage",
      systemInstructions:systemText,
      prompt:userText,
      conversationLanguage:session.language,
      mode:"task",
      maxOutputTokens:500,
      timeoutMs:config.agentTimeoutMs,
      agentPolicy:buildProductionAgentPolicy({agentId:orchestrator.id,roleTitle:orchestrator.role_title,riskCeiling:"high",maxCostPerRequest:effectiveRequestCostLimit(entitlement!,remainingBudget),maxOutputTokens:500,savedLanguage:session.language}),
      tenantPolicy,
      legacyFallback:{provider:"openai",model,reason:"compatibility"},
      telemetryPolicy:"required",
    });
    const parsed=parseTriage(gateway.outputText);
    if(!parsed) return fail("B-001 legal triage returned invalid structured output. Retry is safe.",502);
    const reason=String(parsed.reason??(parsed.legal_review_recommended?"Potential legal or regulatory relevance identified.":"No material legal relevance identified.")).slice(0,1000);
    if(reasonContradictsClosure(reason)){
      return fail("B-001 legal triage contradicted the confirmed chair-closure state and was not persisted. Retry is safe.",502);
    }

    const recommended=Boolean(parsed.legal_review_recommended);
    const status=recommended?"recommended":"not_indicated";
    const now=new Date().toISOString();
    const inputTokens=Number(gateway.usage?.inputTokens??0);
    const outputTokens=Number(gateway.usage?.outputTokens??0);
    const cost=Number(gateway.actualCostUsd??0);
    const accumulatedCost=Number(session.estimated_cost_usd??0)+cost;
    if(accumulatedCost>Number(session.budget_cap_usd??0)) return fail("Legal triage would exceed the configured meeting AI budget cap.",409);
    const {error:updateError}=await supabase.from("meeting_agent_sessions").update({legal_triage_status:status,legal_triage_reason:reason,legal_triaged_at:now,legal_triage_basis_closed_at:meeting.ended_at,legal_triage_correlation_id:gateway.correlationId,total_input_tokens:Number(session.total_input_tokens??0)+inputTokens,total_output_tokens:Number(session.total_output_tokens??0)+outputTokens,estimated_cost_usd:accumulatedCost,updated_at:now}).eq("id",sessionId).eq("organization_id",organizationId);
    if(updateError) return fail("Legal relevance triage could not be persisted against the chair-closure snapshot.",500);
    await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"agent",actor_agent_id:orchestrator.id,event_type:"meeting.legal_triage_completed",object_type:"meeting",object_id:meeting.id,risk_level:recommended?"medium":"low",payload:{session_id:sessionId,orchestrator:"B-001",chair_closed:true,chair_closed_at:meeting.ended_at,triage_basis_closed_at:meeting.ended_at,legal_review_recommended:recommended,reason,correlation_id:gateway.correlationId,routing_mode:gateway.routingMode,selected_tier:gateway.routingDecision.selectedTier,provider:gateway.routingDecision.selectedProvider,model:gateway.routingDecision.selectedModel,input_tokens:inputTokens,output_tokens:outputTokens,estimated_cost_usd:cost,external_actions:false}});
    return NextResponse.json({ok:true,status,reason,triagedAt:now,recommended,meetingClosedAt:meeting.ended_at,triageBasisClosedAt:meeting.ended_at});
  }catch(error){
    const message=error instanceof Error?error.message:"Legal triage failed.";
    return fail(`B-001 legal triage failed: ${message}`,502);
  }
}
