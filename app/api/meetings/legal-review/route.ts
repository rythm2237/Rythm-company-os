import OpenAI from "openai";
import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { redactSecretText } from "@/lib/security/redaction";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CALIBRATION_VERSION=3;
const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status});
const estimateCost=(inputTokens:number,outputTokens:number,inputRate:number,outputRate:number)=>(inputTokens/1_000_000)*inputRate+(outputTokens/1_000_000)*outputRate;

type LegalPayload={
  outcome:string;
  legal_applicability:string;
  executive_note:string;
  risk_summary:string;
  conditions:string[];
  jurisdictions:string[];
  licensed_counsel_required:boolean;
};
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

function firstSentences(value:string,max=4){
  const compact=value.replace(/\s+/g," ").trim();
  if(!compact) return "A-106 completed advisory legal issue-spotting, but returned no concise executive note.";
  return compact.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,max).join(" ").slice(0,1600);
}

function extractSection(value:string,startNames:string[],endNames:string[]){
  const lines=value.split(/\r?\n/);
  let active=false;
  const picked:string[]=[];
  for(const line of lines){
    const normalized=line.trim().replace(/^#+\s*/,"").replace(/\*\*/g,"").trim();
    const lower=normalized.toLowerCase();
    if(!active&&startNames.some(name=>lower===name||lower.startsWith(`${name}:`))){active=true;continue;}
    if(active&&endNames.some(name=>lower===name||lower.startsWith(`${name}:`))) break;
    if(active&&normalized) picked.push(normalized);
  }
  return picked.join("\n").trim();
}

function extractLooseJsonString(value:string,key:string){
  const marker=`"${key}"`;
  const markerIndex=value.indexOf(marker);
  if(markerIndex<0) return "";
  const colon=value.indexOf(":",markerIndex+marker.length);
  if(colon<0) return "";
  const quote=value.indexOf('"',colon+1);
  if(quote<0) return "";
  let escaped=false;
  let raw="";
  for(let i=quote+1;i<value.length;i+=1){
    const ch=value[i];
    if(escaped){raw+=`\\${ch}`;escaped=false;continue;}
    if(ch==="\\"){escaped=true;continue;}
    if(ch==='"'){
      try{return JSON.parse(`"${raw}"`) as string;}catch{return raw.replace(/\\n/g,"\n").replace(/\\"/g,'"').replace(/\\\\/g,"\\");}
    }
    raw+=ch;
  }
  return raw.replace(/\\n/g,"\n").replace(/\\"/g,'"').replace(/\\\\/g,"\\").trim();
}

function extractLooseJsonArray(value:string,key:string){
  const marker=`"${key}"`;
  const markerIndex=value.indexOf(marker);
  if(markerIndex<0) return [] as string[];
  const colon=value.indexOf(":",markerIndex+marker.length);
  const open=value.indexOf("[",colon+1);
  if(colon<0||open<0) return [] as string[];
  const close=value.indexOf("]",open+1);
  const chunk=close>=0?value.slice(open,close+1):value.slice(open);
  if(close>=0){try{const parsed=JSON.parse(chunk);return Array.isArray(parsed)?parsed.map(String):[];}catch{}}
  return [...chunk.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(match=>{
    try{return JSON.parse(`"${match[1]}"`) as string;}catch{return match[1];}
  }).slice(0,12);
}

function normalizeLegalPayload(value:string):LegalPayload{
  const cleaned=value.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```$/i,"").trim();
  try{return JSON.parse(cleaned) as LegalPayload;}catch{}
  const start=cleaned.indexOf("{");
  const end=cleaned.lastIndexOf("}");
  if(start>=0&&end>start){try{return JSON.parse(cleaned.slice(start,end+1)) as LegalPayload;}catch{}}

  const upper=cleaned.toUpperCase();
  const explicitOutcome=extractLooseJsonString(cleaned,"outcome").toUpperCase();
  const explicitApplicability=extractLooseJsonString(cleaned,"legal_applicability").toUpperCase();
  const explicitExecutiveNote=extractLooseJsonString(cleaned,"executive_note");
  const explicitRiskSummary=extractLooseJsonString(cleaned,"risk_summary");
  const explicitConditions=extractLooseJsonArray(cleaned,"conditions");
  const explicitJurisdictions=extractLooseJsonArray(cleaned,"jurisdictions");
  const explicitlyLicensed=explicitOutcome==="LICENSED_COUNSEL_REQUIRED"||explicitApplicability==="LICENSED_COUNSEL_REQUIRED"||/"licensed_counsel_required"\s*:\s*true/i.test(cleaned)||/LICENSED\s+COUNSEL\s+(?:IS\s+)?REQUIRED/i.test(cleaned)||/MUST\s+NOT\s+(?:PROCEED|EXECUTE)[\s\S]{0,120}LICENSED\s+COUNSEL/i.test(cleaned)||/DO\s+NOT\s+(?:PROCEED|EXECUTE)[\s\S]{0,120}(?:QUALIFIED|LICENSED)\s+(?:LEGAL\s+)?COUNSEL/i.test(cleaned);

  let outcome=["CLEAR","CLEAR_WITH_CONDITIONS","RISK_IDENTIFIED","LICENSED_COUNSEL_REQUIRED"].includes(explicitOutcome)?explicitOutcome:"CLEAR_WITH_CONDITIONS";
  if(explicitlyLicensed) outcome="LICENSED_COUNSEL_REQUIRED";
  else if(!explicitOutcome&&(/RISK[_\s-]?IDENTIFIED/.test(upper)||/MATERIAL\s+LEGAL\s+RISK/i.test(cleaned))) outcome="RISK_IDENTIFIED";

  let legalApplicability=["STRATEGIC_CONDITIONS_ONLY","EXECUTION_REVIEW_REQUIRED","LICENSED_COUNSEL_REQUIRED"].includes(explicitApplicability)?explicitApplicability:"STRATEGIC_CONDITIONS_ONLY";
  if(explicitlyLicensed) legalApplicability="LICENSED_COUNSEL_REQUIRED";
  else if(!explicitApplicability&&(/EXECUTION[_\s-]?REVIEW[_\s-]?REQUIRED/.test(upper)||/BEFORE\s+EXECUTION/i.test(cleaned)||/EXECUTION[-\s]LEVEL\s+(?:LEGAL\s+)?REVIEW/i.test(cleaned)||/FUTURE\s+(?:EXPERIMENT|IMPLEMENTATION|EXECUTION)/i.test(cleaned))) legalApplicability="EXECUTION_REVIEW_REQUIRED";

  const conditionsSection=extractSection(cleaned,["conditions","conditions / guardrails","guardrails"],["jurisdictions","jurisdiction context","licensed counsel","disclaimer"]);
  const conditionLines=explicitConditions.length?explicitConditions:(conditionsSection||"").split(/\r?\n/).map(line=>line.trim()).filter(line=>/^[-*•]\s+/.test(line)||/^\d+[.)]\s+/.test(line)).map(line=>line.replace(/^[-*•]\s+/,"").replace(/^\d+[.)]\s+/,"").trim()).filter(Boolean).slice(0,12);
  const riskSection=extractSection(cleaned,["risk summary","risks","legal risk summary"],["conditions","jurisdictions","jurisdiction context","recommendation"]);
  const jurisdictionSection=extractSection(cleaned,["jurisdictions","jurisdiction context"],["conditions","licensed counsel","disclaimer"]);
  const jurisdictions=explicitJurisdictions.length?explicitJurisdictions:jurisdictionSection?jurisdictionSection.split(/[,;\n]/).map(v=>v.trim()).filter(Boolean).slice(0,12):["Not specified"];

  return {
    outcome,
    legal_applicability:legalApplicability,
    executive_note:(explicitExecutiveNote||firstSentences(cleaned.replace(/^\s*\{/,""),4)).slice(0,2200),
    risk_summary:(explicitRiskSummary||riskSection||"Legal and regulatory risks attach primarily to future execution steps rather than approval of the strategic direction itself.").slice(0,2200),
    conditions:conditionLines,
    jurisdictions,
    licensed_counsel_required:explicitlyLicensed,
  };
}

const legalSchema={
  type:"object",
  additionalProperties:false,
  properties:{
    outcome:{type:"string",enum:["CLEAR","CLEAR_WITH_CONDITIONS","RISK_IDENTIFIED","LICENSED_COUNSEL_REQUIRED"]},
    legal_applicability:{type:"string",enum:["STRATEGIC_CONDITIONS_ONLY","EXECUTION_REVIEW_REQUIRED","LICENSED_COUNSEL_REQUIRED"]},
    executive_note:{type:"string"},
    risk_summary:{type:"string"},
    conditions:{type:"array",items:{type:"string"}},
    jurisdictions:{type:"array",items:{type:"string"}},
    licensed_counsel_required:{type:"boolean"},
  },
  required:["outcome","legal_applicability","executive_note","risk_summary","conditions","jurisdictions","licensed_counsel_required"],
} as const;

async function authContext(){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok) return {error:fail(auth.error,auth.status)} as const;
  return {supabase:auth.supabase,user:auth.user,organizationId:auth.organizationId} as const;
}

export async function GET(request:Request){
  const auth=await authContext();
  if("error" in auth) return auth.error;
  const sessionId=new URL(request.url).searchParams.get("sessionId")?.trim()??"";
  if(!sessionId) return fail("sessionId is required.",400);
  const {data:review,error}=await auth.supabase.from("meeting_legal_reviews").select("id,status,outcome,legal_applicability,calibration_version,executive_note,risk_summary,conditions,jurisdictions,licensed_counsel_required,estimated_cost_usd,error_message,requested_at,completed_at").eq("session_id",sessionId).eq("organization_id",auth.organizationId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(error) return fail(error.message,500);
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

  const {data:existing}=await supabase.from("meeting_legal_reviews").select("id,status,outcome,legal_applicability,calibration_version,executive_note,risk_summary,conditions,jurisdictions,licensed_counsel_required,estimated_cost_usd,error_message,requested_at,completed_at").eq("session_id",sessionId).eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(existing?.status==="completed"&&Number(existing.calibration_version??1)>=CALIBRATION_VERSION) return NextResponse.json({ok:true,review:existing,cached:true});
  if(existing?.status==="running") return fail("A-106 legal review is already running.",409);

  const now=new Date().toISOString();
  const {data:newReview,error:newReviewError}=await supabase.from("meeting_legal_reviews").insert({organization_id:organizationId,meeting_id:meeting.id,session_id:sessionId,legal_agent_id:legalAgent.id,requested_by_user_id:user.id,status:"running",requested_at:now,calibration_version:CALIBRATION_VERSION}).select("id").single();
  if(newReviewError||!newReview) return fail(newReviewError?.message??"Legal review record could not be created.",500);
  const reviewId=newReview.id;

  const {data:messages}=await supabase.from("meeting_agent_messages").select("round_no,message_type,content,agents(agent_code,display_name,name)").eq("session_id",sessionId).eq("organization_id",organizationId).neq("message_type","system").order("turn_index");
  const transcript=(messages??[]).map((row:any)=>{const a=Array.isArray(row.agents)?row.agents[0]:row.agents;return `${a?.agent_code??"Human CEO/System"} (${row.message_type}, round ${row.round_no}): ${row.content}`;}).join("\n\n").slice(-30000);

  const systemPrompt=`You are A-106, RYTHM Legal & Regulatory Counsel. You provide advisory AI legal issue-spotting, not licensed legal advice. Calibration rule: first distinguish a strategic/policy direction from a concrete execution authorization. Do NOT require licensed counsel merely because future implementation could touch regulated areas. A strategic decision may normally be CLEAR_WITH_CONDITIONS when the legal issues attach to future experiments or execution steps rather than to adopting the strategy itself. Use LICENSED_COUNSEL_REQUIRED only when the decision package itself authorizes or commits to a concrete legally sensitive action, transaction, customer-facing change, regulated data processing, contract, cross-border transfer, pricing/payment change, material external claim, or other jurisdiction-specific act that should not execute without qualified counsel. If execution-level review is needed later but the strategic direction can be approved now, use legal_applicability EXECUTION_REVIEW_REQUIRED and normally CLEAR_WITH_CONDITIONS. If conditions are only future guardrails, use STRATEGIC_CONDITIONS_ONLY. Cover only relevant issues such as AI regulation, privacy/data protection, consumer protection, online commerce/platform duties, contracts, payments/tax implications, intellectual property, employment, advertising claims, licensing, and cross-border operations. Never state that a matter is legally approved. Keep executive_note concise (maximum 4 sentences), risk_summary concise (maximum 3 sentences), and conditions to no more than 8 short items. Respond in ${session.language}.`;
  const userPrompt=`Meeting: ${meeting.title}\nPurpose: ${meeting.purpose}\nDecision question: ${session.decision_question}\nAgenda: ${Array.isArray(meeting.agenda)?meeting.agenda.map(String).join(" | "):""}\nB-001 legal triage: ${session.legal_triage_status} — ${session.legal_triage_reason??""}\nSynthesis: ${session.synthesis??""}\nRecommendation: ${session.recommendation??""}\nDecision options: ${JSON.stringify(session.decision_options??[])}\n\nTranscript:\n${transcript}`;

  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  try{
    let response:ResponseLike;
    try{
      response=await client.responses.create({model:config.dryRunModel,max_output_tokens:3000,text:{format:{type:"json_schema",name:"rythm_legal_review",description:"Calibrated advisory legal review for a governed RYTHM meeting.",strict:true,schema:legalSchema}},input:[{role:"system",content:[{type:"input_text",text:systemPrompt}]},{role:"user",content:[{type:"input_text",text:userPrompt}]}]},{signal:AbortSignal.timeout(config.agentTimeoutMs)}) as unknown as ResponseLike;
    }catch(structuredError){
      const structuredMessage=structuredError instanceof Error?structuredError.message:String(structuredError);
      const unsupported=/json_schema|text\.format|unsupported|not supported|unknown parameter/i.test(structuredMessage);
      if(!unsupported) throw structuredError;
      response=await client.responses.create({model:config.dryRunModel,max_output_tokens:3000,input:[{role:"system",content:[{type:"input_text",text:`${systemPrompt} Return one valid JSON object only with exactly these keys: outcome, legal_applicability, executive_note, risk_summary, conditions, jurisdictions, licensed_counsel_required. No markdown fences or commentary.`}]},{role:"user",content:[{type:"input_text",text:userPrompt}]}]},{signal:AbortSignal.timeout(config.agentTimeoutMs)}) as unknown as ResponseLike;
    }

    const raw=extractText(response);
    if(!raw) throw new Error("A-106 returned no displayable text.");
    const parsed=normalizeLegalPayload(raw);
    const allowedOutcomes=new Set(["CLEAR","CLEAR_WITH_CONDITIONS","RISK_IDENTIFIED","LICENSED_COUNSEL_REQUIRED"]);
    const allowedApplicability=new Set(["STRATEGIC_CONDITIONS_ONLY","EXECUTION_REVIEW_REQUIRED","LICENSED_COUNSEL_REQUIRED"]);
    const outcome=allowedOutcomes.has(String(parsed.outcome))?String(parsed.outcome):"CLEAR_WITH_CONDITIONS";
    const legalApplicability=allowedApplicability.has(String(parsed.legal_applicability))?String(parsed.legal_applicability):"EXECUTION_REVIEW_REQUIRED";
    const conditions=Array.isArray(parsed.conditions)?parsed.conditions.map(String).slice(0,12):[];
    const jurisdictions=Array.isArray(parsed.jurisdictions)?parsed.jurisdictions.map(String).slice(0,12):["Not specified"];
    const licensed=legalApplicability==="LICENSED_COUNSEL_REQUIRED"||outcome==="LICENSED_COUNSEL_REQUIRED"||Boolean(parsed.licensed_counsel_required);
    const normalizedOutcome=licensed?"LICENSED_COUNSEL_REQUIRED":outcome;
    const normalizedApplicability=licensed?"LICENSED_COUNSEL_REQUIRED":legalApplicability;
    const inputTokens=Number(response.usage?.input_tokens??0);
    const outputTokens=Number(response.usage?.output_tokens??0);
    const cost=estimateCost(inputTokens,outputTokens,config.inputCostPerMillionUsd,config.outputCostPerMillionUsd);
    const newCost=Number(session.estimated_cost_usd??0)+cost;
    if(newCost>Number(session.budget_cap_usd)) throw new Error("AI legal review would exceed the configured meeting AI budget cap.");
    const completedAt=new Date().toISOString();
    const {data:review,error:updateError}=await supabase.from("meeting_legal_reviews").update({status:"completed",outcome:normalizedOutcome,legal_applicability:normalizedApplicability,calibration_version:CALIBRATION_VERSION,executive_note:String(parsed.executive_note??"").slice(0,4000),risk_summary:String(parsed.risk_summary??"").slice(0,4000),conditions,jurisdictions,licensed_counsel_required:licensed,model:config.dryRunModel,input_tokens:inputTokens,output_tokens:outputTokens,estimated_cost_usd:cost,error_message:null,completed_at:completedAt,updated_at:completedAt}).eq("id",reviewId).eq("organization_id",organizationId).select("id,status,outcome,legal_applicability,calibration_version,executive_note,risk_summary,conditions,jurisdictions,licensed_counsel_required,estimated_cost_usd,requested_at,completed_at").single();
    if(updateError||!review) return fail(updateError?.message??"Legal review could not be saved.",500);
    await supabase.from("meeting_agent_sessions").update({total_input_tokens:Number(session.total_input_tokens??0)+inputTokens,total_output_tokens:Number(session.total_output_tokens??0)+outputTokens,estimated_cost_usd:newCost,updated_at:completedAt}).eq("id",sessionId).eq("organization_id",organizationId);
    await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"agent",actor_agent_id:legalAgent.id,event_type:"meeting.ai_legal_review_completed",object_type:"meeting",object_id:meeting.id,risk_level:normalizedOutcome==="CLEAR"?"low":normalizedOutcome==="CLEAR_WITH_CONDITIONS"?"medium":"high",payload:{session_id:sessionId,review_id:review.id,agent_code:"A-106",outcome:normalizedOutcome,legal_applicability:normalizedApplicability,calibration_version:CALIBRATION_VERSION,licensed_counsel_required:licensed,conditions,jurisdictions,model:config.dryRunModel,input_tokens:inputTokens,output_tokens:outputTokens,estimated_cost_usd:cost,external_actions:false,advisory_only:true,normalizer:"partial_json_v2"}});
    return NextResponse.json({ok:true,review,sessionEstimatedCostUsd:newCost,recalibrated:Boolean(existing&&Number(existing.calibration_version??1)<CALIBRATION_VERSION)});
  }catch(error){
    const message=redactSecretText(error instanceof Error?error.message:"AI legal review failed.");
    await supabase.from("meeting_legal_reviews").update({status:"failed",error_message:message,updated_at:new Date().toISOString()}).eq("id",reviewId).eq("organization_id",organizationId);
    return fail(`A-106 legal review failed: ${message}`,502);
  }
}
