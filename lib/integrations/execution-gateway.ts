import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EXECUTION_POLICY_VERSION,
  type DataSensitivity,
  type ExecutionMode,
  type ExecutionRequest,
  type ExecutionReversibility,
} from "@/lib/integrations/contracts";
import {
  buildApprovalScopeDigest,
  buildExecutionIdempotencyKey,
  executionDigest,
  newCorrelationId,
} from "@/lib/integrations/idempotency";
import {
  evaluateExecutionPolicy,
  type ApprovalEvidence,
  type ExecutionPolicyContext,
} from "@/lib/integrations/policy-engine";
import { getToolMetadata } from "@/lib/integrations/registry";
import {
  safeInputValidationError,
  validateExecutionInput,
} from "@/lib/integrations/input-validation";
import { redactSensitiveValue } from "@/lib/security/redaction";

export type ToolExecutionIntent = {
  organizationId: string;
  userId: string;
  agentId?: string | null;
  integrationId: string;
  toolId?: string;
  capabilityKey: string;
  operation?: string;
  actionType?: string;
  targetRef?: string | null;
  input?: Record<string, unknown>;
  persistedInput?: Record<string, unknown>;
  payloadSummary?: Record<string, unknown>;
  payloadReference?: string | null;
  idempotencyKey?: string;
  correlationId?: string;
  originatingRequestId?: string | null;
  projectId?: string | null;
  meetingId?: string | null;
  sessionId?: string | null;
  intent?: string;
  requestedBy?: "user" | "agent" | "system";
  authoritySource?:
    | "human"
    | "agent"
    | "boardroom"
    | "company_library"
    | "system";
  costLimit?: number | null;
  estimatedCost?: number | null;
};

const TOOL_BY_INTEGRATION: Record<string, Record<string, string>> = {
  github: {
    "repo.read": "github.repository",
    "branch.create": "github.repository",
    "code.write": "github.repository",
    "pull_request.create": "github.repository",
    "pull_request.merge": "github.repository",
  },
  vercel: {
    "deployment.read": "vercel.deployment",
    "preview.deploy": "vercel.deployment",
    "production.deploy": "vercel.deployment",
  },
  supabase: {
    "schema.read": "supabase.database",
    "sql.read": "supabase.database",
    "migration.apply": "supabase.database",
  },
  cloudflare: { "dns.read": "cloudflare.dns", "dns.write": "cloudflare.dns" },
  stripe: {
    "billing.read": "stripe.billing",
    "refund.create": "stripe.billing",
  },
  google_workspace: {
    "calendar.read": "google_workspace.calendar",
    "calendar.write": "google_workspace.calendar",
    "email.send": "google_workspace.email",
  },
  microsoft_365: {
    "calendar.read": "microsoft_365.calendar",
    "calendar.write": "microsoft_365.calendar",
    "email.send": "microsoft_365.email",
  },
  resend: { "email.send": "resend.email" },
};

function values(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object")
    return Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => enabled === true)
      .map(([key]) => key);
  return [];
}

function intersect(left: string[], right: string[]) {
  const available = new Set(right.map((item) => item.toLowerCase()));
  return left.filter((item) => available.has(item.toLowerCase()));
}

