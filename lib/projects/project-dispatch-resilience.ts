/**
 * W13: Retry only explicitly idempotent maintenance calls.
 * Never wrap the dispatcher, a claim, a task, an approval, or an external action here.
 * Replaying a timed-out write can duplicate a real-world side effect.
 */
type RpcResult = { error?: unknown; status?: number };

export function isTransientUpstreamFailure(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const error = input as { status?: number | string; code?: string; message?: string };
  const status = Number(error.status);
  if ([429, 502, 503, 504].includes(status)) return true;
  const code = String(error.code ?? "").toUpperCase();
  // PostgREST connection errors, connection exceptions, and PG restart/overload.
  if (["PGRST000", "PGRST002", "57P01", "57P02", "57P03", "53300"].includes(code)) return true;
  if (code.startsWith("08") && /^[0-9A-Z]{5}$/.test(code)) return true;
  return /(?:fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|network request failed)/i.test(String(error.message ?? ""));
}

export async function retryIdempotentRpc<T extends RpcResult>(
  operation: () => PromiseLike<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    wait?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number) => void;
  } = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(3, options.maxAttempts ?? 3));
  const baseDelayMs = Math.max(0, Math.min(500, options.baseDelayMs ?? 120));
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();
      if (!result.error || attempt === maxAttempts) return result;
      const candidate = typeof result.error === "object" && result.error !== null
        ? { ...(result.error as object), status: (result.error as { status?: number }).status ?? result.status }
        : { status: result.status };
      if (!isTransientUpstreamFailure(candidate)) return result;
    } catch (error) {
      if (!isTransientUpstreamFailure(error) || attempt === maxAttempts) throw error;
    }
    options.onRetry?.(attempt);
    await wait(baseDelayMs * 2 ** (attempt - 1));
  }
  throw new Error("Unreachable retry state");
}

export type DispatchHealth = "healthy" | "degraded" | "failed";

export function dispatchDiagnostic(traceId: string, step: string, code: string) {
  // Fixed labels and generated trace identifiers only; never serialize provider errors,
  // payloads, tokens, organization IDs, customer input or stack traces.
  return JSON.stringify({ traceId, step, errorCode: code });
}
