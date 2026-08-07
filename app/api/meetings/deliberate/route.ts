import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const jsonError = (message: string, status: number) => NextResponse.json({ ok: false, error: message }, { status });
const estimateCost = (inputTokens: number, outputTokens: number, inputRate: number, outputRate: number) =>
  (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;

const asList = (value: unknown) => Array.isArray(value) ? value.map((item) => String(item)) : [];
const cleanJson = (value: string) => value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

type AgentRow = {
  id: string;
  agent_code: string;
  display_name: string | null;
  name: string;
  role_title: string;
  purpose: string | null;
  work_style: string | null;
};

type ParticipantRow = {
  agent_id: string;
  seat_order: number;
  session_role: string;
  agents: AgentRow | AgentRow[] | null;
};

type MessageRow = {
  turn_index: number;
  round_no: number;
  message_type: string;
  content: string;
  agent_id: string | null;
};

function participantAgent(row: ParticipantRow): AgentRow | null {
  if (Array.isArray(row.agents)) return row.agents[0] ?? null;
  return row.agents ?? null;
}

export async function POST(request: Request) {
  const config = getRuntimeConfig();
  if (!config.agentExecutionEnabled) return jsonError("Agent execution is disabled by environment policy.", 503);
  if (config.externalActionsEnabled) return jsonError("Meeting runtime refuses to operate while external actions are enabled.", 503);
  if (!config.openAIConfigured || !config.dryRunModel) return jsonError("OpenAI and RYTHM_DRY_RUN_MODEL must be configured.", 503);

  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Authentication required.", 401);

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!membership) return jsonError("Owner authorization required.", 403);

  let sessionId = "";
  try {
    const body = await request.json() as { sessionId?: string };
    sessionId = String(body.sessionId ?? "").trim();
  } catch {
    return jsonError("A JSON body with sessionId is required.", 400);
  }
  if (!sessionId) return jsonError("sessionId is required.", 400);

  const organizationId = membership.organization_id as string;
  const { data: session } = await supabase
    .from("meeting_agent_sessions")
    .select("id, meeting_id, project_id, status, decision_question, language, max_rounds, budget_cap_usd, external_research_allowed, total_input_tokens, total_output_tokens, estimated_cost_usd")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!session) return jsonError("Meeting agent session not found.", 404);
  if (!["ready", "running"].includes(session.status)) {
    return jsonError(session.status === "completed" ? "This deliberation is already completed." : "This deliberation cannot run in its current state.", 409);
  }
  if (session.external_research_allowed) return jsonError("This runtime supports internal analysis only. External research must remain separately approval-gated.", 409);

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, title, purpose, status, agenda")
    .eq("id", session.meeting_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!meeting) return jsonError("Linked meeting not found.", 404);
  if (meeting.status !== "running") return jsonError("Start the meeting before running agent deliberation.", 409);

  const { data: participantData } = await supabase
    .from("meeting_agent_participants")
    .select("agent_id, seat_order, session_role, agents(id, agent_code, display_name, name, role_title, purpose, work_style)")
    .eq("session_id", sessionId)
    .eq("organization_id", organizationId)
    .eq("explicitly_authorized_by_ceo", true)
    .order("seat_order");
  const participants = (participantData ?? []) as unknown as ParticipantRow[];
  if (participants.length < 2) return jsonError("At least two CEO-authorized agents are required.", 409);

  const { data: messageData } = await supabase
    .from("meeting_agent_messages")
    .select("turn_index, round_no, message_type, content, agent_id")
    .eq("session_id", sessionId)
    .eq("organization_id", organizationId)
    .order("turn_index");
  const messages = (messageData ?? []) as MessageRow[];
  const deliberationMessages = messages.filter((message) => message.message_type === "position" || message.message_type === "challenge");
  const totalAgentTurns = participants.length * Number(session.max_rounds);
  const nextTurnIndex = (messages.at(-1)?.turn_index ?? 0) + 1;

  if (session.status === "ready") {
    const startedAt = new Date().toISOString();
    const { data: claimed } = await supabase
      .from("meeting_agent_sessions")
      .update({ status: "running", started_by_user_id: user.id, started_at: startedAt, model: config.dryRunModel, updated_at: startedAt })
      .eq("id", sessionId)
      .eq("organization_id", organizationId)
      .eq("status", "ready")
      .select("id")
      .maybeSingle();
    if (!claimed) return jsonError("The meeting session could not be claimed for execution.", 409);
    await supabase.from("audit_events").insert({
      organization_id: organizationId,
      actor_type: "user",
      actor_user_id: user.id,
      event_type: "meeting.agent_deliberation_started",
      object_type: "meeting",
      object_id: meeting.id,
      risk_level: "medium",
      payload: { session_id: sessionId, participants: participants.length, rounds: session.max_rounds, model: config.dryRunModel, external_actions: false, external_research: false },
    });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const transcript = messages
    .filter((message) => message.message_type !== "system")
    .map((message) => {
      const participant = participants.find((item) => item.agent_id === message.agent_id);
      const agent = participant ? participantAgent(participant) : null;
      return `${agent?.agent_code ?? "SYSTEM"} (${message.message_type}, round ${message.round_no}): ${message.content}`;
    })
    .join("\n\n")
    .slice(-14000);

  const sharedContext = [
    `Meeting: ${meeting.title}`,
    `Purpose: ${meeting.purpose}`,
    `Agenda: ${asList(meeting.agenda).join(" | ")}`,
    `Decision question: ${session.decision_question}`,
    `Language: ${session.language}`,
    "Governance: Human CEO has final authority. Internal analysis only. No tools, browsing, external messages, transactions, deployments, or record changes are authorized by this deliberation.",
  ].join("\n");

  let responseText = "";
  let responseAgent: AgentRow | null = null;
  let messageType: "position" | "challenge" | "synthesis" = "position";
  let roundNo = 1;
  let synthesisPayload: { executive_summary?: string; consensus?: string; disagreements?: string[]; options?: string[]; recommendation?: string; next_step?: string } | null = null;

  try {
    if (deliberationMessages.length < totalAgentTurns) {
      const participantIndex = deliberationMessages.length % participants.length;
      roundNo = Math.floor(deliberationMessages.length / participants.length) + 1;
      const participant = participants[participantIndex];
      responseAgent = participantAgent(participant);
      if (!responseAgent) return jsonError("A participant agent record is missing.", 409);
      messageType = roundNo === 1 ? "position" : "challenge";

      const roundInstruction = roundNo === 1
        ? "State your independent position. Identify the strongest rationale, major risks, and the option you recommend. You may reference earlier speakers, but do not simply agree."
        : "Challenge the prior discussion. Identify weak assumptions or missing trade-offs, respond to disagreements, and revise your recommendation if evidence in the transcript warrants it.";

      const response = await client.responses.create({
        model: config.dryRunModel,
        max_output_tokens: 420,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: `You are ${responseAgent.agent_code}, ${responseAgent.display_name ?? responseAgent.name}, the RYTHM ${responseAgent.role_title}. Your mandate: ${responseAgent.purpose ?? "Provide disciplined internal analysis."} Work style: ${responseAgent.work_style ?? "Evidence-led and concise."} Stay inside your assigned professional lens. Do not impersonate the CEO. Do not use tools or claim external research. ${roundInstruction} Format with short headings: Position, Rationale, Risks/Challenges, Recommendation.` }],
          },
          { role: "user", content: [{ type: "input_text", text: `${sharedContext}\n\nTranscript so far:\n${transcript || "No prior agent statements."}` }] },
        ],
      }, { signal: AbortSignal.timeout(config.agentTimeoutMs) });
      responseText = (response.output_text || "No textual response was produced.").trim().slice(0, 6000);
      const inputTokens = Number(response.usage?.input_tokens ?? 0);
      const outputTokens = Number(response.usage?.output_tokens ?? 0);
      const cost = estimateCost(inputTokens, outputTokens, config.inputCostPerMillionUsd, config.outputCostPerMillionUsd);
      const accumulatedCost = Number(session.estimated_cost_usd ?? 0) + messages.reduce((sum, item) => sum, 0) + cost;
      if (accumulatedCost > Number(session.budget_cap_usd)) {
        await supabase.from("meeting_agent_sessions").update({ status: "failed", error_message: `Estimated cost $${accumulatedCost.toFixed(6)} exceeded the session budget cap.`, updated_at: new Date().toISOString() }).eq("id", sessionId).eq("organization_id", organizationId);
        return jsonError("The next agent turn exceeded the configured meeting budget cap.", 409);
      }

      const { error: insertError } = await supabase.from("meeting_agent_messages").insert({
        organization_id: organizationId,
        meeting_id: meeting.id,
        session_id: sessionId,
        agent_id: responseAgent.id,
        turn_index: nextTurnIndex,
        round_no: roundNo,
        speaker_type: "agent",
        message_type: messageType,
        content: responseText,
        model: config.dryRunModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: cost,
      });
      if (insertError) return jsonError(insertError.message, 500);

      await supabase.from("meeting_agent_sessions").update({
        total_input_tokens: Number(session.total_input_tokens ?? 0) + inputTokens,
        total_output_tokens: Number(session.total_output_tokens ?? 0) + outputTokens,
        estimated_cost_usd: Number(session.estimated_cost_usd ?? 0) + cost,
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId).eq("organization_id", organizationId);

      return NextResponse.json({
        ok: true,
        sessionId,
        status: "running",
        phase: messageType,
        roundNo,
        turnIndex: nextTurnIndex,
        speaker: { id: responseAgent.id, code: responseAgent.agent_code, name: responseAgent.display_name ?? responseAgent.name, role: responseAgent.role_title },
        content: responseText,
        remainingTurns: totalAgentTurns - deliberationMessages.length - 1,
      });
    }

    const synthesizerParticipant = participants.find((participant) => participantAgent(participant)?.agent_code === "B-001") ?? participants.find((participant) => participant.session_role === "synthesizer") ?? participants[0];
    responseAgent = participantAgent(synthesizerParticipant);
    messageType = "synthesis";
    roundNo = Number(session.max_rounds) + 1;

    const synthesisResponse = await client.responses.create({
      model: config.dryRunModel,
      max_output_tokens: 650,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: "You are the RYTHM Executive Orchestrator synthesizing a governed internal multi-agent meeting. Do not invent evidence. Preserve material disagreements instead of forcing consensus. Human CEO makes the final decision. Return STRICT JSON only with keys: executive_summary (string), consensus (string), disagreements (array of strings), options (array of 2-4 decision-ready strings), recommendation (string), next_step (string). No markdown fences." }],
        },
        { role: "user", content: [{ type: "input_text", text: `${sharedContext}\n\nFull deliberation transcript:\n${transcript}` }] },
      ],
    }, { signal: AbortSignal.timeout(config.agentTimeoutMs) });

    const raw = (synthesisResponse.output_text || "{}").trim();
    try {
      synthesisPayload = JSON.parse(cleanJson(raw));
    } catch {
      synthesisPayload = {
        executive_summary: raw.slice(0, 4000),
        consensus: "Structured JSON synthesis could not be parsed; review the synthesis text directly.",
        disagreements: [],
        options: ["Review transcript and defer decision", "Adopt the strongest supported recommendation with CEO conditions"],
        recommendation: "Human CEO review required.",
        next_step: "Review the transcript and record a governed decision.",
      };
    }

    const options = Array.isArray(synthesisPayload.options) ? synthesisPayload.options.map(String).slice(0, 4) : [];
    responseText = [
      `Executive summary\n${synthesisPayload.executive_summary ?? ""}`,
      `Consensus\n${synthesisPayload.consensus ?? ""}`,
      `Material disagreements\n${(synthesisPayload.disagreements ?? []).map((item) => `• ${item}`).join("\n") || "None recorded."}`,
      `Recommendation\n${synthesisPayload.recommendation ?? "Human CEO review required."}`,
      `Next governed step\n${synthesisPayload.next_step ?? "Human CEO decision."}`,
    ].join("\n\n").slice(0, 8000);

    const inputTokens = Number(synthesisResponse.usage?.input_tokens ?? 0);
    const outputTokens = Number(synthesisResponse.usage?.output_tokens ?? 0);
    const cost = estimateCost(inputTokens, outputTokens, config.inputCostPerMillionUsd, config.outputCostPerMillionUsd);
    const finalCost = Number(session.estimated_cost_usd ?? 0) + cost;
    if (finalCost > Number(session.budget_cap_usd)) {
      await supabase.from("meeting_agent_sessions").update({ status: "failed", error_message: `Estimated cost $${finalCost.toFixed(6)} exceeded the session budget cap during synthesis.`, updated_at: new Date().toISOString() }).eq("id", sessionId).eq("organization_id", organizationId);
      return jsonError("Meeting synthesis exceeded the configured budget cap.", 409);
    }

    const { error: synthesisInsertError } = await supabase.from("meeting_agent_messages").insert({
      organization_id: organizationId,
      meeting_id: meeting.id,
      session_id: sessionId,
      agent_id: responseAgent?.id ?? null,
      turn_index: nextTurnIndex,
      round_no: roundNo,
      speaker_type: "agent",
      message_type: "synthesis",
      content: responseText,
      model: config.dryRunModel,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
    });
    if (synthesisInsertError) return jsonError(synthesisInsertError.message, 500);

    const completedAt = new Date().toISOString();
    await supabase.from("meeting_agent_sessions").update({
      status: "completed",
      synthesis: responseText,
      recommendation: String(synthesisPayload.recommendation ?? "Human CEO review required."),
      decision_options: options,
      total_input_tokens: Number(session.total_input_tokens ?? 0) + inputTokens,
      total_output_tokens: Number(session.total_output_tokens ?? 0) + outputTokens,
      estimated_cost_usd: finalCost,
      completed_at: completedAt,
      updated_at: completedAt,
      error_message: null,
    }).eq("id", sessionId).eq("organization_id", organizationId);

    await supabase.from("audit_events").insert({
      organization_id: organizationId,
      actor_type: "system",
      event_type: "meeting.agent_deliberation_completed",
      object_type: "meeting",
      object_id: meeting.id,
      risk_level: "medium",
      payload: { session_id: sessionId, rounds: session.max_rounds, participants: participants.length, decision_options: options.length, external_actions: false, human_decision_required: true },
    });

    return NextResponse.json({
      ok: true,
      sessionId,
      status: "completed",
      phase: "synthesis",
      roundNo,
      turnIndex: nextTurnIndex,
      speaker: responseAgent ? { id: responseAgent.id, code: responseAgent.agent_code, name: responseAgent.display_name ?? responseAgent.name, role: responseAgent.role_title } : null,
      content: responseText,
      decisionOptions: options,
      recommendation: synthesisPayload.recommendation ?? "Human CEO review required.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown meeting runtime error";
    await supabase.from("meeting_agent_sessions").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", sessionId).eq("organization_id", organizationId);
    await supabase.from("audit_events").insert({
      organization_id: organizationId,
      actor_type: "system",
      event_type: "meeting.agent_deliberation_failed",
      object_type: "meeting",
      object_id: meeting.id,
      risk_level: "medium",
      payload: { session_id: sessionId, message, external_actions: false },
    });
    return jsonError("Agent deliberation failed. Review the session error and audit trail.", 500);
  }
}
