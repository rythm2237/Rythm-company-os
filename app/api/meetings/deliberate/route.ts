import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const jsonError = (message: string, status: number) => NextResponse.json({ ok: false, error: message }, { status });
const estimateCost = (inputTokens: number, outputTokens: number, inputRate: number, outputRate: number) =>
  (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
const asList = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
const cleanJson = (value: string) => value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

type AgentRow = { id:string; agent_code:string; display_name:string|null; name:string; role_title:string; purpose:string|null; work_style:string|null; enabled:boolean };
type ParticipantRow = { agent_id:string; seat_order:number; session_role:string; agents:AgentRow|AgentRow[]|null };
type MessageRow = { turn_index:number; round_no:number; message_type:string; content:string; agent_id:string|null };
type SynthesisPayload = { executive_summary?:string; consensus?:string; disagreements?:string[]; options?:string[]; recommendation?:string; next_step?:string };

type ResponseLike = {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  status?: string;
  incomplete_details?: { reason?: string } | null;
};

function participantAgent(row:ParticipantRow):AgentRow|null {
  return Array.isArray(row.agents) ? row.agents[0] ?? null : row.agents ?? null;
}

function extractResponseText(response:ResponseLike):string {
  const direct = String(response.output_text ?? "").trim();
  if (direct) return direct;
  const fragments:string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if ((part.type === "output_text" || part.type === "text") && part.text) fragments.push(part.text);
    }
  }
  return fragments.join("\n").trim();
}

