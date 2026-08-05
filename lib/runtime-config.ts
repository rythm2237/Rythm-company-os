export type RuntimeConfig = {
  supabaseConfigured: boolean;
  openAIConfigured: boolean;
  agentExecutionEnabled: boolean;
  externalActionsEnabled: boolean;
  monthlyAiBudgetUsd: number;
  environment: string;
};

const enabled = (value: string | undefined) => value === "true";

export function getRuntimeConfig(): RuntimeConfig {
  const supabasePublicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && supabasePublicKey,
    ),
    openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
    agentExecutionEnabled: enabled(process.env.RYTHM_AGENT_EXECUTION_ENABLED),
    externalActionsEnabled: enabled(process.env.RYTHM_EXTERNAL_ACTIONS_ENABLED),
    monthlyAiBudgetUsd: Number(process.env.RYTHM_MONTHLY_AI_BUDGET_USD ?? 25),
    environment: process.env.RYTHM_ENV ?? process.env.NODE_ENV ?? "development",
  };
}
