import { randomUUID } from "node:crypto";
import { clampTier, findRegisteredModel, getModelRegistry, getModelRegistryVersion, nextTier, supportedReasoningLevel } from "@/lib/ai/model-registry";
import { deterministicRequestIntelligence } from "@/lib/ai/request-intelligence";
import { getProviderEligibility } from "@/lib/ai/provider-eligibility";
import {
  DEFAULT_MODEL_POLICY,
  type AgentRoutingPolicy,
  type CapabilityTier,
  type ModelPolicy,
  type ModelTier,
  type ProviderCapability,
  type RoutingDecision,
  type RoutingReasonCode,
  type TenantAiPolicy,
} from "@/lib/ai/routing-types";

export const ADAPTIVE_ROUTER_VERSION = "adaptive-router-v2.0.0";
export const ADAPTIVE_POLICY_VERSION = "adaptive-policy-v2.0.0";

const tierRank: Record<ModelTier, number> = { luna: 0, terra: 1, sol: 2 };
const riskSafeFailureClasses = new Set(["timeout", "rate_limited", "provider_unavailable", "model_unavailable", "model_unsupported"]);

export class RoutingPolicyError extends Error {
  readonly reasonCodes: RoutingReasonCode[];
  constructor(message: string, reasonCodes: RoutingReasonCode[]) {
    super(message);
    this.name = "RoutingPolicyError";
    this.reasonCodes = reasonCodes;
  }
}

export type RouteRequestInput = {
  prompt: string;
  requestId?: string;
  requestType?: string;
  conversationLanguage?: string | null;
  attachments?: Array<{ mimeType: string }>;
  contextCharacterCount?: number | null;
  agent?: AgentRoutingPolicy;
  tenant?: TenantAiPolicy;
  escalationIndex?: number;
  forcedTier?: ModelTier;
  runtimeEnvironment?: string;
  environment?: NodeJS.ProcessEnv;
  excludedModels?: Array<{ provider: ProviderCapability["provider"]; model: string }>;
};

function mergePolicy(agent?: AgentRoutingPolicy, tenant?: TenantAiPolicy): ModelPolicy {
  return {
    ...DEFAULT_MODEL_POLICY,
    ...(tenant?.costStrategy ? { costStrategy: tenant.costStrategy } : {}),
    ...(agent?.modelPolicy ?? {}),
  };
}

function estimateCost(capability: ProviderCapability | null, inputTokens: number | null, maxOutputTokens = 1200) {
  if (!capability || inputTokens == null || capability.inputCostPerMillionUsd == null || capability.outputCostPerMillionUsd == null) return null;
  return (inputTokens / 1_000_000) * capability.inputCostPerMillionUsd
    + (maxOutputTokens / 1_000_000) * capability.outputCostPerMillionUsd;
}

function reasonCodeForEligibility(reason: string): RoutingReasonCode | null {
  if (reason === "provider_not_production_approved") return "PROVIDER_NOT_APPROVED";
  if (reason === "provider_not_environment_enabled" || reason === "provider_not_registered" || reason === "provider_not_supported") return "PROVIDER_DISABLED";
  return null;
}

function supportsRequest(candidate: ProviderCapability, intelligence: ReturnType<typeof deterministicRequestIntelligence>) {
  const capabilityAlternatives: Record<CapabilityTier, CapabilityTier[]> = {
    fast: ["fast", "standard", "advanced_reasoning", "high_accuracy", "coding", "multimodal", "specialized"],
    standard: ["standard", "advanced_reasoning", "high_accuracy", "coding", "multimodal", "specialized"],
    advanced_reasoning: ["advanced_reasoning", "high_accuracy"],
    high_accuracy: ["high_accuracy"],
    coding: ["coding"],
    multimodal: ["multimodal"],
    specialized: ["specialized", "high_accuracy"],
    fallback: ["fallback"],
  };
  if (!candidate.capabilityTiers.some((tier) => capabilityAlternatives[intelligence.recommendedCapabilityTier].includes(tier))) return false;
  if (!intelligence.requiredModalities.every((modality) => candidate.supportedModalities.includes(modality))) return false;
  if (intelligence.requiredTools.length && !candidate.supportsTools) return false;
  if (intelligence.estimatedInputTokens != null && candidate.maxContextTokens != null && intelligence.estimatedInputTokens > candidate.maxContextTokens) return false;
  if (!candidate.reasoningDepths.includes(intelligence.reasoningDepth)) return false;
  if (intelligence.recommendedCapabilityTier === "coding" && candidate.codingSuitability === "basic" && intelligence.complexity !== "low") return false;
  return true;
}

