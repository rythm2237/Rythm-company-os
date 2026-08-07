import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getProjectOperatingTimeline, getProjectRelationships, refreshProjectWorkflowState, type EntityRelationship, type WorkflowTimelineItem } from "@/lib/workflow/server";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  project_code: string;
  name: string;
  description: string;
  status: string;
  stage: string;
  workflow_state: string;
  workflow_state_updated_at: string;
  progress_percent: number;
  blocker_type: string | null;
  blocker_summary: string | null;
  resolution_required: string | null;
};

type CountRow = { count: number | null };

const stateExplanation: Record<string, string> = {
  INTAKE: "A governed project or issue exists and is waiting to enter substantive discovery.",
  DISCOVERY: "Context, evidence, resources, assumptions or project framing are being prepared.",
  DELIBERATION: "A governed meeting or multi-agent deliberation is active or is the current required step.",
  LEGAL_REVIEW: "The current path is waiting for or undergoing AI Legal Review.",
  DECISION_PENDING: "A decision package exists and Human CEO action is required.",
  APPROVAL_PENDING: "A governed approval gate is pending.",
  EXECUTION: "An approved decision has active governed execution work.",
  BLOCKED: "Progress cannot continue until an explicit governed blocker is resolved.",
  COMPLETE: "The current governed objective has satisfied its completion conditions.",
  CANCELLED: "The governed project or workflow was intentionally stopped.",
};

function label(value: string) {
  return value.replaceAll("_", " ").replaceAll(".", " · ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function payloadSummary(item: WorkflowTimelineItem) {
  const payload = item.payload ?? {};
  const explicit = [payload.event_label, payload.label, payload.reason, payload.next_step, payload.after_state]
    .find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof explicit === "string" ? explicit : label(item.event_type);
}

function destinationForRelationship(edge: EntityRelationship) {
  const candidates = [edge.source_type, edge.target_type];
  if (candidates.includes("meeting") || candidates.includes("meeting_session") || candidates.includes("decision") || candidates.includes("legal_review")) {
    return "/meetings/room";
  }
  if (candidates.includes("project_progress_event") || candidates.includes("project_milestone")) {
    return "/projects";
  }
  if (candidates.includes("action_item")) {
    return "/projects/execution-plan";
  }
  if (candidates.includes("memory_record")) {
    return "/memory";
  }
  return "/projects";
}

async function ownerContext() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!membership) redirect("/login?error=Owner%20authorization%20required.");
  return { supabase, organizationId: membership.organization_id as string };
}

