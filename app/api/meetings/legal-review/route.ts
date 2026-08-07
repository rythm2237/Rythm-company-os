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
  if(config.externalActionsEnabled) return fail("Legal review refuses to run while external actions are enabled.",503);
  if(!config.openAIConfigured||!config.dryRunModel) return fail("OpenAI runtime is not configured.",503);
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return fail("Authentication required.",401);
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) return fail("Owner authorization required.",403);
  let sessionId="";try{sessionId=String(((await request.json()) as {sessionId?:string}).sessionId??"").trim();}catch{return fail("sessionId is required.",400);}if(!sessionId)return fail("sessionId is required.",400);
  const organizationId=membership.organization_id as string;
  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,status,decision_question,synthesis,recommendation,decision_options,language,legal_triage_status,legal_triage_reason,legal_review_status,legal_review_report").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session)return fail("Meeting session not found.",404);
  if(session.status!=="completed")return fail("Legal review runs after agent deliberation is complete.",409);
  if(!["recommended","required"].includes(session.legal_triage_status))return fail("B-001 did not identify a legal-review need for this meeting.",409);
  if(["clear","clear_with_conditions","licensed_counsel_required"].includes(session.legal_review_status))return NextResponse.json({ok:true,status:session.legal_review_status,report:session.legal_review_report??"",cached:true});
  const {data:legalAgent}=await supabase.from("agents").select("id,agent_code,display_name,name,role_title,purpose,work_style").eq("organization_id",organizationId).eq("agent_code","A-106").maybeSingle();
  if(!legalAgent)return fail("A-106 Legal & Regulatory Counsel is not registered. Run the legal-review migration first.",409);
  const {data:meeting}=await supabase.from("meetings").select("id,title,purpose,agenda").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();if(!meeting)return fail("Linked meeting not found.",404);
  const {data:rows}=await supabase.from("meeting_agent_messages").select("turn_index,message_type,content").eq("session_id",sessionId).eq("organization_id",organizationId).neq("message_type","system").order("turn_index");
  const transcript=(rows??[]).map(row=>`${row.message_type}: ${row.content}`).join("\n\n").slice(-22000);
  await supabase.from("meeting_agent_sessions").update({legal_review_status:"pending",updated_at:new Date().toISOString()}).eq("id",sessionId).eq("organization_id",organizationId);
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  try{
    const response=await client.responses.create({model:config.dryRunModel,max_output_tokens:1400,input:[
      {role:"system",content:[{type:"input_text",text:`You are A-106, RYTHM Legal & Regulatory Counsel. This is an advisory AI legal-risk review, not formal legal advice and not a substitute for licensed jurisdiction-specific counsel. Review only the supplied meeting record. Identify material legal/regulatory concerns, uncertainty, conditions, and when licensed counsel is needed. Do not invent laws or claim certainty about jurisdictions not specified. Return STRICT JSON only with keys: status (clear|clear_with_conditions|licensed_counsel_required), summary (string, 2-4 sentences), risks (array of concise strings), conditions (array of concise strings), jurisdiction_notes (array of concise strings), licensed_counsel_reason (string). Respond in ${session.language}.`}]},
      {role:"user",content:[{type:"input_text",text:`Meeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nDecision question: ${session.decision_question}\nB-001 legal triage: ${session.legal_triage_status} — ${session.legal_triage_reason??""}\nSynthesis: ${session.synthesis??""}\nRecommendation: ${session.recommendation??""}\nDecision options: ${JSON.stringify(session.decision_options??[])}\n\nTranscript:\n${transcript}`}]}
    ]},{signal:AbortSignal.timeout(config.agentTimeoutMs)}) as unknown as ResponseLike;
    const raw=textOf(response);if(!raw)throw new Error("A-106 returned no displayable output.");
    let parsed:{status?:string;summary?:string;risks?:string[];conditions?:string[];jurisdiction_notes?:string[];licensed_counsel_reason?:string};try{parsed=JSON.parse(cleanJson(raw));}catch{throw new Error("A-106 returned invalid structured output.");}
    const status=["clear","clear_with_conditions","licensed_counsel_required"].includes(String(parsed.status))?String(parsed.status):"licensed_counsel_required";
    const report=[
      `AI LEGAL REVIEW — ${status.replaceAll("_"," ").toUpperCase()}`,
      `Summary\n${String(parsed.summary??"")}`,
      `Risks\n${(parsed.risks??[]).map(item=>`• ${item}`).join("\n")||"• No material legal risk identified from the supplied record."}`,
      `Conditions\n${(parsed.conditions??[]).map(item=>`• ${item}`).join("\n")||"• None stated."}`,
      `Jurisdiction notes\n${(parsed.jurisdiction_notes??[]).map(item=>`• ${item}`).join("\n")||"• No jurisdiction-specific conclusion can be made without jurisdiction facts."}`,
      status==="licensed_counsel_required"?`Licensed counsel\n${String(parsed.licensed_counsel_reason??"Jurisdiction-specific licensed legal review is required before execution.")}`:"Advisory note\nThis AI review is not formal legal advice."
    ].join("\n\n").slice(0,9000);
    await supabase.from("meeting_agent_sessions").update({legal_review_status:status,legal_review_report:report,legal_reviewed_at:new Date().toISOString(),legal_review_agent_id:legalAgent.id,updated_at:new Date().toISOString()}).eq("id",sessionId).eq("organization_id",organizationId);
    await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"agent",event_type:"meeting.legal_review_completed",object_type:"meeting",object_id:meeting.id,risk_level:status==="licensed_counsel_required"?"high":status==="clear_with_conditions"?"medium":"low",payload:{session_id:sessionId,agent_code:"A-106",legal_review_status:status,external_actions:false,advisory:true,formal_legal_advice:false}});
    return NextResponse.json({ok:true,status,report,cached:false});
  }catch(error){await supabase.from("meeting_agent_sessions").update({legal_review_status:"failed",updated_at:new Date().toISOString()}).eq("id",sessionId).eq("organization_id",organizationId);return fail(`A-106 legal review failed: ${error instanceof Error?error.message:"Unknown error"}`,502);}
}
