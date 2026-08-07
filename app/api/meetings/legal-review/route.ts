import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status});
const cleanJson=(value:string)=>value.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```$/i,"").trim();
const estimateCost=(inputTokens:number,outputTokens:number,inputRate:number,outputRate:number)=>(inputTokens/1_000_000)*inputRate+(outputTokens/1_000_000)*outputRate;

type ResponseLike={output_text?:string;output?:Array<{type?:string;content?:Array<{type?:string;text?:string}>}>;usage?:{input_tokens?:number;output_tokens?:number}};
function extractText(response:ResponseLike){
  const direct=String(response.output_text??"").trim();
  if(direct) return direct;
  const parts:string[]=[];
  for(const item of response.output??[]){
    if(item.type!=="message") continue;
    for(const part of item.content??[]) if((part.type==="output_text"||part.type==="text")&&part.text) parts.push(part.text);
  }
  return parts.join("\n").trim();
}

async function authContext(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return {error:fail("Authentication required.",401)} as const;
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) return {error:fail("Owner authorization required.",403)} as const;
  return {supabase,user,organizationId:membership.organization_id as string} as const;
}

export async function GET(request:Request){
  const auth=await authContext();
  if("error" in auth) return auth.error;
  const sessionId=new URL(request.url).searchParams.get("sessionId")?.trim()??"";
  if(!sessionId) return fail("sessionId is required.",400);
  const {data:review}=await auth.supabase.from("meeting_legal_reviews").select("id,status,outcome,executive_note,risk_summary,conditions,jurisdictions,licensed_counsel_required,estimated_cost_usd,error_message,requested_at,completed_at,agents:legal_agent_id(agent_code,display_name,name,role_title)").eq("session_id",sessionId).eq("organization_id",auth.organizationId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  return NextResponse.json({ok:true,review:review??null});
}

export async function POST(request:Request){
  const config=getRuntimeConfig();
  if(!config.agentExecutionEnabled) return fail("Agent execution is disabled by environment policy.",503);
  if(config.externalActionsEnabled) return fail("AI legal review refuses to run while external actions are enabled.",503);
  if(!config.openAIConfigured||!config.dryRunModel) return fail("OpenAI runtime is not configured.",503);

  const auth=await authContext();
  if("error" in auth) return auth.error;
  let sessionId="";
  try{sessionId=String(((await request.json()) as {sessionId?:string}).sessionId??"").trim();}
  catch{return fail("A JSON body with sessionId is required.",400);}
  if(!sessionId) return fail("sessionId is required.",400);

  const {supabase,user,organizationId}=auth;
  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,status,decision_question,language,synthesis,recommendation,decision_options,total_input_tokens,total_output_tokens,estimated_cost_usd,budget_cap_usd,legal_triage_status,legal_triage_reason").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session) return fail("Meeting session not found.",404);
  if(session.status!=="completed") return fail("AI legal review is available after deliberation is completed.",409);
  const {data:meeting}=await supabase.from("meetings").select("id,title,purpose,agenda").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();
  if(!meeting) return fail("Linked meeting not found.",404);
  const {data:legalAgent}=await supabase.from("agents").select("id,agent_code,display_name,name,role_title,purpose,work_style").eq("organization_id",organizationId).eq("agent_code","A-106").maybeSingle();
  if(!legalAgent) return fail("A-106 Legal & Regulatory Counsel is not registered. Run the Legal Review Gate migration first.",409);

  const {data:existing}=await supabase.from("meeting_legal_reviews").select("id,status,outcome,executive_note,risk_summary,conditions,jurisdictions,licensed_counsel_required,estimated_cost_usd,error_message,requested_at,completed_at").eq("session_id",sessionId).eq("organization_id",organizationId).in("status",["pending","running","completed"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(existing?.status==="completed") return NextResponse.json({ok:true,review:existing,cached:true});
  if(existing?.status==="running") return fail("A-106 legal review is already running.",409);

  let reviewId=existing?.id??null;
  const now=new Date().toISOString();
  if(reviewId){
    const {error}=await supabase.from("meeting_legal_reviews").update({status:"running",legal_agent_id:legalAgent.id,requested_by_user_id:user.id,error_message:null,updated_at:now}).eq("id",reviewId).eq("organization_id",organizationId);
    if(error) return fail(error.message,500);
  }else{
    const {data:newReview,error}=await supabase.from("meeting_legal_reviews").insert({organization_id:organizationId,meeting_id:meeting.id,session_id:sessionId,legal_agent_id:legalAgent.id,requested_by_user_id:user.id,status:"running",requested_at:now}).select("id").single();
    if(error||!newReview) return fail(error?.message??"Legal review record could not be created.",500);
    reviewId=newReview.id;
  }

  const {data:messages}=await supabase.from("meeting_agent_messages").select("round_no,message_type,content,agents(agent_code,display_name,name)").eq("session_id",sessionId).eq("organization_id",organizationId).neq("message_type","system").order("turn_index");
  const transcript=(messages??[]).map((row:any)=>{const a=Array.isArray(row.agents)?row.agents[0]:row.agents;return `${a?.agent_code??"Human CEO/System"} (${row.message_type}, round ${row.round_no}): ${row.content}`;}).join("\n\n").slice(-30000);

  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  try{
    const response=await client.responses.create({
      model:config.dryRunModel,
      max_output_tokens:1800,
      input:[
        {role:"system",content:[{type:"input_text",text:`You are A-106, RYTHM Legal & Regulatory Counsel. You provide advisory AI legal issue-spotting, not licensed legal advice. Review the meeting decision package for plausible legal/regulatory exposure. Be jurisdiction-aware and conservative when facts or jurisdiction are missing. Cover only relevant issues such as AI regulation, privacy/data protection, consumer protection, online commerce/platform duties, contracts, payments/tax implications, intellectual property, employment, advertising claims, licensing, and cross-border operations. Never state that a matter is legally approved. Return STRICT JSON only with keys: outcome (one of CLEAR, CLEAR_WITH_CONDITIONS, RISK_IDENTIFIED, LICENSED_COUNSEL_REQUIRED), executive_note (2-4 concise sentences), risk_summary (concise string), conditions (array of strings), jurisdictions (array of jurisdiction strings or "Not specified"), licensed_counsel_required (boolean). Respond in ${session.language}.`}]},
        {role:"user",content:[{type:"input_text",text:`Meeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nDecision question: ${session.decision_question}\nAgenda: ${Array.isArray(meeting.agenda)?meeting.agenda.map(String).join(" | "):""}\nB-001 legal triage: ${session.legal_triage_status} — ${session.legal_triage_reason??""}\nSynthesis: ${session.synthesis??""}\nRecommendation: ${session.recommendation??""}\nDecision options: ${JSON.stringify(session.decision_options??[])}\n\nTranscript:\n${transcript}`}]}],
    },{signal:AbortSignal.timeout(config.agentTimeoutMs)}) as unknown as ResponseLike;
    const raw=extractText(response);
    if(!raw) throw new Error("A-106 returned no displayable text.");
    let parsed:{outcome?:string;executive_note?:string;risk_summary?:string;conditions?:unknown;jurisdictions?:unknown;licensed_counsel_required?:boolean};
    try{parsed=JSON.parse(cleanJson(raw)) as typeof parsed;}catch{throw new Error("A-106 returned invalid structured output.");}
    const allowed=new Set(["CLEAR","CLEAR_WITH_CONDITIONS","RISK_IDENTIFIED","LICENSED_COUNSEL_REQUIRED"]);
    const outcome=allowed.has(String(parsed.outcome))?String(parsed.outcome):"RISK_IDENTIFIED";
    const conditions=Array.isArray(parsed.conditions)?parsed.conditions.map(String).slice(0,12):[];
    const jurisdictions=Array.isArray(parsed.jurisdictions)?parsed.jurisdictions.map(String).slice(0,12):["Not specified"];
    const licensed=Boolean(parsed.licensed_counsel_required)||outcome==="LICENSED_COUNSEL_REQUIRED";
    const inputTokens=Number(response.usage?.input_tokens??0);
    const outputTokens=Number(response.usage?.output_tokens??0);
    const cost=estimateCost(inputTokens,outputTokens,config.inputCostPerMillionUsd,config.outputCostPerMillionUsd);
    const newCost=Number(session.estimated_cost_usd??0)+cost;
    if(newCost>Number(session.budget_cap_usd)) throw new Error("AI legal review would exceed the configured meeting AI budget cap.");
    const completedAt=new Date().toISOString();
    const {data:review,error:updateError}=await supabase.from("meeting_legal_reviews").update({status:"completed",outcome,executive_note:String(parsed.executive_note??"").slice(0,4000),risk_summary:String(parsed.risk_summary??"").slice(0,4000),conditions,jurisdictions,licensed_counsel_required:licensed,model:config.dryRunModel,input_tokens:inputTokens,output_tokens:outputTokens,estimated_cost_usd:cost,error_message:null,completed_at:completedAt,updated_at:completedAt}).eq("id",reviewId).eq("organization_id",organizationId).select("id,status,outcome,executive_note,risk_summary,conditions,jurisdictions,licensed_counsel_required,estimated_cost_usd,requested_at,completed_at").single();
    if(updateError||!review) return fail(updateError?.message??"Legal review could not be saved.",500);
    await supabase.from("meeting_agent_sessions").update({total_input_tokens:Number(session.total_input_tokens??0)+inputTokens,total_output_tokens:Number(session.total_output_tokens??0)+outputTokens,estimated_cost_usd:newCost,updated_at:completedAt}).eq("id",sessionId).eq("organization_id",organizationId);
    await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"agent",actor_agent_id:legalAgent.id,event_type:"meeting.ai_legal_review_completed",object_type:"meeting",object_id:meeting.id,risk_level:outcome==="CLEAR"?"low":outcome==="CLEAR_WITH_CONDITIONS"?"medium":"high",payload:{session_id:sessionId,review_id:review.id,agent_code:"A-106",outcome,licensed_counsel_required:licensed,conditions,jurisdictions,model:config.dryRunModel,input_tokens:inputTokens,output_tokens:outputTokens,estimated_cost_usd:cost,external_actions:false,advisory_only:true}});
    return NextResponse.json({ok:true,review,sessionEstimatedCostUsd:newCost});
  }catch(error){
    const message=error instanceof Error?error.message:"AI legal review failed.";
    await supabase.from("meeting_legal_reviews").update({status:"failed",error_message:message,updated_at:new Date().toISOString()}).eq("id",reviewId).eq("organization_id",organizationId);
    return fail(`A-106 legal review failed: ${message}`,502);
  }
}