function candidateCost(candidate: ProviderCapability, estimatedInputTokens: number | null, maxOutputTokens: number) {
  return estimateCost(candidate, estimatedInputTokens, maxOutputTokens) ?? Number.POSITIVE_INFINITY;
}

function selectCandidate(input: {
  intelligence: ReturnType<typeof deterministicRequestIntelligence>;
  policy: ModelPolicy;
  tenant?: TenantAiPolicy;
  runtimeEnvironment: string;
  environment: NodeJS.ProcessEnv;
  forcedTier?: ModelTier;
  excludedModels?: RouteRequestInput["excludedModels"];
}) {
  const rejectedReasonCodes: RoutingReasonCode[] = [];
  const allowedTiers = input.tenant?.allowedTiers?.length ? new Set(input.tenant.allowedTiers) : null;
  const excluded = new Set((input.excludedModels ?? []).map((item) => `${item.provider}:${item.model}`));
  const requestedLegacyTier = clampTier(input.forcedTier ?? input.intelligence.recommendedTier, input.policy.minimumTier, input.policy.maximumTier);
  if (requestedLegacyTier !== (input.forcedTier ?? input.intelligence.recommendedTier)) rejectedReasonCodes.push("POLICY_TIER_CLAMPED");
  let candidates = getModelRegistry(input.environment).filter((candidate) => {
    if (candidate.availability !== "available" || excluded.has(`${candidate.provider}:${candidate.model}`)) {
      rejectedReasonCodes.push("MODEL_UNAVAILABLE");
      return false;
    }
    if (allowedTiers && !allowedTiers.has(candidate.tier)) {
      rejectedReasonCodes.push("ENTITLEMENT_CONSTRAINED");
      return false;
    }
    if (tierRank[candidate.tier] < tierRank[clampTier(candidate.tier, input.policy.minimumTier)] || tierRank[candidate.tier] > tierRank[clampTier(candidate.tier, undefined, input.policy.maximumTier)]) {
      rejectedReasonCodes.push("POLICY_TIER_CLAMPED");
      return false;
    }
    if (input.tenant?.advancedReasoningAllowed === false && candidate.tier === "sol") {
      rejectedReasonCodes.push("ENTITLEMENT_CONSTRAINED");
      return false;
    }
    if (input.intelligence.estimatedInputTokens != null && input.tenant?.maxContextTokens != null && input.intelligence.estimatedInputTokens > input.tenant.maxContextTokens) {
      rejectedReasonCodes.push("CONTEXT_LIMIT_EXCEEDED", "ENTITLEMENT_CONSTRAINED");
      return false;
    }
    const eligibility = getProviderEligibility(candidate.provider, input.runtimeEnvironment, input.environment);
    if (!eligibility.eligible) {
      for (const reason of eligibility.reasonCodes) {
        const code = reasonCodeForEligibility(reason);
        if (code) rejectedReasonCodes.push(code);
      }
      return false;
    }
    if (!supportsRequest(candidate, input.intelligence)) {
      if (input.intelligence.estimatedInputTokens != null && candidate.maxContextTokens != null && input.intelligence.estimatedInputTokens > candidate.maxContextTokens) rejectedReasonCodes.push("CONTEXT_LIMIT_EXCEEDED");
      return false;
    }
    return true;
  });
  if (!candidates.length) {
    const reasons: RoutingReasonCode[] = [...new Set<RoutingReasonCode>([...rejectedReasonCodes, "NO_ELIGIBLE_MODEL", "ESCALATION_REQUIRED"])];
    throw new RoutingPolicyError("No Production-eligible model satisfies the request capability and policy requirements.", reasons);
  }

  const expectedOutputTokens = input.intelligence.complexity === "high" ? 2600 : input.intelligence.complexity === "medium" ? 1400 : 700;
  const maxOutputTokens = Math.min(input.policy.maxTokens ?? expectedOutputTokens, expectedOutputTokens);
  const maxCost = input.policy.maxCostPerRequest ?? input.tenant?.remainingAiAllowance ?? null;
  if (maxCost != null) {
    const withinBudget = candidates.filter((candidate) => {
      const cost = estimateCost(candidate, input.intelligence.estimatedInputTokens, maxOutputTokens);
      return cost == null || cost <= maxCost;
    });
    if (!withinBudget.length) throw new RoutingPolicyError("No eligible model fits the configured per-request budget without violating capability requirements.", ["BUDGET_LIMIT_REACHED", "NO_ELIGIBLE_MODEL", "ESCALATION_REQUIRED"]);
    candidates = withinBudget;
  }

  const sorted = [...candidates].sort((a, b) => {
    const costDelta = candidateCost(a, input.intelligence.estimatedInputTokens, maxOutputTokens) - candidateCost(b, input.intelligence.estimatedInputTokens, maxOutputTokens);
    const latencyDelta = (a.estimatedLatencyMs ?? Number.POSITIVE_INFINITY) - (b.estimatedLatencyMs ?? Number.POSITIVE_INFINITY);
    const requestedDistance = Math.abs(tierRank[a.tier] - tierRank[requestedLegacyTier]) - Math.abs(tierRank[b.tier] - tierRank[requestedLegacyTier]);
    if (input.policy.costStrategy === "economy") return costDelta || requestedDistance || latencyDelta || b.fallbackPriority - a.fallbackPriority;
    if (input.policy.costStrategy === "quality") return tierRank[b.tier] - tierRank[a.tier] || requestedDistance || costDelta;
    if (input.intelligence.latencyPreference === "interactive") return latencyDelta || costDelta || requestedDistance;
    return requestedDistance || costDelta || latencyDelta || b.fallbackPriority - a.fallbackPriority;
  });
  const selected = sorted[0];
  const cheapest = [...candidates].sort((a, b) => candidateCost(a, input.intelligence.estimatedInputTokens, maxOutputTokens) - candidateCost(b, input.intelligence.estimatedInputTokens, maxOutputTokens))[0];
  const selectionReasonCodes = [...new Set(rejectedReasonCodes)];
  if (selected === cheapest && candidates.length > 1) selectionReasonCodes.push("COST_OPTIMIZED");
  return { selected, selectionReasonCodes, maxOutputTokens };
}

