import type { CapabilityTier, ModelTier, ProviderCapability, ReasoningDepth, ReasoningLevel } from "@/lib/ai/routing-types";

export const DEFAULT_MODEL_REGISTRY_VERSION = "rythm-model-registry-2026-08-25-v2";

const tierRank: Record<ModelTier, number> = { luna: 0, terra: 1, sol: 2 };

const OPENAI_DEFAULTS: Record<ModelTier, Omit<ProviderCapability, "tier">> = {
  luna: {
    provider: "openai",
    model: "gpt-5.6-luna",
    capabilityTiers: ["fast", "standard", "fallback"],
    reasoningLevels: ["low", "medium", "high"],
    reasoningDepths: ["minimal", "standard"],
    supportedModalities: ["text", "image", "file"],
    supportsImages: true,
    supportsFiles: true,
    supportsTools: true,
    codingSuitability: "basic",
    languageSuitability: "multilingual",
    latencyProfile: "low",
    estimatedLatencyMs: 900,
    costProfile: "low",
    availability: "available",
    fallbackPriority: 30,
    maxContextTokens: 1_050_000,
    inputCostPerMillionUsd: 0.20,
    outputCostPerMillionUsd: 1.20,
  },
  terra: {
    provider: "openai",
    model: "gpt-5.6-terra",
    capabilityTiers: ["standard", "advanced_reasoning", "coding", "multimodal", "specialized", "fallback"],
    reasoningLevels: ["low", "medium", "high"],
    reasoningDepths: ["minimal", "standard", "deep"],
    supportedModalities: ["text", "image", "file"],
    supportsImages: true,
    supportsFiles: true,
    supportsTools: true,
    codingSuitability: "strong",
    languageSuitability: "multilingual",
    latencyProfile: "normal",
    estimatedLatencyMs: 1800,
    costProfile: "medium",
    availability: "available",
    fallbackPriority: 20,
    maxContextTokens: 1_050_000,
    inputCostPerMillionUsd: 2.00,
    outputCostPerMillionUsd: 12.00,
  },
  sol: {
    provider: "openai",
    model: "gpt-5.6-sol",
    capabilityTiers: ["advanced_reasoning", "high_accuracy", "coding", "multimodal", "specialized", "fallback"],
    reasoningLevels: ["low", "medium", "high"],
    reasoningDepths: ["minimal", "standard", "deep", "expert"],
    supportedModalities: ["text", "image", "file"],
    supportsImages: true,
    supportsFiles: true,
    supportsTools: true,
    codingSuitability: "expert",
    languageSuitability: "multilingual",
    latencyProfile: "high",
    estimatedLatencyMs: 3200,
    costProfile: "high",
    availability: "available",
    fallbackPriority: 10,
    maxContextTokens: 1_050_000,
    inputCostPerMillionUsd: 4.00,
    outputCostPerMillionUsd: 20.00,
  },
};

function parseList<T extends string>(value: string | undefined, allowed: ReadonlySet<string>, fallback: T[]): T[] {
  if (!value) return fallback;
  const parsed = value.split(",").map((item) => item.trim().toLowerCase()).filter((item): item is T => allowed.has(item));
  return parsed.length ? parsed : fallback;
}

function numberOrUndefined(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function enumValue<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  const normalized = value?.trim().toLowerCase() as T | undefined;
  return normalized && allowed.includes(normalized) ? normalized : fallback;
}

