import { randomUUID } from "node:crypto";
import { runAgentDetailed, type RunAgentInput, type RunAgentResult } from "@/lib/ai/agent-provider";
import { AiGatewayError, normalizeAiGatewayError } from "@/lib/ai/gateway-errors";
import { getProviderEligibility } from "@/lib/ai/provider-eligibility";
import type { AiGatewayRequest, AiGatewayResponse } from "@/lib/ai/gateway-contracts";
import type { RoutingDecision } from "@/lib/ai/routing-types";
import { routeRequestV2, RoutingPolicyError } from "@/lib/ai/adaptive-router";
import { routeLegacyRequest } from "@/lib/ai/legacy-adaptive-router";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { loadRoutingRollout } from "@/lib/ai/routing-rollout-store";
import type { ResolvedRoutingRollout } from "@/lib/ai/routing-rollout";
import { AI_PRICING_VERSION, calculateActualCostUsd } from "@/lib/ai/routing-cost";
import { AI_ROUTER_VERSION, writeRoutingTelemetry, type AiRoutingTelemetryRecord, type AiRoutingTelemetryWriter } from "@/lib/ai/routing-telemetry";
import { safeErrorMetadata } from "@/lib/security/redaction";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AiGatewayDependencies = {
  loadRollout?: (input: { organizationId: string; environment: string; feature: AiGatewayRequest["feature"]; environmentKillSwitch?: string | boolean | null }) => Promise<ResolvedRoutingRollout>;
  evaluateRouting?: typeof routeRequestV2;
  execute?: (input: RunAgentInput) => Promise<RunAgentResult>;
  telemetryWriter?: AiRoutingTelemetryWriter;
  now?: () => number;
};

export function validateAiGatewayRequest(request: AiGatewayRequest) {
  if (!request.organizationId.trim()) throw new AiGatewayError("invalid_request", "Organization context is required.");
  if (!UUID.test(request.organizationId)) throw new AiGatewayError("invalid_request", "Organization context must be a valid identifier.");
  if (request.correlationId && !UUID.test(request.correlationId)) throw new AiGatewayError("invalid_request", "Correlation ID must be a valid UUID.");
  const identifiers = [
    ["Actor user", request.actor.userId],
    ["Actor agent", request.actor.agentId],
    ["Meeting", request.context?.meetingId],
    ["Meeting session", request.context?.meetingSessionId],
    ["Document", request.context?.documentId],
    ["Project", request.context?.projectId],
  ] as const;
  for (const [label, value] of identifiers) {
    if (value && !UUID.test(value)) throw new AiGatewayError("invalid_request", `${label} context must be a valid identifier.`);
  }
  if (!request.prompt.trim()) throw new AiGatewayError("invalid_request", "AI request prompt is required.");
  if (!request.systemInstructions.trim()) throw new AiGatewayError("invalid_request", "AI system instructions are required.");
  if (request.maxOutputTokens != null && (!Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > 16_000)) {
    throw new AiGatewayError("invalid_request", "AI max output tokens must be an integer between 1 and 16000.");
  }
}

function decisionReasonCodes(decision: RoutingDecision | null) {
  if (!decision) return [];
  return [
    ...decision.reasonCodes,
    ...decision.escalationReasons,
    ...(decision.escalationIndex > 0 ? ["ESCALATION_REQUIRED"] : []),
  ];
}

function legacyCompatibilityDecision(request: AiGatewayRequest, correlationId: string): RoutingDecision | null {
  if (!request.legacyFallback) return null;
  const classified = routeLegacyRequest({
    prompt: request.prompt,
    requestId: correlationId,
    requestType: request.feature,
    conversationLanguage: request.conversationLanguage,
    attachments: request.attachments?.map(({ mimeType }) => ({ mimeType })),
    contextCharacterCount: request.conversation?.length ?? 0,
    agent: request.agentPolicy,
    tenant: request.tenantPolicy,
  });
  return {
    ...classified,
    selectedCapabilityTier: "fallback",
    selectedProvider: request.legacyFallback.provider,
    selectedModel: request.legacyFallback.model,
    estimatedCostUsd: null,
    reasonCodes: [...new Set([...classified.reasonCodes, "LEGACY_FALLBACK" as const])],
    reasonSummary: "Gateway compatibility model selected by off/shadow rollout mode",
    routingVersion: "phase1d-legacy-compatibility",
    policyVersion: "phase1d-legacy-compatibility",
  };
}

