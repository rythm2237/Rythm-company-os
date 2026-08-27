"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { requestToolExecution } from "@/lib/integrations/execution-gateway";
import {
  createExecutionServiceClient,
  executeApprovedToolRequest,
  rollbackToolExecution,
} from "@/lib/integrations/service-runner";

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}
function fail(message: string): never {
  redirect(`/integrations?error=${encodeURIComponent(message)}`);
}
function scopes(value: FormDataEntryValue | null) {
  return [
    ...new Set(
      text(value)
        .split(/[\s,]+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  ].slice(0, 50);
}

export async function createIntegration(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const providerKey = text(formData.get("providerKey"));
  const displayName = text(formData.get("displayName"));
  const accountRef = text(formData.get("accountRef")) || null;
  const baseUrl = text(formData.get("baseUrl")) || null;
  const authType = text(formData.get("authType")) || "token";
  const grantedScopes = scopes(formData.get("grantedScopes"));
  const secret = text(formData.get("secret"));
  if (!providerKey || !displayName)
    fail("Provider and connection name are required.");
  const { data: integration, error } = await context.supabase
    .from("organization_integrations")
    .insert({
      organization_id: context.organizationId,
      provider_key: providerKey,
      display_name: displayName,
      account_ref: accountRef,
      base_url: baseUrl,
      auth_type: authType,
      granted_scopes: grantedScopes,
      status: secret ? "disconnected" : "disconnected",
      connected_by_user_id: context.user.id,
    })
    .select("id")
    .single();
  if (error || !integration)
    fail(error?.message ?? "Integration could not be created.");
  if (secret) {
    const { error: secretError } = await context.supabase.rpc(
      "set_organization_integration_secret_v1",
      { target_integration_id: integration.id, secret_value: secret },
    );
    if (secretError)
      fail(
        `Connection created, but credential could not be stored: ${secretError.message}`,
      );
  }
  revalidatePath("/integrations");
  redirect("/integrations?message=Integration%20connection%20created.");
}

export async function rotateIntegrationSecret(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const integrationId = text(formData.get("integrationId"));
  const secret = text(formData.get("secret"));
  const grantedScopes = scopes(formData.get("grantedScopes"));
  if (!integrationId || !secret)
    fail("Connection and credential are required.");
  const { error } = await context.supabase.rpc(
    "set_organization_integration_secret_v1",
    { target_integration_id: integrationId, secret_value: secret },
  );
  if (error) fail(error.message);
  if (grantedScopes.length) {
    const { error: scopeError } = await context.supabase
      .from("organization_integrations")
      .update({ granted_scopes: grantedScopes })
      .eq("id", integrationId)
      .eq("organization_id", context.organizationId);
    if (scopeError) fail(scopeError.message);
  }
  revalidatePath("/integrations");
  redirect("/integrations?message=Credential%20updated%20securely.");
}

export async function grantAgentCapability(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const agentId = text(formData.get("agentId"));
  const integrationId = text(formData.get("integrationId"));
  const capabilityKey = text(formData.get("capabilityKey"));
  const approvalMode = text(formData.get("approvalMode"));
  if (!agentId || !integrationId || !capabilityKey || !approvalMode)
    fail("Agent, connection, capability and approval mode are required.");
  const { data: integration } = await context.supabase
    .from("organization_integrations")
    .select("provider_key")
    .eq("id", integrationId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!integration) fail("Connection is not part of this company.");
  const { data: capability } = await context.supabase
    .from("integration_capabilities")
    .select("risk_level,default_approval_mode,required_scopes,enabled")
    .eq("provider_key", integration.provider_key)
    .eq("capability_key", capabilityKey)
    .eq("enabled", true)
    .maybeSingle();
  if (!capability) fail("Capability is not valid for this provider.");
  if (
    capability.default_approval_mode === "human_only" &&
    approvalMode !== "human_only"
  )
    fail("This capability is Human Only and cannot be delegated.");
  if (
    capability.default_approval_mode === "approval_required" &&
    approvalMode === "autonomous"
  )
    fail(
      "This high-risk capability requires approval and cannot be autonomous.",
    );
  const { error } = await context.supabase
    .from("agent_integration_grants")
    .upsert(
      {
        organization_id: context.organizationId,
        agent_id: agentId,
        integration_id: integrationId,
        capability_key: capabilityKey,
        approval_mode: approvalMode,
        scope: { scopes: capability.required_scopes ?? [] },
        enabled: true,
        granted_by_user_id: context.user.id,
      },
      { onConflict: "agent_id,integration_id,capability_key" },
    );
  if (error) fail(error.message);
  revalidatePath("/integrations");
  redirect("/integrations?message=Agent%20permission%20updated.");
}

export async function revokeAgentCapability(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const grantId = text(formData.get("grantId"));
  if (!grantId) fail("Grant is required.");
  const { error } = await context.supabase
    .from("agent_integration_grants")
    .update({ enabled: false })
    .eq("id", grantId)
    .eq("organization_id", context.organizationId);
  if (error) fail(error.message);
  revalidatePath("/integrations");
}

export async function applyTemplateIntegrationProfile(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const integrationId = text(formData.get("integrationId"));
  const templateKey =
    text(formData.get("templateKey")) || "ready_software_company_v1";
  if (!integrationId) fail("Select a connected integration.");
  const { data, error } = await context.supabase.rpc(
    "apply_company_template_integration_profile_v1",
    {
      target_org_id: context.organizationId,
      target_integration_id: integrationId,
      target_template_key: templateKey,
    },
  );
  if (error || data == null) {
    console.error("template_integration_profile_failed", {
      organizationId: context.organizationId,
      integrationId,
      templateKey,
      error,
    });
    fail(
      error?.message ?? "Recommended integration grants could not be applied.",
    );
  }
  revalidatePath("/integrations");
  revalidatePath("/studio/templates");
  redirect(
    `/integrations?message=${encodeURIComponent(`${data} recommended least-privilege grants applied. Restricted capabilities remain Human Only.`)}`,
  );
}

export async function setExecutionRollout(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const toolId = text(formData.get("toolId"));
  const integrationKey = text(formData.get("integrationKey"));
  const mode = text(formData.get("executionMode"));
  const killSwitch = text(formData.get("killSwitch")) === "true";
  if (
    (!toolId && !integrationKey) ||
    ![
      "disabled",
      "simulate",
      "approval_only",
      "limited_enforced",
      "enforced",
    ].includes(mode)
  )
    fail("A valid rollout scope and mode are required.");
  const env =
    process.env.VERCEL_ENV === "production"
      ? "production"
      : process.env.VERCEL_ENV === "preview"
        ? "preview"
        : "development";
  const service = createExecutionServiceClient();
  const { error } = await service.from("execution_rollout_config").upsert(
    {
      organization_id: context.organizationId,
      tool_id: toolId || "",
      integration_key: integrationKey || "",
      environment: env,
      execution_mode: mode,
      kill_switch: killSwitch,
      policy_version: "execution-policy-v2.0.0",
      reason: "Human CEO rollout control",
      updated_by_user_id: context.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,tool_id,integration_key,environment" },
  );
  if (error) fail(error.message);
  const { error: auditError } = await context.supabase
    .from("audit_events")
    .insert({
      organization_id: context.organizationId,
      actor_type: "user",
      actor_user_id: context.user.id,
      event_type: "execution.rollout_updated",
      object_type: "execution_rollout_config",
      object_id: toolId || integrationKey,
      risk_level: killSwitch ? "high" : "medium",
      payload: {
        tool_id: toolId || null,
        integration_key: integrationKey || null,
        environment: env,
        execution_mode: mode,
        kill_switch: killSwitch,
      },
    });
  if (auditError)
    fail(
      "Rollout changed, but its audit event failed; verify the control before executing any action.",
    );
  revalidatePath("/integrations");
  redirect("/integrations?message=Execution%20rollout%20updated.");
}

export async function executeApprovedRequest(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const executionId = text(formData.get("executionId"));
  if (!executionId) fail("Execution is required.");
  const { data } = await context.supabase
    .from("tool_execution_requests")
    .select("id,status")
    .eq("id", executionId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!data) fail("Execution is not part of this company.");
  try {
    await executeApprovedToolRequest(executionId);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Execution failed.");
  }
  revalidatePath("/integrations");
  redirect(
    "/integrations?message=Approved%20action%20executed%20and%20verified.",
  );
}

export async function rollbackApprovedRequest(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const executionId = text(formData.get("executionId"));
  if (!executionId) fail("Execution is required.");
  const { data } = await context.supabase
    .from("tool_execution_requests")
    .select("id,status,rollback_available")
    .eq("id", executionId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!data?.rollback_available)
    fail("Rollback is not available for this execution.");
  try {
    await rollbackToolExecution(executionId);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Rollback failed.");
  }
  revalidatePath("/integrations");
  redirect(
    "/integrations?message=Compensating%20action%20completed%20and%20verified.",
  );
}

export async function proposePhase2Validation(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const proposalId = text(formData.get("proposalId"));
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      proposalId,
    )
  )
    fail("A valid validation proposal ID is required.");
  const service = createExecutionServiceClient();
  const { data: integration, error: integrationError } = await service
    .from("organization_integrations")
    .upsert(
      {
        organization_id: context.organizationId,
        provider_key: "internal",
        display_name: "RYTHM Internal Control",
        account_ref: "phase2",
        auth_type: "service_account",
        status: "connected",
        enabled: true,
        granted_scopes: [],
        metadata: { credential_source: "internal_service" },
        connected_by_user_id: context.user.id,
        connected_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider_key,display_name" },
    )
    .select("id")
    .single();
  if (integrationError || !integration)
    fail(
      integrationError?.message ??
        "Internal validation connection could not be prepared.",
    );
  const result = await requestToolExecution(service, {
    organizationId: context.organizationId,
    userId: context.user.id,
    integrationId: integration.id,
    toolId: "internal.validation",
    capabilityKey: "validation.record.create",
    targetRef: "release-gate-2",
    input: { marker: "phase2-production-validation" },
    originatingRequestId: `phase2-validation:${proposalId}`,
    requestedBy: "user",
    authoritySource: "human",
    intent: "release_gate_validation",
  });
  revalidatePath("/integrations");
  if (result.approval_request_id)
    redirect(
      `/approvals?approval=${result.approval_request_id}&message=Review%20the%20exact%20reversible%20Phase%202%20validation%20action.`,
    );
  redirect(
    "/integrations?message=Phase%202%20validation%20simulation%20recorded.",
  );
}
