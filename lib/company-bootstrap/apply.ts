import "server-only";

import {
  requestToolExecution,
  syncToolExecutionApproval,
} from "@/lib/integrations/execution-gateway";
import {
  createExecutionServiceClient,
  executeApprovedToolRequest,
  rollbackToolExecution,
} from "@/lib/integrations/service-runner";
import {
  PHASE3_BOOTSTRAP_APPLY_TOOL_ID,
  registerPhase3BootstrapApplyTool,
} from "@/lib/company-bootstrap/register-apply-tool";

function environment(): "development" | "preview" | "production" {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

async function internalIntegration(
  service: ReturnType<typeof createExecutionServiceClient>,
  organizationId: string,
  userId: string,
) {
  const { data: existing, error: readError } = await service
    .from("organization_integrations")
    .select("id,status,enabled")
    .eq("organization_id", organizationId)
    .eq("provider_key", "internal")
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  if (readError) throw new Error("Internal execution boundary could not be resolved.");
  if (existing) {
    if (existing.status !== "connected")
      throw new Error("Internal execution boundary is not connected.");
    return existing.id;
  }

  const now = new Date().toISOString();
  const { data, error } = await service
    .from("organization_integrations")
    .insert({
      organization_id: organizationId,
      provider_key: "internal",
      display_name: "RYTHM Internal Control",
      account_ref: "phase3",
      auth_type: "service_account",
      status: "connected",
      enabled: true,
      granted_scopes: [],
      metadata: { credential_source: "internal_service", phase3_bootstrap: true },
      connected_by_user_id: userId,
      connected_at: now,
      last_verified_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Internal execution boundary could not be prepared.");
  return data.id;
}

async function ensureApplyRollout(
  service: ReturnType<typeof createExecutionServiceClient>,
  organizationId: string,
  userId: string,
) {
  const env = environment();
  const { data: existing, error: readError } = await service
    .from("execution_rollout_config")
    .select("id,execution_mode,kill_switch")
    .eq("organization_id", organizationId)
    .eq("tool_id", PHASE3_BOOTSTRAP_APPLY_TOOL_ID)
    .eq("integration_key", "")
    .eq("environment", env)
    .maybeSingle();
  if (readError) throw new Error("Bootstrap apply rollout policy could not be read.");
  if (existing) {
    if (existing.kill_switch)
      throw new Error("Company Bootstrap apply is disabled by the company kill switch.");
    if (!["limited_enforced", "enforced"].includes(existing.execution_mode))
      throw new Error(
        `Company Bootstrap apply is currently ${existing.execution_mode}. Enable the dedicated governed rollout before applying.`,
      );
    return existing;
  }

  // Requesting apply is an explicit opt-in for this isolated internal tool. High-risk metadata
  // still forces an exact Human CEO approval before execution.
  const { data: created, error } = await service
    .from("execution_rollout_config")
    .insert({
      organization_id: organizationId,
      tool_id: PHASE3_BOOTSTRAP_APPLY_TOOL_ID,
      integration_key: "",
      environment: env,
      execution_mode: "limited_enforced",
      kill_switch: false,
      policy_version: "execution-policy-v2.0.0",
      reason: "Phase 3 exact confirmed Company Bootstrap apply",
      updated_by_user_id: userId,
      updated_at: new Date().toISOString(),
    })
    .select("id,execution_mode,kill_switch")
    .single();
  if (error || !created) throw new Error("Bootstrap apply rollout could not be enabled.");

  const { error: auditError } = await service.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: userId,
    event_type: "company_bootstrap.apply_rollout_enabled",
    object_type: "execution_rollout_config",
    object_id: created.id,
    risk_level: "high",
    payload: {
      tool_id: PHASE3_BOOTSTRAP_APPLY_TOOL_ID,
      execution_mode: "limited_enforced",
      human_ceo_approval_required: true,
      rollback_supported: true,
    },
  });
  if (auditError)
    throw new Error("Bootstrap apply rollout changed but its audit event could not be recorded.");
  return created;
}

export async function requestCompanyBootstrapApply(input: {
  organizationId: string;
  userId: string;
  runId: string;
  proposalDigest: string;
}) {
  registerPhase3BootstrapApplyTool();
  const service = createExecutionServiceClient();

  const { data: run, error: runError } = await service
    .from("company_bootstrap_runs")
    .select("id,status,proposal_digest,confirmed_by_user_id,confirmed_at")
    .eq("organization_id", input.organizationId)
    .eq("id", input.runId)
    .maybeSingle();
  if (
    runError ||
    !run ||
    run.status !== "confirmed" ||
    run.proposal_digest !== input.proposalDigest ||
    !run.confirmed_by_user_id ||
    !run.confirmed_at
  ) {
    throw new Error("Only the exact Human CEO confirmed proposal can be submitted for apply.");
  }

  const integrationId = await internalIntegration(
    service,
    input.organizationId,
    input.userId,
  );
  await ensureApplyRollout(service, input.organizationId, input.userId);

  const request = await requestToolExecution(service, {
    organizationId: input.organizationId,
    userId: input.userId,
    integrationId,
    toolId: PHASE3_BOOTSTRAP_APPLY_TOOL_ID,
    capabilityKey: "company_bootstrap.apply",
    targetRef: input.runId,
    input: {
      runId: input.runId,
      proposalDigest: input.proposalDigest,
    },
    persistedInput: {
      runId: input.runId,
      proposalDigest: input.proposalDigest,
    },
    payloadSummary: {
      run_id: input.runId,
      proposal_digest: input.proposalDigest,
      action: "Create the exact reviewed departments and paused Agents",
      agents_initial_status: "paused",
      external_actions_allowed: false,
      rollback_supported: true,
    },
    originatingRequestId: `company-bootstrap:${input.runId}:apply:${input.proposalDigest}`,
    requestedBy: "user",
    authoritySource: "human",
    intent: "company_bootstrap_apply",
  });

  if (request.status === "denied")
    throw new Error(
      `Bootstrap apply was denied by policy${request.policy_reason_code ? `: ${request.policy_reason_code}` : "."}`,
    );
  if (request.status === "simulated")
    throw new Error("Bootstrap apply is still in simulation mode.");
  if (!request.approval_request_id)
    throw new Error("High-risk bootstrap apply did not produce the required Human CEO approval.");

  return {
    executionId: request.id,
    approvalId: request.approval_request_id,
    status: request.status,
  };
}

export async function executeCompanyBootstrapApply(input: {
  organizationId: string;
  executionId: string;
}) {
  registerPhase3BootstrapApplyTool();
  const service = createExecutionServiceClient();
  const synced = await syncToolExecutionApproval(
    service,
    input.organizationId,
    input.executionId,
  );
  if (synced?.status !== "approved")
    throw new Error("The exact bootstrap apply request must be approved by the Human CEO before execution.");

  const result = await executeApprovedToolRequest(input.executionId);
  return result;
}

export async function rollbackCompanyBootstrapApply(input: {
  organizationId: string;
  executionId: string;
  runId: string;
}) {
  registerPhase3BootstrapApplyTool();
  const service = createExecutionServiceClient();
  const { data: execution, error } = await service
    .from("tool_execution_requests")
    .select("id,status,tool,capability_key,target_ref,rollback_available")
    .eq("id", input.executionId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (
    error ||
    !execution ||
    execution.tool !== PHASE3_BOOTSTRAP_APPLY_TOOL_ID ||
    execution.capability_key !== "company_bootstrap.apply" ||
    execution.target_ref !== input.runId ||
    execution.status !== "succeeded" ||
    !execution.rollback_available
  ) {
    throw new Error("This bootstrap execution is not eligible for rollback.");
  }
  return rollbackToolExecution(input.executionId);
}
