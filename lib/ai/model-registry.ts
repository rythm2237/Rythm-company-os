import type { ModelTier, ProviderCapability, ReasoningLevel } from "@/lib/ai/routing-types";

const tierRank: Record<ModelTier, number> = { luna: 0, terra: 1, sol: 2 };

const OPENAI_DEFAULTS: Record<ModelTier, Omit<ProviderCapability, "tier">> = {
  luna: {
    provider: "openai",
    model: "gpt-5.6-luna",
    reasoningLevels: ["low", "medium", "high"],
    supportsImages: true,
    supportsFiles: true,
    supportsTools: true,
    maxContextTokens: 1_050_000,
    inputCostPerMillionUsd: 0.20,
    outputCostPerMillionUsd: 1.20,
  },
  terra: {
    provider: "openai",
    model: "gpt-5.6-terra",
    reasoningLevels: ["low", "medium", "high"],
    supportsImages: true,
    supportsFiles: true,
    supportsTools: true,
    maxContextTokens: 1_050_000,
    inputCostPerMillionUsd: 2.00,
    outputCostPerMillionUsd: 12.00,
  },
  sol: {
    provider: "openai",
    model: "gpt-5.6-sol",
    reasoningLevels: ["low", "medium", "high"],
    supportsImages: true,
    supportsFiles: true,
    supportsTools: true,
    maxContextTokens: 1_050_000,
    inputCostPerMillionUsd: 4.00,
    outputCostPerMillionUsd: 20.00,
  },
};

function parseLevels(value: string | undefined, fallback: ReasoningLevel[]): ReasoningLevel[] {
  if (!value) return fallback;
  const supported = new Set<ReasoningLevel>(["low", "medium", "high"]);
  const levels = value.split(",").map((item) => item.trim().toLowerCase()).filter((item): item is ReasoningLevel => supported.has(item as ReasoningLevel));
  return levels.length ? levels : fallback;
}

function numberOrUndefined(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function capability(tier: ModelTier): ProviderCapability {
  const upper = tier.toUpperCase();
  const defaults = OPENAI_DEFAULTS[tier];
  const model = process.env[`RYTHM_MODEL_${upper}`]?.trim() || defaults.model;
  const providerRaw = process.env[`RYTHM_MODEL_${upper}_PROVIDER`]?.trim().toLowerCase() || defaults.provider;
  const provider = providerRaw === "anthropic" || providerRaw === "google" ? providerRaw : "openai";
  return {
    provider,
    model,
    tier,
    reasoningLevels: parseLevels(process.env[`RYTHM_MODEL_${upper}_REASONING`], defaults.reasoningLevels),
    supportsImages: process.env[`RYTHM_MODEL_${upper}_IMAGES`] !== "false",
    supportsFiles: process.env[`RYTHM_MODEL_${upper}_FILES`] !== "false",
    supportsTools: process.env[`RYTHM_MODEL_${upper}_TOOLS`] !== "false",
    maxContextTokens: numberOrUndefined(process.env[`RYTHM_MODEL_${upper}_MAX_CONTEXT`]) ?? defaults.maxContextTokens,
    inputCostPerMillionUsd: numberOrUndefined(process.env[`RYTHM_MODEL_${upper}_INPUT_COST_PER_MILLION_USD`]) ?? defaults.inputCostPerMillionUsd,
    outputCostPerMillionUsd: numberOrUndefined(process.env[`RYTHM_MODEL_${upper}_OUTPUT_COST_PER_MILLION_USD`]) ?? defaults.outputCostPerMillionUsd,
  };
}

export function getModelRegistry(): ProviderCapability[] {
  return (["luna", "terra", "sol"] as ModelTier[]).map(capability);
}

export function getModelForTier(tier: ModelTier, allowedTiers?: ModelTier[]) {
  const registry = getModelRegistry();
  const allowed = allowedTiers?.length ? new Set(allowedTiers) : null;
  const candidates = registry.filter((item) => !allowed || allowed.has(item.tier));
  if (!candidates.length) return null;
  return candidates.find((item) => item.tier === tier)
    ?? [...candidates].sort((a, b) => Math.abs(tierRank[a.tier] - tierRank[tier]) - Math.abs(tierRank[b.tier] - tierRank[tier]))[0]
    ?? null;
}

export function clampTier(tier: ModelTier, minimum?: ModelTier, maximum?: ModelTier): ModelTier {
  let rank = tierRank[tier];
  if (minimum) rank = Math.max(rank, tierRank[minimum]);
  if (maximum) rank = Math.min(rank, tierRank[maximum]);
  return (["luna", "terra", "sol"] as ModelTier[])[rank];
}

export function nextTier(tier: ModelTier): ModelTier | null {
  if (tier === "luna") return "terra";
  if (tier === "terra") return "sol";
  return null;
}

export function supportedReasoningLevel(capability: ProviderCapability, requested: ReasoningLevel): ReasoningLevel {
  if (capability.reasoningLevels.includes(requested)) return requested;
  const order: ReasoningLevel[] = ["low", "medium", "high"];
  const requestedIndex = order.indexOf(requested);
  return [...capability.reasoningLevels].sort((a, b) => Math.abs(order.indexOf(a) - requestedIndex) - Math.abs(order.indexOf(b) - requestedIndex))[0] ?? "low";
}