function capability(tier: ModelTier, environment: NodeJS.ProcessEnv): ProviderCapability {
  const upper = tier.toUpperCase();
  const prefix = `RYTHM_MODEL_${upper}`;
  const defaults = OPENAI_DEFAULTS[tier];
  const providerRaw = environment[`${prefix}_PROVIDER`]?.trim().toLowerCase() || defaults.provider;
  const validProvider = providerRaw === "openai" || providerRaw === "anthropic" || providerRaw === "google";
  const provider = providerRaw === "anthropic" || providerRaw === "google" ? providerRaw : "openai";
  const capabilityTiers = parseList<CapabilityTier>(environment[`${prefix}_CAPABILITIES`], new Set<CapabilityTier>(["fast", "standard", "advanced_reasoning", "high_accuracy", "coding", "multimodal", "specialized", "fallback"]), defaults.capabilityTiers);
  const reasoningLevels = parseList<ReasoningLevel>(environment[`${prefix}_REASONING`], new Set<ReasoningLevel>(["low", "medium", "high"]), defaults.reasoningLevels);
  const reasoningDepths = parseList<ReasoningDepth>(environment[`${prefix}_REASONING_DEPTHS`], new Set<ReasoningDepth>(["minimal", "standard", "deep", "expert"]), defaults.reasoningDepths);
  const modalities = parseList<"text" | "image" | "file" | "audio">(environment[`${prefix}_MODALITIES`], new Set(["text", "image", "file", "audio"]), defaults.supportedModalities);
  return {
    provider,
    model: environment[prefix]?.trim() || defaults.model,
    tier,
    capabilityTiers,
    reasoningLevels,
    reasoningDepths,
    supportedModalities: modalities,
    supportsImages: modalities.includes("image"),
    supportsFiles: modalities.includes("file"),
    supportsTools: environment[`${prefix}_TOOLS`] === undefined ? defaults.supportsTools : environment[`${prefix}_TOOLS`] === "true",
    codingSuitability: enumValue(environment[`${prefix}_CODING`], ["basic", "strong", "expert"] as const, defaults.codingSuitability),
    languageSuitability: enumValue(environment[`${prefix}_LANGUAGE`], ["multilingual", "limited"] as const, defaults.languageSuitability),
    latencyProfile: enumValue(environment[`${prefix}_LATENCY_PROFILE`], ["low", "normal", "high"] as const, defaults.latencyProfile),
    estimatedLatencyMs: numberOrUndefined(environment[`${prefix}_ESTIMATED_LATENCY_MS`]) ?? defaults.estimatedLatencyMs,
    costProfile: enumValue(environment[`${prefix}_COST_PROFILE`], ["low", "medium", "high"] as const, defaults.costProfile),
    availability: !validProvider || environment[`${prefix}_ENABLED`] === "false" ? "disabled" : "available",
    fallbackPriority: numberOrUndefined(environment[`${prefix}_FALLBACK_PRIORITY`]) ?? defaults.fallbackPriority,
    maxContextTokens: numberOrUndefined(environment[`${prefix}_MAX_CONTEXT`]) ?? defaults.maxContextTokens,
    inputCostPerMillionUsd: numberOrUndefined(environment[`${prefix}_INPUT_COST_PER_MILLION_USD`]) ?? defaults.inputCostPerMillionUsd,
    outputCostPerMillionUsd: numberOrUndefined(environment[`${prefix}_OUTPUT_COST_PER_MILLION_USD`]) ?? defaults.outputCostPerMillionUsd,
  };
}

export function getModelRegistry(environment: NodeJS.ProcessEnv = process.env): ProviderCapability[] {
  return (["luna", "terra", "sol"] as ModelTier[]).map((tier) => capability(tier, environment));
}

export function getModelRegistryVersion(environment: NodeJS.ProcessEnv = process.env) {
  return environment.RYTHM_MODEL_REGISTRY_VERSION?.trim() || DEFAULT_MODEL_REGISTRY_VERSION;
}

export function getModelForTier(tier: ModelTier, allowedTiers?: ModelTier[], environment: NodeJS.ProcessEnv = process.env) {
  const registry = getModelRegistry(environment).filter((item) => item.availability === "available");
  const allowed = allowedTiers?.length ? new Set(allowedTiers) : null;
  const candidates = registry.filter((item) => !allowed || allowed.has(item.tier));
  if (!candidates.length) return null;
  return candidates.find((item) => item.tier === tier)
    ?? [...candidates].sort((a, b) => Math.abs(tierRank[a.tier] - tierRank[tier]) - Math.abs(tierRank[b.tier] - tierRank[tier]))[0]
    ?? null;
}

export function findRegisteredModel(provider: ProviderCapability["provider"], model: string, environment: NodeJS.ProcessEnv = process.env) {
  return getModelRegistry(environment).find((candidate) => candidate.provider === provider && candidate.model === model) ?? null;
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
