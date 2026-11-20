import { NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { pilotTraceHeaders, pilotTraceId, recordPilotSignal } from "@/lib/observability/pilot";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getRuntimeConfig();
  const externalActionsLocked = !config.externalActionsEnabled;
  const executionConfigured = config.openAIConfigured && Boolean(config.dryRunModel);
  const safe = config.supabaseConfigured && externalActionsLocked;
  const status = safe ? (config.agentExecutionEnabled && !executionConfigured ? "degraded" : "ok") : "error";

  const traceId = pilotTraceId();
  if (status === "error") recordPilotSignal({traceId,surface:"core_routes",severity:"P0",outcome:"failed",code:"CONFIGURATION_UNAVAILABLE",httpStatus:503});
  return NextResponse.json({
    service: "RYTHM Company OS",
    status,
    timestamp: new Date().toISOString(),
    readiness: {
      database: config.supabaseConfigured,
      controlledDryRunConfiguration: executionConfigured,
      environmentExecutionSwitch: config.agentExecutionEnabled,
      externalActionsLocked,
    },
    runtime: {
      environment: config.environment,
      supabase: config.supabaseConfigured ? "configured" : "pending",
      openai: config.openAIConfigured ? "configured" : "pending",
      dryRunModel: config.dryRunModel ? "configured" : "pending",
      agentExecution: config.agentExecutionEnabled ? "enabled" : "disabled",
      externalActions: config.externalActionsEnabled ? "enabled" : "disabled",
      monthlyAiBudgetUsd: config.monthlyAiBudgetUsd,
      timeoutMs: config.agentTimeoutMs,
      maxRetries: config.agentMaxRetries,
      costRatesConfigured: config.inputCostPerMillionUsd > 0 || config.outputCostPerMillionUsd > 0,
    },
  }, { status: status === "error" ? 503 : 200, headers: pilotTraceHeaders(traceId) });
}
