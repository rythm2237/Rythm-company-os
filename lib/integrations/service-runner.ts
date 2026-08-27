import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  getIntegrationAdapter,
  INTEGRATION_ADAPTERS,
} from "@/lib/integrations/adapters/provider-adapters";
import { resendAdapter } from "@/lib/integrations/adapters/resend";
import { internalValidationAdapter } from "@/lib/integrations/adapters/internal-validation";
import type {
  AdapterContext,
  AdapterExecutionOutcome,
} from "@/lib/integrations/adapters/types";
import type {
  ApprovalPolicy,
  DataSensitivity,
  ExecutionMode,
  ExecutionRequest,
  ExecutionReversibility,
  ExecutionRisk,
  RetryPolicy,
} from "@/lib/integrations/contracts";
import {
  IntegrationExecutionError,
  normalizeExecutionError,
} from "@/lib/integrations/error-normalization";
import { executeWithRetry } from "@/lib/integrations/retry";
import { getToolMetadata } from "@/lib/integrations/registry";
import { executionDigest } from "@/lib/integrations/idempotency";
import { redactSensitiveValue } from "@/lib/security/redaction";

type Json = Record<string, any>;

export function createExecutionServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Integration executor service credentials are not configured.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function safe(value: unknown): Record<string, unknown> {
  const redacted = redactSensitiveValue(value);
  if (redacted == null) return {};
  if (Array.isArray(redacted)) return { items: redacted.slice(0, 20) };
  if (typeof redacted === "object") return redacted as Record<string, unknown>;
  return { value: String(redacted).slice(0, 1500) };
}

function toRequest(row: Json): ExecutionRequest {
  return {
    executionId: row.id,
    correlationId: row.correlation_id,
    organizationId: row.organization_id,
    userId: row.requested_by_user_id,
    agentId: row.agent_id,
    originatingRequestId: row.originating_request_id,
    projectId: row.project_id,
    meetingId: row.meeting_id,
    sessionId: row.session_id,
    actionType: row.action_type || row.capability_key,
    integration: row.integration_key,
    integrationId: row.integration_id,
    tool: row.tool,
    operation: row.capability_key,
    target: row.target_ref,
    payloadReference: row.payload_reference,
    payloadDigest: row.payload_digest,
    input: (row.input ?? {}) as Record<string, unknown>,
    requestedAt: row.created_at,
    requestedBy: row.requested_by,
    intent: row.intent || row.operation,
    riskLevel: row.risk_level as ExecutionRisk,
    reversibility: row.reversibility as ExecutionReversibility,
    externalSideEffect: Boolean(row.external_side_effect),
    financialImpact: Boolean(row.financial_impact),
    dataSensitivity: row.data_sensitivity as DataSensitivity,
    requiredPermissions: row.required_permissions ?? [],
    requiredScopes: row.required_scopes ?? [],
    humanApprovalRequired: Boolean(row.human_approval_required),
    approvalPolicy: row.approval_policy as ApprovalPolicy,
    idempotencyKey: row.idempotency_key,
    timeoutMs: row.timeout_ms,
    retryPolicy: row.retry_policy as RetryPolicy,
    costLimit: row.cost_limit,
    executionMode: row.execution_mode as ExecutionMode,
    policyVersion: row.policy_version,
  };
}

async function lifecycle(
  supabase: ReturnType<typeof createExecutionServiceClient>,
  row: Json,
  eventType: string,
  status: string,
  detail: Record<string, unknown> = {},
) {
  const payload = safe(detail);
  const { data, error } = await supabase.rpc(
    "record_tool_execution_lifecycle_v2",
    {
      target_execution_id: row.id,
      target_event_type: eventType,
      target_status: status,
      target_detail: payload,
      target_actor: "system",
    },
  );
  if (error)
    throw new Error(
      `Execution lifecycle could not be recorded: ${error.message}`,
    );
  return data ?? null;
}

async function credentialFor(
  supabase: ReturnType<typeof createExecutionServiceClient>,
  integration: Json,
) {
  if (integration.provider_key === "internal")
    return "internal-service-boundary";
  if (
    integration.provider_key === "resend" &&
    integration.metadata?.credential_source === "platform_env"
  ) {
    const credential = process.env.RESEND_API_KEY?.trim();
    if (!credential)
      throw new Error("Managed Resend credential is unavailable.");
    return credential;
  }
  const { data, error } = await supabase.rpc(
    "get_organization_integration_secret_service_v1",
    { target_integration_id: integration.id },
  );
  if (error || !data)
    throw new Error(
      "Provider credential is unavailable to the service executor.",
    );
  return String(data);
}

