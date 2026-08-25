import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redactSecretText, safeErrorMetadata } from "@/lib/security/redaction";
import type { RoutingMode } from "@/lib/ai/routing-rollout";
import type { RoutingDecision } from "@/lib/ai/routing-types";
import type { ProviderUsage } from "@/lib/ai/gateway-contracts";

export const AI_ROUTER_VERSION = "adaptive-router-v2.0.0";

export type AiRoutingTelemetryRecord = {
  correlationId: string;
  organizationId: string;
  userId?: string | null;
  agentId?: string | null;
  meetingId?: string | null;
  meetingSessionId?: string | null;
  documentId?: string | null;
  projectId?: string | null;
  requestType: string;
  routingMode: RoutingMode;
  proposed: RoutingDecision | null;
  actual: RoutingDecision | null;
  executionPolicy: "adaptive" | "legacy_fallback" | "fixed_model";
  fallbackUsed: boolean;
  reasonCodes: string[];
  policyVersion: string;
  pricingVersion: string;
  usage?: ProviderUsage;
  actualCostUsd?: number | null;
  providerLatencyMs?: number | null;
  gatewayLatencyMs?: number | null;
  totalLatencyMs?: number | null;
  success: boolean;
  errorClass?: string | null;
};

export type AiRoutingTelemetryWriter = (record: AiRoutingTelemetryRecord) => Promise<void>;

function cleanReasonCodes(values: string[]) {
  return Array.from(new Set(values.map((value) => redactSecretText(value, 100).toLowerCase().replace(/[^a-z0-9_:-]/g, "_")).filter(Boolean))).slice(0, 32);
}

export function telemetryRow(record: AiRoutingTelemetryRecord) {
  const effective = record.actual ?? record.proposed;
  const classification = record.proposed ?? record.actual;
  return {
    request_id: record.correlationId,
    organization_id: record.organizationId,
    user_id: record.userId ?? null,
    agent_id: record.agentId ?? null,
    meeting_id: record.meetingId ?? null,
    meeting_session_id: record.meetingSessionId ?? null,
    document_id: record.documentId ?? null,
    project_id: record.projectId ?? null,
    request_type: record.requestType,
    task_type: classification?.taskType ?? null,
    operation_type: classification?.operation ?? null,
    detected_language: classification?.language ?? null,
    response_language: classification?.responseLanguage ?? null,
    intent: classification?.intent ?? null,
    intent_taxonomy_version: classification?.intentTaxonomyVersion ?? null,
    complexity: classification?.complexity ?? null,
    risk_level: classification?.risk ?? null,
    selected_model_tier: effective?.selectedTier ?? null,
    provider: effective?.selectedProvider ?? null,
    provider_model: effective?.selectedModel ?? null,
    reasoning_level: classification?.reasoningLevel ?? null,
    reasoning_depth: classification?.reasoningDepth ?? null,
    routing_confidence: classification?.confidence ?? null,
    routing_source: classification?.classificationSource ?? null,
    escalation_index: effective?.escalationIndex ?? 0,
    tools_used: classification?.requiredTools ?? [],
    latency_ms: record.totalLatencyMs ?? null,
    input_tokens: record.usage?.inputTokens ?? null,
    cached_tokens: record.usage?.cachedTokens ?? null,
    output_tokens: record.usage?.outputTokens ?? null,
    estimated_cost_usd: record.proposed?.estimatedCostUsd ?? effective?.estimatedCostUsd ?? null,
    execution_status: record.success ? "completed" : "failed",
    validation_result: record.success ? "completed" : "provider_error",
    routing_mode: record.routingMode,
    proposed_model_tier: record.proposed?.selectedTier ?? null,
    proposed_capability_tier: record.proposed?.selectedCapabilityTier ?? null,
    proposed_provider: record.proposed?.selectedProvider ?? null,
    proposed_model: record.proposed?.selectedModel ?? null,
    actual_model_tier: record.actual?.selectedTier ?? null,
    actual_capability_tier: record.actual?.selectedCapabilityTier ?? null,
    actual_provider: record.actual?.selectedProvider ?? null,
    actual_model: record.actual?.selectedModel ?? null,
    execution_policy: record.executionPolicy,
    fixed_model_exception: record.executionPolicy === "fixed_model",
    fallback_used: record.fallbackUsed,
    escalation_triggered: (record.actual?.escalationIndex ?? record.proposed?.escalationIndex ?? 0) > 0,
    reason_codes: cleanReasonCodes(record.reasonCodes),
    actual_cost_usd: record.actualCostUsd ?? null,
    reasoning_tokens: record.usage?.reasoningTokens ?? null,
    provider_latency_ms: record.providerLatencyMs ?? null,
    gateway_latency_ms: record.gatewayLatencyMs ?? null,
    total_latency_ms: record.totalLatencyMs ?? null,
    estimated_latency_ms: record.proposed?.estimatedLatencyMs ?? effective?.estimatedLatencyMs ?? null,
    authorization_signal: classification?.authorizationSignal ?? null,
    human_review_required: classification?.humanReviewRequired ?? false,
    context_requirements: classification?.contextRequirements ?? [],
    required_modalities: classification?.requiredModalities ?? [],
    normalized_error_class: record.errorClass ? redactSecretText(record.errorClass, 80) : null,
    router_version: record.proposed?.routingVersion ?? record.actual?.routingVersion ?? AI_ROUTER_VERSION,
    policy_version: record.policyVersion,
    adaptive_policy_version: classification?.policyVersion ?? null,
    classifier_version: classification?.classifierVersion ?? null,
    model_registry_version: classification?.modelRegistryVersion ?? null,
    pricing_version: record.pricingVersion,
    completed_at: new Date().toISOString(),
  };
}

export const writeRoutingTelemetry: AiRoutingTelemetryWriter = async (record) => {
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Routing telemetry storage is not configured.");
  const row = telemetryRow(record);
  const { error } = await supabase.from("ai_routing_decisions").upsert(row, { onConflict: "request_id,escalation_index" });
  if (error) {
    console.warn("[RYTHM AI Telemetry] persistence failed", { correlationId: record.correlationId, ...safeErrorMetadata(error) });
    throw new Error(`Routing telemetry persistence failed (${redactSecretText(error.code ?? "unknown", 40)}).`);
  }
};
