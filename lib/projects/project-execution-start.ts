import type { SupabaseClient } from "@supabase/supabase-js";
import { getApprovedProjectRoadmap, type RoadmapTask } from "@/lib/projects/project-roadmap";

/**
 * Starts durable project execution from the manager-approved roadmap baseline.
 * Readiness remains advisory; task-level dependencies, approvals and connection/data
 * waits determine which branches can execute. Project progress is measured against
 * the same approved roadmap, so task count can never masquerade as project progress.
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
    .select("id,execution_no,status,roadmap_id")
    .eq("project_id", projectId)
    .in("status", ["queued", "running", "paused"])
    .maybeSingle();

  if (active.data) return active.data;

  const roadmap = await getApprovedProjectRoadmap(supabase, organizationId, projectId);
  if (!roadmap) throw new Error("Approve a project roadmap before execution can start.");

  const latest = await supabase
    .from("project_executions")
    .select("execution_no")
    .eq("project_id", projectId)
    .order("execution_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const phaseByTaskKey = new Map<string, { phaseId: string; phaseKey: string; task: RoadmapTask }>();
  for (const phase of roadmap.phases) {
    if (!phase.id) continue;
    for (const task of phase.tasks) {
      const executionKey = `${phase.key}:${task.key}`.slice(0, 180);
      if (phaseByTaskKey.has(executionKey)) throw new Error(`Duplicate roadmap task key: ${executionKey}`);
      phaseByTaskKey.set(executionKey, { phaseId: phase.id, phaseKey: phase.key, task });
    }
  }

  const unresolvedTasks = [...phaseByTaskKey.entries()].map(([executionKey, value]) => ({
    ...value.task,
    key: executionKey,
    rawTaskKey: value.task.key,
    phaseId: value.phaseId,
    phaseKey: value.phaseKey,
  }));
  if (!unresolvedTasks.length) throw new Error("The approved roadmap has no executable tasks. Revise the roadmap before starting execution.");

  const executionKeys = new Set(unresolvedTasks.map((task) => task.key));
  const keysByRawTask = new Map<string, string[]>();
  for (const task of unresolvedTasks) {
    const matches = keysByRawTask.get(task.rawTaskKey) ?? [];
    matches.push(task.key);
    keysByRawTask.set(task.rawTaskKey, matches);
  }

  const tasks = unresolvedTasks.map((task) => ({
    ...task,
    dependencies: task.dependencies.map((dependency) => {
      const dep = String(dependency).trim();
      if (!dep) throw new Error(`Roadmap task ${task.key} contains an empty dependency.`);
      if (executionKeys.has(dep)) return dep;

      const samePhaseKey = `${task.phaseKey}:${dep}`;
      if (executionKeys.has(samePhaseKey)) return samePhaseKey;

      const globalMatches = keysByRawTask.get(dep) ?? [];
      if (globalMatches.length === 1) return globalMatches[0];
      if (globalMatches.length > 1) {
        throw new Error(`Roadmap dependency ${dep} for ${task.key} is ambiguous across phases. Use an explicit phase:task key.`);
      }
      throw new Error(`Roadmap dependency ${dep} for ${task.key} does not exist in the approved roadmap.`);
    }),
  }));

  const executionNo = Number(latest.data?.execution_no ?? 0) + 1;
  const now = new Date().toISOString();

  const execution = await supabase
    .from("project_executions")
    .insert({
      organization_id: organizationId,
      project_id: projectId,
      roadmap_id: roadmap.id,
      execution_no: executionNo,
      status: "running",
      execution_context: {
        project_code: project.data.project_code,
        autonomy_mode: project.data.autonomy_mode,
        readiness_at_start: Number(project.data.readiness_score ?? 0),
        global_readiness_gate: false,
        roadmap_id: roadmap.id,
        roadmap_version: roadmap.version,
      },
      plan_snapshot: {
        roadmap: { id: roadmap.id, version: roadmap.version, title: roadmap.title, phases: roadmap.phases },
        tasks,
      },
      budget_snapshot: { ai_budget_usd: project.data.budget_cap_usd },
      started_by_user_id: userId,
      started_at: now,
      last_heartbeat_at: now,
    })
    .select("id,execution_no,status,roadmap_id")
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
      roadmap_id: roadmap.id,
      roadmap_phase_id: task.phaseId,
      action_item_id: actionId,
      task_key: task.key,
      title: task.title,
      assigned_agent_id: task.agentId ?? null,
      status: approvalId ? "waiting_for_approval" : "queued",
      priority: task.priority,
      dependencies: task.dependencies,
      waiting_on_approval_id: approvalId,
      work_weight: Math.max(0.1, Number(task.workWeight || 1)),
      idempotency_key: `project:${projectId}:execution:${executionNo}:task:${task.key}`,
      input: { description: task.description, risk: task.risk, roadmap_id: roadmap.id, roadmap_version: roadmap.version, roadmap_phase_id: task.phaseId, roadmap_phase_key: task.phaseKey },
    });
  }

  await supabase
    .from("projects")
    .update({ status: "active", stage: "execution", progress_percent: 0, last_heartbeat_at: now, updated_at: now })
    .eq("id", projectId)
    .eq("organization_id", organizationId);

  await supabase.from("project_activity_events").insert({
    organization_id: organizationId,
    project_id: projectId,
    execution_id: execution.data.id,
    event_type: "project.execution.started",
    headline: "Project execution started from approved roadmap",
    detail: `Execution #${executionNo} started from roadmap v${roadmap.version} with ${tasks.length} tasks. Progress is measured against weighted roadmap work, not raw task count.`,
    importance: "major",
    metadata: { readiness_at_start: Number(project.data.readiness_score ?? 0), global_readiness_gate: false, roadmap_id: roadmap.id, roadmap_version: roadmap.version },
  });

  return { ...execution.data, taskCount: tasks.length, roadmapVersion: roadmap.version };
}