function adapterFor(provider: string) {
  if (provider === "internal") return internalValidationAdapter;
  if (provider === "resend") return resendAdapter;
  return getIntegrationAdapter(provider);
}

async function hydratePayload(
  supabase: ReturnType<typeof createExecutionServiceClient>,
  request: ExecutionRequest,
) {
  if (request.tool !== "resend.email") return request;
  const messageId = String(request.input.messageId ?? "");
  if (
    !messageId ||
    request.payloadReference !== `communication_message:${messageId}`
  )
    throw new IntegrationExecutionError(
      "The approved communication payload reference is invalid.",
      "validation_error",
    );
  const { data: message, error } = await supabase
    .from("communication_messages")
    .select(
      "id,thread_id,status,sender_email,recipients,subject,body_text,approved_by_user_id,approved_at",
    )
    .eq("organization_id", request.organizationId)
    .eq("id", messageId)
    .maybeSingle();
  if (
    error ||
    !message ||
    message.status !== "ready_for_delivery" ||
    !message.approved_by_user_id ||
    !message.approved_at
  )
    throw new IntegrationExecutionError(
      "The approved communication is no longer eligible for delivery.",
      "authorization_error",
    );
  const exactInput = { ...request.input, text: message.body_text || "" };
  if (executionDigest(exactInput) !== request.payloadDigest)
    throw new IntegrationExecutionError(
      "The communication changed after approval; a new approval is required.",
      "approval_required",
    );
  return { ...request, input: exactInput };
}

async function finalizeApplicationState(
  supabase: ReturnType<typeof createExecutionServiceClient>,
  request: ExecutionRequest,
  outcome: AdapterExecutionOutcome,
) {
  if (request.tool !== "resend.email") return;
  const messageId = String(request.input.messageId ?? "");
  const threadId = String(request.input.threadId ?? "");
  if (!messageId || !threadId || !outcome.externalReferenceId)
    throw new IntegrationExecutionError(
      "Provider accepted the email, but the governed message reference is incomplete.",
      "verification_failed",
      false,
      true,
    );
  const now = new Date().toISOString();
  const { data: message, error } = await supabase
    .from("communication_messages")
    .update({
      direction: "outbound",
      status: "sent",
      provider_message_id: outcome.externalReferenceId,
      sent_by_user_id: request.userId,
      sent_at: now,
      updated_at: now,
      transport_source: "resend",
    })
    .eq("organization_id", request.organizationId)
    .eq("id", messageId)
    .eq("status", "ready_for_delivery")
    .select("id")
    .maybeSingle();
  if (error)
    throw new IntegrationExecutionError(
      "Provider accepted the email, but RYTHM could not finalize delivery state. Do not resend until reconciled.",
      "verification_failed",
      false,
      true,
    );
  if (!message) {
    const { data: existing } = await supabase
      .from("communication_messages")
      .select("id,provider_message_id,status")
      .eq("organization_id", request.organizationId)
      .eq("id", messageId)
      .maybeSingle();
    if (
      existing?.status !== "sent" ||
      existing.provider_message_id !== outcome.externalReferenceId
    )
      throw new IntegrationExecutionError(
        "Provider accepted the email, but delivery state is uncertain. Do not retry automatically.",
        "verification_failed",
        false,
        true,
      );
  }
  await supabase
    .from("communication_threads")
    .update({
      status: "waiting_external",
      last_message_at: now,
      updated_at: now,
    })
    .eq("organization_id", request.organizationId)
    .eq("id", threadId);
  await supabase
    .from("communication_provider_connections")
    .update({ outbound_enabled: true, status: "connected", updated_at: now })
    .eq("organization_id", request.organizationId)
    .eq("provider_code", "rythm_managed");
}

