export type NormalizedExecutionErrorClass =
  | "authentication_error"
  | "authorization_error"
  | "scope_missing"
  | "validation_error"
  | "timeout"
  | "rate_limit"
  | "provider_unavailable"
  | "network_error"
  | "conflict"
  | "duplicate"
  | "approval_required"
  | "approval_rejected"
  | "policy_denied"
  | "execution_failed"
  | "verification_failed"
  | "rollback_failed"
  | "unknown";

export class IntegrationExecutionError extends Error {
  constructor(
    message: string,
    readonly errorClass: NormalizedExecutionErrorClass,
    readonly retryable = false,
    readonly uncertainCompletion = false,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "IntegrationExecutionError";
  }
}

// Persist stable classifications only: provider exceptions and SQL failures may
// contain arbitrary customer text even after token/credential redaction.
export function normalizeExecutionError(error: unknown) {
  if (error instanceof IntegrationExecutionError) {
    return {
      errorClass: error.errorClass,
      retryable: error.retryable,
      uncertainCompletion: error.uncertainCompletion,
      statusCode: error.statusCode ?? null,
      sanitizedError: `EXECUTION_${error.errorClass.toUpperCase()}`,
    };
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  if (/abort|timeout|timed out/.test(lower))
    return {
      errorClass: "timeout" as const,
      retryable: true,
      uncertainCompletion: true,
      statusCode: null,
      sanitizedError: "EXECUTION_TIMEOUT",
    };
  if (/network|fetch failed|econnreset|enotfound|socket/.test(lower))
    return {
      errorClass: "network_error" as const,
      retryable: true,
      uncertainCompletion: true,
      statusCode: null,
      sanitizedError: "EXECUTION_NETWORK_ERROR",
    };
  if (/validation|missing provider input|invalid/.test(lower))
    return {
      errorClass: "validation_error" as const,
      retryable: false,
      uncertainCompletion: false,
      statusCode: null,
      sanitizedError: "EXECUTION_VALIDATION_ERROR",
    };
  return {
    errorClass: "unknown" as const,
    retryable: false,
    uncertainCompletion: false,
    statusCode: null,
    sanitizedError: "EXECUTION_UNKNOWN",
  };
}

export function normalizeHttpError(status: number, retryAfter?: string | null) {
  if (status === 401)
    return new IntegrationExecutionError(
      "Provider authentication failed.",
      "authentication_error",
      false,
      false,
      status,
    );
  if (status === 403)
    return new IntegrationExecutionError(
      "Provider authorization or scope check failed.",
      "authorization_error",
      false,
      false,
      status,
    );
  if (status === 409)
    return new IntegrationExecutionError(
      "Provider reported a conflict or duplicate.",
      "conflict",
      false,
      false,
      status,
    );
  if (status === 429)
    return new IntegrationExecutionError(
      `Provider rate limit reached${retryAfter ? `; retry-after ${retryAfter}` : ""}.`,
      "rate_limit",
      true,
      false,
      status,
    );
  if (status >= 500)
    return new IntegrationExecutionError(
      "Provider is temporarily unavailable.",
      "provider_unavailable",
      true,
      true,
      status,
    );
  return new IntegrationExecutionError(
    `Provider rejected the request (${status}).`,
    "execution_failed",
    false,
    false,
    status,
  );
}