function fixedDecision(input: RouteRequestInput, intelligence: ReturnType<typeof deterministicRequestIntelligence>, policy: ModelPolicy, requestId: string, runtimeEnvironment: string, environment: NodeJS.ProcessEnv): RoutingDecision | null {
  if (policy.mode !== "fixed" || !policy.fixedProvider || !policy.fixedModel) return null;
  const eligibility = getProviderEligibility(policy.fixedProvider, runtimeEnvironment, environment);
  if (!eligibility.eligible) {
    throw new RoutingPolicyError("The explicit fixed model provider is unavailable or not Production-approved.", [
      ...eligibility.reasonCodes.map(reasonCodeForEligibility).filter((code): code is RoutingReasonCode => Boolean(code)),
      "FIXED_MODEL_UNAVAILABLE",
      "ESCALATION_REQUIRED",
    ]);
  }
  const registered = findRegisteredModel(policy.fixedProvider, policy.fixedModel, environment);
  if (registered?.availability === "disabled") throw new RoutingPolicyError("The explicit fixed model is disabled.", ["MODEL_UNAVAILABLE", "FIXED_MODEL_UNAVAILABLE", "ESCALATION_REQUIRED"]);
  if (registered && !supportsRequest(registered, intelligence)) {
    if (policy.fixedModelFallback === "adaptive") return null;
    throw new RoutingPolicyError("The explicit fixed model cannot satisfy the request capability requirements.", ["FIXED_MODEL_UNAVAILABLE", "ESCALATION_REQUIRED"]);
  }
  const selectedTier = registered?.tier ?? clampTier(policy.preferredTier ?? intelligence.recommendedTier, policy.minimumTier, policy.maximumTier);
  const reasonCodes: RoutingReasonCode[] = [...intelligence.reasonCodes, "FIXED_MODEL_EXCEPTION"];
  if (!registered) reasonCodes.push("MODEL_METADATA_UNKNOWN");
  return {
    ...intelligence,
    reasonCodes: [...new Set(reasonCodes)],
    reasonSummary: [...new Set(reasonCodes)].slice(0, 5).map((code) => code.toLowerCase().replaceAll("_", " ")).join("; "),
    requestId,
    selectedCapabilityTier: intelligence.recommendedCapabilityTier,
    selectedTier,
    selectedProvider: policy.fixedProvider,
    selectedModel: policy.fixedModel,
    reasoningLevel: registered ? supportedReasoningLevel(registered, intelligence.reasoningRequirement) : intelligence.reasoningRequirement,
    estimatedCostUsd: estimateCost(registered, intelligence.estimatedInputTokens, Math.min(policy.maxTokens ?? 3200, 3200)),
    estimatedLatencyMs: registered?.estimatedLatencyMs ?? null,
    escalationIndex: input.escalationIndex ?? 0,
    escalationReasons: intelligence.humanReviewRequired ? ["HUMAN_REVIEW_REQUIRED"] : [],
    routingVersion: ADAPTIVE_ROUTER_VERSION,
    policyVersion: input.tenant?.organizationPolicyVersion ?? ADAPTIVE_POLICY_VERSION,
    modelRegistryVersion: getModelRegistryVersion(environment),
  };
}

