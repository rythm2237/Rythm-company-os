import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getRuntimeConfig } from "@/lib/runtime-config";

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

type ResponseLike={output_text?:string;output?:Array<{type?:string;content?:Array<{type?:string;text?:string}>}>;usage?:{input_tokens?:number;output_tokens?:number}};
type ParsedTriage={legal_review_recommended?:boolean;reason?:string};
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
function parseTriage(raw:string):ParsedTriage|null{
  if(!raw) return null;
  try{return JSON.parse(cleanJson(raw)) as ParsedTriage;}catch{return null;}
}

async function context(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return {error:fail("Authentication required.",401)} as const;
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) return {error:fail("Owner authorization required.",403)} as const;
  return {supabase,user,organizationId:membership.organization_id as string} as const;
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

  const auth=await context();
  if("error" in auth) return auth.error;
  let sessionId="";
  try{sessionId=String(((await request.json()) as {sessionId?:string}).sessionId??"").trim();}
  catch{return fail("A JSON body with sessionId is required.",400);}
  if(!sessionId) return fail("sessionId is required.",400);

  const {supabase,user,organizationId}=auth;
  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,status,decision_question,language,synthesis,recommendation,decision_options,legal_triage_status,legal_triage_reason,legal_triaged_at,legal_triage_basis_closed_at").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session) return fail("Meeting session not found.",404);
  if(session.status!=="completed") return fail("Legal triage runs after the latest agent synthesis is completed.",409);

  const {data:meeting}=await supabase.from("meetings").select("id,title,purpose,agenda,status,ended_at").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();
  if(!meeting) return fail("Linked meeting not found.",404);
  if(meeting.status!=="completed"||!meeting.ended_at) return fail("The Human CEO / Chair must explicitly close the meeting before legal relevance triage begins.",409);

  const closureBound=triageMatchesClosure(session.legal_triaged_at,session.legal_triage_basis_closed_at,meeting.ended_at);
  if(session.legal_triage_status!=="pending"&&closureBound){
    return NextResponse.json({ok:true,status:session.legal_triage_status,reason:session.legal_triage_reason,triagedAt:session.legal_triaged_at,cached:true,meetingClosedAt:meeting.ended_at});
  }

  const {data:messages}=await supabase.from("meeting_agent_messages").select("round_no,message_type,content,agents(agent_code)").eq("session_id",sessionId).eq("organization_id",organizationId).neq("message_type","system").order("turn_index");
  const transcript=(messages??[]).map((row:any)=>`${Array.isArray(row.agents)?row.agents[0]?.agent_code:row.agents?.agent_code??(row.message_type==="ceo_contribution"?"HUMAN CEO":"SYSTEM")} (${row.message_type}, round ${row.round_no}): ${row.content}`).join("\n\n").slice(-22000);
  const governanceFact=`GOVERNANCE FACT: The Human CEO / Chair explicitly CLOSED this meeting at ${meeting.ended_at}. Treat this as authoritative runtime state. Do not state or imply that the meeting remains open, is awaiting closure, or has not received closure confirmation.`;
  const userText=`${governanceFact}\nMeeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nDecision question: ${session.decision_question}\nAgenda: ${Array.isArray(meeting.agenda)?meeting.agenda.map(String).join(" | "):""}\nSynthesis: ${session.synthesis??""}\nRecommendation: ${session.recommendation??""}\nDecision options: ${JSON.stringify(session.decision_options??[])}\n\nTranscript:\n${transcript}`;
  const systemText=`You are B-001, RYTHM Executive Orchestrator. Perform only legal/regulatory relevance triage after the Human CEO/Chair has explicitly closed a governed meeting. You are NOT giving legal advice. Decide whether the proposed decision plausibly touches law, regulation, contractual obligations, privacy/data protection, AI regulation, consumer protection, payments/tax implications, intellectual property, employment, advertising claims, online-platform obligations, cross-border operations, licensing, or similar legal exposure. If there is meaningful uncertainty, recommend legal review. Do not recommend legal review for ordinary product/UI/operational matters with no plausible legal effect. The supplied meeting-closure fact is authoritative and must not be contradicted. Return STRICT JSON only: {"legal_review_recommended":boolean,"reason":"one concise sentence"}. Respond in ${session.language}.`;

  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const requestTriage=async(correction?:string)=>{
    const response=await client.responses.create({
      model:config.dryRunModel,
      max_output_tokens:500,
      input:[
        {role:"system",content:[{type:"input_text",text:correction?`${systemText}\n${correction}`:systemText}]},
        {role:"user",content:[{type:"input_text",text:userText}]}],
    },{signal:AbortSignal.timeout(config.agentTimeoutMs)}) as unknown as ResponseLike;
    return parseTriage(extractText(response));
  };

  try{
    let parsed=await requestTriage();
    if(!parsed) return fail("B-001 legal triage returned invalid structured output. Retry is safe.",502);
    let reason=String(parsed.reason??(parsed.legal_review_recommended?"Potential legal or regulatory relevance identified.":"No material legal relevance identified.")).slice(0,1000);
    if(reasonContradictsClosure(reason)){
      parsed=await requestTriage("Your previous attempt contradicted the authoritative closure state. Re-evaluate legal relevance only; the meeting is already closed by the Human CEO / Chair.");
      if(!parsed) return fail("B-001 legal triage retry returned invalid structured output. Retry is safe.",502);
      reason=String(parsed.reason??(parsed.legal_review_recommended?"Potential legal or regulatory relevance identified.":"No material legal relevance identified.")).slice(0,1000);
      if(reasonContradictsClosure(reason)) return fail("B-001 legal triage contradicted the confirmed chair-closure state and was not persisted. Retry is safe.",502);
    }

    const recommended=Boolean(parsed.legal_review_recommended);
    const status=recommended?"recommended":"not_indicated";
    const now=new Date().toISOString();
    const {error:updateError}=await supabase.from("meeting_agent_sessions").update({legal_triage_status:status,legal_triage_reason:reason,legal_triaged_at:now,legal_triage_basis_closed_at:meeting.ended_at,updated_at:now}).eq("id",sessionId).eq("organization_id",organizationId);
    if(updateError) return fail("Legal relevance triage could not be persisted against the chair-closure snapshot.",500);
    await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"agent",actor_agent_id:null,event_type:"meeting.legal_triage_completed",object_type:"meeting",object_id:meeting.id,risk_level:recommended?"medium":"low",payload:{session_id:sessionId,orchestrator:"B-001",chair_closed:true,chair_closed_at:meeting.ended_at,triage_basis_closed_at:meeting.ended_at,legal_review_recommended:recommended,reason,model:config.dryRunModel,external_actions:false}});
    return NextResponse.json({ok:true,status,reason,triagedAt:now,recommended,meetingClosedAt:meeting.ended_at,triageBasisClosedAt:meeting.ended_at});
  }catch(error){
    const message=error instanceof Error?error.message:"Legal triage failed.";
    return fail(`B-001 legal triage failed: ${message}`,502);
  }
}
