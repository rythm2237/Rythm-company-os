import "server-only";

import { executeAiRequest } from "@/lib/ai/request-gateway";
import { loadCompanyKnowledgeForAgent } from "@/lib/company-knowledge";
import type { SupabaseClient } from "@supabase/supabase-js";

type AutopilotContext = {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  organizationName: string;
};

type ActionRow = {
  id: string;
  project_id: string;
  action_code: string | null;
  title: string;
  description: string | null;
  status: string;
  assigned_agent_id: string | null;
  dependencies: unknown;
  success_criteria: unknown;
  evidence_required: unknown;
  risk_level: string;
  authorization_snapshot: Record<string, unknown> | null;
};

const asList = (value: unknown) => Array.isArray(value) ? value.map(String) : [];

async function loadProjectContext(context: AutopilotContext, projectId: string) {
  const [{ data: project }, { data: brief }, { data: resources }] = await Promise.all([
    context.supabase.from("projects").select("id,project_code,name,description,objective,scope,constraints,success_criteria").eq("organization_id", context.organizationId).eq("id", projectId).maybeSingle(),
    context.supabase.from("project_strategy_briefs").select("brief_code,title,strategic_question,internal_evidence,assumptions,analysis_priorities,required_outputs,status").eq("organization_id", context.organizationId).eq("project_id", projectId).eq("status", "ready").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    context.supabase.from("project_resources").select("resource_type,name,url,external_reference,status,metadata").eq("organization_id", context.organizationId).eq("project_id", projectId).eq("status", "connected"),
  ]);
  if (!project) throw new Error("Project is not available in the active company.");
  return { project, brief, resources: resources ?? [] };
}

