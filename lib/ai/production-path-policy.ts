import type { OrganizationEntitlement } from "@/lib/auth/organization-context";
import { isOrganizationEntitlementActive } from "@/lib/auth/organization-context";
import type { AgentRoutingPolicy, CostStrategy, ModelTier, RiskLevel, TenantAiPolicy } from "@/lib/ai/routing-types";

const INTERNAL_READ_PERMISSIONS = ["read"];

function allowedTiers(value: unknown): ModelTier[] {
  if (!Array.isArray(value)) return ["luna", "terra", "sol"];
  const tiers = value.filter((item): item is ModelTier => item === "luna" || item === "terra" || item === "sol");
  return tiers.length ? tiers : ["luna", "terra", "sol"];
}

function costStrategy(value: unknown): CostStrategy {
  return value === "economy" || value === "quality" ? value : "balanced";
}

export function buildProductionTenantPolicy(entitlement: OrganizationEntitlement | null): TenantAiPolicy {
  if (!entitlement || !isOrganizationEntitlementActive(entitlement)) {
    throw new Error("The active organization does not have an active AI entitlement.");
  }
  return {
    allowedTiers: allowedTiers(entitlement.allowed_model_tiers),
    aiBudgetLimit: Number(entitlement.ai_budget_limit ?? 0),
    costStrategy: costStrategy(entitlement.preferred_cost_strategy),
    maxContextTokens: entitlement.max_ai_context_tokens,
    advancedReasoningAllowed: entitlement.advanced_reasoning_enabled,
    userPermissions: INTERNAL_READ_PERMISSIONS,
    humanReviewRiskThreshold: "high",
  };
}

export function buildProductionAgentPolicy(input: {
  agentId?: string | null;
  roleTitle: string;
  riskCeiling?: RiskLevel;
  allowedTools?: string[];
  maxCostPerRequest?: number | null;
  maxOutputTokens?: number;
  savedLanguage?: string | null;
  costStrategy?: CostStrategy;
}): AgentRoutingPolicy {
  const maxCost = input.maxCostPerRequest == null ? undefined : Math.max(0, Number(input.maxCostPerRequest));
  return {
    ...(input.agentId ? { agentId: input.agentId } : {}),
    roleTitle: input.roleTitle,
    allowedTools: input.allowedTools ?? [],
    permissions: INTERNAL_READ_PERMISSIONS,
    riskCeiling: input.riskCeiling ?? "high",
    savedLanguage: input.savedLanguage ?? null,
    modelPolicy: {
      mode: "adaptive",
      allowEscalation: true,
      maxEscalations: 1,
      maxRetries: 0,
      costStrategy: input.costStrategy ?? "balanced",
      ...(input.maxOutputTokens == null ? {} : { maxTokens: Math.max(1, Math.min(16_000, input.maxOutputTokens)) }),
      ...(maxCost == null ? {} : { maxCostPerRequest: maxCost }),
    },
  };
}

export function effectiveRequestCostLimit(entitlement: OrganizationEntitlement, remainingOperationalBudget?: number | null) {
  const entitlementLimit = entitlement.max_ai_cost_per_request == null ? null : Number(entitlement.max_ai_cost_per_request);
  const operationalLimit = remainingOperationalBudget == null ? null : Math.max(0, Number(remainingOperationalBudget));
  if (entitlementLimit == null) return operationalLimit;
  if (operationalLimit == null) return entitlementLimit;
  return Math.min(entitlementLimit, operationalLimit);
}
