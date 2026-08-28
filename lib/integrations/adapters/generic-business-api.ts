import type {
  AdapterContext,
  AdapterExecutionOutcome,
  IntegrationAdapter,
  PreparedAdapterExecution,
} from "@/lib/integrations/adapters/types";
import { executeJsonRequest } from "@/lib/integrations/adapters/http";
import {
  IntegrationExecutionError,
  normalizeExecutionError,
} from "@/lib/integrations/error-normalization";
import { validatePublicHttpUrl } from "@/lib/security/public-url";

const TOOL_ID = "generic_business_api.request";
const OPERATIONS = new Set(["api.read", "api.write", "webhook.send"]);
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);

function baseUrl(context: Pick<AdapterContext, "baseUrl">) {
  if (!context.baseUrl)
    throw new IntegrationExecutionError(
      "Generic Business API base URL is not configured.",
      "validation_error",
    );
  return new URL(context.baseUrl);
}

function safeRelativePath(input: Record<string, unknown>) {
  const path = String(input.path ?? "/");
  if (
    path.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(path) ||
    path.includes("\\")
  ) {
    throw new IntegrationExecutionError(
      "Generic Business API target must be a relative path on the configured origin.",
      "validation_error",
    );
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function appendQuery(url: URL, query: unknown) {
  if (query == null) return;
  if (!query || typeof query !== "object" || Array.isArray(query))
    throw new IntegrationExecutionError(
      "Generic Business API query must be an object.",
      "validation_error",
    );
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value == null) continue;
    if (!["string", "number", "boolean"].includes(typeof value))
      throw new IntegrationExecutionError(
        "Generic Business API query values must be scalar.",
        "validation_error",
      );
    url.searchParams.set(key, String(value));
  }
}

async function targetUrl(context: AdapterContext) {
  const base = await validatePublicHttpUrl(baseUrl(context));
  const target = new URL(safeRelativePath(context.request.input), base);
  appendQuery(target, context.request.input.query);

  if (target.origin !== base.origin)
    throw new IntegrationExecutionError(
      "Generic Business API target cannot leave the configured origin.",
      "validation_error",
    );

  return validatePublicHttpUrl(target, { allowedHosts: [base.hostname] });
}

function requestInit(context: AdapterContext): RequestInit {
  const operation = context.request.operation;
  const input = context.request.input;
  let method = "GET";

  if (operation === "api.write") {
    method = String(input.method ?? "POST").toUpperCase();
    if (!WRITE_METHODS.has(method))
      throw new IntegrationExecutionError(
        "Generic Business API writes only support POST, PUT, or PATCH.",
        "validation_error",
      );
  } else if (operation === "webhook.send") {
    method = "POST";
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${context.credential}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (method !== "GET") headers["Idempotency-Key"] = context.idempotencyKey;

  return {
    method,
    headers,
    ...(method !== "GET" ? { body: JSON.stringify(input.body ?? {}) } : {}),
  };
}

export const GENERIC_BUSINESS_API_ADAPTER: IntegrationAdapter = {
  integrationId: "generic_business_api",
  version: "generic-business-api-v1",
  supportedTools: [TOOL_ID],

  validate(context) {
    if (!context.credential)
      throw new IntegrationExecutionError(
        "Generic Business API credential is unavailable.",
        "authentication_error",
      );
    if (context.request.tool !== TOOL_ID)
      throw new IntegrationExecutionError(
        "Generic Business API adapter does not support the requested tool.",
        "validation_error",
      );
    if (!OPERATIONS.has(context.request.operation))
      throw new IntegrationExecutionError(
        "Generic Business API operation is not supported.",
        "validation_error",
      );
    if (context.request.operation === "file.exchange")
      throw new IntegrationExecutionError(
        "Generic file exchange is not enabled until a bounded file contract is released.",
        "policy_denied",
      );
  },

  async prepare(context): Promise<PreparedAdapterExecution> {
    return { url: await targetUrl(context), init: requestInit(context) };
  },

  async execute(context, prepared): Promise<AdapterExecutionOutcome> {
    const rawResult = await executeJsonRequest(
      prepared.url,
      prepared.init,
      context.request.timeoutMs,
    );
    const row = rawResult && typeof rawResult === "object"
      ? (rawResult as Record<string, unknown>)
      : null;
    return {
      rawResult,
      externalReferenceId:
        row?.id != null ? String(row.id) : row?.url != null ? String(row.url) : null,
      rollbackReference: null,
    };
  },

  async verify(_context, outcome) {
    return {
      status: "verified",
      detail: {
        responseReceived: true,
        externalReferencePresent: Boolean(outcome.externalReferenceId),
      },
    };
  },

  normalizeError(error) {
    return normalizeExecutionError(error);
  },

  async healthCheck(context) {
    if (!context.credential)
      return { healthy: false, detail: "credential_missing" };
    if (!context.baseUrl)
      return { healthy: false, detail: "base_url_missing" };
    await validatePublicHttpUrl(new URL(context.baseUrl));
    return { healthy: true, detail: "configuration_valid" };
  },
};