async function persistTelemetry(writer: AiRoutingTelemetryWriter, record: AiRoutingTelemetryRecord, policy: AiGatewayRequest["telemetryPolicy"]) {
  try {
    await writer(record);
  } catch (error) {
    console.warn("[RYTHM AI Gateway] operational telemetry unavailable", { correlationId: record.correlationId, ...safeErrorMetadata(error) });
    if (policy === "required") {
      throw new AiGatewayError("policy_denied", "Governance-required AI telemetry could not be persisted.", false, { cause: error });
    }
  }
}

/**
 * Canonical RYTHM-owned AI Request Gateway.
 *
 * Phase 1B adds deterministic off/shadow/enforced control and durable,
 * content-minimized telemetry. Phase 1C evaluates Request Intelligence v2
 * only through this boundary. Shadow issues no second provider request and
 * the v1 compatibility path remains authoritative until Phase 1D migration.
 */
export async function executeAiRequest(request: AiGatewayRequest, dependencies: AiGatewayDependencies = {}): Promise<AiGatewayResponse> {
  validateAiGatewayRequest(request);
  const runtime = getRuntimeConfig();
  const correlationId = request.correlationId?.trim() || randomUUID();
  const now = dependencies.now ?? (() => performance.now());
  const started = now();
  const loadRollout = dependencies.loadRollout ?? loadRoutingRollout;
  const evaluate = dependencies.evaluateRouting ?? routeRequestV2;
  const execute = dependencies.execute ?? runAgentDetailed;
  const telemetryWriter = dependencies.telemetryWriter ?? writeRoutingTelemetry;
  const rollout = await loadRollout({
    organizationId: request.organizationId,
    environment: runtime.environment,
    feature: request.feature,
    environmentKillSwitch: process.env.RYTHM_AI_ROUTING_KILL_SWITCH,
  });

  const routeInput = {
    prompt: request.prompt,
    requestId: correlationId,
    requestType: request.feature,
    conversationLanguage: request.conversationLanguage,
    attachments: request.attachments?.map(({ mimeType }) => ({ mimeType })),
    contextCharacterCount: request.conversation?.length ?? 0,
    agent: request.agentPolicy,
    tenant: request.tenantPolicy,
    runtimeEnvironment: runtime.environment,
  };
  let proposed: RoutingDecision | null = null;
  let actual: RoutingDecision | null = null;
  let compatibility: RoutingDecision | null = null;
  let preExecutionError: AiGatewayError | null = null;
  const reasonCodes = [...rollout.reasonCodes];

  if (rollout.mode !== "off") {
    try {
      proposed = evaluate(routeInput);
      reasonCodes.push(...decisionReasonCodes(proposed));
      const eligibility = getProviderEligibility(proposed.selectedProvider, runtime.environment);
      if (!eligibility.eligible) {
        reasonCodes.push(...eligibility.reasonCodes);
        if (rollout.mode === "enforced") {
          preExecutionError = new AiGatewayError("provider_not_eligible", `Selected provider is not eligible (${eligibility.reasonCodes.join(",") || "unknown"}).`);
        }
      }
    } catch (error) {
      if (error instanceof RoutingPolicyError) reasonCodes.push(...error.reasonCodes);
      if (rollout.mode === "enforced") preExecutionError = normalizeAiGatewayError(error);
      else {
        reasonCodes.push("shadow_evaluation_failed");
        proposed = null;
      }
    }
  }
  if (rollout.mode !== "enforced" && request.legacyFallback) {
    try {
      compatibility = legacyCompatibilityDecision(request, correlationId);
    } catch (error) {
      preExecutionError = normalizeAiGatewayError(error);
      reasonCodes.push("legacy_compatibility_classification_failed");
    }
  }

  const routingCompleted = now();
  try {
    if (preExecutionError) throw preExecutionError;
    const result = await execute({
      provider: request.legacyFallback?.provider,
      model: request.legacyFallback?.model,
      requestId: correlationId,
      systemInstructions: request.systemInstructions,
      prompt: request.prompt,
      conversation: request.conversation,
      attachments: request.attachments,
      attachmentFailurePolicy: request.attachmentFailurePolicy,
      mode: request.mode,
      maxOutputTokens: request.maxOutputTokens,
      timeoutMs: request.timeoutMs,
      agentPolicy: request.agentPolicy,
      tenantPolicy: request.tenantPolicy,
      conversationLanguage: request.conversationLanguage,
      authoritativeDecision: rollout.mode === "enforced" ? proposed ?? undefined : compatibility ?? undefined,
      executionPolicyOverride: compatibility ? "legacy_fallback" : undefined,
      onRoutingDecision: async (decision) => {
        actual = decision;
        const eligibility = getProviderEligibility(decision.selectedProvider, runtime.environment);
        if (!eligibility.eligible) {
          reasonCodes.push(...eligibility.reasonCodes);
          throw new AiGatewayError("provider_not_eligible", `Selected provider is not eligible (${eligibility.reasonCodes.join(",") || "unknown"}).`);
        }
        await request.onRoutingDecision?.(decision);
      },
    });
    actual = result.actualModel && result.actualModel !== result.routingDecision.selectedModel
      ? { ...result.routingDecision, selectedModel: result.actualModel }
      : result.routingDecision;
    if (result.fallbackUsed) reasonCodes.push("legacy_model_fallback");
    if (result.executionPolicy === "fixed_model") reasonCodes.push("fixed_model_exception");
    const totalLatencyMs = Math.max(0, Math.round(now() - started));
    const gatewayLatencyMs = Math.max(0, totalLatencyMs - result.providerLatencyMs);
    const actualCostUsd = calculateActualCostUsd(actual.selectedProvider, actual.selectedModel, result.usage);
    await persistTelemetry(telemetryWriter, {
      correlationId,
      organizationId: request.organizationId,
      userId: request.actor.userId,
      agentId: request.actor.agentId ?? request.agentPolicy?.agentId,
      meetingId: request.context?.meetingId,
      meetingSessionId: request.context?.meetingSessionId,
      documentId: request.context?.documentId,
      projectId: request.context?.projectId,
      requestType: request.feature,
      routingMode: rollout.mode,
      proposed,
      actual,
      executionPolicy: result.executionPolicy,
      fallbackUsed: result.fallbackUsed,
      reasonCodes,
      policyVersion: rollout.policyVersion,
      pricingVersion: AI_PRICING_VERSION,
      usage: result.usage,
      actualCostUsd,
      providerLatencyMs: result.providerLatencyMs,
      gatewayLatencyMs,
      totalLatencyMs,
      success: true,
    }, request.telemetryPolicy);
    return {
      correlationId,
      outputText: result.outputText,
      routingDecision: actual,
      proposedRoutingDecision: proposed,
      routingMode: rollout.mode,
      executionPolicy: result.executionPolicy,
      fallbackUsed: result.fallbackUsed,
      usage: result.usage,
      actualCostUsd,
      providerLatencyMs: result.providerLatencyMs,
      gatewayLatencyMs,
      totalLatencyMs,
    };
  } catch (error) {
    const normalized = normalizeAiGatewayError(error);
    const totalLatencyMs = Math.max(0, Math.round(now() - started));
    await persistTelemetry(telemetryWriter, {
        correlationId,
        organizationId: request.organizationId,
        userId: request.actor.userId,
        agentId: request.actor.agentId ?? request.agentPolicy?.agentId,
        meetingId: request.context?.meetingId,
        meetingSessionId: request.context?.meetingSessionId,
        documentId: request.context?.documentId,
        projectId: request.context?.projectId,
        requestType: request.feature,
        routingMode: rollout.mode,
        proposed,
        actual,
        executionPolicy: rollout.mode !== "enforced" && request.legacyFallback ? "legacy_fallback" : request.agentPolicy?.modelPolicy?.mode === "fixed" ? "fixed_model" : "adaptive",
        fallbackUsed: false,
        reasonCodes: [...reasonCodes, "execution_failed"],
        policyVersion: rollout.policyVersion,
        pricingVersion: AI_PRICING_VERSION,
        gatewayLatencyMs: Math.max(0, Math.round(routingCompleted - started)),
        totalLatencyMs,
        success: false,
        errorClass: normalized.code,
    }, request.telemetryPolicy);
    throw normalized;
  }
}

export { AI_ROUTER_VERSION };
