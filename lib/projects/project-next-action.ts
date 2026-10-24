import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectNextAction = {
  stage: "setup" | "discovery" | "diagnosis" | "planning" | "approval" | "execution" | "verification" | "completion" | "blocked" | "recovery";
  executionState: string | null;
  action: "analyze" | "clarify" | "create_roadmap" | "review_roadmap" | "start" | "monitor" | "review_decisions" | "review_results" | "assign_team" | "review_recovery" | "supply_evidence" | "none";
  label: string;
  reason: string;
  eligible: boolean;
  blockers: string[];
  requiredApprovals: number;
  href: string;
};
export type NextActionInput = {
  projectId: string;
  projectStatus: string;
  lifecycleState?: string | null;
  nextRequiredAction?: string | null;
  executionState?: string | null;
  hasAnalysis: boolean;
  requiredQuestions: number;
  pendingApprovals: number;
  roadmap: { status: string; isBaseline: boolean } | null;
  canManage: boolean;
  teamNeedsAttention?: boolean;
  waitingForEvidence?: boolean;
};

/** Product-level projection only. Existing task waits and approval gates remain authoritative. */
export function deriveProjectNextAction(input: NextActionInput): ProjectNextAction {
  const base = `/projects/operating?project=${encodeURIComponent(input.projectId)}`;
  const status = input.projectStatus.toLowerCase();
  const lifecycle = (input.lifecycleState ?? "").toUpperCase();
  const execution = input.executionState ?? null;
  const result = (stage: ProjectNextAction["stage"], action: ProjectNextAction["action"], label: string, reason: string, view: string, blockers: string[] = []): ProjectNextAction => ({
    stage, action, label, reason, href: `${base}&view=${view}`, executionState: execution,
    eligible: input.canManage && action !== "none", blockers, requiredApprovals: input.pendingApprovals,
  });
  if (["cancelled", "archived", "completed"].includes(status) || ["CANCELLED", "ARCHIVED", "COMPLETED"].includes(lifecycle)) {
    return result("completion", "review_results", "Review project results", input.nextRequiredAction || "Review recorded outcomes and retained project history.", "results");
  }
  if (["blocked", "on_hold", "paused"].includes(status) || ["BLOCKED", "ON_HOLD", "PAUSED"].includes(lifecycle) || (execution === "paused" && !(status === "active" && input.roadmap && !input.roadmap.isBaseline && ["draft", "in_review"].includes(input.roadmap.status)))) {
    return result("blocked", "review_decisions", "Review project hold", input.nextRequiredAction || "Review the pause and governing decisions before resuming work.", "overview", ["Execution is on hold; resumption requires the existing governance controls."]);
  }
  // Active legacy execution takes precedence over new setup fields: never restart it.
  if (["running", "queued"].includes(execution ?? "")) {
    if (input.requiredQuestions > 0) return result("execution", "clarify", "Answer the next essential question", "A runnable task needs information only you can supply. Independent authorized work can continue.", "overview");
    if (input.waitingForEvidence) return result("execution", "supply_evidence", "Supply evidence for the waiting work", "Page-specific work is waiting for usable screenshots or page content. Upload the relevant evidence; a website URL alone does not prove its pages were inspected.", "files");
    return input.pendingApprovals > 0
      ? result("execution", "review_decisions", "Review pending decisions", "Independent authorized work can continue while these decisions are reviewed.", "decisions")
      : result("execution", "monitor", "View live operations", "Execution continues on the server. Follow actual tasks, handoffs and blockers.", "overview");
  }
  if (input.roadmap?.isBaseline && execution === "completed") {
    return result("verification", "review_results", "Review delivery and outcome evidence", input.nextRequiredAction || "Completed tasks do not by themselves establish a verified business outcome.", "results");
  }
  if (["failed", "cancelled"].includes(execution ?? "")) {
    return result("recovery", "review_recovery", "Review execution recovery", "Review failed work and retained evidence. Use the explicit Run Project control to retry the approved baseline, or prepare a revised roadmap; no restart has occurred.", "advanced");
  }
  if (!input.hasAnalysis) return result("discovery", "analyze", "Understand this project", "Analyze the goal and authorized context before preparing a plan.", "overview");
  if (input.requiredQuestions > 0) return result("diagnosis", "clarify", "Review essential missing information", `${input.requiredQuestions} essential clarification${input.requiredQuestions === 1 ? " is" : "s are"} awaiting a response. Safe independent discovery may still proceed.`, "overview");
  if (input.teamNeedsAttention) return result("planning", "assign_team", "Review the AI project lead", "No eligible AI lead is currently confirmed. Review capabilities and available capacity before preparing execution.", "advanced", ["AI assignment requires attention."]);
  if (input.roadmap && ["draft", "in_review"].includes(input.roadmap.status)) return result("approval", "review_roadmap", "Review the proposed roadmap", "Review the diagnosis, assumptions, responsibilities and deliverables before authorizing execution.", "roadmap");
  if (input.roadmap?.isBaseline) return result("approval", "start", "Start approved work", "Only the approved baseline is eligible; task-level access and approval gates remain in force.", "roadmap");
  return result("planning", "create_roadmap", input.roadmap?.status === "rejected" ? "Prepare a revised roadmap" : "Prepare the project roadmap", "Create a reviewable plan. This action does not authorize execution.", "roadmap");
}