export function routeRequestV2(input: RouteRequestInput): RoutingDecision {
  const environment = input.environment ?? process.env;
  const runtimeEnvironment = input.runtimeEnvironment ?? environment.VERCEL_ENV ?? environment.RYTHM_ENV ?? environment.NODE_ENV ?? "development";
  const intelligence = deterministicRequestIntelligence({
    prompt: input.prompt,
    requestType: input.requestType,
    conversationLanguage: input.conversationLanguage,
    savedLanguage: input.agent?.savedLanguage,
    attachments: input.attachments,
    contextCharacterCount: input.contextCharacterCount,
    latencyPreference: input.agent?.modelPolicy?.latencyPreference,
    agent: input.agent,
    tenant: input.tenant,
  });
  const policy = mergePolicy(input.agent, input.tenant);
  const requestId = input.requestId ?? randomUUID();
  if (intelligence.risk === "restricted") {
    throw new RoutingPolicyError("RYTHM routing blocked this request because it requires restricted handling.", [...intelligence.reasonCodes, "ESCALATION_REQUIRED"]);
  }
  const fixed = fixedDecision(input, intelligence, policy, requestId, runtimeEnvironment, environment);
  if (fixed) return fixed;

  const { selected, selectionReasonCodes, maxOutputTokens } = selectCandidate({ intelligence, policy, tenant: input.tenant, runtimeEnvironment, environment, forcedTier: input.forcedTier, excludedModels: input.excludedModels });
  const reasonCodes = [...new Set([...intelligence.reasonCodes, ...selectionReasonCodes])];
  return {
    ...intelligence,
    reasonCodes,
    reasonSummary: reasonCodes.slice(0, 5).map((code) => code.toLowerCase().replaceAll("_", " ")).join("; "),
    requestId,
    selectedCapabilityTier: intelligence.recommendedCapabilityTier,
    selectedTier: selected.tier,
    selectedProvider: selected.provider,
    selectedModel: selected.model,
    reasoningLevel: supportedReasoningLevel(selected, intelligence.reasoningRequirement),
    estimatedCostUsd: estimateCost(selected, intelligence.estimatedInputTokens, maxOutputTokens),
    estimatedLatencyMs: selected.estimatedLatencyMs ?? null,
    escalationIndex: input.escalationIndex ?? 0,
    escalationReasons: intelligence.humanReviewRequired ? ["HUMAN_REVIEW_REQUIRED"] : [],
    routingVersion: ADAPTIVE_ROUTER_VERSION,
    policyVersion: input.tenant?.organizationPolicyVersion ?? ADAPTIVE_POLICY_VERSION,
    modelRegistryVersion: getModelRegistryVersion(environment),
  };
}

export function fallbackRoutingDecision(current: RoutingDecision, input: RouteRequestInput, failureClass: string) {
  if (!riskSafeFailureClasses.has(failureClass)) return null;
  const policy = mergePolicy(input.agent, input.tenant);
  if (policy.mode === "fixed" && policy.fixedModelFallback !== "adaptive") return null;
  try {
    const fallback = routeRequestV2({
      ...input,
      requestId: current.requestId,
      escalationIndex: current.escalationIndex + 1,
      forcedTier: current.selectedTier,
      excludedModels: [...(input.excludedModels ?? []), { provider: current.selectedProvider, model: current.selectedModel }],
    });
    const reasonCodes: RoutingReasonCode[] = [...new Set<RoutingReasonCode>([...fallback.reasonCodes, "ESCALATION_REQUIRED"])];
    const escalationReasons: RoutingReasonCode[] = [...new Set<RoutingReasonCode>([...fallback.escalationReasons, "MODEL_UNAVAILABLE"])];
    return {
      ...fallback,
      reasonCodes,
      escalationReasons,
    } satisfies RoutingDecision;
  } catch {
    return null;
  }
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

export { routeLegacyRequest as routeRequest } from "@/lib/ai/legacy-adaptive-router";
