"use server";

import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { executeAiRequest } from "@/lib/ai/request-gateway";
import { loadCompanyKnowledgeForAgent } from "@/lib/company-knowledge";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AgentTaskState } from "./state";

function cleanTask(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().slice(0, 12000);
}

export async function runAgentTask(_previous: AgentTaskState, formData: FormData): Promise<AgentTaskState> {
  const context = await requireActiveOwnerOrganizationContext();
  const agentCode = String(formData.get("agentCode") ?? "").trim();
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  if (!agentCode || !assignmentId) return { status: "error", error: "Agent and governed work assignment are required." };

  const { data: agent } = await context.supabase
    .from("agents")
    .select("id,agent_code,display_name,name,role_title,purpose,department,work_style,enabled,system_instructions,company_knowledge_connected")
    .eq("organization_id", context.organizationId)
    .ilike("agent_code", agentCode)
    .maybeSingle();

  if (!agent) return { status: "error", error: "Agent is not part of this company." };
  if (!agent.enabled) return { status: "error", error: "This Agent is paused. Enable the Agent runtime from its profile before assigning work." };

  const { data: assignment } = await context.supabase
    .from("agent_work_assignments")
    .select("id,title,task_brief,acceptance_criteria,status,verification_status")
    .eq("id", assignmentId)
    .eq("agent_id", agent.id)
    .eq("organization_id", context.organizationId)
    .in("status", ["assigned", "planning", "blocked"])
    .maybeSingle();
  if (!assignment) return { status: "error", error: "This governed assignment is unavailable or already executed." };
  const task = cleanTask(assignment.task_brief);

  const knowledge = await loadCompanyKnowledgeForAgent(
    { organizationId: context.organizationId, organization: context.organization as any, supabase: context.supabase },
    { id: agent.id, role_title: agent.role_title, department: agent.department, company_knowledge_connected: agent.company_knowledge_connected },
    task,
  );

  const roleInstruction = [
    agent.system_instructions?.trim(),
    !agent.system_instructions?.trim() ? `You are ${agent.display_name ?? agent.name}, serving as ${agent.role_title} in ${context.organization.name}.` : "",
    agent.purpose ? `Role purpose: ${agent.purpose}` : "",
    agent.work_style ? `Operating style: ${agent.work_style}` : "",
    "You are executing a user-assigned internal task. Use the live company and direct Agent knowledge supplied below when relevant.",
    "Do not invent company facts that are absent from the supplied knowledge. Clearly distinguish facts from recommendations.",
    "External actions, publishing, spending, legal commitments, credential changes and destructive actions are not authorized by this task interface. Propose them for Human approval instead of executing them.",
    knowledge.contextText,
  ].filter(Boolean).join("\n\n");

  let executionCompleted = false;
  try {
    const result = await executeAiRequest({
      organizationId: context.organizationId,
      actor: { type: "user", userId: context.user.id, agentId: agent.id },
      feature: "agent.console",
      prompt: task,
      systemInstructions: roleInstruction,
      attachments: knowledge.attachments,
      attachmentFailurePolicy: "retry_without_binary",
      mode: "task",
      maxOutputTokens: 4000,
      timeoutMs: 90000,
      telemetryPolicy: "required",
    });
    executionCompleted = true;

    const { data: auditEvent, error: auditError } = await context.supabase.from("audit_events").insert({
      organization_id: context.organizationId,
      actor_type: "user",
      actor_user_id: context.user.id,
      event_type: "agent.task_completed",
      object_type: "agent",
      object_id: agent.id,
      risk_level: "low",
      payload: {
        agent_code: agent.agent_code,
        correlation_id: result.correlationId,
        knowledge_count: knowledge.knowledgeCount,
        routing_mode: result.routingMode,
        execution_policy: result.executionPolicy,
        selected_provider: result.routingDecision.selectedProvider,
        selected_model: result.routingDecision.selectedModel,
        external_actions_allowed: false,
        assignment_id: assignment.id,
      },
    }).select("id").single();
    if (auditError || !auditEvent) throw new Error("Task completed, but its immutable execution evidence could not be recorded.");

    const service = createServerSupabaseClient();
    if (!service) throw new Error("Task completed, but the operational evidence service is unavailable.");
    const { error: outcomeError } = await service.rpc("record_agent_work_outcome_v1", {
      target_assignment_id: assignment.id,
      target_outcome_status: "successful",
      target_quality_score: null,
      target_agent_run_id: null,
      target_tool_execution_request_id: null,
      target_ai_request_audit_event_id: auditEvent.id,
      target_evidence: {
        correlation_id: result.correlationId,
        routing_mode: result.routingMode,
        selected_provider: result.routingDecision.selectedProvider,
        selected_model: result.routingDecision.selectedModel,
        acceptance_criteria: assignment.acceptance_criteria,
      },
    });
    if (outcomeError) throw new Error(`Task completed, but its work outcome could not be attached to the evidence ledger: ${outcomeError.message}`);
    revalidatePath(`/agents/${agent.agent_code.toLowerCase()}`);
    revalidatePath(`/agents/${agent.agent_code.toLowerCase()}/task`);

    return {
      status: "success",
      output: result.outputText,
      correlationId: result.correlationId,
      routing: `${result.routingDecision.selectedProvider} · ${result.routingDecision.selectedModel} · ${result.executionPolicy}`,
      knowledgeCount: knowledge.knowledgeCount,
      assignmentId: assignment.id,
    };
  } catch (error) {
    await context.supabase.from("audit_events").insert({
      organization_id: context.organizationId,
      actor_type: "user",
      actor_user_id: context.user.id,
      event_type: executionCompleted ? "agent.task_evidence_reconciliation_required" : "agent.task_failed",
      object_type: "agent",
      object_id: agent.id,
      risk_level: "low",
      payload: { agent_code: agent.agent_code, assignment_id: assignment.id, execution_completed: executionCompleted, external_actions_allowed: false },
    });
    return { status: "error", error: error instanceof Error ? error.message : "Agent task failed." };
  }
}
