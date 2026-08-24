import type { SupabaseClient } from "@supabase/supabase-js";

export type ToolExecutionIntent = {
  organizationId: string;
  agentId: string;
  integrationId: string;
  capabilityKey: string;
  operation: string;
  targetRef?: string | null;
  input?: Record<string, unknown>;
  idempotencyKey: string;
};

type GrantRow = { approval_mode: "autonomous"|"approval_required"|"human_only"; enabled: boolean };
type CapabilityRow = { risk_level: "low"|"medium"|"high"|"restricted"; default_approval_mode: "autonomous"|"approval_required"|"human_only" };

function approvalRisk(risk: CapabilityRow["risk_level"]) { return risk === "restricted" ? "critical" : risk; }

export async function requestToolExecution(supabase: SupabaseClient, intent: ToolExecutionIntent) {
  const { data: integration, error: integrationError } = await supabase.from("organization_integrations")
    .select("id,organization_id,provider_key,status")
    .eq("id", intent.integrationId).eq("organization_id", intent.organizationId).maybeSingle();
  if (integrationError || !integration) throw new Error("Integration is not available to this company.");
  if (integration.status !== "connected") throw new Error("Integration is not connected.");

  const { data: grant } = await supabase.from("agent_integration_grants")
    .select("approval_mode,enabled")
    .eq("organization_id", intent.organizationId).eq("agent_id", intent.agentId).eq("integration_id", intent.integrationId)
    .eq("capability_key", intent.capabilityKey).eq("enabled", true).maybeSingle() as { data: GrantRow | null };
  if (!grant?.enabled) throw new Error("Agent does not have permission for this integration capability.");

  const { data: capability } = await supabase.from("integration_capabilities")
    .select("risk_level,default_approval_mode").eq("provider_key", integration.provider_key).eq("capability_key", intent.capabilityKey).maybeSingle() as { data: CapabilityRow | null };
  if (!capability) throw new Error("Integration capability is not registered.");
  if (capability.default_approval_mode === "human_only" || grant.approval_mode === "human_only") {
    throw new Error("This operation is Human Only and cannot be executed by an Agent.");
  }
  const approvalMode = capability.default_approval_mode === "approval_required" ? "approval_required" : grant.approval_mode;

  const { data: request, error: requestError } = await supabase.from("tool_execution_requests").insert({
    organization_id: intent.organizationId,
    agent_id: intent.agentId,
    integration_id: intent.integrationId,
    capability_key: intent.capabilityKey,
    operation: intent.operation,
    target_ref: intent.targetRef ?? null,
    input: intent.input ?? {},
    risk_level: capability.risk_level,
    approval_mode: approvalMode,
    status: approvalMode === "approval_required" ? "awaiting_approval" : "approved",
    idempotency_key: intent.idempotencyKey,
  }).select("id,status").single();
  if (requestError || !request) {
    if (requestError?.code === "23505") {
      const { data: existing } = await supabase.from("tool_execution_requests").select("id,status,approval_request_id").eq("organization_id", intent.organizationId).eq("idempotency_key", intent.idempotencyKey).maybeSingle();
      if (existing) return existing;
    }
    throw new Error(requestError?.message ?? "Tool execution request could not be created.");
  }

  await supabase.from("tool_execution_events").insert({ organization_id: intent.organizationId, execution_request_id: request.id, event_type: "requested", status: request.status, safe_detail: { capability: intent.capabilityKey, operation: intent.operation, target: intent.targetRef ?? null } });

  if (approvalMode === "approval_required") {
    const { data: approval, error: approvalError } = await supabase.from("approval_requests").insert({
      organization_id: intent.organizationId,
      subject_type: "tool_execution",
      subject_id: request.id,
      title: `Approve ${intent.capabilityKey}`,
      summary: `Agent requests ${intent.operation}${intent.targetRef ? ` on ${intent.targetRef}` : ""}.`,
      risk_level: approvalRisk(capability.risk_level),
      requested_by_agent_id: intent.agentId,
      status: "pending",
      conditions: { integration_id: intent.integrationId, capability_key: intent.capabilityKey, execution_request_id: request.id },
    }).select("id").single();
    if (approvalError || !approval) throw new Error(approvalError?.message ?? "Approval request could not be created.");
    await supabase.from("tool_execution_requests").update({ approval_request_id: approval.id }).eq("id", request.id).eq("organization_id", intent.organizationId);
    return { ...request, approval_request_id: approval.id };
  }

  return request;
}

export async function syncToolExecutionApproval(supabase: SupabaseClient, organizationId: string, executionRequestId: string) {
  const { data: request } = await supabase.from("tool_execution_requests").select("id,status,approval_request_id").eq("organization_id", organizationId).eq("id", executionRequestId).maybeSingle();
  if (!request?.approval_request_id) return request;
  const { data: approval } = await supabase.from("approval_requests").select("status").eq("organization_id", organizationId).eq("id", request.approval_request_id).maybeSingle();
  if (!approval) return request;
  const nextStatus = approval.status === "approved" ? "approved" : approval.status === "rejected" ? "denied" : approval.status === "cancelled" || approval.status === "expired" ? "cancelled" : "awaiting_approval";
  if (nextStatus !== request.status) {
    await supabase.from("tool_execution_requests").update({ status: nextStatus }).eq("id", request.id).eq("organization_id", organizationId);
    await supabase.from("tool_execution_events").insert({ organization_id: organizationId, execution_request_id: request.id, event_type: "approval_sync", status: nextStatus, safe_detail: {} });
  }
  return { ...request, status: nextStatus };
}
