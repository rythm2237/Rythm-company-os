import { redactSecretText } from "@/lib/security/redaction";

export type AiGatewayErrorCode =
  | "invalid_request"
  | "policy_denied"
  | "provider_not_eligible"
  | "provider_not_configured"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable"
  | "invalid_response"
  | "unknown";

export class AiGatewayError extends Error {
  readonly code: AiGatewayErrorCode;
  readonly retryable: boolean;
  readonly safeDetail: string;

  constructor(code: AiGatewayErrorCode, safeDetail: string, retryable = false, options?: { cause?: unknown }) {
    super(redactSecretText(safeDetail), options);
    this.name = "AiGatewayError";
    this.code = code;
    this.retryable = retryable;
    this.safeDetail = redactSecretText(safeDetail);
  }
}

export function normalizeAiGatewayError(error: unknown): AiGatewayError {
  if (error instanceof AiGatewayError) return error;
  const detail = redactSecretText(error);
  if (/timed?\s*out|aborterror/i.test(detail)) return new AiGatewayError("timeout", "The AI provider request timed out.", true, { cause: error });
  if (/\b429\b|rate.?limit/i.test(detail)) return new AiGatewayError("rate_limited", "The AI provider rate limit was reached.", true, { cause: error });
  if (/not configured|missing.*(?:key|credential)/i.test(detail)) return new AiGatewayError("provider_not_configured", "The selected AI provider is not configured.", false, { cause: error });
  if (/empty .*response|invalid structured|invalid .*output/i.test(detail)) return new AiGatewayError("invalid_response", "The AI provider returned an invalid response.", true, { cause: error });
  if (/\b(?:502|503|504)\b|temporarily unavailable|provider unavailable/i.test(detail)) return new AiGatewayError("provider_unavailable", "The AI provider is temporarily unavailable.", true, { cause: error });
  if (/restricted handling|blocked this request|permission|entitlement|budget/i.test(detail)) return new AiGatewayError("policy_denied", detail, false, { cause: error });
  return new AiGatewayError("unknown", "The AI request failed.", false, { cause: error });
}
