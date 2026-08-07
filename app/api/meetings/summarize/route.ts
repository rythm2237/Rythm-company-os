import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status});

type ResponseLike={output_text?:string;output?:Array<{type?:string;content?:Array<{type?:string;text?:string}>}>};
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

  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return fail("Authentication required.",401);
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) return fail("Owner authorization required.",403);

  let sessionId="";
  try{sessionId=String(((await request.json()) as {sessionId?:string}).sessionId??"").trim();}
  catch{return fail("A JSON body with sessionId is required.",400);}
  if(!sessionId) return fail("sessionId is required.",400);

  const organizationId=membership.organization_id as string;
  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,decision_question,language,status").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session) return fail("Meeting session not found.",404);
  const {data:meeting}=await supabase.from("meetings").select("title,purpose,agenda").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();
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
        {role:"system",content:[{type:"input_text",text:`You are the RYTHM meeting secretary. Summarize the governed meeting in ${session.language}. Be concise but decision-useful. Do not invent evidence. Use exactly these headings: Executive summary; Key points; Consensus; Material disagreements; Risks; Decision-ready options; Recommended next step. Clearly distinguish consensus from unresolved issues. Human CEO remains final authority.`}]},
        {role:"user",content:[{type:"input_text",text:`Meeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nDecision question: ${session.decision_question}\nAgenda: ${Array.isArray(meeting.agenda)?meeting.agenda.map(String).join(" | "):""}\n\nTranscript:\n${transcript}`}]}],
    },{signal:AbortSignal.timeout(config.agentTimeoutMs)}) as unknown as ResponseLike;
    const summary=extractText(response).slice(0,10000);
    if(!summary) return fail("The summary model returned no displayable text. Retry is safe.",502);
    return NextResponse.json({ok:true,summary,language:session.language,status:session.status});
  }catch(error){
    const message=error instanceof Error?error.message:"Meeting summary failed.";
    return fail(`Meeting summary failed: ${message}`,502);
  }
}
