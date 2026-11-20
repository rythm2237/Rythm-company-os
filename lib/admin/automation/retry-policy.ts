/**
 * W14: bounded retry policy for platform automation. This file has no provider or database
 * imports so it can be tested with disposable fixtures and never opens real network calls.
 */
export type AutomationFailureCode =
  | "PROVIDER_AUTH_REQUIRED"
  | "PROVIDER_CONFIGURATION_REQUIRED"
  | "RATE_LIMITED"
  | "TRANSIENT_TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "NETWORK_UNAVAILABLE"
  | "DATABASE_UNAVAILABLE"
  | "UNEXPECTED_FAILURE";

const RETRY_SAFE_HANDLERS = new Set([
  "system_health",
  "seo_site_health",
  "ai_usage_cost",
  "security_health",
]);

export function classifyAutomationFailure(error: unknown): AutomationFailureCode {
  const message = error instanceof Error ? error.message : "";
  if (/reconnect|not connected|authorization was revoked|invalid.grant|oauth|credential.*invalid|401|403|forbidden|unauthoriz/i.test(message)) {
    return "PROVIDER_AUTH_REQUIRED";
  }
  if (/not configured|configuration required|service-role environment is unavailable|missing api key/i.test(message)) {
    return "PROVIDER_CONFIGURATION_REQUIRED";
  }
  if (/429|quota|rate.limit/i.test(message)) return "RATE_LIMITED";
  if (/abort|timeout|timed out|etimedout/i.test(message)) return "TRANSIENT_TIMEOUT";
  if (/\b(500|502|503|504)\b|upstream|bad gateway|service unavailable/i.test(message)) return "UPSTREAM_UNAVAILABLE";
  if (/fetch failed|network|enotfound|econnreset|econnrefused|dns/i.test(message)) return "NETWORK_UNAVAILABLE";
  if (/database|postgres|connection pool|pgrst/i.test(message)) return "DATABASE_UNAVAILABLE";
  return "UNEXPECTED_FAILURE";
}

export function mayRetryAutomationFailure(handlerKey: string, code: AutomationFailureCode) {
  return RETRY_SAFE_HANDLERS.has(handlerKey) &&
    (code === "TRANSIENT_TIMEOUT" || code === "UPSTREAM_UNAVAILABLE" || code === "NETWORK_UNAVAILABLE" || code === "DATABASE_UNAVAILABLE");
}

export class AutomationRetryExhausted extends Error {
  constructor(
    readonly failureCode: AutomationFailureCode,
    readonly attempts: number,
  ) {
    super(failureCode);
    this.name = "AutomationRetryExhausted";
  }
}

type RetryOptions = {
  handlerKey: string;
  maxRetries: number;
  onAttempt?: (attempt: number) => Promise<void>;
  wait?: (ms: number) => Promise<void>;
};

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function executeWithSafeRetry<T>(
  invoke: (attempt: number) => Promise<T>,
  { handlerKey, maxRetries, onAttempt, wait = defaultWait }: RetryOptions,
): Promise<{ value: T; attempts: number }> {
  // 1 initial attempt + at most 2 retries, regardless of database configuration.
  const retryLimit = Number.isFinite(maxRetries) ? Math.min(2, Math.max(0, Math.floor(maxRetries))) : 0;
  for (let attempt = 1; attempt <= retryLimit + 1; attempt++) {
    // State persistence errors must not cause a handler to execute twice.
    if (onAttempt) await onAttempt(attempt);
    try {
      return { value: await invoke(attempt), attempts: attempt };
    } catch (error) {
      const failureCode = classifyAutomationFailure(error);
      if (attempt > retryLimit || !mayRetryAutomationFailure(handlerKey, failureCode)) {
        throw new AutomationRetryExhausted(failureCode, attempt);
      }
      await wait(200 * 2 ** (attempt - 1));
    }
  }
  throw new AutomationRetryExhausted("UNEXPECTED_FAILURE", retryLimit + 1);
}
