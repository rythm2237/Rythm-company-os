import type { RetryPolicy } from "@/lib/integrations/contracts";
import { normalizeExecutionError } from "@/lib/integrations/error-normalization";

export async function executeWithRetry<T>(input: {
  policy: RetryPolicy;
  idempotencySupported: boolean;
  action: (attempt: number) => Promise<T>;
  wait?: (milliseconds: number) => Promise<void>;
  onAttempt?: (attempt: number) => Promise<void> | void;
}) {
  const wait =
    input.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const maxAttempts = Math.max(1, Math.min(5, input.policy.maxAttempts));
  let last: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await input.onAttempt?.(attempt);
    try {
      return { value: await input.action(attempt), attempts: attempt };
    } catch (error) {
      last = error;
      const normalized = normalizeExecutionError(error);
      const safeToRetry =
        normalized.retryable &&
        (!normalized.uncertainCompletion || input.idempotencySupported);
      if (attempt >= maxAttempts || !safeToRetry || !input.idempotencySupported)
        throw error;
      const delay = Math.min(
        input.policy.maxDelayMs,
        input.policy.baseDelayMs * 2 ** (attempt - 1),
      );
      await wait(delay);
    }
  }
  throw last;
}
