import { getRuntimeConfig } from "@/lib/runtime-config";

export type PublicStatusLevel = "operational" | "degraded" | "attention_required";

export type PublicStatusComponent = Readonly<{
  key: string;
  label: string;
  status: PublicStatusLevel | "configured" | "enabled" | "locked_by_default";
  detail: string;
}>;

export type PublicStatusSnapshot = Readonly<{
  service: "RYTHM Company OS";
  environment: string;
  status: PublicStatusLevel;
  observedAt: string;
  scope: "configuration_readiness";
  components: readonly PublicStatusComponent[];
  historicalUptime: null;
  incidentHistory: "not_yet_published";
}>;

export function getPublicStatusSnapshot(now = new Date()): PublicStatusSnapshot {
  const config = getRuntimeConfig();
  const databaseConfigured = config.supabaseConfigured;
  const aiRuntimeConfigured = config.openAIConfigured && Boolean(config.dryRunModel);
  const executionReady = config.agentExecutionEnabled && aiRuntimeConfigured;

  const status: PublicStatusLevel = databaseConfigured && aiRuntimeConfigured
    ? "operational"
    : databaseConfigured || aiRuntimeConfigured
      ? "degraded"
      : "attention_required";

  return {
    service: "RYTHM Company OS",
    environment: config.environment,
    status,
    observedAt: now.toISOString(),
    scope: "configuration_readiness",
    components: [
      {
        key: "web_delivery",
        label: "Production web delivery",
        status: "operational",
        detail: "This status response was served by the Production web application.",
      },
      {
        key: "authentication_data",
        label: "Authentication & data runtime",
        status: databaseConfigured ? "configured" : "attention_required",
        detail: databaseConfigured
          ? "Production Supabase configuration is present. This is a readiness signal, not a live database latency probe."
          : "Required Supabase configuration is incomplete.",
      },
      {
        key: "ai_runtime",
        label: "AI runtime",
        status: aiRuntimeConfigured ? "configured" : "attention_required",
        detail: aiRuntimeConfigured
          ? "The approved AI provider and controlled runtime model are configured."
          : "The approved AI provider or controlled runtime model requires attention.",
      },
      {
        key: "governed_execution",
        label: "Governed Agent execution",
        status: executionReady ? "enabled" : "attention_required",
        detail: executionReady
          ? "Agent execution is enabled behind RYTHM policy, approval, and runtime controls."
          : "Governed Agent execution is not currently ready from configuration signals.",
      },
      {
        key: "external_actions",
        label: "External actions",
        status: config.externalActionsEnabled ? "enabled" : "locked_by_default",
        detail: config.externalActionsEnabled
          ? "External actions are enabled and remain subject to execution policy and approval controls."
          : "External actions are locked by default at the environment level.",
      },
    ],
    historicalUptime: null,
    incidentHistory: "not_yet_published",
  };
}
