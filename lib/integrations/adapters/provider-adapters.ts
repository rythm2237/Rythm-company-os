import type {
  AdapterContext,
  AdapterExecutionOutcome,
  IntegrationAdapter,
  PreparedAdapterExecution,
} from "@/lib/integrations/adapters/types";
import {
  executeJsonRequest,
  requireAdapterFields,
  secureProviderUrl,
} from "@/lib/integrations/adapters/http";
import { normalizeExecutionError } from "@/lib/integrations/error-normalization";
import { executeProviderCapability } from "@/lib/integrations/provider-executors";

const DEFAULT_BASE: Record<string, string> = {
  github: "https://api.github.com",
  vercel: "https://api.vercel.com",
  supabase: "https://api.supabase.com",
  cloudflare: "https://api.cloudflare.com/client/v4",
  stripe: "https://api.stripe.com",
  google_workspace: "https://www.googleapis.com",
  microsoft_365: "https://graph.microsoft.com",
};

const HOSTS: Record<string, string[]> = {
  github: ["api.github.com"],
  vercel: ["api.vercel.com"],
  supabase: ["api.supabase.com"],
  cloudflare: ["api.cloudflare.com"],
  stripe: ["api.stripe.com"],
  google_workspace: ["www.googleapis.com", "gmail.googleapis.com"],
  microsoft_365: ["graph.microsoft.com"],
};

const TOOLS: Record<string, string[]> = {
  github: ["github.repository"],
  vercel: ["vercel.deployment"],
  supabase: ["supabase.database"],
  cloudflare: ["cloudflare.dns"],
  stripe: ["stripe.billing"],
  google_workspace: ["google_workspace.calendar", "google_workspace.email"],
  microsoft_365: ["microsoft_365.calendar", "microsoft_365.email"],
};

function reference(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const row = result as Record<string, unknown>;
  for (const key of ["id", "uuid", "sha", "url"])
    if (row[key] != null) return String(row[key]);
  return null;
}

function rollbackReference(
  context: AdapterContext,
  result: unknown,
): Record<string, unknown> | null {
  const input = context.request.input;
  if (context.request.operation === "branch.create")
    return {
      type: "github_branch",
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
    };
  if (context.request.operation === "pull_request.create")
    return {
      type: "github_pull_request",
      owner: input.owner,
      repo: input.repo,
      pullNumber: (result as Record<string, unknown> | null)?.number,
    };
  if (context.request.operation === "calendar.write")
    return {
      type: "calendar_event",
      calendarId: input.calendarId ?? "primary",
      eventId: (result as Record<string, unknown> | null)?.id,
    };
  return null;
}