function environment(): "development" | "preview" | "production" {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

function statusFor(decision: ReturnType<typeof evaluateExecutionPolicy>) {
  if (!decision.allowed) return "denied";
  if (decision.mode === "simulate") return "simulated";
  if (decision.approvalRequired && !decision.execute) return "waiting_approval";
  return "authorized";
}

function permissionsForRole(role: string, required: string[]) {
  return role === "owner"
    ? [
        ...new Set([
          ...required,
          "read",
          "create",
          "update",
          "delete",
          "send",
          "publish",
          "financial",
          "external_communication",
          "privileged",
        ]),
      ]
    : ["read"];
}

async function loadRollout(
  supabase: SupabaseClient,
  organizationId: string,
  toolId: string,
  integrationId: string,
): Promise<{ mode: ExecutionMode; killSwitch: boolean }> {
  const { data } = await supabase
    .from("execution_rollout_config")
    .select(
      "organization_id,tool_id,integration_key,environment,execution_mode,kill_switch",
    )
    .in("organization_id", [organizationId])
    .eq("environment", environment())
    .or(`tool_id.eq.${toolId},integration_key.eq.${integrationId}`)
    .order("tool_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data
    ? {
        mode: data.execution_mode as ExecutionMode,
        killSwitch: Boolean(data.kill_switch),
      }
    : { mode: "simulate", killSwitch: false };
}

async function writeLifecycleEvent(
  supabase: SupabaseClient,
  request: {
    id: string;
    organization_id: string;
    correlation_id?: string | null;
    agent_id?: string | null;
    requested_by_user_id?: string | null;
    risk_level?: string;
  },
  eventType: string,
  status: string,
  detail: Record<string, unknown>,
) {
  const { error } = await supabase.rpc("record_tool_execution_lifecycle_v2", {
    target_execution_id: request.id,
    target_event_type: eventType,
    target_status: status,
    target_detail: redactSensitiveValue(detail),
    target_actor: "requester",
  });
  if (error)
    throw new Error(
      `Execution lifecycle could not be recorded: ${error.message}`,
    );
}

export async function requestToolExecution(
  supabase: SupabaseClient,
  intent: ToolExecutionIntent,
) {
  const input = intent.input ?? {};
  const persistedInput = intent.persistedInput ?? input;
  const operation = intent.operation ?? intent.capabilityKey;
  const correlationId = intent.correlationId ?? newCorrelationId();
  const [
    { data: integration },
    { data: membership },
    { data: entitlement },
    { data: agent },
    { data: grant },
    { data: autonomy },
  ] = (await Promise.all([
    supabase
      .from("organization_integrations")
      .select(
        "id,organization_id,provider_key,status,enabled,granted_scopes,metadata",
      )
      .eq("id", intent.integrationId)
      .eq("organization_id", intent.organizationId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("role,membership_status")
      .eq("organization_id", intent.organizationId)
      .eq("user_id", intent.userId)
      .maybeSingle(),
    supabase
      .from("organization_entitlements")
      .select("status,starts_at,ends_at")
      .eq("organization_id", intent.organizationId)
      .maybeSingle(),
    intent.agentId
      ? supabase
          .from("agents")
          .select(
            "id,organization_id,enabled,agent_status,risk_ceiling,permissions,allowed_tools,execution_capabilities,external_actions_allowed",
          )
          .eq("id", intent.agentId)
          .eq("organization_id", intent.organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    intent.agentId
      ? supabase
          .from("agent_integration_grants")
          .select("approval_mode,enabled,scope")
          .eq("organization_id", intent.organizationId)
          .eq("agent_id", intent.agentId)
          .eq("integration_id", intent.integrationId)
          .eq("capability_key", intent.capabilityKey)
          .eq("enabled", true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    intent.agentId
      ? supabase
          .from("agent_autonomy_profiles")
          .select(
            "current_level,maximum_level,status,allowed_risk_levels,requires_approval_for_external_actions",
          )
          .eq("organization_id", intent.organizationId)
          .eq("agent_id", intent.agentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])) as any[];
  if (!integration)
    throw new Error("Integration is not available to this company.");

  const toolId =
    intent.toolId ??
    TOOL_BY_INTEGRATION[integration.provider_key]?.[intent.capabilityKey];
  const registered = toolId
    ? getToolMetadata(toolId, intent.capabilityKey)
    : null;
  if (!registered)
    throw new Error(
      "Integration capability is not registered in the canonical tool registry.",
    );
  if (registered.tool.integrationId !== integration.provider_key)
    throw new Error(
      "The requested tool does not belong to the selected integration provider.",
    );
  const rollout = await loadRollout(
    supabase,
    intent.organizationId,
    toolId,
    integration.provider_key,
  );
  const meta = registered.operation;
  const autonomyLevel = Number(autonomy?.current_level ?? 0);
  const autonomyActive = Boolean(
    autonomy && !["locked", "suspended"].includes(String(autonomy.status)),
  );
  const autonomyAllowsRequest =
    !intent.agentId ||
    (autonomyActive &&
      autonomyLevel >= 1 &&
      (!meta.externalSideEffect || autonomyLevel >= 2) &&
      (!["medium", "high", "restricted"].includes(meta.riskLevel) ||
        autonomyLevel >= 2));
  const autonomyRequiresApproval = Boolean(
    intent.agentId &&
      (meta.financialImpact ||
        ["high", "restricted"].includes(meta.riskLevel) ||
        (meta.externalSideEffect &&
          (autonomyLevel < 3 ||
            autonomy?.requires_approval_for_external_actions !== false))),
  );
  const inputValidation = validateExecutionInput(
    toolId,
    intent.capabilityKey,
    input,
  );
  const requestedAt = new Date().toISOString();
  const idempotencyKey =
    intent.idempotencyKey ??
    buildExecutionIdempotencyKey({
      organizationId: intent.organizationId,
      originatingRequestId: intent.originatingRequestId,
      agentId: intent.agentId,
      tool: toolId,
      operation: intent.capabilityKey,
      target: intent.targetRef,
      input,
    });
  const payloadDigest = executionDigest(input);
  const request: ExecutionRequest = {
    correlationId,
    organizationId: intent.organizationId,
    userId: intent.userId,
    agentId: intent.agentId ?? null,
    originatingRequestId: intent.originatingRequestId ?? null,
    projectId: intent.projectId ?? null,
    meetingId: intent.meetingId ?? null,
    sessionId: intent.sessionId ?? null,
    actionType: intent.actionType ?? intent.capabilityKey,
    integration: integration.provider_key,
    integrationId: intent.integrationId,
    tool: toolId,
    operation: intent.capabilityKey,
    target: intent.targetRef ?? null,
    payloadReference: intent.payloadReference ?? null,
    input,
    requestedAt,
    requestedBy: intent.requestedBy ?? (intent.agentId ? "agent" : "user"),
    intent: intent.intent ?? intent.capabilityKey,
    riskLevel: meta.riskLevel,
    reversibility: meta.reversibility as ExecutionReversibility,
    externalSideEffect: meta.externalSideEffect,
    financialImpact: meta.financialImpact,
    dataSensitivity: meta.dataSensitivity as DataSensitivity,
    requiredPermissions: [
      ...meta.requiredAgentPermissions,
      ...meta.requiredUserPermissions,
    ],
    requiredScopes: meta.requiredScopes,
    humanApprovalRequired:
      meta.approvalPolicy !== "not_required" ||
      grant?.approval_mode === "approval_required" ||
      autonomyRequiresApproval,
    approvalPolicy: meta.approvalPolicy,
    idempotencyKey,
    timeoutMs: meta.timeoutMs,
    retryPolicy: meta.retryPolicy,
    costLimit: intent.costLimit ?? null,
    executionMode: rollout.mode,
    policyVersion: EXECUTION_POLICY_VERSION,
    authoritySource:
      intent.authoritySource ?? (intent.agentId ? "agent" : "human"),
  };

  const now = new Date();
  const activeEntitlement =
    entitlement?.status === "active" &&
    (!entitlement.starts_at || new Date(entitlement.starts_at) <= now) &&
    (!entitlement.ends_at || new Date(entitlement.ends_at) > now);
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const [
    recentOrganization,
    recentUser,
    recentIntegration,
    recentOperation,
    recentAgent,
  ] = await Promise.all([
    supabase
      .from("tool_execution_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", intent.organizationId)
      .gte("created_at", since),
    supabase
      .from("tool_execution_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", intent.organizationId)
      .eq("requested_by_user_id", intent.userId)
      .gte("created_at", since),
    supabase
      .from("tool_execution_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", intent.organizationId)
      .eq("integration_id", intent.integrationId)
      .gte("created_at", since),
    supabase
      .from("tool_execution_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", intent.organizationId)
      .eq("tool", toolId)
      .eq("capability_key", intent.capabilityKey)
      .gte("created_at", since),
    intent.agentId
      ? supabase
          .from("tool_execution_requests")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", intent.organizationId)
          .eq("agent_id", intent.agentId)
          .gte("created_at", since)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  const rateLimitReadFailed = [
    recentOrganization,
    recentUser,
    recentIntegration,
    recentOperation,
    recentAgent,
  ].some((result) => Boolean(result.error));
  const withinRateLimit =
    !rateLimitReadFailed &&
    (recentOrganization.count ?? 0) < meta.rateLimit.organizationPerHour &&
    (recentUser.count ?? 0) < meta.rateLimit.userPerHour &&
    (recentIntegration.count ?? 0) < meta.rateLimit.integrationPerHour &&
    (recentOperation.count ?? 0) < meta.rateLimit.operationPerHour &&
    (recentAgent.count ?? 0) < meta.rateLimit.agentPerHour;
  const policyContext: ExecutionPolicyContext = {
    userAuthorized: Boolean(
      membership && membership.membership_status === "active",
    ),
    agentAuthorized:
      !intent.agentId ||
      Boolean(agent && grant?.enabled && autonomyAllowsRequest),
    agentEnabled:
      !intent.agentId ||
      Boolean(agent?.enabled && agent?.agent_status !== "archived"),
    organizationEntitled: Boolean(activeEntitlement),
    integrationEnabled:
      integration.enabled !== false && registered.tool.enabled,
    integrationConnected: integration.status === "connected",
    operationSupported: true,
    payloadValid: inputValidation.valid,
    agentCapabilities: intent.agentId
      ? [
          ...values(agent?.execution_capabilities),
          ...values(agent?.allowed_tools),
          ...values(agent?.permissions),
          ...(grant?.enabled ? meta.requiredAgentPermissions : []),
        ]
      : meta.requiredAgentPermissions,
    userPermissions: permissionsForRole(
      membership?.role ?? "",
      meta.requiredUserPermissions,
    ),
    requiredAgentCapabilities: meta.requiredAgentPermissions,
    requiredUserPermissions: meta.requiredUserPermissions,
    grantedScopes: intent.agentId
      ? intersect(
          values(integration.granted_scopes),
          values(grant?.scope?.scopes),
        )
      : values(integration.granted_scopes),
    requiredScopes: meta.requiredScopes,
    agentRiskCeiling: agent?.risk_ceiling ?? "restricted",
    environment: environment(),
    allowedEnvironments: meta.allowedEnvironments,
    externalActionsAllowed:
      !intent.agentId || Boolean(agent?.external_actions_allowed),
    duplicate: false,
    withinRateLimit,
    withinCostLimit:
      intent.costLimit == null ||
      intent.estimatedCost == null ||
      intent.estimatedCost <= intent.costLimit,
    killSwitchActive: rollout.killSwitch || registered.tool.killSwitch,
    mode: rollout.mode,
  };
  const decision = evaluateExecutionPolicy(request, policyContext);
  const { data: stored, error } = await supabase
    .from("tool_execution_requests")
    .insert({
      organization_id: intent.organizationId,
      correlation_id: correlationId,
      agent_id: intent.agentId ?? null,
      requested_by_user_id: intent.userId,
      originating_request_id: intent.originatingRequestId ?? null,
      project_id: intent.projectId ?? null,
      meeting_id: intent.meetingId ?? null,
      session_id: intent.sessionId ?? null,
      integration_id: intent.integrationId,
      integration_key: integration.provider_key,
      tool: toolId,
      capability_key: intent.capabilityKey,
      operation,
      action_type: request.actionType,
      target_ref: intent.targetRef ?? null,
      payload_reference: intent.payloadReference ?? null,
      input: redactSensitiveValue(persistedInput),
      payload_digest: payloadDigest,
      requested_by: intent.requestedBy ?? (intent.agentId ? "agent" : "user"),
      intent: intent.intent ?? intent.capabilityKey,
      risk_level: meta.riskLevel,
      reversibility: meta.reversibility,
      external_side_effect: meta.externalSideEffect,
      financial_impact: meta.financialImpact,
      data_sensitivity: meta.dataSensitivity,
      required_permissions: request.requiredPermissions,
      required_scopes: meta.requiredScopes,
      human_approval_required: decision.approvalRequired,
      approval_policy: meta.approvalPolicy,
      approval_mode: decision.approvalRequired
        ? "approval_required"
        : "autonomous",
      approval_status: decision.approvalRequired ? "pending" : "not_required",
      status: statusFor(decision),
      authorization_result: decision.authorized,
      policy_reason_code: decision.reasonCode,
      policy_reason_codes: decision.reasonCodes,
      idempotency_key: idempotencyKey,
      timeout_ms: meta.timeoutMs,
      retry_policy: meta.retryPolicy,
      cost_limit: intent.costLimit ?? null,
      execution_mode: rollout.mode,
      policy_version: EXECUTION_POLICY_VERSION,
      adapter_version: registered.tool.adapterVersion,
      rollback_available: meta.rollbackSupported,
      normalized_error_class: inputValidation.valid ? null : "validation_error",
      sanitized_error: safeInputValidationError(inputValidation),
    })
    .select(
      "id,organization_id,correlation_id,agent_id,requested_by_user_id,risk_level,status,approval_request_id,policy_reason_code,execution_mode",
    )
    .single();
  if (error?.code === "23505") {
    const { data: existing } = await supabase
      .from("tool_execution_requests")
      .select("id,status,approval_request_id,policy_reason_code,execution_mode")
      .eq("organization_id", intent.organizationId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return { ...existing, duplicate: true };
  }
  if (error || !stored)
    throw new Error(
      error?.message ?? "Execution request could not be recorded.",
    );
  await writeLifecycleEvent(supabase, stored, "requested", stored.status, {
    tool: toolId,
    operation: intent.capabilityKey,
    target: intent.targetRef ?? null,
    reasonCode: decision.reasonCode,
    mode: rollout.mode,
  });
  await writeLifecycleEvent(
    supabase,
    stored,
    "policy_evaluated",
    stored.status,
    {
      authorized: decision.authorized,
      reasonCodes: decision.reasonCodes,
      approvalRequired: decision.approvalRequired,
    },
  );

  if (decision.approvalRequired && stored.status === "waiting_approval") {
    const scopeDigest = buildApprovalScopeDigest({
      organizationId: intent.organizationId,
      executionId: stored.id,
      tool: toolId,
      operation: intent.capabilityKey,
      target: intent.targetRef,
      payloadDigest,
    });
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: approval, error: approvalError } = await supabase
      .from("approval_requests")
      .insert({
        organization_id: intent.organizationId,
        subject_type: "tool_execution",
        subject_id: stored.id,
        title: `Approve ${registered.tool.name}: ${intent.capabilityKey}`,
        summary: `${intent.agentId ? "Agent" : "User"} proposes ${intent.capabilityKey}${intent.targetRef ? ` for ${intent.targetRef}` : ""}. ${meta.externalSideEffect ? "This changes an external system." : ""} ${meta.reversibility === "irreversible" ? "This action cannot be rolled back." : `Reversibility: ${meta.reversibility}.`}`,
        risk_level:
          meta.riskLevel === "restricted" ? "critical" : meta.riskLevel,
        requested_by_agent_id: intent.agentId ?? null,
        status: "pending",
        expires_at: expiresAt,
        requested_by_user_id: intent.userId,
        conditions: {
          execution_id: stored.id,
          tool: toolId,
          operation: intent.capabilityKey,
          target: intent.targetRef ?? null,
          payload_digest: payloadDigest,
          scope_digest: scopeDigest,
          external_side_effect: meta.externalSideEffect,
          financial_impact: meta.financialImpact,
          reversibility: meta.reversibility,
          data_sensitivity: meta.dataSensitivity,
          cost_limit: intent.costLimit ?? null,
        },
        execution_payload_summary: redactSensitiveValue(
          intent.payloadSummary ?? {
            fields: Object.keys(persistedInput)
              .filter((key) => persistedInput[key] !== undefined)
              .slice(0, 20),
          },
        ),
        execution_expected_impact: meta.externalSideEffect
          ? `Changes ${registered.tool.name} outside RYTHM.`
          : "Creates a tenant-scoped internal record.",
        execution_reversibility: meta.reversibility,
        execution_scope_digest: scopeDigest,
        execution_payload_digest: payloadDigest,
        execution_target: intent.targetRef ?? null,
        execution_tool: toolId,
        execution_operation: intent.capabilityKey,
      })
      .select("id")
      .single();
    if (approvalError || !approval)
      throw new Error(
        approvalError?.message ?? "Approval request could not be created.",
      );
    await supabase
      .from("tool_execution_requests")
      .update({
        approval_request_id: approval.id,
        approval_scope_digest: scopeDigest,
      })
      .eq("id", stored.id)
      .eq("organization_id", intent.organizationId);
    await writeLifecycleEvent(
      supabase,
      stored,
      "approval_requested",
      "waiting_approval",
      { approvalId: approval.id, expiresAt, reason: decision.reasonCode },
    );
    return {
      ...stored,
      approval_request_id: approval.id,
      preview: {
        agentId: intent.agentId ?? null,
        action: intent.capabilityKey,
        target: intent.targetRef ?? "No target",
        system: registered.tool.name,
        risk: meta.riskLevel,
        sideEffects: meta.externalSideEffect
          ? "External change"
          : "No external mutation",
        reversibility: meta.reversibility,
        reason: decision.reasonCode,
      },
    };
  }
  return stored;
}

export async function syncToolExecutionApproval(
  supabase: SupabaseClient,
  organizationId: string,
  executionRequestId: string,
) {
  const { data: request } = await supabase
    .from("tool_execution_requests")
    .select(
      "id,organization_id,status,approval_request_id,approval_scope_digest,correlation_id,agent_id,requested_by_user_id,risk_level",
    )
    .eq("organization_id", organizationId)
    .eq("id", executionRequestId)
    .maybeSingle();
  if (!request?.approval_request_id) return request;
  const { data: approval } = await supabase
    .from("approval_requests")
    .select("status,expires_at,execution_scope_digest,consumed_at")
    .eq("organization_id", organizationId)
    .eq("id", request.approval_request_id)
    .maybeSingle();
  if (!approval) return request;
  let next = request.status;
  if (approval.expires_at && new Date(approval.expires_at) <= new Date())
    next = "expired";
  else if (
    approval.status === "approved" &&
    approval.execution_scope_digest === request.approval_scope_digest &&
    !approval.consumed_at
  )
    next = "approved";
  else if (approval.status === "rejected") next = "rejected";
  else if (approval.status === "cancelled" || approval.status === "expired")
    next = "expired";
  if (next !== request.status) {
    await supabase
      .from("tool_execution_requests")
      .update({ status: next, approval_status: approval.status })
      .eq("id", request.id)
      .eq("organization_id", organizationId);
    await writeLifecycleEvent(
      supabase,
      request,
      next === "approved"
        ? "approved"
        : next === "rejected"
          ? "rejected"
          : "approval_expired",
      next,
      { approvalId: request.approval_request_id },
    );
  }
  return { ...request, status: next };
}

export function evaluateExecutionPolicyForTest(
  request: ExecutionRequest,
  context: ExecutionPolicyContext,
  approval?: ApprovalEvidence | null,
) {
  return evaluateExecutionPolicy(request, {
    ...context,
    approval: approval ?? context.approval,
  });
}