export async function loadProjectNextAction(supabase: SupabaseClient, organizationId: string, projectId: string, canManage = true) {
  const [project, execution, assessment, questions, approvals, roadmap, lead, assignmentEvents, evidenceWaits] = await Promise.all([
    supabase.from("projects").select("id,status,lifecycle_state,next_required_action").eq("organization_id", organizationId).eq("id", projectId).maybeSingle(),
    supabase.from("project_executions").select("status").eq("organization_id", organizationId).eq("project_id", projectId).order("execution_no", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("project_readiness_assessments").select("id,evidence").eq("organization_id", organizationId).eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("project_clarification_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("project_id", projectId).eq("status", "open").eq("materiality", "required"),
    supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("project_id", projectId).eq("status", "pending"),
    supabase.from("project_roadmaps").select("status,is_baseline").eq("organization_id", organizationId).eq("project_id", projectId).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("project_agents").select("agent_id").eq("organization_id", organizationId).eq("project_id", projectId).eq("assignment_role", "AI Project Lead").in("status", ["assigned", "active"]).limit(1).maybeSingle(),
    supabase.from("project_activity_events").select("event_type,metadata").eq("organization_id", organizationId).eq("project_id", projectId).in("event_type", ["project.assignment.blocked", "project.agent.assigned"]).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(30),
    supabase.from("project_task_runs").select("id,project_executions!inner(status)").eq("organization_id", organizationId).eq("project_id", projectId).eq("status", "waiting_for_data").eq("error_class", "missing_project_resource").in("project_executions.status", ["running", "queued"]).limit(1),
  ]);
  if ([project, execution, assessment, questions, approvals, roadmap, lead, assignmentEvents, evidenceWaits].some(row => row.error)) throw new Error("Project guidance is unavailable. Refresh before taking the next action.");
  if (!project.data) throw new Error("Project not found.");
  return deriveProjectNextAction({ projectId, projectStatus: project.data.status, lifecycleState: project.data.lifecycle_state, nextRequiredAction: project.data.next_required_action, executionState: execution.data?.status, hasAnalysis: Boolean(assessment.data), requiredQuestions: questions.count ?? 0, pendingApprovals: approvals.count ?? 0, roadmap: roadmap.data ? { status: roadmap.data.status, isBaseline: roadmap.data.is_baseline } : null, canManage, waitingForEvidence: Boolean(evidenceWaits.data?.length), teamNeedsAttention: Boolean(assessment.data?.evidence?.diagnosis) && (!lead.data || assignmentEvents.data?.find(row => row.event_type === "project.assignment.blocked" || row.metadata?.role === "lead")?.event_type === "project.assignment.blocked") });
}
