import { randomUUID } from "node:crypto";
import { runAgent } from "@/lib/ai/agent-provider";
import { AiGatewayError, normalizeAiGatewayError } from "@/lib/ai/gateway-errors";
import { getProviderEligibility } from "@/lib/ai/provider-eligibility";
import type { AiGatewayRequest, AiGatewayResponse } from "@/lib/ai/gateway-contracts";
import type { RoutingDecision } from "@/lib/ai/routing-types";
import { getRuntimeConfig } from "@/lib/runtime-config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateAiGatewayRequest(request: AiGatewayRequest) {
  if (!request.organizationId.trim()) throw new AiGatewayError("invalid_request", "Organization context is required.");
  if (!UUID.test(request.organizationId)) throw new AiGatewayError("invalid_request", "Organization context must be a valid identifier.");
  if (request.correlationId && !UUID.test(request.correlationId)) throw new AiGatewayError("invalid_request", "Correlation ID must be a valid UUID.");
  if (!request.prompt.trim()) throw new AiGatewayError("invalid_request", "AI request prompt is required.");
  if (!request.systemInstructions.trim()) throw new AiGatewayError("invalid_request", "AI system instructions are required.");
}

/**
 * Canonical RYTHM-owned AI Request Gateway boundary.
 *
 * Phase 1A establishes the contract without migrating existing callers. New AI
 * capabilities must enter here. Routing remains owned by RYTHM; provider
 * adapters are transport implementations and cannot grant policy authority.
 */
export async function executeAiRequest(request: AiGatewayRequest): Promise<AiGatewayResponse> {
  validateAiGatewayRequest(request);
  const correlationId = request.correlationId?.trim() || randomUUID();
  let routingDecision: RoutingDecision | null = null;
  try {
    const outputText = await runAgent({
      provider: request.legacyFallback?.provider,
      model: request.legacyFallback?.model,
      requestId: correlationId,
      systemInstructions: request.systemInstructions,
      prompt: request.prompt,
      conversation: request.conversation,
      attachments: request.attachments,
      mode: request.mode,
      timeoutMs: request.timeoutMs,
      agentPolicy: request.agentPolicy,
      tenantPolicy: request.tenantPolicy,
      conversationLanguage: request.conversationLanguage,
      onRoutingDecision: async (decision) => {
        routingDecision = decision;
        const eligibility = getProviderEligibility(decision.selectedProvider, getRuntimeConfig().environment);
        if (!eligibility.eligible) {
          throw new AiGatewayError(
            "provider_not_eligible",
            `Selected provider is not eligible (${eligibility.reasonCodes.join(",") || "unknown"}).`,
          );
        }
        await request.onRoutingDecision?.(decision);
      },
    });
    if (!routingDecision) throw new AiGatewayError("invalid_response", "Routing completed without a decision record.");
    return { correlationId, outputText, routingDecision };
  } catch (error) {
    throw normalizeAiGatewayError(error);
  }
}