export async function POST(request:Request) {
  const config = getRuntimeConfig();
  if (!config.agentExecutionEnabled) return jsonError("Agent execution is disabled by environment policy.", 503);
  if (config.externalActionsEnabled) return jsonError("Meeting runtime refuses to operate while external actions are enabled.", 503);
  if (!config.openAIConfigured || !config.dryRunModel) return jsonError("OpenAI and RYTHM_DRY_RUN_MODEL must be configured.", 503);

  const supabase = await createAuthServerClient();
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Authentication required.", 401);
  const { data:membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).eq("role", "owner").maybeSingle();
  if (!membership) return jsonError("Owner authorization required.", 403);

  let sessionId = "";
  try { sessionId = String(((await request.json()) as {sessionId?:string}).sessionId ?? "").trim(); }
  catch { return jsonError("A JSON body with sessionId is required.", 400); }
  if (!sessionId) return jsonError("sessionId is required.", 400);

  const organizationId = membership.organization_id as string;
  const { data:session } = await supabase.from("meeting_agent_sessions")
    .select("id,meeting_id,project_id,status,decision_question,language,max_rounds,budget_cap_usd,external_research_allowed,total_input_tokens,total_output_tokens,estimated_cost_usd")
    .eq("id", sessionId).eq("organization_id", organizationId).maybeSingle();
  if (!session) return jsonError("Meeting agent session not found.", 404);
  if (!["ready","running"].includes(session.status)) return jsonError(session.status === "completed" ? "Agent synthesis is complete. The Human CEO may contribute or close the meeting." : "This deliberation cannot run in its current state.", 409);
  if (session.external_research_allowed) return jsonError("This runtime supports internal analysis only. External research must remain separately approval-gated.", 409);

  const { data:meeting } = await supabase.from("meetings").select("id,title,purpose,status,agenda").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();
  if (!meeting) return jsonError("Linked meeting not found.", 404);
  if (meeting.status !== "running") return jsonError("The meeting is not open for agent deliberation.", 409);

  const { data:participantData } = await supabase.from("meeting_agent_participants")
    .select("agent_id,seat_order,session_role,agents(id,agent_code,display_name,name,role_title,purpose,work_style,enabled)")
    .eq("session_id",sessionId).eq("organization_id",organizationId).eq("explicitly_authorized_by_ceo",true).order("seat_order");
  const participants = (participantData ?? []) as unknown as ParticipantRow[];
  if (participants.length < 2) return jsonError("At least two CEO-authorized agents are required.", 409);

  const participantAgents = participants.map(participantAgent);
  if (participantAgents.some(agent => !agent)) return jsonError("A participant agent record is unavailable. Refresh the meeting before continuing.", 409);
  const pausedAgents = participantAgents.filter((agent):agent is AgentRow => Boolean(agent && !agent.enabled));
  if (pausedAgents.length) return jsonError(`Agent execution is paused for ${pausedAgents.map(agent=>agent.agent_code).join(", ")}. The Human CEO must enable the agent before the meeting can continue.`, 409);
  if (!participantAgents.some(agent => agent?.agent_code === "B-001" && agent.enabled)) return jsonError("Enabled B-001 Executive Orchestrator is required for governed meeting synthesis.", 409);

  const { data:messageData } = await supabase.from("meeting_agent_messages")
    .select("turn_index,round_no,message_type,content,agent_id").eq("session_id",sessionId).eq("organization_id",organizationId).order("turn_index");
  const messages = (messageData ?? []) as MessageRow[];
  const deliberationMessages = messages.filter(m => m.message_type === "position" || m.message_type === "challenge");
  const totalAgentTurns = participants.length * Number(session.max_rounds);
  const nextTurnIndex = (messages.at(-1)?.turn_index ?? 0) + 1;

  if (session.status === "ready") {
    const startedAt = new Date().toISOString();
    const { data:claimed, error:claimError } = await supabase.from("meeting_agent_sessions")
      .update({ status:"running", started_by_user_id:user.id, started_at:startedAt, model:config.dryRunModel, error_message:null, updated_at:startedAt })
      .eq("id",sessionId).eq("organization_id",organizationId).eq("status","ready").select("id").maybeSingle();
    if (claimError) {
      console.error("meeting_session_claim_failed", { sessionId, claimError });
      return jsonError("The meeting session could not start. Confirm that every selected agent is enabled and retry.", 409);
    }
    if (!claimed) return jsonError("The meeting session could not be claimed for execution.", 409);
    await supabase.from("audit_events").insert({ organization_id:organizationId, actor_type:"user", actor_user_id:user.id, event_type:"meeting.agent_deliberation_started", object_type:"meeting", object_id:meeting.id, risk_level:"medium", payload:{ session_id:sessionId, participants:participants.length, rounds:session.max_rounds, model:config.dryRunModel, external_actions:false, external_research:false } });
  }

  const client = new OpenAI({ apiKey:process.env.OPENAI_API_KEY });
  const transcript = messages.filter(m => m.message_type !== "system").map(m => {
    const participant = participants.find(p => p.agent_id === m.agent_id);
    const agent = participant ? participantAgent(participant) : null;
    return `${agent?.agent_code ?? (m.message_type==="ceo_contribution"?"HUMAN CEO":"SYSTEM")} (${m.message_type}, round ${m.round_no}): ${m.content}`;
  }).join("\n\n").slice(-18000);

  const sharedContext = [
    `Meeting: ${meeting.title}`,
    `Purpose: ${meeting.purpose}`,
    `Agenda: ${asList(meeting.agenda).join(" | ")}`,
    `Decision question: ${session.decision_question}`,
    `Language: ${session.language}`,
    "Governance: Human CEO has final authority. The meeting remains open until the Human CEO/Chair explicitly closes it. Internal analysis only. No tools, browsing, external messages, transactions, deployments, or record changes are authorized by this deliberation."
  ].join("\n");

  try {
    const lastMessage=messages.at(-1);
    const synthesizerParticipant = participants.find(p => participantAgent(p)?.agent_code === "B-001") ?? participants.find(p => p.session_role === "synthesizer") ?? participants[0];
    const synthesizerAgent = participantAgent(synthesizerParticipant);

    if(lastMessage?.message_type==="ceo_contribution" && deliberationMessages.length>=totalAgentTurns){
      if(!synthesizerAgent || !synthesizerAgent.enabled) return jsonError("Enabled B-001 Executive Orchestrator is required for CEO follow-up.",409);
      const response=await client.responses.create({
        model:config.dryRunModel,
        max_output_tokens:1200,
        input:[
          {role:"system",content:[{type:"input_text",text:`You are ${synthesizerAgent.agent_code}, ${synthesizerAgent.display_name??synthesizerAgent.name}, responding inside an open Human CEO-chaired meeting. Address the Human CEO's latest contribution directly, correct misunderstandings where needed, and identify whether the prior recommendation should change. Do not close the meeting. Do not claim external research. Respond in ${session.language}. Use short headings: Response to Chair; Clarification; Updated Recommendation.`}]},
          {role:"user",content:[{type:"input_text",text:`${sharedContext}\n\nTranscript including the latest Human CEO contribution:\n${transcript}`}]}]
      },{signal:AbortSignal.timeout(config.agentTimeoutMs)}) as unknown as ResponseLike;
      const responseText=extractResponseText(response).slice(0,6000);
      const inputTokens=Number(response.usage?.input_tokens??0);
      const outputTokens=Number(response.usage?.output_tokens??0);
      const cost=estimateCost(inputTokens,outputTokens,config.inputCostPerMillionUsd,config.outputCostPerMillionUsd);
      const accumulatedCost=Number(session.estimated_cost_usd??0)+cost;
      if(accumulatedCost>Number(session.budget_cap_usd)) return jsonError("CEO follow-up would exceed the configured meeting budget cap.",409);
      if(!responseText) return jsonError("The chair follow-up produced no displayable text. Retry is safe.",502);
      const roundNo=Math.max(Number(session.max_rounds)+1,Number(lastMessage.round_no)+1);
      const {error:insertError}=await supabase.from("meeting_agent_messages").insert({organization_id:organizationId,meeting_id:meeting.id,session_id:sessionId,agent_id:synthesizerAgent.id,turn_index:nextTurnIndex,round_no:roundNo,speaker_type:"agent",message_type:"challenge",content:responseText,model:config.dryRunModel,input_tokens:inputTokens,output_tokens:outputTokens,estimated_cost_usd:cost});
      if(insertError) {
        console.error("meeting_chair_followup_persist_failed", { sessionId, insertError });
        return jsonError("The chair follow-up could not be persisted. Retry is safe; no valid turn was accepted.",500);
      }
      await supabase.from("meeting_agent_sessions").update({total_input_tokens:Number(session.total_input_tokens??0)+inputTokens,total_output_tokens:Number(session.total_output_tokens??0)+outputTokens,estimated_cost_usd:accumulatedCost,error_message:null,updated_at:new Date().toISOString()}).eq("id",sessionId).eq("organization_id",organizationId);
      return NextResponse.json({ok:true,sessionId,status:"running",phase:"chair_follow_up",roundNo,turnIndex:nextTurnIndex,speaker:{id:synthesizerAgent.id,code:synthesizerAgent.agent_code,name:synthesizerAgent.display_name??synthesizerAgent.name,role:synthesizerAgent.role_title},content:responseText,remainingTurns:0});
    }

    if (deliberationMessages.length < totalAgentTurns) {
      const participantIndex = deliberationMessages.length % participants.length;
      const roundNo = Math.floor(deliberationMessages.length / participants.length) + 1;
      const participant = participants[participantIndex];
      const responseAgent = participantAgent(participant);
      if (!responseAgent) return jsonError("A participant agent record is missing.", 409);
      if (!responseAgent.enabled) return jsonError(`Agent ${responseAgent.agent_code} is paused. The meeting cannot continue until the Human CEO enables the agent.`,409);
      const messageType:"position"|"challenge" = roundNo === 1 ? "position" : "challenge";
      const roundInstruction = roundNo === 1
        ? "State your independent position. Identify the strongest rationale, major risks, and the option you recommend. You may reference earlier speakers, but do not simply agree."
        : "Challenge the prior discussion. Identify weak assumptions or missing trade-offs, respond to disagreements, and revise your recommendation if warranted.";

      const response = await client.responses.create({
        model:config.dryRunModel,
        max_output_tokens:1400,
        input:[
          { role:"system", content:[{ type:"input_text", text:`You are ${responseAgent.agent_code}, ${responseAgent.display_name ?? responseAgent.name}, the RYTHM ${responseAgent.role_title}. Your mandate: ${responseAgent.purpose ?? "Provide disciplined internal analysis."} Work style: ${responseAgent.work_style ?? "Evidence-led and concise."} Stay inside your assigned professional lens. Do not impersonate the CEO. Do not use tools or claim external research. ${roundInstruction} Respond in ${session.language}. Use short headings: Position, Rationale, Risks/Challenges, Recommendation.` }] },
          { role:"user", content:[{ type:"input_text", text:`${sharedContext}\n\nTranscript so far:\n${transcript || "No prior agent statements."}` }] }
        ]
      }, { signal:AbortSignal.timeout(config.agentTimeoutMs) }) as unknown as ResponseLike;

      const responseText = extractResponseText(response).slice(0,6000);
      const inputTokens = Number(response.usage?.input_tokens ?? 0);
      const outputTokens = Number(response.usage?.output_tokens ?? 0);
      const cost = estimateCost(inputTokens,outputTokens,config.inputCostPerMillionUsd,config.outputCostPerMillionUsd);
      const accumulatedCost = Number(session.estimated_cost_usd ?? 0) + cost;
      if (accumulatedCost > Number(session.budget_cap_usd)) {
        await supabase.from("meeting_agent_sessions").update({ status:"failed", error_message:`Estimated cost $${accumulatedCost.toFixed(6)} exceeded the session budget cap.`, updated_at:new Date().toISOString() }).eq("id",sessionId).eq("organization_id",organizationId);
        return jsonError("The next agent turn exceeded the configured meeting budget cap.",409);
      }
      if (!responseText) {
        const reason = response.incomplete_details?.reason ?? response.status ?? "empty model output";
        await supabase.from("meeting_agent_sessions").update({ error_message:`Agent ${responseAgent.agent_code} returned no displayable text (${reason}). Retry is safe; no turn was recorded.`, updated_at:new Date().toISOString() }).eq("id",sessionId).eq("organization_id",organizationId);
        await supabase.from("audit_events").insert({ organization_id:organizationId, actor_type:"system", event_type:"meeting.agent_empty_output", object_type:"meeting", object_id:meeting.id, risk_level:"low", payload:{ session_id:sessionId, agent_code:responseAgent.agent_code, round_no:roundNo, reason, turn_recorded:false } });
        return jsonError(`Agent ${responseAgent.agent_code} produced no displayable text. The turn was not recorded; retry is safe.`,502);
      }

      const { error:insertError } = await supabase.from("meeting_agent_messages").insert({ organization_id:organizationId, meeting_id:meeting.id, session_id:sessionId, agent_id:responseAgent.id, turn_index:nextTurnIndex, round_no:roundNo, speaker_type:"agent", message_type:messageType, content:responseText, model:config.dryRunModel, input_tokens:inputTokens, output_tokens:outputTokens, estimated_cost_usd:cost });
      if (insertError) {
        console.error("meeting_agent_turn_persist_failed", { sessionId, agentCode:responseAgent.agent_code, insertError });
        return jsonError("The agent turn could not be persisted. Retry is safe; no valid turn was accepted.",500);
      }
      await supabase.from("meeting_agent_sessions").update({ total_input_tokens:Number(session.total_input_tokens ?? 0)+inputTokens, total_output_tokens:Number(session.total_output_tokens ?? 0)+outputTokens, estimated_cost_usd:accumulatedCost, error_message:null, updated_at:new Date().toISOString() }).eq("id",sessionId).eq("organization_id",organizationId);
      return NextResponse.json({ ok:true, sessionId, status:"running", phase:messageType, roundNo, turnIndex:nextTurnIndex, speaker:{ id:responseAgent.id, code:responseAgent.agent_code, name:responseAgent.display_name ?? responseAgent.name, role:responseAgent.role_title }, content:responseText, remainingTurns:totalAgentTurns-deliberationMessages.length-1 });
    }

    const responseAgent = synthesizerAgent;
    if (!responseAgent || !responseAgent.enabled || responseAgent.agent_code !== "B-001") return jsonError("Enabled B-001 Executive Orchestrator is required for governed meeting synthesis.",409);
    const roundNo = Math.max(Number(session.max_rounds)+1,Number(messages.at(-1)?.round_no??0)+1);
    const synthesisResponse = await client.responses.create({
      model:config.dryRunModel,
      max_output_tokens:2200,
      input:[
        { role:"system", content:[{ type:"input_text", text:`You are the RYTHM Executive Orchestrator synthesizing an open, Human CEO-chaired internal multi-agent meeting. Incorporate any Human CEO contributions and follow-up responses. Do not invent evidence. Preserve material disagreements instead of forcing consensus. Human CEO makes the final decision and separately confirms meeting closure. Respond in ${session.language}. Return STRICT JSON only with keys: executive_summary (string), consensus (string), disagreements (array of strings), options (array of 2-4 decision-ready strings), recommendation (string), next_step (string). No markdown fences.` }] },
        { role:"user", content:[{ type:"input_text", text:`${sharedContext}\n\nFull deliberation transcript:\n${transcript}` }] }
      ]
    }, { signal:AbortSignal.timeout(config.agentTimeoutMs) }) as unknown as ResponseLike;

    const raw = extractResponseText(synthesisResponse);
    const inputTokens = Number(synthesisResponse.usage?.input_tokens ?? 0);
    const outputTokens = Number(synthesisResponse.usage?.output_tokens ?? 0);
    const cost = estimateCost(inputTokens,outputTokens,config.inputCostPerMillionUsd,config.outputCostPerMillionUsd);
    const finalCost = Number(session.estimated_cost_usd ?? 0)+cost;
    if (finalCost > Number(session.budget_cap_usd)) {
      await supabase.from("meeting_agent_sessions").update({ status:"failed", error_message:`Estimated cost $${finalCost.toFixed(6)} exceeded the session budget cap during synthesis.`, updated_at:new Date().toISOString() }).eq("id",sessionId).eq("organization_id",organizationId);
      return jsonError("Meeting synthesis exceeded the configured budget cap.",409);
    }
    if (!raw) {
      const reason = synthesisResponse.incomplete_details?.reason ?? synthesisResponse.status ?? "empty model output";
      await supabase.from("meeting_agent_sessions").update({ error_message:`Synthesis returned no displayable text (${reason}). Retry is safe; synthesis was not recorded.`, updated_at:new Date().toISOString() }).eq("id",sessionId).eq("organization_id",organizationId);
      return jsonError("Executive synthesis produced no displayable text. It was not recorded; retry is safe.",502);
    }

    let payload:SynthesisPayload;
    try { payload = JSON.parse(cleanJson(raw)) as SynthesisPayload; }
    catch { payload = { executive_summary:raw.slice(0,4000), consensus:"Structured JSON synthesis could not be parsed; review the synthesis text directly.", disagreements:[], options:["Review transcript and defer decision","Adopt the strongest supported recommendation with CEO conditions"], recommendation:"Human CEO review required.", next_step:"Review the transcript and record a governed decision." }; }
    const options = Array.isArray(payload.options) ? payload.options.map(String).slice(0,4) : [];
    const responseText = [
      `Executive summary\n${payload.executive_summary ?? ""}`,
      `Consensus\n${payload.consensus ?? ""}`,
      `Material disagreements\n${(payload.disagreements ?? []).map(item=>`• ${item}`).join("\n") || "None recorded."}`,
      `Recommendation\n${payload.recommendation ?? "Human CEO review required."}`,
      `Next governed step\n${payload.next_step ?? "Human CEO review, then explicit chair closure."}`
    ].join("\n\n").slice(0,8000);

    const { error:synthesisInsertError } = await supabase.from("meeting_agent_messages").insert({ organization_id:organizationId, meeting_id:meeting.id, session_id:sessionId, agent_id:responseAgent.id, turn_index:nextTurnIndex, round_no:roundNo, speaker_type:"agent", message_type:"synthesis", content:responseText, model:config.dryRunModel, input_tokens:inputTokens, output_tokens:outputTokens, estimated_cost_usd:cost });
    if (synthesisInsertError) {
      console.error("meeting_synthesis_persist_failed", { sessionId, synthesisInsertError });
      return jsonError("Executive synthesis could not be persisted. Retry is safe; no synthesis was accepted.",500);
    }
    const completedAt = new Date().toISOString();
    await supabase.from("meeting_agent_sessions").update({ status:"completed", synthesis:responseText, recommendation:String(payload.recommendation ?? "Human CEO review required."), decision_options:options, total_input_tokens:Number(session.total_input_tokens ?? 0)+inputTokens, total_output_tokens:Number(session.total_output_tokens ?? 0)+outputTokens, estimated_cost_usd:finalCost, completed_at:completedAt, updated_at:completedAt, error_message:null }).eq("id",sessionId).eq("organization_id",organizationId);
    await supabase.from("audit_events").insert({ organization_id:organizationId, actor_type:"system", event_type:"meeting.agent_deliberation_completed", object_type:"meeting", object_id:meeting.id, risk_level:"medium", payload:{ session_id:sessionId, rounds:session.max_rounds, participants:participants.length, decision_options:options.length, awaiting_chair_close:true, external_actions:false, human_decision_required:true } });
    return NextResponse.json({ ok:true, sessionId, status:"completed", phase:"synthesis", roundNo, turnIndex:nextTurnIndex, speaker:{ id:responseAgent.id, code:responseAgent.agent_code, name:responseAgent.display_name ?? responseAgent.name, role:responseAgent.role_title }, content:responseText, decisionOptions:options, recommendation:payload.recommendation ?? "Human CEO review required.",awaitingChairClose:true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0,1000) : "Unknown meeting runtime error";
    await supabase.from("meeting_agent_sessions").update({ error_message:message, updated_at:new Date().toISOString() }).eq("id",sessionId).eq("organization_id",organizationId);
    await supabase.from("audit_events").insert({ organization_id:organizationId, actor_type:"system", event_type:"meeting.agent_deliberation_retryable_error", object_type:"meeting", object_id:meeting.id, risk_level:"low", payload:{ session_id:sessionId, message, external_actions:false, session_left_resumable:true } });
    console.error("meeting_deliberation_retryable_error", { sessionId, error });
    return jsonError("Agent deliberation hit a retryable runtime error. Retry is safe; the failed turn was not recorded.",500);
  }
}