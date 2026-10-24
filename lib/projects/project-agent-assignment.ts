import type { SupabaseClient } from "@supabase/supabase-js";

export type AssignmentRequirements = { skills: string[]; domain?: string; allocationPercent?: number; minimumSkillMatch?: number };
export type AssignmentWeights = { skill: number; domain: number; capacity: number; quality: number; scheduling: number };
export const DEFAULT_ASSIGNMENT_WEIGHTS: AssignmentWeights = { skill: 40, domain: 25, capacity: 20, quality: 10, scheduling: 5 };
export type AssignmentCandidate = {
  agentId: string; name: string; role: string; skills: string[]; specializations: string[];
  eligible: boolean; blockers: string[]; score: number | null; reason: string;
  capacity: { allocationPercent: number; runningTasks: number; queuedTasks: number; availablePercent: number; maxConcurrentTasks: number };
  scores: { skill: number; domain: number | null; capacity: number; quality: number | null; scheduling: number };
  evidence: { skills: "declared" | "evaluated"; qualitySamples: number; profileUpdatedAt?: string };
};
export type AssignmentDecision = { status: "assigned" | "blocked"; agentId: string | null; reason: string; candidates: AssignmentCandidate[]; decisionId?: string };
type AgentRecord = { id: string; organization_id: string; name?: string; display_name?: string; role_title?: string; enabled?: boolean; agent_status?: string; provisioning_status?: string; skills?: unknown; specializations?: unknown; execution_capabilities?: unknown; permissions?: unknown; mastery_status?: string; mastery_verified_at?: string; mastery_basis?: unknown; updated_at?: string };
type Commitment = { agent_id: string; project_id: string; allocation_percent: number };
type Task = { assigned_agent_id: string | null; project_id: string; status: string };
type Readiness = { agent_id: string; verified_work_count?: number; verified_work_success_rate?: number; governance_violation_count?: number };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const normalize = (value: string) => value.toLowerCase().replace(/[_-]/g, " ").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
const list = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(item => typeof item === "string" ? [item] : typeof object(item).name === "string" ? [String(object(item).name)] : typeof object(item).skill_id === "string" ? [String(object(item).skill_id)] : []) : [];
const aliases: Record<string, string[]> = {
  requirements_engineering: ["requirements", "business analysis", "product analysis"], product_discovery: ["product discovery", "product strategy", "product management"],
  ux_research: ["ux", "user research", "user experience", "usability"], solution_architecture: ["architecture", "system design", "software design"],
  security_review: ["security", "threat", "privacy"], quality_assurance: ["quality", "testing", "test automation", "qa"],
  business_model_analysis: ["business model", "business analysis", "strategy"], market_research: ["market research", "market analysis", "marketing"],
  customer_research: ["customer research", "customer insight", "audience", "research"], root_cause_analysis: ["root cause", "diagnosis", "problem solving", "analysis"],
  outcome_measurement: ["analytics", "measurement", "reporting", "kpi"], strategic_analysis: ["strategy", "strategic", "gtm"],
  hypothesis_testing: ["hypothesis", "experiment", "research", "testing"], process_mapping: ["process", "operations", "workflow"], risk_analysis: ["risk", "security", "governance"],
};
function matches(requirement: string, values: string[]) {
  const needles = [normalize(requirement), ...(aliases[requirement] ?? []).map(normalize)];
  return values.some(value => needles.some(needle => needle.length > 1 && (` ${normalize(value)} `).includes(` ${needle} `)));
}
function positiveInteger(value: unknown, fallback: number, cap = 32) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? Math.min(cap, parsed) : fallback; }
export function requestedAllocation(requirements: AssignmentRequirements) { return positiveInteger(requirements.allocationPercent, 20, 100); }

