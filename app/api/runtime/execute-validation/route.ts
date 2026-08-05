import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const jsonError = (message: string, status: number) =>
  NextResponse.json({ ok: false, error: message }, { status });

const estimateCost = (
  inputTokens: number,
  outputTokens: number,
  inputRate: number,
  outputRate: number,
) => (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;

export async function POST(request: Request) {
  const config = getRuntimeConfig();
  if (!config.agentExecutionEnabled) return jsonError("Agent execution is disabled by environment policy.", 503);
  if (config.externalActionsEnabled) return jsonError("Validation runtime refuses to operate while external actions are enabled.", 503);
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

  let runId = "";
  try {
    const body = await request.json() as { runId?: string };
    runId = String(body.runId ?? "").trim();
  } catch {
    return jsonError("A JSON body with runId is required.", 400);
  }
  if (!runId) return jsonError("runId is required.", 400);

  const organizationId = membership.organization_id as string;
  const { data: run } = await supabase
    .from("agent_runs")
    .select("id, agent_id, input_summary, status, risk_level, execution_mode, budget_cap_usd, attempt_count, max_attempts, timeout_seconds")
    .eq("id", runId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!run) return jsonError("Run not found.", 404);
  if (run.status !== "queued") return jsonError("Only queued runs can execute.", 409);

  const { data: agent } = await supabase
    .from("agents")
    .select("agent_code, name, enabled")
    .eq("id", run.agent_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!agent || agent.agent_code !== "T-001" || !agent.enabled) {
    return jsonError("Only the enabled T-001 Runtime Validation Agent may execute.", 409);
  }
  if (run.risk_level !== "low" || run.execution_mode !== "dry_run") {
    return jsonError("Only low-risk dry-runs may execute.", 409);
  }

  const { data: policy } = await supabase
    .from("runtime_policies")
    .select("dry_run_execution_enabled, timeout_seconds, max_attempts")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!policy?.dry_run_execution_enabled) return jsonError("Dry-run execution is disabled by database policy.", 409);

  const startedAt = new Date().toISOString();
  const { error: claimError } = await supabase
    .from("agent_runs")
    .update({ status: "running", started_at: startedAt, last_heartbeat_at: startedAt })
    .eq("id", runId)
    .eq("organization_id", organizationId)
    .eq("status", "queued");
  if (claimError) return jsonError(claimError.message, 409);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "agent_run.started",
    object_type: "agent_run",
    object_id: runId,
    risk_level: "low",
    payload: { execution_mode: "dry_run", model: config.dryRunModel, external_actions: false },
  });

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const attemptsAllowed = Math.min(Number(policy.max_attempts ?? run.max_attempts ?? 1), config.agentMaxRetries + 1);
  const timeoutMs = Math.min(Number(policy.timeout_seconds ?? run.timeout_seconds ?? 45) * 1000, config.agentTimeoutMs);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
    try {
      const response = await client.responses.create({
        model: config.dryRunModel,
        max_output_tokens: 300,
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: "You are the RYTHM Runtime Validation Agent. Perform analysis only. Do not call tools, browse, send messages, modify records, or request external actions. Return a concise validation response with: interpretation, checks performed conceptually, risks, and a safe next step. State explicitly that no external action was executed.",
            }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: run.input_summary }],
          },
        ],
      }, { signal: AbortSignal.timeout(timeoutMs) });

      const inputTokens = Number(response.usage?.input_tokens ?? 0);
      const outputTokens = Number(response.usage?.output_tokens ?? 0);
      const estimatedCost = estimateCost(
        inputTokens,
        outputTokens,
        config.inputCostPerMillionUsd,
        config.outputCostPerMillionUsd,
      );
      const summary = (response.output_text || "Validation completed without textual output.").slice(0, 4000);

      if (estimatedCost > Number(run.budget_cap_usd)) {
        const { error: budgetFailureError } = await supabase.from("agent_runs").update({
          status: "failed",
          model: config.dryRunModel,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: 0,
          error_code: "POST_RUN_BUDGET_ESTIMATE_EXCEEDED",
          error_message: `Estimated cost $${estimatedCost.toFixed(6)} exceeded the configured cap.`,
          finished_at: new Date().toISOString(),
        }).eq("id", runId).eq("organization_id", organizationId).eq("status", "running");
        if (budgetFailureError) return jsonError(budgetFailureError.message, 500);
        await supabase.from("audit_events").insert({
          organization_id: organizationId,
          actor_type: "system",
          event_type: "agent_run.failed",
          object_type: "agent_run",
          object_id: runId,
          risk_level: "low",
          payload: { error_code: "POST_RUN_BUDGET_ESTIMATE_EXCEEDED", estimated_cost_usd: estimatedCost },
        });
        return jsonError("Validation completed but its estimated cost exceeded the run cap.", 409);
      }

      const { error: successError } = await supabase.from("agent_runs").update({
        status: "succeeded",
        model: config.dryRunModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: estimatedCost,
        result_summary: summary,
        finished_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      }).eq("id", runId).eq("organization_id", organizationId).eq("status", "running");
      if (successError) return jsonError(successError.message, 500);

      await supabase.from("audit_events").insert({
        organization_id: organizationId,
        actor_type: "system",
        event_type: "agent_run.succeeded",
        object_type: "agent_run",
        object_id: runId,
        risk_level: "low",
        payload: { model: config.dryRunModel, input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: estimatedCost, external_actions: false },
      });
      return NextResponse.json({ ok: true, runId, status: "succeeded", result: summary, estimatedCostUsd: estimatedCost });
    } catch (error) {
      lastError = error;
      if (attempt < attemptsAllowed) continue;
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message.slice(0, 1000) : "Unknown validation runtime error";
  await supabase.from("agent_runs").update({
    status: "failed",
    error_code: "VALIDATION_RUNTIME_ERROR",
    error_message: errorMessage,
    finished_at: new Date().toISOString(),
  }).eq("id", runId).eq("organization_id", organizationId).eq("status", "running");
  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "system",
    event_type: "agent_run.failed",
    object_type: "agent_run",
    object_id: runId,
    risk_level: "low",
    payload: { error_code: "VALIDATION_RUNTIME_ERROR", message: errorMessage, external_actions: false },
  });
  return jsonError("Validation dry-run failed. Review the run audit record.", 500);
}
