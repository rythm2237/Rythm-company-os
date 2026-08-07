import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=60;

const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status});
const cleanJson=(value:string)=>value.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```$/i,"").trim();
const estimateCost=(inputTokens:number,outputTokens:number,inputRate:number,outputRate:number)=>(inputTokens/1_000_000)*inputRate+(outputTokens/1_000_000)*outputRate;
type ResponseLike={output_text?:string;output?:Array<{type?:string;content?:Array<{type?:string;text?:string}>}>;usage?:{input_tokens?:number;output_tokens?:number};status?:string;incomplete_details?:{reason?:string}|null};
function textOf(response:ResponseLike){const direct=String(response.output_text??"").trim();if(direct)return direct;const parts:string[]=[];for(const item of response.output??[]){if(item.type!=="message")continue;for(const part of item.content??[])if((part.type==="output_text"||part.type==="text")&&part.text)parts.push(part.text);}return parts.join("\n").trim();}

async function context(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership)return null;
  return {supabase,user,organizationId:membership.organization_id as string};
}

export async function GET(request:Request){
  const auth=await context();if(!auth)return fail("Owner authorization required.",403);
  const sessionId=new URL(request.url).searchParams.get("sessionId")?.trim()??"";if(!sessionId)return fail("sessionId is required.",400);
  const {supabase,organizationId}=auth;
  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,status,legal_review_recommended,legal_review_reason").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session)return fail("Meeting session not found.",404);
  const {data:review}=await supabase.from("meeting_legal_reviews").select("id,status,outcome,executive_note,risks,conditions,licensed_counsel_reason,estimated_cost_usd,error_message,completed_at").eq("session_id",sessionId).eq("organization_id",organizationId).maybeSingle();
  return NextResponse.json({ok:true,recommended:Boolean(session.legal_review_recommended),reason:session.legal_review_reason??"",sessionStatus:session.status,review:review??null});
}

export async function POST(request:Request){
  const config=getRuntimeConfig();
  if(!config.agentExecutionEnabled)return fail("Agent execution is disabled by environment policy.",503);
  if(config.externalActionsEnabled)return fail("Legal review refuses to run while external actions are enabled.",503);
  if(!config.openAIConfigured||!config.dryRunModel)return fail("OpenAI runtime is not configured.",503);
  const auth=await context();if(!auth)return fail("Owner authorization required.",403);
  const {supabase,user,organizationId}=auth;
  let sessionId="";try{sessionId=String(((await request.json())as{sessionId?:string}).sessionId??"").trim();}catch{return fail("A JSON body with sessionId is required.",400);}if(!sessionId)return fail("sessionId is required.",400);

  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,project_id,status,decision_question,language,synthesis,recommendation,decision_options,total_input_tokens,total_output_tokens,estimated_cost_usd,budget_cap_usd,legal_review_recommended,legal_review_reason").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session)return fail("Meeting session not found.",404);if(session.status!=="completed")return fail("Legal review is available after agent deliberation completes.",409);
  const {data:meeting}=await supabase.from("meetings").select("id,title,purpose,agenda").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();if(!meeting)return fail("Linked meeting not found.",404);
  const {data:a106}=await supabase.from("agents").select("id,agent_code,display_name,name,role_title,purpose,work_style").eq("organization_id",organizationId).eq("agent_code","A-106").maybeSingle();if(!a106)return fail("A-106 Legal & Regulatory Counsel is not registered. Run the legal-review migration first.",409);
  const {data:existing}=await supabase.from("meeting_legal_reviews").select("id,status,outcome,executive_note,risks,conditions,licensed_counsel_reason,estimated_cost_usd,error_message,completed_at").eq("session_id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(existing?.status==="completed")return NextResponse.json({ok:true,review:existing,cached:true});

  const now=new Date().toISOString();
  const reviewId=existing?.id??null;
  let activeId=reviewId;
  if(activeId){await supabase.from("meeting_legal_reviews").update({status:"running",legal_agent_id:a106.id,requested_by_user_id:user.id,requested_at:now,error_message:null,updated_at:now}).eq("id",activeId).eq("organization_id",organizationId);}
  else{const {data:created,error}=await supabase.from("meeting_legal_reviews").insert({organization_id:organizationId,meeting_id:meeting.id,session_id:sessionId,legal_agent_id:a106.id,status:"running",requested_by_user_id:user.id,requested_at:now}).select("id").single();if(error||!created)return fail(error?.message??"Legal review record could not be created.",500);activeId=created.id;}

  const {data:messages}=await supabase.from("meeting_agent_messages").select("turn_index,round_no,message_type,speaker_type,content,agents(agent_code,display_name,name)").eq("session_id",sessionId).eq("organization_id",organizationId).neq("message_type","system").order("turn_index");
  const transcript=(messages??[]).map((row:any)=>{const joined=Array.isArray(row.agents)?row.agents[0]:row.agents;const speaker=row.speaker_type==="human_ceo"?"Human CEO":joined?.agent_code??"System";return `${speaker} (${row.message_type}, round ${row.round_no}): ${row.content}`;}).join("\n\n").slice(-28000);
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  try{
    const response=await client.responses.create({model:config.dryRunModel,max_output_tokens:1800,input:[
      {role:"system",content:[{type:"input_text",text:`You are A-106, RYTHM Legal & Regulatory Counsel. Perform advisory legal/regulatory issue-spotting only; you are not a licensed lawyer and must never represent this as formal legal advice. No browsing or external research is authorized. Assess only what is supported by the meeting record. Consider AI regulation, privacy/data protection, consumer protection, SaaS/e-commerce, payments, IP, advertising claims, employment, contracts, and cross-border/jurisdiction risk when relevant. If jurisdiction-specific legal certainty or licensed representation is needed, say so. Return STRICT JSON only with keys: outcome (one of clear, clear_with_conditions, risk_identified, licensed_counsel_required), executive_note (short string), risks (array of short strings), conditions (array of short strings), licensed_counsel_reason (string, empty unless needed). Respond in ${session.language}.`}]},
      {role:"user",content:[{type:"input_text",text:`Meeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nDecision question: ${session.decision_question}\nB-001 legal-review notice: ${session.legal_review_reason??"CEO requested a precautionary legal review."}\nRecommendation: ${session.recommendation??""}\nDecision options: ${JSON.stringify(session.decision_options??[])}\nSynthesis:\n${session.synthesis??""}\n\nTranscript:\n${transcript}`}]}]},{signal:AbortSignal.timeout(config.agentTimeoutMs)}) as unknown as ResponseLike;
    const raw=textOf(response);if(!raw){const reason=response.incomplete_details?.reason??response.status??"empty output";await supabase.from("meeting_legal_reviews").update({status:"failed",error_message:`A-106 returned no displayable text (${reason}).`,updated_at:new Date().toISOString()}).eq("id",activeId);return fail("A-106 returned no displayable legal review. Retry is safe.",502);}
    let payload:any;try{payload=JSON.parse(cleanJson(raw));}catch{payload={outcome:"licensed_counsel_required",executive_note:"The AI legal review could not be parsed reliably. Treat the matter conservatively and obtain human legal review before consequential execution.",risks:["Unstructured legal-review output"],conditions:[],licensed_counsel_reason:"Reliable structured legal assessment was not produced."};}
    const allowed=new Set(["clear","clear_with_conditions","risk_identified","licensed_counsel_required"]);const outcome=allowed.has(String(payload.outcome))?String(payload.outcome):"licensed_counsel_required";
    const inputTokens=Number(response.usage?.input_tokens??0),outputTokens=Number(response.usage?.output_tokens??0);const cost=estimateCost(inputTokens,outputTokens,config.inputCostPerMillionUsd,config.outputCostPerMillionUsd);const accumulated=Number(session.estimated_cost_usd??0)+cost;
    if(accumulated>Number(session.budget_cap_usd)){await supabase.from("meeting_legal_reviews").update({status:"failed",error_message:"Legal review would exceed the meeting AI budget cap.",updated_at:new Date().toISOString()}).eq("id",activeId);return fail("Legal review would exceed the configured meeting AI budget cap.",409);}
    const completedAt=new Date().toISOString();const review={status:"completed",outcome,executive_note:String(payload.executive_note??"").slice(0,3000),risks:Array.isArray(payload.risks)?payload.risks.map(String).slice(0,12):[],conditions:Array.isArray(payload.conditions)?payload.conditions.map(String).slice(0,12):[],licensed_counsel_reason:String(payload.licensed_counsel_reason??"").slice(0,2000),model:config.dryRunModel,input_tokens:inputTokens,output_tokens:outputTokens,estimated_cost_usd:cost,completed_at:completedAt,error_message:null,updated_at:completedAt};
    await supabase.from("meeting_legal_reviews").update(review).eq("id",activeId).eq("organization_id",organizationId);
    await supabase.from("meeting_agent_sessions").update({total_input_tokens:Number(session.total_input_tokens??0)+inputTokens,total_output_tokens:Number(session.total_output_tokens??0)+outputTokens,estimated_cost_usd:accumulated,updated_at:completedAt}).eq("id",sessionId).eq("organization_id",organizationId);
    await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"meeting.legal_review_completed",object_type:"meeting",object_id:meeting.id,risk_level:outcome==="clear"?"low":outcome==="clear_with_conditions"?"medium":"high",payload:{session_id:sessionId,legal_agent:"A-106",outcome,advisory_ai_review:true,licensed_counsel_required:outcome==="licensed_counsel_required",external_actions:false,external_research:false,estimated_cost_usd:cost}});
    return NextResponse.json({ok:true,review:{id:activeId,...review},sessionEstimatedCostUsd:accumulated});
  }catch(error){const message=error instanceof Error?error.message:"Legal review failed.";await supabase.from("meeting_legal_reviews").update({status:"failed",error_message:message.slice(0,1000),updated_at:new Date().toISOString()}).eq("id",activeId);return fail(`Legal review failed: ${message}`,502);}
}