/** Pure deterministic ranking. A listed skill is never represented as demonstrated performance. */
export function scoreProjectAgents(input: {
  organizationId: string; projectId: string | null; agents: AgentRecord[]; commitments: Commitment[]; tasks: Task[]; readiness?: Readiness[];
  requirements: AssignmentRequirements; weights?: AssignmentWeights;
}): AssignmentCandidate[] {
  const weights = input.weights ?? DEFAULT_ASSIGNMENT_WEIGHTS;
  if (Object.values(weights).some(value => !Number.isFinite(value) || value < 0) || Object.values(weights).reduce((a, b) => a + b, 0) <= 0) throw new Error("Invalid assignment weights.");
  const allocation = requestedAllocation(input.requirements);
  const required = [...new Set(input.requirements.skills.map(normalize).filter(Boolean))];
  return input.agents.filter(agent => agent.organization_id === input.organizationId).map(agent => {
    const skills = list(agent.skills); const specializations = list(agent.specializations);
    const capabilities = object(agent.execution_capabilities); const permissions = object(agent.permissions);
    const maxConcurrentTasks = positiveInteger(capabilities.max_concurrent_tasks, 1);
    const runningTasks = input.tasks.filter(task => task.assigned_agent_id === agent.id && task.status === "running").length;
    const queuedTasks = input.tasks.filter(task => task.assigned_agent_id === agent.id && ["queued", "retrying"].includes(task.status)).length;
    const committed = input.commitments.filter(row => row.agent_id === agent.id && row.project_id !== input.projectId).reduce((sum, row) => sum + Math.max(0, Number(row.allocation_percent) || 0), 0);
    // Reservations are planning commitments; running occupancy is separately measured, not added twice.
    const used = Math.max(committed, runningTasks / maxConcurrentTasks * 100);
    const availablePercent = Math.max(0, 100 - used);
    const skillMatches = required.filter(skill => matches(skill.replace(/ /g, "_"), skills)).length;
    const skill = required.length ? skillMatches / required.length : 0;
    const domain = input.requirements.domain ? (matches(input.requirements.domain, specializations) ? 1 : 0) : null;
    const readiness = input.readiness?.find(row => row.agent_id === agent.id);
    const qualitySamples = Math.max(0, readiness?.verified_work_count ?? 0);
    const quality = qualitySamples > 0 ? Math.max(0, Math.min(1, Number(readiness?.verified_work_success_rate) || 0)) : null;
    const blockers: string[] = [];
    if (!agent.enabled || agent.agent_status !== "enabled") blockers.push("Agent is paused, disabled or archived.");
    if (agent.provisioning_status && agent.provisioning_status !== "ready") blockers.push("Professional knowledge provisioning is not ready.");
    if (permissions.project_execution === false || capabilities.project_coordination === false) blockers.push("Project coordination is not permitted by the agent profile.");
    if ((readiness?.governance_violation_count ?? 0) > 0) blockers.push("Unresolved governance violations require review.");
    if (!required.length) blockers.push("Project capabilities have not been identified.");
    if (required.length && (skillMatches === 0 || skill < (input.requirements.minimumSkillMatch ?? 0.15))) blockers.push("No sufficient declared capability match; specialist review is needed.");
    if (availablePercent < allocation || runningTasks >= maxConcurrentTasks) blockers.push("Insufficient schedulable capacity.");
    if (queuedTasks >= positiveInteger(capabilities.max_queued_tasks, 20, 1000)) blockers.push("Agent queue is at its workload limit.");
    const scores = { skill, domain, capacity: availablePercent / 100, quality, scheduling: 1 / (1 + queuedTasks) };
    // Unknown history/domain is excluded from denominator rather than fabricated as success or failure.
    const entries = Object.entries(scores) as Array<[keyof AssignmentWeights, number | null]>;
    const denominator = entries.reduce((sum, [key, value]) => sum + (value === null ? 0 : weights[key]), 0);
    const total = entries.reduce((sum, [key, value]) => sum + (value === null ? 0 : value * weights[key]), 0);
    const eligible = blockers.length === 0;
    return { agentId: agent.id, name: agent.display_name || agent.name || agent.id, role: agent.role_title || "Company agent", skills, specializations, eligible,
      blockers, score: eligible ? Math.round(total / denominator * 1000) / 10 : null,
      reason: eligible ? `${skillMatches}/${required.length} declared capabilities match; ${Math.round(availablePercent)}% capacity available; ${runningTasks} running and ${queuedTasks} queued tasks. ${qualitySamples ? `${qualitySamples} independently verified work records.` : "Historical quality is unknown."}` : blockers.join(" "),
      capacity: { allocationPercent: committed, runningTasks, queuedTasks, availablePercent, maxConcurrentTasks }, scores,
      evidence: { skills: "declared" as const, qualitySamples, profileUpdatedAt: agent.updated_at } };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || (b.score ?? -1) - (a.score ?? -1) || a.capacity.queuedTasks - b.capacity.queuedTasks || a.agentId.localeCompare(b.agentId));
}

/** All capacity records are scoped to the organization; terminal projects release planning commitments. */
export async function loadProjectAgentCandidates(supabase: SupabaseClient, organizationId: string, projectId: string | null, requirements: AssignmentRequirements) {
  const [agents, commitments, tasks, projects, readiness] = await Promise.all([
    supabase.from("agents").select("id,organization_id,name,display_name,role_title,enabled,agent_status,provisioning_status,skills,specializations,permissions,execution_capabilities,updated_at").eq("organization_id", organizationId),
    supabase.from("project_agent_capacity").select("agent_id,project_id,allocation_percent").eq("organization_id", organizationId),
    supabase.from("project_task_runs").select("assigned_agent_id,project_id,status").eq("organization_id", organizationId).in("status", ["running", "queued", "retrying"]),
    supabase.from("projects").select("id,status").eq("organization_id", organizationId),
    supabase.rpc("organization_agent_operational_readiness_v1", { target_organization_id: organizationId }),
  ]);
  for (const result of [agents, commitments, tasks, projects]) if (result.error) throw new Error(`Agent assignment evidence is unavailable: ${result.error.message}`);
  const terminal = new Set((projects.data ?? []).filter(row => ["completed", "cancelled", "archived"].includes(String(row.status))).map(row => row.id));
  return scoreProjectAgents({ organizationId, projectId, requirements, agents: agents.data ?? [], commitments: (commitments.data ?? []).filter(row => !terminal.has(row.project_id)), tasks: tasks.data ?? [], readiness: !readiness.error && Array.isArray(readiness.data) ? readiness.data : [] });
}

export async function reserveProjectAgentAssignment(supabase: SupabaseClient, organizationId: string, projectId: string, actorId: string, candidate: AssignmentCandidate, requirements: AssignmentRequirements, role: "lead" | "specialist", mode: "auto" | "manual") {
  if (!candidate.eligible) return { ok: false, reason: candidate.reason };
  const reserved = await supabase.rpc("reserve_project_agent_assignment_v1", { p_organization_id: organizationId, p_project_id: projectId, p_agent_id: candidate.agentId, p_actor_user_id: actorId, p_allocation_percent: requestedAllocation(requirements), p_role: role,
    p_decision: { algorithm: "capability-capacity-v1", mode, requirements, weights: DEFAULT_ASSIGNMENT_WEIGHTS, scores: candidate.scores, score: candidate.score, evidence: candidate.evidence, reason: candidate.reason } });
  if (reserved.error) return { ok: false, reason: reserved.error.code === "PGRST202" ? "Atomic assignment service is unavailable until the assignment migration is installed." : reserved.error.message };
  const result = object(reserved.data);
  return { ok: result.ok === true, reason: String(result.reason ?? "Assignment capacity changed; refresh and retry."), decisionId: typeof result.event_id === "string" ? result.event_id : undefined };
}

export async function assignProjectLead(supabase: SupabaseClient, organizationId: string, projectId: string, actorId: string, input: AssignmentRequirements & { mode: "auto" | "manual"; agentId?: string }): Promise<AssignmentDecision> {
  const candidates = await loadProjectAgentCandidates(supabase, organizationId, projectId, input);
  const options = input.mode === "manual" ? candidates.filter(candidate => candidate.agentId === input.agentId) : candidates.filter(candidate => candidate.eligible);
  if (!options.length) return { status: "blocked", agentId: null, reason: "No suitable available AI lead. Review the required capabilities and workforce; no agent was selected.", candidates };
  let reason = "No suitable schedulable AI lead remains.";
  for (const candidate of options) {
    const result = await reserveProjectAgentAssignment(supabase, organizationId, projectId, actorId, candidate, input, "lead", input.mode);
    if (result.ok) return { status: "assigned", agentId: candidate.agentId, reason: candidate.reason, candidates, decisionId: result.decisionId };
    reason = result.reason;
    if (reason.includes("migration")) break;
  }
  return { status: "blocked", agentId: null, reason, candidates };
}

/** Approved task text identifies needed capabilities; this never grants external execution permission. */
export function capabilitiesForAssignmentText(text: string) {
  return Object.keys(aliases).filter(capability => matches(capability, [text]));
}
export async function ensureProjectAgentReservation(supabase: SupabaseClient, input: { organizationId: string; projectId: string; actorId: string; agentId: string; taskText: string; allocationPercent?: number }) {
  const previous = await supabase.from("project_activity_events").select("metadata").eq("organization_id", input.organizationId).eq("project_id", input.projectId).eq("agent_id", input.agentId).eq("event_type", "project.agent.assigned").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previous.error) throw new Error(previous.error.message);
  const existingCapacity = await supabase.from("project_agent_capacity").select("allocation_percent").eq("organization_id", input.organizationId).eq("project_id", input.projectId).eq("agent_id", input.agentId).maybeSingle();
  if (existingCapacity.error) throw new Error(existingCapacity.error.message);
  if (existingCapacity.data?.allocation_percent === 0) return { ok: false, reason: "This agent allocation is explicitly paused; a human must restore capacity." };
  const priorRequirements = object(object(object(previous.data?.metadata).decision).requirements);
  const skills = capabilitiesForAssignmentText(input.taskText);
  const requirements: AssignmentRequirements = { skills: skills.length ? skills : list(priorRequirements.skills), allocationPercent: existingCapacity.data?.allocation_percent ?? input.allocationPercent ?? (Number(priorRequirements.allocationPercent) || 20) };
  const candidates = await loadProjectAgentCandidates(supabase, input.organizationId, input.projectId, requirements);
  const candidate = candidates.find(row => row.agentId === input.agentId);
  if (!candidate) return { ok: false, reason: "Assigned agent is outside the authorized company workforce." };
  return reserveProjectAgentAssignment(supabase, input.organizationId, input.projectId, input.actorId, candidate, requirements, "specialist", "manual");
}