export async function executeApprovedToolRequest(executionRequestId: string) {
  const supabase = createExecutionServiceClient();
  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_tool_execution_v2",
    { target_execution_id: executionRequestId },
  );
  const row = Array.isArray(claimed) ? claimed[0] : claimed;
  if (claimError || !row)
    throw new Error(
      claimError?.message ?? "Execution request could not be claimed.",
    );
  let attempts = 0;
  try {
    const request = await hydratePayload(supabase, toRequest(row));
    const registered = getToolMetadata(request.tool, request.operation);
    if (!registered)
      throw new IntegrationExecutionError(
        "Canonical tool metadata is unavailable.",
        "policy_denied",
      );
    const { data: integration, error: integrationError } = await supabase
      .from("organization_integrations")
      .select(
        "id,organization_id,provider_key,account_ref,base_url,status,enabled,metadata",
      )
      .eq("id", request.integrationId)
      .eq("organization_id", request.organizationId)
      .maybeSingle();
    if (
      integrationError ||
      !integration ||
      integration.status !== "connected" ||
      integration.enabled === false
    )
      throw new IntegrationExecutionError(
        "Connected provider is unavailable.",
        "authorization_error",
      );
    const adapter = adapterFor(integration.provider_key);
    if (!adapter)
      throw new IntegrationExecutionError(
        `No adapter is registered for ${integration.provider_key}.`,
        "policy_denied",
      );
    const credential = await credentialFor(supabase, integration);
    const context: AdapterContext = {
      request,
      credential,
      accountRef: integration.account_ref,
      baseUrl: integration.base_url,
      idempotencyKey: request.idempotencyKey,
    };
    await adapter.validate(context);
    const prepared = await adapter.prepare(context);
    await lifecycle(supabase, row, "started", "executing", {
      tool: request.tool,
      operation: request.operation,
      adapterVersion: adapter.version,
    });
    const run = await executeWithRetry<AdapterExecutionOutcome>({
      policy: request.retryPolicy,
      idempotencySupported: registered.operation.idempotencySupported,
      action: async (attempt) => {
        attempts = attempt;
        const started = Date.now();
        try {
          const outcome = await adapter.execute(context, prepared);
          const accepted = safe(outcome.rawResult);
          const { error: acceptanceError } = await supabase
            .from("tool_execution_requests")
            .update({
              external_reference_id: outcome.externalReferenceId ?? null,
              result_metadata: accepted,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
            .eq("status", "executing");
          if (acceptanceError)
            throw new IntegrationExecutionError(
              "Provider response could not be durably reconciled. Do not retry automatically.",
              "verification_failed",
              false,
              true,
            );
          const { error: attemptError } = await supabase
            .from("tool_execution_attempts")
            .insert({
              organization_id: request.organizationId,
              execution_request_id: row.id,
              attempt_number: attempt,
              status: "succeeded",
              completed_at: new Date().toISOString(),
              safe_detail: { latency_ms: Date.now() - started },
            });
          if (attemptError)
            throw new IntegrationExecutionError(
              "Provider result was received but attempt telemetry failed. Do not retry automatically.",
              "verification_failed",
              false,
              true,
            );
          return outcome;
        } catch (error) {
          const n = adapter.normalizeError(error);
          const { error: attemptError } = await supabase
            .from("tool_execution_attempts")
            .insert({
              organization_id: request.organizationId,
              execution_request_id: row.id,
              attempt_number: attempt,
              status: "failed",
              completed_at: new Date().toISOString(),
              normalized_error_class: n.errorClass,
              retryable: n.retryable,
              uncertain_completion: n.uncertainCompletion,
              safe_detail: { latency_ms: Date.now() - started },
            });
          if (attemptError && attemptError.code !== "23505")
            throw new IntegrationExecutionError(
              "Provider failure could not be recorded safely. Automatic retry stopped.",
              "execution_failed",
              false,
              true,
            );
          throw error;
        }
      },
    });
    const verification = await adapter.verify(context, run.value);
    if (verification.status === "failed")
      throw new IntegrationExecutionError(
        "Provider result verification failed.",
        "verification_failed",
        false,
        true,
      );
    await finalizeApplicationState(supabase, request, run.value);
    const completed = new Date().toISOString();
    const result = safe(run.value.rawResult);
    const { data: updated } = await supabase
      .from("tool_execution_requests")
      .update({
        status: "succeeded",
        safe_result: result,
        result_metadata: result,
        external_reference_id: run.value.externalReferenceId ?? null,
        verification_result: verification,
        rollback_available: Boolean(
          registered.operation.rollbackSupported && run.value.rollbackReference,
        ),
        rollback_reference: run.value.rollbackReference ?? null,
        rollback_status:
          registered.operation.rollbackSupported && run.value.rollbackReference
            ? "available"
            : "not_available",
        retry_count: Math.max(0, run.attempts - 1),
        completed_at: completed,
        latency_ms: row.started_at
          ? Date.now() - new Date(row.started_at).valueOf()
          : null,
        updated_at: completed,
      })
      .eq("id", row.id)
      .eq("status", "executing")
      .select("id")
      .single();
    if (!updated) throw new Error("Execution result could not be committed.");
    const auditEventId = await lifecycle(
      supabase,
      row,
      "completed",
      "succeeded",
      {
        attempts: run.attempts,
        externalReferenceId: run.value.externalReferenceId ?? null,
        verification: verification.status,
        rollbackAvailable: Boolean(run.value.rollbackReference),
      },
    );
    return {
      ok: true as const,
      executionId: row.id,
      result,
      attempts: run.attempts,
      verification,
      externalReferenceId: run.value.externalReferenceId ?? null,
      auditEventId,
    };
  } catch (error) {
    const normalized = normalizeExecutionError(error);
    const completed = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("tool_execution_requests")
      .update({
        status: "failed",
        normalized_error_class: normalized.errorClass,
        sanitized_error: normalized.sanitizedError,
        safe_result: { message: normalized.sanitizedError },
        retry_count: Math.max(0, attempts - 1),
        completed_at: completed,
        updated_at: completed,
      })
      .eq("id", row.id)
      .eq("status", "executing");
    if (!updateError)
      await lifecycle(supabase, row, "failed", "failed", {
        errorClass: normalized.errorClass,
        attempts,
        uncertainCompletion: normalized.uncertainCompletion,
      });
    throw new Error(
      updateError
        ? "Execution failed and its terminal state could not be persisted; operator reconciliation is required."
        : normalized.sanitizedError,
    );
  }
}

export async function rollbackToolExecution(executionRequestId: string) {
  const supabase = createExecutionServiceClient();
  const { data: claimed, error } = await supabase.rpc(
    "claim_tool_execution_rollback_v2",
    { target_execution_id: executionRequestId },
  );
  const row = Array.isArray(claimed) ? claimed[0] : claimed;
  if (error || !row)
    throw new Error(error?.message ?? "Rollback could not be claimed.");
  try {
    const request = toRequest(row);
    const { data: integration } = await supabase
      .from("organization_integrations")
      .select(
        "id,organization_id,provider_key,account_ref,base_url,status,enabled,metadata",
      )
      .eq("id", request.integrationId)
      .eq("organization_id", request.organizationId)
      .maybeSingle();
    if (!integration)
      throw new Error("Integration is unavailable for rollback.");
    const adapter = adapterFor(integration.provider_key);
    if (!adapter?.rollback || !adapter.verifyRollback)
      throw new Error("The adapter does not provide a verifiable rollback.");
    const credential = await credentialFor(supabase, integration);
    const context: AdapterContext = {
      request,
      credential,
      accountRef: integration.account_ref,
      baseUrl: integration.base_url,
      idempotencyKey: `${request.idempotencyKey}:rollback`,
    };
    await lifecycle(supabase, row, "rollback_requested", "succeeded", {});
    const outcome = await adapter.rollback(context, row.rollback_reference);
    const verification = await adapter.verifyRollback(
      context,
      row.rollback_reference,
      outcome,
    );
    if (verification.status !== "verified")
      throw new IntegrationExecutionError(
        "Compensating action could not be verified.",
        "rollback_failed",
        false,
        true,
      );
    const completed = new Date().toISOString();
    const { data: updated } = await supabase
      .from("tool_execution_requests")
      .update({
        status: "rolled_back",
        rollback_status: "succeeded",
        verification_result: {
          status: "verified",
          detail: { rollback: verification.detail ?? {} },
        },
        updated_at: completed,
      })
      .eq("id", row.id)
      .eq("rollback_status", "requested")
      .select("id")
      .single();
    if (!updated) throw new Error("Rollback result could not be persisted.");
    await lifecycle(supabase, row, "rolled_back", "rolled_back", {
      externalReferenceId: outcome.externalReferenceId ?? null,
      verification: "verified",
    });
    return { ok: true as const, executionId: row.id };
  } catch (reason) {
    const normalized = normalizeExecutionError(reason);
    await supabase
      .from("tool_execution_requests")
      .update({
        rollback_status: "failed",
        normalized_error_class: "rollback_failed",
        sanitized_error: normalized.sanitizedError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    await lifecycle(supabase, row, "rollback_failed", "failed", {
      errorClass: normalized.errorClass,
    });
    throw new Error(normalized.sanitizedError);
  }
}

export async function healthCheckExecutionAdapters() {
  return Promise.all(
    [
      ...Object.values(INTEGRATION_ADAPTERS),
      resendAdapter,
      internalValidationAdapter,
    ].map(async (adapter) => ({
      integration: adapter.integrationId,
      version: adapter.version,
      supportedTools: adapter.supportedTools,
    })),
  );
}
