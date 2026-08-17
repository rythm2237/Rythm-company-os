export type RuntimeConfig = {
  supabaseConfigured: boolean;
  openAIConfigured: boolean;
  anthropicConfigured: boolean;
  geminiConfigured: boolean;
  agentExecutionEnabled: boolean;
  externalActionsEnabled: boolean;
  monthlyAiBudgetUsd: number;
  environment: string;
  dryRunModel: string | null;
  agentTimeoutMs: number;
  agentMaxRetries: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
};

const enabled = (value: string | undefined) => value === "true";
const boundedNumber = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export function getRuntimeConfig(): RuntimeConfig {
  const supabasePublicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && supabasePublicKey,
    ),
    openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    agentExecutionEnabled: enabled(process.env.RYTHM_AGENT_EXECUTION_ENABLED),
    externalActionsEnabled: enabled(process.env.RYTHM_EXTERNAL_ACTIONS_ENABLED),
    monthlyAiBudgetUsd: boundedNumber(process.env.RYTHM_MONTHLY_AI_BUDGET_USD, 25, 0, 100000),
    environment: process.env.VERCEL_ENV ?? process.env.RYTHM_ENV ?? process.env.NODE_ENV ?? "development",
    dryRunModel: process.env.RYTHM_DRY_RUN_MODEL?.trim() || null,
    agentTimeoutMs: boundedNumber(process.env.RYTHM_AGENT_TIMEOUT_MS, 45000, 5000, 180000),
    agentMaxRetries: boundedNumber(process.env.RYTHM_AGENT_MAX_RETRIES, 1, 0, 4),
    inputCostPerMillionUsd: boundedNumber(process.env.RYTHM_INPUT_COST_PER_MILLION_USD, 0, 0, 1000),
    outputCostPerMillionUsd: boundedNumber(process.env.RYTHM_OUTPUT_COST_PER_MILLION_USD, 0, 0, 1000),
  };
}
