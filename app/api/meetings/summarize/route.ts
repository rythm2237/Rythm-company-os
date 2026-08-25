import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { redactSecretText } from "@/lib/security/redaction";
import { executeAiRequest } from "@/lib/ai/request-gateway";
import { buildProductionAgentPolicy, buildProductionTenantPolicy, effectiveRequestCostLimit } from "@/lib/ai/production-path-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status});
const estimateCost=(inputTokens:number,outputTokens:number,inputRate:number,outputRate:number)=>(inputTokens/1_000_000)*inputRate+(outputTokens/1_000_000)*outputRate;

export async function POST(request:Request){
  const config=getRuntimeConfig();
  if(!config.agentExecutionEnabled) return fail("Agent execution is disabled by environment policy.",503);
  if(config.externalActionsEnabled) return fail("Meeting summaries refuse to run while external actions are enabled.",503);
  if(!config.openAIConfigured||!config.dryRunModel) return fail("OpenAI runtime is not configured.",503);

  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok) return fail(auth.error,auth.status);
  const {supabase,user,organizationId,entitlement}=auth;
  let tenantPolicy:ReturnType<typeof buildProductionTenantPolicy>;
  try{tenantPolicy=buildProductionTenantPolicy(entitlement);}
  catch{return fail("The active organization does not have an active AI entitlement.",403);}

  let sessionId="";
  let requestedLanguage="";
  try{
    const body=(await request.json()) as {sessionId?:string;summaryLanguage?:string};
    sessionId=String(body.sessionId??"").trim();
    requestedLanguage=String(body.summaryLanguage??"").trim().slice(0,80);
  }
  catch{return fail("A JSON body with sessionId is required.",400);}
  if(!sessionId) return fail("sessionId is required.",400);

  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,decision_question,language,status,total_input_tokens,total_output_tokens,estimated_cost_usd,budget_cap_usd").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session) return fail("Meeting session not found.",404);
  const summaryLanguage=requestedLanguage||session.language||"English";
  const {data:meeting}=await supabase.from("meetings").select("id,title,purpose,agenda").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();
  if(!meeting) return fail("Linked meeting not found.",404);
  const {data:rows}=await supabase.from("meeting_agent_messages").select("turn_index,round_no,message_type,speaker_type,content,agents(agent_code,display_name,name)").eq("session_id",sessionId).eq("organization_id",organizationId).neq("message_type","system").order("turn_index");
  if(!rows?.length) return fail("There is not enough meeting content to summarize yet.",409);

  const transcript=(rows as any[]).map(row=>{
    const joined=Array.isArray(row.agents)?row.agents[0]:row.agents;
    const speaker=row.speaker_type==="human_ceo"?"Human CEO":joined?.agent_code??"System";
    return `${speaker} (${row.message_type}, round ${row.round_no}): ${row.content}`;
  }).join("\n\n").slice(-30000);
  try{
    const remainingBudget=Math.max(0,Number(session.budget_cap_usd??0)-Number(session.estimated_cost_usd??0));
    const gateway=await executeAiRequest({
      organizationId,
      actor:{type:"user",userId:user.id},
      context:{meetingId:meeting.id,meetingSessionId:sessionId},
      feature:"boardroom.summary",
      systemInstructions:`You are the RYTHM meeting secretary. Summarize the governed meeting in ${summaryLanguage}. Be concise but decision-useful. Do not invent evidence. Use exactly these headings, translated naturally into the requested summary language: Executive summary; Key points; Consensus; Material disagreements; Risks; Decision-ready options; Recommended next step. Clearly distinguish consensus from unresolved issues. Human CEO remains final authority. This is a summary, never a decision or execution authorization.`,
      prompt:`Meeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nDecision question: ${session.decision_question}\nOriginal meeting language: ${session.language}\nRequested summary language: ${summaryLanguage}\nAgenda: ${Array.isArray(meeting.agenda)?meeting.agenda.map(String).join(" | "):""}\n\nTranscript:\n${transcript}`,
      conversationLanguage:summaryLanguage,
      mode:"task",
      maxOutputTokens:1800,
      timeoutMs:config.agentTimeoutMs,
      agentPolicy:buildProductionAgentPolicy({roleTitle:"Boardroom Meeting Secretary",riskCeiling:"high",maxCostPerRequest:effectiveRequestCostLimit(entitlement!,remainingBudget),maxOutputTokens:1800,savedLanguage:summaryLanguage}),
      tenantPolicy,
      legacyFallback:{provider:"openai",model:config.dryRunModel,reason:"compatibility"},
      telemetryPolicy:"required",
    });
    const summary=gateway.outputText.slice(0,10000);
    if(!summary) return fail("The summary model returned no displayable text. Retry is safe.",502);

    const inputTokens=Number(gateway.usage?.inputTokens??0);
    const outputTokens=Number(gateway.usage?.outputTokens??0);
    const summaryCostUsd=gateway.actualCostUsd??estimateCost(inputTokens,outputTokens,config.inputCostPerMillionUsd,config.outputCostPerMillionUsd);
    const sessionEstimatedCostUsd=Number(session.estimated_cost_usd??0)+summaryCostUsd;
    if(sessionEstimatedCostUsd>Number(session.budget_cap_usd??0)) return fail("Meeting summary would exceed the configured meeting AI budget cap.",409);
    await supabase.from("meeting_agent_sessions").update({
      total_input_tokens:Number(session.total_input_tokens??0)+inputTokens,
      total_output_tokens:Number(session.total_output_tokens??0)+outputTokens,
      estimated_cost_usd:sessionEstimatedCostUsd,
      updated_at:new Date().toISOString(),
    }).eq("id",sessionId).eq("organization_id",organizationId);
    await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"meeting.summary_generated",object_type:"meeting",object_id:meeting.id,risk_level:"low",payload:{session_id:sessionId,summary_language:summaryLanguage,correlation_id:gateway.correlationId,routing_mode:gateway.routingMode,selected_tier:gateway.routingDecision.selectedTier,provider:gateway.routingDecision.selectedProvider,model:gateway.routingDecision.selectedModel,input_tokens:inputTokens,output_tokens:outputTokens,estimated_cost_usd:summaryCostUsd,session_estimated_cost_usd:sessionEstimatedCostUsd,budget_cap_usd:Number(session.budget_cap_usd??0),external_actions:false}});

    return NextResponse.json({ok:true,summary,language:summaryLanguage,meetingLanguage:session.language,status:session.status,model:gateway.routingDecision.selectedModel,inputTokens,outputTokens,summaryCostUsd,sessionEstimatedCostUsd});
  }catch(error){
    const message=redactSecretText(error instanceof Error?error.message:"Meeting summary failed.");
    return fail(`Meeting summary failed: ${message}`,502);
  }
}
