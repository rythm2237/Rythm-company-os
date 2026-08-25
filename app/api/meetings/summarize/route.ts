import OpenAI from "openai";
import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { redactSecretText } from "@/lib/security/redaction";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status});
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

export async function POST(request:Request){
  const config=getRuntimeConfig();
  if(!config.agentExecutionEnabled) return fail("Agent execution is disabled by environment policy.",503);
  if(config.externalActionsEnabled) return fail("Meeting summaries refuse to run while external actions are enabled.",503);
  if(!config.openAIConfigured||!config.dryRunModel) return fail("OpenAI runtime is not configured.",503);

  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok) return fail(auth.error,auth.status);
  const {supabase,user,organizationId}=auth;

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
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  try{
    const response=await client.responses.create({
      model:config.dryRunModel,
      max_output_tokens:1800,
      input:[
        {role:"system",content:[{type:"input_text",text:`You are the RYTHM meeting secretary. Summarize the governed meeting in ${summaryLanguage}. Be concise but decision-useful. Do not invent evidence. Use exactly these headings, translated naturally into the requested summary language: Executive summary; Key points; Consensus; Material disagreements; Risks; Decision-ready options; Recommended next step. Clearly distinguish consensus from unresolved issues. Human CEO remains final authority.`}]},
        {role:"user",content:[{type:"input_text",text:`Meeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nDecision question: ${session.decision_question}\nOriginal meeting language: ${session.language}\nRequested summary language: ${summaryLanguage}\nAgenda: ${Array.isArray(meeting.agenda)?meeting.agenda.map(String).join(" | "):""}\n\nTranscript:\n${transcript}`}]}],
    },{signal:AbortSignal.timeout(config.agentTimeoutMs)}) as unknown as ResponseLike;
    const summary=extractText(response).slice(0,10000);
    if(!summary) return fail("The summary model returned no displayable text. Retry is safe.",502);

    const inputTokens=Number(response.usage?.input_tokens??0);
    const outputTokens=Number(response.usage?.output_tokens??0);
    const summaryCostUsd=estimateCost(inputTokens,outputTokens,config.inputCostPerMillionUsd,config.outputCostPerMillionUsd);
    const sessionEstimatedCostUsd=Number(session.estimated_cost_usd??0)+summaryCostUsd;
    await supabase.from("meeting_agent_sessions").update({
      total_input_tokens:Number(session.total_input_tokens??0)+inputTokens,
      total_output_tokens:Number(session.total_output_tokens??0)+outputTokens,
      estimated_cost_usd:sessionEstimatedCostUsd,
      updated_at:new Date().toISOString(),
    }).eq("id",sessionId).eq("organization_id",organizationId);
    await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"meeting.summary_generated",object_type:"meeting",object_id:meeting.id,risk_level:"low",payload:{session_id:sessionId,summary_language:summaryLanguage,model:config.dryRunModel,input_tokens:inputTokens,output_tokens:outputTokens,estimated_cost_usd:summaryCostUsd,session_estimated_cost_usd:sessionEstimatedCostUsd,budget_cap_usd:Number(session.budget_cap_usd??0),external_actions:false}});

    return NextResponse.json({ok:true,summary,language:summaryLanguage,meetingLanguage:session.language,status:session.status,model:config.dryRunModel,inputTokens,outputTokens,summaryCostUsd,sessionEstimatedCostUsd});
  }catch(error){
    const message=redactSecretText(error instanceof Error?error.message:"Meeting summary failed.");
    return fail(`Meeting summary failed: ${message}`,502);
  }
}
