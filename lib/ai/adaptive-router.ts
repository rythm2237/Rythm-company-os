import { randomUUID } from "crypto";
import { clampTier, getModelForTier, nextTier, supportedReasoningLevel } from "@/lib/ai/model-registry";
import { deterministicRequestIntelligence } from "@/lib/ai/request-intelligence";
import { DEFAULT_MODEL_POLICY, type AgentRoutingPolicy, type ModelPolicy, type ModelTier, type RoutingDecision, type TenantAiPolicy } from "@/lib/ai/routing-types";

const tierRank: Record<ModelTier, number> = { luna: 0, terra: 1, sol: 2 };

function mergePolicy(agent?: AgentRoutingPolicy, tenant?: TenantAiPolicy): ModelPolicy {
  return {
    ...DEFAULT_MODEL_POLICY,
    ...(tenant?.costStrategy ? { costStrategy: tenant.costStrategy } : {}),
    ...(agent?.modelPolicy ?? {}),
  };
}

function estimateCost(capability: ReturnType<typeof getModelForTier>, inputChars: number, maxOutputTokens = 1200) {
  if (!capability || capability.inputCostPerMillionUsd == null || capability.outputCostPerMillionUsd == null) return null;
  const approximateInputTokens = Math.ceil(inputChars / 4);
  return (approximateInputTokens / 1_000_000) * capability.inputCostPerMillionUsd
    + (maxOutputTokens / 1_000_000) * capability.outputCostPerMillionUsd;
}

function applyCostStrategy(tier: ModelTier, policy: ModelPolicy, risk: RoutingDecision["risk"] | "low", complexity: RoutingDecision["complexity"] | "low") {
  if (risk === "high" || risk === "restricted" || complexity === "high") return tier;
  if (policy.costStrategy === "quality" && tier === "luna") return "terra";
  if (policy.costStrategy === "economy" && tier === "sol") return "terra";
  return tier;
}

export function routeRequest(input: {
  prompt: string;
  requestId?: string;
  conversationLanguage?: string | null;
  agent?: AgentRoutingPolicy;
  tenant?: TenantAiPolicy;
  escalationIndex?: number;
  forcedTier?: ModelTier;
}) {
  const intelligence = deterministicRequestIntelligence({
    prompt: input.prompt,
    conversationLanguage: input.conversationLanguage,
    savedLanguage: input.agent?.savedLanguage,
    agent: input.agent,
  });
  const policy = mergePolicy(input.agent, input.tenant);
  if (intelligence.risk === "restricted") {
    throw new Error("RYTHM routing blocked this request because it requires restricted handling.");
  }

  if (policy.mode === "fixed" && policy.fixedModel && policy.fixedProvider) {
    return {
      ...intelligence,
      requestId: input.requestId ?? randomUUID(),
      selectedTier: policy.preferredTier ?? "terra",
      selectedProvider: policy.fixedProvider,
      selectedModel: policy.fixedModel,
      reasoningLevel: intelligence.reasoningRequirement,
      estimatedCostUsd: null,
      escalationIndex: input.escalationIndex ?? 0,
      routingVersion: "adaptive-v1",
    } satisfies RoutingDecision;
  }

  let tier = input.forcedTier ?? intelligence.recommendedTier;
  tier = applyCostStrategy(tier, policy, intelligence.risk, intelligence.complexity);
  tier = clampTier(tier, policy.minimumTier, policy.maximumTier);

  if (input.tenant?.advancedReasoningAllowed === false && intelligence.reasoningRequirement === "high" && tier === "sol") {
    tier = clampTier("terra", policy.minimumTier, policy.maximumTier);
  }

  const capability = getModelForTier(tier, input.tenant?.allowedTiers);
  if (!capability) throw new Error("No configured RYTHM model tier is available for this request.");
  const reasoningLevel = supportedReasoningLevel(capability, intelligence.reasoningRequirement);
  const maxTokens = policy.maxTokens ?? 3200;
  const estimatedCostUsd = estimateCost(capability, input.prompt.length, Math.min(maxTokens, 3200));
  if (policy.maxCostPerRequest != null && estimatedCostUsd != null && estimatedCostUsd > policy.maxCostPerRequest) {
    const cheaper = getModelForTier("luna", input.tenant?.allowedTiers);
    if (!cheaper || intelligence.complexity === "high" || intelligence.risk === "high") {
      throw new Error("AI request exceeds the configured per-request budget.");
    }
    return {
      ...intelligence,
      requestId: input.requestId ?? randomUUID(),
      selectedTier: cheaper.tier,
      selectedProvider: cheaper.provider,
      selectedModel: cheaper.model,
      reasoningLevel: supportedReasoningLevel(cheaper, intelligence.reasoningRequirement),
      estimatedCostUsd: estimateCost(cheaper, input.prompt.length, Math.min(maxTokens, 3200)),
      escalationIndex: input.escalationIndex ?? 0,
      routingVersion: "adaptive-v1",
    } satisfies RoutingDecision;
  }

  return {
    ...intelligence,
    requestId: input.requestId ?? randomUUID(),
    selectedTier: capability.tier,
    selectedProvider: capability.provider,
    selectedModel: capability.model,
    reasoningLevel,
    estimatedCostUsd,
    escalationIndex: input.escalationIndex ?? 0,
    routingVersion: "adaptive-v1",
  } satisfies RoutingDecision;
}

export function escalationDecision(current: RoutingDecision, agent?: AgentRoutingPolicy) {
  const policy = mergePolicy(agent, undefined);
  if (!policy.allowEscalation || !current.allowEscalation || current.escalationIndex >= policy.maxEscalations) return null;
  const next = nextTier(current.selectedTier);
  if (!next) return null;
  const clamped = clampTier(next, policy.minimumTier, policy.maximumTier);
  if (tierRank[clamped] <= tierRank[current.selectedTier]) return null;
  return clamped;
}

export function shouldEscalate(result: { empty?: boolean; invalidStructuredOutput?: boolean; insufficientCapability?: boolean; validationFailed?: boolean; toolComplexityExceeded?: boolean }) {
  return Boolean(result.empty || result.invalidStructuredOutput || result.insufficientCapability || result.validationFailed || result.toolComplexityExceeded);
}