async function rollback(
  integrationId: string,
  context: AdapterContext,
  ref: Record<string, unknown>,
): Promise<AdapterExecutionOutcome> {
  let url: URL;
  let init: RequestInit;
  const headers = {
    Authorization: `Bearer ${context.credential}`,
    "Content-Type": "application/json",
  };
  if (ref.type === "github_branch") {
    requireAdapterFields(ref, ["owner", "repo", "branch"]);
    url = new URL(
      `/repos/${encodeURIComponent(String(ref.owner))}/${encodeURIComponent(String(ref.repo))}/git/refs/heads/${encodeURIComponent(String(ref.branch))}`,
      context.baseUrl || DEFAULT_BASE.github,
    );
    init = { method: "DELETE", headers };
  } else if (ref.type === "github_pull_request") {
    requireAdapterFields(ref, ["owner", "repo", "pullNumber"]);
    url = new URL(
      `/repos/${encodeURIComponent(String(ref.owner))}/${encodeURIComponent(String(ref.repo))}/pulls/${encodeURIComponent(String(ref.pullNumber))}`,
      context.baseUrl || DEFAULT_BASE.github,
    );
    init = {
      method: "PATCH",
      headers,
      body: JSON.stringify({ state: "closed" }),
    };
  } else if (
    ref.type === "calendar_event" &&
    integrationId === "google_workspace"
  ) {
    requireAdapterFields(ref, ["eventId"]);
    url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(ref.calendarId || "primary"))}/events/${encodeURIComponent(String(ref.eventId))}`,
    );
    init = { method: "DELETE", headers };
  } else if (
    ref.type === "calendar_event" &&
    integrationId === "microsoft_365"
  ) {
    requireAdapterFields(ref, ["eventId"]);
    url = new URL(
      `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(String(ref.eventId))}`,
    );
    init = { method: "DELETE", headers };
  } else
    throw new Error(
      "The recorded provider action has no supported compensating action.",
    );
  await secureProviderUrl(url, HOSTS[integrationId]);
  const rawResult = await executeJsonRequest(
    url,
    init,
    context.request.timeoutMs,
  );
  return {
    rawResult,
    externalReferenceId: reference(rawResult),
    rollbackReference: null,
  };
}

async function verifyRollback(
  integrationId: string,
  context: AdapterContext,
  ref: Record<string, unknown>,
) {
  const headers = {
    Authorization: `Bearer ${context.credential}`,
    "Content-Type": "application/json",
  };
  let url: URL;
  if (ref.type === "github_branch") {
    requireAdapterFields(ref, ["owner", "repo", "branch"]);
    url = new URL(
      `/repos/${encodeURIComponent(String(ref.owner))}/${encodeURIComponent(String(ref.repo))}/git/ref/heads/${encodeURIComponent(String(ref.branch))}`,
      context.baseUrl || DEFAULT_BASE.github,
    );
  } else if (ref.type === "github_pull_request") {
    requireAdapterFields(ref, ["owner", "repo", "pullNumber"]);
    url = new URL(
      `/repos/${encodeURIComponent(String(ref.owner))}/${encodeURIComponent(String(ref.repo))}/pulls/${encodeURIComponent(String(ref.pullNumber))}`,
      context.baseUrl || DEFAULT_BASE.github,
    );
  } else if (
    ref.type === "calendar_event" &&
    integrationId === "google_workspace"
  ) {
    requireAdapterFields(ref, ["eventId"]);
    url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(ref.calendarId || "primary"))}/events/${encodeURIComponent(String(ref.eventId))}`,
    );
  } else if (
    ref.type === "calendar_event" &&
    integrationId === "microsoft_365"
  ) {
    requireAdapterFields(ref, ["eventId"]);
    url = new URL(
      `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(String(ref.eventId))}`,
    );
  } else
    return {
      status: "failed" as const,
      detail: { reason: "unsupported_rollback_reference" },
    };
  await secureProviderUrl(url, HOSTS[integrationId]);
  try {
    const state = await executeJsonRequest(
      url,
      { headers },
      context.request.timeoutMs,
    );
    if (
      ref.type === "github_pull_request" &&
      state &&
      typeof state === "object" &&
      (state as Record<string, unknown>).state === "closed"
    ) {
      return {
        status: "verified" as const,
        detail: { providerState: "closed" },
      };
    }
    return {
      status: "failed" as const,
      detail: { providerResourceStillPresent: true },
    };
  } catch (error) {
    const normalized = normalizeExecutionError(error);
    if (normalized.statusCode === 404 || normalized.statusCode === 410)
      return {
        status: "verified" as const,
        detail: { providerResourcePresent: false },
      };
    throw error;
  }
}

function adapter(integrationId: string): IntegrationAdapter {
  return {
    integrationId,
    version: `${integrationId}-adapter-v2`,
    supportedTools: TOOLS[integrationId],
    validate(context) {
      if (!context.credential)
        throw new Error("Provider credential is unavailable.");
      if (!TOOLS[integrationId].includes(context.request.tool))
        throw new Error("Adapter does not support the requested tool.");
    },
    async prepare(context): Promise<PreparedAdapterExecution> {
      const url = await secureProviderUrl(
        context.baseUrl || DEFAULT_BASE[integrationId],
        HOSTS[integrationId],
      );
      return { url, init: {} };
    },
    async execute(context) {
      const rawResult = await executeProviderCapability({
        providerKey: integrationId,
        capabilityKey: context.request.operation,
        credential: context.credential,
        accountRef: context.accountRef,
        baseUrl: context.baseUrl,
        input: context.request.input,
        idempotencyKey: context.idempotencyKey,
        timeoutMs: context.request.timeoutMs,
      });
      return {
        rawResult,
        externalReferenceId: reference(rawResult),
        rollbackReference: rollbackReference(context, rawResult),
      };
    },
    async verify(_context, outcome) {
      return outcome.rawResult == null
        ? {
            status: "not_verified",
            detail: { reason: "provider_returned_no_result" },
          }
        : {
            status: "verified",
            detail: {
              externalReferencePresent: Boolean(outcome.externalReferenceId),
            },
          };
    },
    normalizeError(error) {
      return normalizeExecutionError(error);
    },
    rollback: (context, ref) => rollback(integrationId, context, ref),
    verifyRollback: (context, ref) =>
      verifyRollback(integrationId, context, ref),
    async healthCheck(context) {
      if (!context.credential)
        return { healthy: false, detail: "credential_missing" };
      if (context.baseUrl)
        await secureProviderUrl(context.baseUrl, HOSTS[integrationId]);
      return { healthy: true, detail: "configuration_valid" };
    },
  };
}

export const INTEGRATION_ADAPTERS: Record<string, IntegrationAdapter> =
  Object.fromEntries(Object.keys(TOOLS).map((key) => [key, adapter(key)]));
export function getIntegrationAdapter(integrationId: string) {
  return INTEGRATION_ADAPTERS[integrationId] ?? null;
}
