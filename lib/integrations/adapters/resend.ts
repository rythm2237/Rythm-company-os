import type {
  AdapterContext,
  IntegrationAdapter,
} from "@/lib/integrations/adapters/types";
import {
  executeJsonRequest,
  requireAdapterFields,
  secureProviderUrl,
} from "@/lib/integrations/adapters/http";
import { normalizeExecutionError } from "@/lib/integrations/error-normalization";

const HOSTS = ["api.resend.com"];

export const resendAdapter: IntegrationAdapter = {
  integrationId: "resend",
  version: "resend-adapter-v2",
  supportedTools: ["resend.email"],
  validate(context) {
    if (!context.credential)
      throw new Error("Resend credential is unavailable.");
    if (context.request.operation !== "email.send")
      throw new Error("Resend adapter only supports email.send.");
    requireAdapterFields(context.request.input, [
      "from",
      "to",
      "subject",
      "text",
    ]);
  },
  async prepare(context) {
    const url = await secureProviderUrl(
      new URL("/emails", context.baseUrl || "https://api.resend.com"),
      HOSTS,
    );
    return {
      url,
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.credential}`,
          "Content-Type": "application/json",
          "Idempotency-Key": context.idempotencyKey,
        },
        body: JSON.stringify({
          from: context.request.input.from,
          to: context.request.input.to,
          subject: context.request.input.subject,
          text: context.request.input.text,
          ...(context.request.input.headers
            ? { headers: context.request.input.headers }
            : {}),
        }),
      },
    };
  },
  async execute(context, prepared) {
    const rawResult = await executeJsonRequest(
      prepared.url,
      prepared.init,
      context.request.timeoutMs,
    );
    const id =
      rawResult && typeof rawResult === "object"
        ? String((rawResult as Record<string, unknown>).id ?? "")
        : "";
    return {
      rawResult,
      externalReferenceId: id || null,
      rollbackReference: null,
    };
  },
  async verify(_context, outcome) {
    return outcome.externalReferenceId
      ? { status: "verified", detail: { providerAccepted: true } }
      : { status: "failed", detail: { providerAccepted: false } };
  },
  normalizeError(error) {
    return normalizeExecutionError(error);
  },
  async healthCheck(context) {
    return {
      healthy: Boolean(context.credential),
      detail: context.credential ? "configuration_valid" : "credential_missing",
    };
  },
};

export function resendAdapterContext(
  request: AdapterContext["request"],
  credential: string,
): AdapterContext {
  return { request, credential, idempotencyKey: request.idempotencyKey };
}