export default async function ProjectOperatingPage() {
  const { supabase, organizationId } = await ownerContext();
  const { data: projectData } = await supabase
    .from("projects")
    .select("id,project_code,name,description,status,stage,workflow_state,workflow_state_updated_at,progress_percent,blocker_type,blocker_summary,resolution_required")
    .eq("organization_id", organizationId)
    .eq("project_code", "AI-PR-001")
    .maybeSingle();

  if (!projectData) {
    return <main className="command-shell"><section className="panel"><h1>Project operating view unavailable</h1><p>AI-PR-001 was not found.</p><Link className="secondary-button" href="/projects">Back to Project Workspace</Link></section></main>;
  }

  const project = projectData as ProjectRow;
  let resolvedState = project.workflow_state;
  try {
    resolvedState = await refreshProjectWorkflowState(supabase, project.id, { entityType: "ui", reason: "Project operating view convergence" });
  } catch {
    // Read-only rendering remains available if a refresh is temporarily unavailable.
  }

  const [timeline, relationships, meetings, decisions, actions, approvals, legalReviews] = await Promise.all([
    getProjectOperatingTimeline(supabase, project.id, 40),
    getProjectRelationships(supabase, project.id),
    supabase.from("meetings").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    supabase.from("decisions").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    supabase.from("action_items").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    supabase.from("meeting_legal_reviews").select("id,meeting_agent_sessions!inner(project_id)", { count: "exact", head: true }).eq("meeting_agent_sessions.project_id", project.id),
  ]);

  const counts: Record<string, CountRow> = {
    meetings: { count: meetings.count },
    decisions: { count: decisions.count },
    actions: { count: actions.count },
    approvals: { count: approvals.count },
    legal: { count: legalReviews.count },
  };

  return <main className="command-shell">
    <header className="command-header">
      <div>
        <p className="eyebrow">RYTHM PROJECT OPERATING VIEW · {project.project_code}</p>
        <h1>{project.name}</h1>
        <p className="subtitle">One governed view of workflow state, operating history and connected project entities.</p>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="secondary-button" href="/projects">Project Workspace</Link>
        <Link className="secondary-button" href="/meetings/room">Boardroom</Link>
        <Link className="secondary-button" href="/projects/execution-plan">Execution Plan</Link>
        <Link className="secondary-button" href="/command-center">Command Center</Link>
      </div>
    </header>

    <section className="organization-banner">
      <div><span>Workflow state</span><strong>{label(resolvedState)}</strong></div>
      <div><span>Project stage</span><strong>{label(project.stage)}</strong></div>
      <div><span>Progress</span><strong>{project.progress_percent}%</strong></div>
    </section>

    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel-heading"><div><p className="label">WF-005</p><h2>Current operating mode</h2></div><span className="pill">{resolvedState}</span></div>
      <p style={{ color: "#596579", lineHeight: 1.7 }}>{stateExplanation[resolvedState] ?? "Canonical workflow state resolved from persisted governed records."}</p>
      {resolvedState === "BLOCKED" ? <div style={{ marginTop: 14 }}><strong>{project.blocker_type ?? "Governed blocker"}</strong><p>{project.blocker_summary ?? "A blocker is recorded for this project."}</p><p>{project.resolution_required ?? "Resolution is required before workflow continuation."}</p></div> : null}
    </section>

    <section className="metrics-grid" style={{ marginTop: 18 }}>
      <article className="metric-card"><span>Meetings</span><strong>{counts.meetings.count ?? 0}</strong></article>
      <article className="metric-card"><span>Decisions</span><strong>{counts.decisions.count ?? 0}</strong></article>
      <article className="metric-card"><span>Actions</span><strong>{counts.actions.count ?? 0}</strong></article>
      <article className="metric-card"><span>Approvals</span><strong>{counts.approvals.count ?? 0}</strong></article>
      <article className="metric-card"><span>AI legal reviews</span><strong>{counts.legal.count ?? 0}</strong></article>
      <article className="metric-card"><span>Semantic links</span><strong>{relationships.length}</strong></article>
    </section>

    <section className="executive-grid" style={{ marginTop: 18 }}>
      <article className="panel panel-wide">
        <div className="panel-heading"><div><p className="label">WF-004</p><h2>Operating Timeline</h2></div><span className="pill">{timeline.length} recent events</span></div>
        <div className="data-list">
          {timeline.length === 0 ? <p className="subtitle">No operating events are available yet.</p> : timeline.map((item) => <div className="data-row" key={`${item.timeline_source}-${item.id}`}>
            <div><strong>{payloadSummary(item)}</strong><span>{label(item.event_type)} · {label(item.entity_type)} · {formatDate(item.occurred_at)}</span></div>
            <div className="row-meta"><span className="pill">{label(item.timeline_source)}</span><span className="pill">{item.risk_level}</span></div>
          </div>)}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading"><div><p className="label">WF-003</p><h2>Project graph</h2></div><span className="pill">{relationships.length} edges</span></div>
        <div className="data-list">
          {relationships.length === 0 ? <p className="subtitle">No semantic relationship edges are available yet.</p> : relationships.slice(0, 20).map((edge) => <Link className="data-row" href={destinationForRelationship(edge)} key={edge.id} style={{ textDecoration: "none" }}>
            <div><strong>{label(edge.relationship_type)}</strong><span>{label(edge.source_type)} → {label(edge.target_type)}</span></div>
          </Link>)}
        </div>
      </article>
    </section>

    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel-heading"><div><p className="label">Contextual navigation</p><h2>Continue the governed workflow</h2></div></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="secondary-button" href="/meetings/room">Open Boardroom</Link>
        <Link className="secondary-button" href="/projects/strategy-analysis">Strategy Analysis</Link>
        <Link className="secondary-button" href="/projects/execution-plan">Execution Planning</Link>
        <Link className="secondary-button" href="/projects">Project Controls</Link>
      </div>
    </section>
  </main>;
}