async function loadNextAction(context: AutopilotContext, projectId: string) {
  await context.supabase.rpc("refresh_project_action_dependencies", { p_project_id: projectId });
  const { data } = await context.supabase.from("action_items")
    .select("id,project_id,action_code,title,description,status,assigned_agent_id,dependencies,success_criteria,evidence_required,risk_level,authorization_snapshot")
    .eq("organization_id", context.organizationId)
    .eq("project_id", projectId)
    .in("status", ["open", "in_progress"])
    .order("execution_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as ActionRow | null;
}

async function ensureApprovalGate(context: AutopilotContext, action: ActionRow) {
  const auth = action.authorization_snapshot ?? {};
  if (auth.human_approval_required !== true) return null;
  const { data: existing } = await context.supabase.from("approval_requests")
    .select("id,status")
    .eq("organization_id", context.organizationId)
    .eq("project_id", action.project_id)
    .eq("subject_type", "action_item")
    .eq("subject_id", action.id)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await context.supabase.from("approval_requests").insert({
    organization_id: context.organizationId,
    project_id: action.project_id,
    requested_by_user_id: context.userId,
    subject_type: "action_item",
    subject_id: action.id,
    title: `Approval required · ${action.title}`,
    summary: String(auth.approval_reason ?? "A consequential external action requires Human CEO approval."),
    risk_level: action.risk_level === "critical" ? "critical" : "high",
    conditions: ["Approval applies only to the prepared launch package and declared scope.", "Any material payload or scope change requires a new approval."],
    execution_operation: "external_campaign_launch",
    execution_target: "AI Role Path advertising channels",
    execution_expected_impact: "May publish externally and/or incur advertising spend.",
    execution_reversibility: "compensatable",
    execution_payload_summary: { action_code: action.action_code, title: action.title },
  }).select("id,status").single();
  if (error) throw new Error(`Approval request could not be created: ${error.message}`);
  return created;
}

export async function runNextInternalProjectAction(context: AutopilotContext, projectId: string) {
  const projectContext = await loadProjectContext(context, projectId);
  const action = await loadNextAction(context, projectId);
  if (!action) return { status: "idle" as const, message: "No internal action is ready to run." };

  const approval = await ensureApprovalGate(context, action);
  if (approval) {
    if (action.status !== "blocked") await context.supabase.from("action_items").update({ status: "blocked" }).eq("id", action.id);
    return { status: "approval_required" as const, actionCode: action.action_code, approvalId: approval.id };
  }

  if (!action.assigned_agent_id) throw new Error("Ready action has no assigned Agent.");
  const { data: agent } = await context.supabase.from("agents")
    .select("id,agent_code,display_name,name,role_title,purpose,department,work_style,enabled,system_instructions,company_knowledge_connected")
    .eq("organization_id", context.organizationId)
    .eq("id", action.assigned_agent_id)
    .maybeSingle();
  if (!agent || !agent.enabled) throw new Error("Assigned Agent is unavailable or paused.");

  if (action.status !== "in_progress") {
    await context.supabase.from("action_items").update({ status: "in_progress" }).eq("id", action.id).eq("status", action.status);
  }

  const task = [
    `PROJECT: ${projectContext.project.project_code} · ${projectContext.project.name}`,
    `ACTION: ${action.action_code ?? action.id} · ${action.title}`,
    action.description ?? "",
    `SUCCESS CRITERIA:\n${asList(action.success_criteria).map((item) => `- ${item}`).join("\n")}`,
    `EVIDENCE REQUIRED:\n${asList(action.evidence_required).map((item) => `- ${item}`).join("\n")}`,
    projectContext.brief ? `CLIENT BRIEF:\n${JSON.stringify(projectContext.brief)}` : "",
    `CONNECTED PROJECT RESOURCES:\n${JSON.stringify(projectContext.resources)}`,
    "Complete this internal action only. Produce a decision-ready deliverable with explicit evidence, assumptions, unresolved questions, handoff notes and next-step dependencies.",
    "Do not publish, spend money, change external accounts, enter contracts, change pricing, expose credentials or claim an external action occurred. Escalate consequential external steps to the Human CEO approval gate.",
  ].filter(Boolean).join("\n\n");

  const knowledge = await loadCompanyKnowledgeForAgent(
    { organizationId: context.organizationId, organization: { id: context.organizationId, name: context.organizationName } as any, supabase: context.supabase },
    { id: agent.id, role_title: agent.role_title, department: agent.department, company_knowledge_connected: agent.company_knowledge_connected },
    task,
  );

  const systemInstructions = [
    agent.system_instructions?.trim(),
    !agent.system_instructions?.trim() ? `You are ${agent.display_name ?? agent.name}, serving as ${agent.role_title} in ${context.organizationName}.` : "",
    agent.purpose ? `Role purpose: ${agent.purpose}` : "",
    agent.work_style ? `Operating style: ${agent.work_style}` : "",
    "PROJECT AUTOPILOT MODE. You are performing governed internal work for an assigned project Action Item.",
    "Use connected client/project resources and supplied verified knowledge. Treat website observations as evidence only when actually present in connected project context; never invent unseen website content.",
    "Facts, assumptions and recommendations must be clearly separated.",
    "Internal analysis, drafting, planning and Agent-to-Agent handoff are authorized. External side effects are not authorized here.",
    knowledge.contextText,
  ].filter(Boolean).join("\n\n");

  try {
    const result = await executeAiRequest({
      organizationId: context.organizationId,
      actor: { type: "user", userId: context.userId, agentId: agent.id },
      feature: "agent.console",
      prompt: task,
      systemInstructions,
      attachments: knowledge.attachments,
      attachmentFailurePolicy: "retry_without_binary",
      mode: "task",
      maxOutputTokens: 6000,
      timeoutMs: 180000,
      telemetryPolicy: "required",
    });

    await context.supabase.from("audit_events").insert({
      organization_id: context.organizationId,
      actor_type: "agent",
      actor_agent_id: agent.id,
      event_type: "project.action_autopilot_completed",
      object_type: "action_item",
      object_id: action.id,
      risk_level: action.risk_level ?? "low",
      payload: {
        project_id: projectId,
        action_code: action.action_code,
        agent_code: agent.agent_code,
        output: result.outputText,
        correlation_id: result.correlationId,
        selected_provider: result.routingDecision.selectedProvider,
        selected_model: result.routingDecision.selectedModel,
        external_actions_allowed: false,
      },
    });

    await context.supabase.from("action_items").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", action.id);
    await context.supabase.rpc("refresh_project_action_dependencies", { p_project_id: projectId });

    return { status: "completed" as const, actionCode: action.action_code, title: action.title, output: result.outputText };
  } catch (error) {
    await context.supabase.from("action_items").update({ status: "blocked" }).eq("id", action.id);
    await context.supabase.from("audit_events").insert({
      organization_id: context.organizationId,
      actor_type: "system",
      event_type: "project.action_autopilot_failed",
      object_type: "action_item",
      object_id: action.id,
      risk_level: "medium",
      payload: { project_id: projectId, action_code: action.action_code, error: error instanceof Error ? error.message.slice(0, 1200) : "Unknown autopilot failure" },
    });
    throw error;
  }
}
