import { NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getRuntimeConfig();
  const externalActionsLocked = !config.externalActionsEnabled;
  const executionConfigured = config.openAIConfigured && Boolean(config.dryRunModel);
  const safe = config.supabaseConfigured && externalActionsLocked;
  const status = safe ? (config.agentExecutionEnabled && !executionConfigured ? "degraded" : "ok") : "error";

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
  }, { status: status === "error" ? 503 : 200 });
}
