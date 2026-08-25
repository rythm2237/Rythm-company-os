import { getModelRegistry } from "@/lib/ai/model-registry";
import type { ProviderUsage } from "@/lib/ai/gateway-contracts";

export const AI_PRICING_VERSION = "model-registry-2026-08-25";

export function calculateActualCostUsd(provider: string, model: string, usage?: ProviderUsage): number | null {
  if (!usage || usage.inputTokens == null || usage.outputTokens == null) return null;
  const capability = getModelRegistry().find((item) => item.provider === provider && item.model === model);
  if (!capability || capability.inputCostPerMillionUsd == null || capability.outputCostPerMillionUsd == null) return null;
  return (usage.inputTokens / 1_000_000) * capability.inputCostPerMillionUsd
    + (usage.outputTokens / 1_000_000) * capability.outputCostPerMillionUsd;
}
