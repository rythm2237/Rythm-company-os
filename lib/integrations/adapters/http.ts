import { fetchPublicResource, validatePublicHttpUrl } from "@/lib/security/public-url";
import {
  IntegrationExecutionError,
  normalizeExecutionError,
  normalizeHttpError,
} from "@/lib/integrations/error-normalization";

export async function secureProviderUrl(
  input: string | URL,
  allowedHosts: string[],
) {
  const url = input instanceof URL ? new URL(input) : new URL(input);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!allowedHosts.map((host) => host.toLowerCase()).includes(hostname)) {
    throw new IntegrationExecutionError(
      "Provider host is not allowlisted.",
      "validation_error",
    );
  }
  return validatePublicHttpUrl(url, { allowedHosts });
}

async function executeRequest(
  url: URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(500, Math.min(timeoutMs, 60_000)),
  );
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    const text = await response.text();
    return { response, text };
  } catch (error) {
    if (error instanceof IntegrationExecutionError) throw error;
    const normalized = normalizeExecutionError(error);
    throw new IntegrationExecutionError(
      normalized.sanitizedError,
      normalized.errorClass,
      normalized.retryable,
      normalized.uncertainCompletion,
      normalized.statusCode ?? undefined,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeTextRequest(
  url: URL,
  init: RequestInit,
  timeoutMs: number,
) {
  return executeRequest(url, init, timeoutMs);
}

export async function executePublicTextRequest(
  url: string | URL,
  allowedHosts: string[],
  init: Pick<RequestInit, "headers">,
  timeoutMs: number,
) {
  try {
    const { response, bytes } = await fetchPublicResource(url, {
      allowedHosts,
      headers: init.headers,
      timeoutMs,
      maxRedirects: 4,
      maxBytes: 1_500_000,
    });
    return { response, text: new TextDecoder().decode(bytes) };
  } catch (error) {
    if (error instanceof IntegrationExecutionError) throw error;
    const normalized = normalizeExecutionError(error);
    throw new IntegrationExecutionError(
      normalized.sanitizedError,
      normalized.errorClass,
      normalized.retryable,
      normalized.uncertainCompletion,
      normalized.statusCode ?? undefined,
    );
  }
}

export async function executeJsonRequest(
  url: URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const { response, text } = await executeRequest(url, init, timeoutMs);
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 2_000);
  }
  if (!response.ok)
    throw normalizeHttpError(
      response.status,
      response.headers.get("retry-after"),
    );
  return body;
}

export function requireAdapterFields(
  input: Record<string, unknown>,
  fields: string[],
) {
  for (const field of fields)
    if (input[field] == null || input[field] === "")
      throw new IntegrationExecutionError(
        `Missing provider input: ${field}`,
        "validation_error",
      );
}

export function resultReference(
  result: unknown,
  candidates = ["id", "uuid", "sha", "url"],
) {
  if (!result || typeof result !== "object") return null;
  const row = result as Record<string, unknown>;
  for (const candidate of candidates)
    if (row[candidate] != null) return String(row[candidate]);
  return null;
}
