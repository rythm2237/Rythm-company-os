import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status});
const cleanJson=(value:string)=>value.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```$/i,"").trim();
type ResponseLike={output_text?:string;output?:Array<{type?:string;content?:Array<{type?:string;text?:string}>}>};
function textOf(response:ResponseLike){const direct=String(response.output_text??"").trim();if(direct)return direct;const parts:string[]=[];for(const item of response.output??[]){if(item.type!=="message")continue;for(const part of item.content??[])if((part.type==="output_text"||part.type==="text")&&part.text)parts.push(part.text);}return parts.join("\n").trim();}

export async function POST(request:Request){
  const config=getRuntimeConfig();
  if(!config.agentExecutionEnabled) return fail("Agent execution is disabled by environment policy.",503);
  if(config.externalActionsEnabled) return fail("Legal triage refuses to run while external actions are enabled.",503);
  if(!config.openAIConfigured||!config.dryRunModel) return fail("OpenAI runtime is not configured.",503);
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return fail("Authentication required.",401);
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) return fail("Owner authorization required.",403);
  let sessionId="";try{sessionId=String(((await request.json()) as {sessionId?:string}).sessionId??"").trim();}catch{return fail("sessionId is required.",400);}if(!sessionId)return fail("sessionId is required.",400);
  const organizationId=membership.organization_id as string;
  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,status,decision_question,synthesis,recommendation,decision_options,language,legal_triage_status,legal_triage_reason,legal_review_status").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session) return fail("Meeting session not found.",404);
  if(session.status!=="completed") return fail("Legal relevance triage runs after agent deliberation is complete.",409);
  if(session.legal_triage_status!=="not_assessed") return NextResponse.json({ok:true,triageStatus:session.legal_triage_status,reason:session.legal_triage_reason??"",legalReviewStatus:session.legal_review_status,cached:true});
  const {data:meeting}=await supabase.from("meetings").select("id,title,purpose,agenda").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();
  if(!meeting)return fail("Linked meeting not found.",404);
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  try{
    const response=await client.responses.create({model:config.dryRunModel,max_output_tokens:700,input:[
      {role:"system",content:[{type:"input_text",text:"You are B-001, RYTHM Executive Orchestrator. Perform ONLY a legal-relevance triage after a governed meeting. Do not give legal advice. Decide whether the meeting outcome plausibly needs specialist legal/regulatory review before implementation. Return STRICT JSON only: {\"status\":\"not_needed|recommended|required\",\"reason\":\"1-3 concise sentences\"}. Use recommended when legal relevance is plausible but not clearly blocking; required when the decision touches material legal/regulatory exposure, jurisdiction-specific obligations, contracts, privacy/data, AI regulation, consumer rights, IP, employment, payments/tax, public claims, regulated sectors, or similar issues where execution should wait for legal review. Use not_needed when the decision is operational/product/internal and no meaningful legal issue is apparent."}]},
      {role:"user",content:[{type:"input_text",text:`Meeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nDecision question: ${session.decision_question}\nSynthesis: ${session.synthesis??""}\nRecommendation: ${session.recommendation??""}\nDecision options: ${JSON.stringify(session.decision_options??[])}\nLanguage: ${session.language}`}]}
    ]},{signal:AbortSignal.timeout(config.agentTimeoutMs)}) as unknown as ResponseLike;
    const raw=textOf(response);if(!raw)return fail("B-001 legal triage returned no displayable output.",502);
    let parsed:{status?:string;reason?:string};try{parsed=JSON.parse(cleanJson(raw));}catch{return fail("B-001 legal triage returned invalid structured output. Retry is safe.",502);}
    const status=["not_needed","recommended","required"].includes(String(parsed.status))?String(parsed.status):"recommended";
    const reason=String(parsed.reason??"Legal relevance could not be ruled out with confidence.").slice(0,1600);
    await supabase.from("meeting_agent_sessions").update({legal_triage_status:status,legal_triage_reason:reason,legal_triaged_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",sessionId).eq("organization_id",organizationId);
    await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"agent",event_type:"meeting.legal_triage_completed",object_type:"meeting",object_id:meeting.id,risk_level:status==="required"?"high":status==="recommended"?"medium":"low",payload:{session_id:sessionId,agent_code:"B-001",triage_status:status,reason,external_actions:false,advisory:true}});
    return NextResponse.json({ok:true,triageStatus:status,reason,legalReviewStatus:session.legal_review_status,cached:false});
  }catch(error){return fail(`Legal triage failed: ${error instanceof Error?error.message:"Unknown error"}`,502);}
}
