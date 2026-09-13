import type { SupabaseClient } from "@supabase/supabase-js";
import { createDynamicExecutionPlan } from "@/lib/projects/project-operating-system";

/**
 * Starts durable project execution without using readiness as a global gate.
 * Readiness and clarifications remain planning signals; task-level dependencies,
 * approvals and connection/data waits determine which work can execute.
 */
export async function startProjectExecutionWithoutGlobalGate(
  supabase: SupabaseClient,
  organizationId: string,
  projectId: string,
  userId: string,
) {
  const project = await supabase
    .from("projects")
    .select("id,name,project_code,readiness_score,status,autonomy_mode,budget_cap_usd")
    .eq("organization_id", organizationId)
    .eq("id", projectId)
    .single();

  if (project.error || !project.data) throw new Error("Project not found.");

  const active = await supabase
    .from("project_executions")
    .select("id,execution_no,status")
    .eq("project_id", projectId)
    .in("status", ["queued", "running", "paused"])
    .maybeSingle();

  if (active.data) return active.data;

  const latest = await supabase
    .from("project_executions")
    .select("execution_no")
    .eq("project_id", projectId)
    .order("execution_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tasks = await createDynamicExecutionPlan(supabase, organizationId, projectId);
  const executionNo = Number(latest.data?.execution_no ?? 0) + 1;
  const now = new Date().toISOString();

  const execution = await supabase
    .from("project_executions")
    .insert({
      organization_id: organizationId,
      project_id: projectId,
      execution_no: executionNo,
      status: "running",
      execution_context: {
        project_code: project.data.project_code,
        autonomy_mode: project.data.autonomy_mode,
        readiness_at_start: Number(project.data.readiness_score ?? 0),
        global_readiness_gate: false,
      },
      plan_snapshot: { tasks },
      budget_snapshot: { ai_budget_usd: project.data.budget_cap_usd },
      started_by_user_id: userId,
      started_at: now,
      last_heartbeat_at: now,
    })
    .select("id,execution_no,status")
    .single();

  if (execution.error || !execution.data) {
    throw new Error(execution.error?.message || "Unable to create project execution.");
  }

  const agentIds = [...new Set(tasks.map((task) => task.agentId).filter(Boolean))] as string[];
  for (const agentId of agentIds) {
    await supabase.from("project_agents").upsert(
      {
        project_id: projectId,
        agent_id: agentId,
        organization_id: organizationId,
        assignment_role: "Execution team member",
        status: "active",
        assigned_at: now,
        authority_scope: { project_execution: true },
      },
      { onConflict: "project_id,agent_id" },
    );
    await supabase.from("project_agent_capacity").upsert(
      {
        organization_id: organizationId,
        project_id: projectId,
        agent_id: agentId,
        allocation_percent: 25,
        priority: Number(project.data.readiness_score ?? 0) >= 80 ? 2 : 3,
      },
      { onConflict: "project_id,agent_id" },
    );
  }

  for (const task of tasks) {
    let actionId: string | null = null;
    const action = await supabase
      .from("action_items")
      .insert({
        organization_id: organizationId,
        project_id: projectId,
        action_code: `${project.data.project_code}-${task.key}`.slice(0, 120),
        title: task.title,
        description: task.description,
        status: "open",
        priority: task.priority,
        assigned_agent_id: task.agentId ?? null,
        dependencies: task.dependencies,
        success_criteria: [],
        evidence_required: [],
        risk_level: task.risk,
      })
      .select("id")
      .maybeSingle();
    if (action.data) actionId = action.data.id;

    let approvalId: string | null = null;
    if (task.requiresApproval) {
      const approval = await supabase
        .from("approval_requests")
        .insert({
          organization_id: organizationId,
          project_id: projectId,
          subject_type: "project_task",
          subject_id: actionId ?? execution.data.id,
          title: `Decision required: ${task.title}`,
          summary: task.approvalReason || `Authorization is required before ${task.title} can execute.`,
          risk_level: task.risk,
          requested_by_agent_id: task.agentId ?? null,
          status: "pending",
          conditions: ["Authorization applies only to this scoped project task."],
        })
        .select("id")
        .single();
      approvalId = approval.data?.id ?? null;
    }

    await supabase.from("project_task_runs").insert({
      organization_id: organizationId,
      project_id: projectId,
      execution_id: execution.data.id,
      action_item_id: actionId,
      task_key: task.key,
      title: task.title,
      assigned_agent_id: task.agentId ?? null,
      status: approvalId ? "waiting_for_approval" : "queued",
      priority: task.priority,
      dependencies: task.dependencies,
      waiting_on_approval_id: approvalId,
      idempotency_key: `project:${projectId}:execution:${executionNo}:task:${task.key}`,
      input: { description: task.description, risk: task.risk },
    });
  }

  await supabase
    .from("projects")
    .update({ status: "active", stage: "execution", last_heartbeat_at: now, updated_at: now })
    .eq("id", projectId)
    .eq("organization_id", organizationId);

  await supabase.from("project_activity_events").insert({
    organization_id: organizationId,
    project_id: projectId,
    execution_id: execution.data.id,
    event_type: "project.execution.started",
    headline: "Project execution started",
    detail: `Execution #${executionNo} started with ${tasks.length} tasks. Readiness is advisory and does not globally block independent work.`,
    importance: "major",
    metadata: { readiness_at_start: Number(project.data.readiness_score ?? 0), global_readiness_gate: false },
  });

  return { ...execution.data, taskCount: tasks.length };
}
