import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status});
const cleanJson=(value:string)=>value.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```$/i,"").trim();

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
  const {data:session}=await auth.supabase.from("meeting_agent_sessions").select("id,meeting_id,status,legal_triage_status,legal_triage_reason,legal_triaged_at").eq("id",sessionId).eq("organization_id",auth.organizationId).maybeSingle();
  if(!session) return fail("Meeting session not found.",404);
  const {data:meeting}=await auth.supabase.from("meetings").select("status").eq("id",session.meeting_id).eq("organization_id",auth.organizationId).maybeSingle();
  return NextResponse.json({ok:true,status:session.legal_triage_status,reason:session.legal_triage_reason,triagedAt:session.legal_triaged_at,sessionStatus:session.status,meetingStatus:meeting?.status??null});
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
  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,status,decision_question,language,synthesis,recommendation,decision_options,legal_triage_status,legal_triage_reason,legal_triaged_at").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session) return fail("Meeting session not found.",404);
  if(session.status!=="completed") return fail("Legal triage runs after the latest agent synthesis is completed.",409);
  if(session.legal_triage_status!=="pending") return NextResponse.json({ok:true,status:session.legal_triage_status,reason:session.legal_triage_reason,triagedAt:session.legal_triaged_at,cached:true});

  const {data:meeting}=await supabase.from("meetings").select("id,title,purpose,agenda,status").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();
  if(!meeting) return fail("Linked meeting not found.",404);
  if(meeting.status!=="completed") return fail("The Human CEO / Chair must explicitly close the meeting before legal relevance triage begins.",409);
  const {data:messages}=await supabase.from("meeting_agent_messages").select("round_no,message_type,content,agents(agent_code)").eq("session_id",sessionId).eq("organization_id",organizationId).neq("message_type","system").order("turn_index");
  const transcript=(messages??[]).map((row:any)=>`${Array.isArray(row.agents)?row.agents[0]?.agent_code:row.agents?.agent_code??(row.message_type==="ceo_contribution"?"HUMAN CEO":"SYSTEM")} (${row.message_type}, round ${row.round_no}): ${row.content}`).join("\n\n").slice(-22000);

  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  try{
    const response=await client.responses.create({
      model:config.dryRunModel,
      max_output_tokens:500,
      input:[
        {role:"system",content:[{type:"input_text",text:`You are B-001, RYTHM Executive Orchestrator. Perform only legal/regulatory relevance triage after the Human CEO/Chair has explicitly closed a governed meeting. You are NOT giving legal advice. Decide whether the proposed decision plausibly touches law, regulation, contractual obligations, privacy/data protection, AI regulation, consumer protection, payments/tax implications, intellectual property, employment, advertising claims, online-platform obligations, cross-border operations, licensing, or similar legal exposure. If there is meaningful uncertainty, recommend legal review. Do not recommend legal review for ordinary product/UI/operational matters with no plausible legal effect. Return STRICT JSON only: {"legal_review_recommended":boolean,"reason":"one concise sentence"}. Respond in ${session.language}.`}]},
        {role:"user",content:[{type:"input_text",text:`Meeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nDecision question: ${session.decision_question}\nAgenda: ${Array.isArray(meeting.agenda)?meeting.agenda.map(String).join(" | "):""}\nSynthesis: ${session.synthesis??""}\nRecommendation: ${session.recommendation??""}\nDecision options: ${JSON.stringify(session.decision_options??[])}\n\nTranscript:\n${transcript}`}]}],
    },{signal:AbortSignal.timeout(config.agentTimeoutMs)}) as unknown as ResponseLike;
    const raw=extractText(response);
    if(!raw) return fail("B-001 legal triage returned no displayable result. Retry is safe.",502);
    let parsed:{legal_review_recommended?:boolean;reason?:string};
    try{parsed=JSON.parse(cleanJson(raw)) as typeof parsed;}catch{return fail("B-001 legal triage returned invalid structured output. Retry is safe.",502);}
    const recommended=Boolean(parsed.legal_review_recommended);
    const reason=String(parsed.reason??(recommended?"Potential legal or regulatory relevance identified.":"No material legal relevance identified.")).slice(0,1000);
    const status=recommended?"recommended":"not_indicated";
    const now=new Date().toISOString();
    const {error:updateError}=await supabase.from("meeting_agent_sessions").update({legal_triage_status:status,legal_triage_reason:reason,legal_triaged_at:now,updated_at:now}).eq("id",sessionId).eq("organization_id",organizationId).eq("legal_triage_status","pending");
    if(updateError) return fail(updateError.message,500);
    await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"agent",actor_agent_id:null,event_type:"meeting.legal_triage_completed",object_type:"meeting",object_id:meeting.id,risk_level:recommended?"medium":"low",payload:{session_id:sessionId,orchestrator:"B-001",chair_closed:true,legal_review_recommended:recommended,reason,model:config.dryRunModel,external_actions:false}});
    return NextResponse.json({ok:true,status,reason,triagedAt:now,recommended});
  }catch(error){
    const message=error instanceof Error?error.message:"Legal triage failed.";
    return fail(`B-001 legal triage failed: ${message}`,502);
  }
}
