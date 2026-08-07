import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type DecisionRow = {
  id: string;
  project_id: string | null;
  decision_key: string;
  title: string;
  risk_level: string;
  status: string;
  decided_at: string | null;
  created_at: string;
};

type ActionRow = {
  id: string;
  project_id: string | null;
  meeting_id: string | null;
  decision_id: string | null;
  action_code: string | null;
  title: string;
  status: string;
  risk_level: string | null;
  handoff_source: string | null;
  authorization_approval_id: string | null;
  authorized_at: string | null;
  created_at: string;
};

type ApprovalRow = { id: string; status: string; risk_level: string; resolved_at: string | null };
type ProjectRow = { id: string; project_code: string; name: string; stage: string | null; progress_percent: number | null };
type MeetingRow = { id: string; title: string; status: string; created_at: string };
type AuditRow = { payload: Record<string, unknown> | null };

type Props = { searchParams: Promise<{ decision?: string }> };

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Not set";

async function ownerContext() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("organization_members")
    .select("organization_id").eq("user_id", user.id).eq("role", "owner").maybeSingle();
  if (!membership) redirect("/login?error=Owner%20authorization%20required.");
  return { supabase, organizationId: membership.organization_id as string };
}

export default async function WorkflowTraceabilityPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, organizationId } = await ownerContext();

  const { data: decisionData } = await supabase.from("decisions")
    .select("id,project_id,decision_key,title,risk_level,status,decided_at,created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(75);
  const decisions = (decisionData ?? []) as DecisionRow[];
  const selectedId = params.decision ?? decisions[0]?.id ?? null;
  const selected = selectedId ? decisions.find((item) => item.id === selectedId) ?? null : null;

  let actions: ActionRow[] = [];
  let approval: ApprovalRow | null = null;
  let project: ProjectRow | null = null;
  let meeting: MeetingRow | null = null;

  if (selected) {
    const [actionResult, approvalResult, projectResult, auditResult] = await Promise.all([
      supabase.from("action_items")
        .select("id,project_id,meeting_id,decision_id,action_code,title,status,risk_level,handoff_source,authorization_approval_id,authorized_at,created_at")
        .eq("organization_id", organizationId).eq("decision_id", selected.id).order("created_at"),
      supabase.from("approval_requests")
        .select("id,status,risk_level,resolved_at")
        .eq("organization_id", organizationId).eq("subject_type", "decision").eq("subject_id", selected.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      selected.project_id
        ? supabase.from("projects").select("id,project_code,name,stage,progress_percent").eq("organization_id", organizationId).eq("id", selected.project_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("audit_events").select("payload").eq("organization_id", organizationId)
        .eq("object_type", "decision").eq("object_id", selected.id).order("created_at", { ascending: false }).limit(10),
    ]);

    actions = (actionResult.data ?? []) as ActionRow[];
    approval = approvalResult.data as ApprovalRow | null;
    project = projectResult.data as ProjectRow | null;

    const auditRows = (auditResult.data ?? []) as AuditRow[];
    const meetingIdFromAudit = auditRows
      .map((row) => typeof row.payload?.meeting_id === "string" ? row.payload.meeting_id : null)
      .find(Boolean) ?? actions.map((item) => item.meeting_id).find(Boolean) ?? null;

    if (meetingIdFromAudit) {
      meeting = (await supabase.from("meetings").select("id,title,status,created_at")
        .eq("organization_id", organizationId).eq("id", meetingIdFromAudit).maybeSingle()).data as MeetingRow | null;
    }
  }

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">RYTHM WORKFLOW TRACEABILITY</p>
          <h1>Decision → Approval → Action → Project</h1>
          <p className="subtitle">Inspect the governed execution chain without changing Human CEO authority or enabling external actions.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="secondary-button" href="/decisions">Decision Engine</Link>
          <Link className="secondary-button" href="/actions">Action Items</Link>
          <Link className="secondary-button" href="/projects/operating">Operating View</Link>
          <Link className="secondary-button" href="/command-center">Command Center</Link>
        </div>
      </header>

      <section className="organization-banner">
        <div><span>Authority</span><strong>Human CEO / Owner</strong></div>
        <div><span>Execution handoff</span><strong>Approval-aware</strong></div>
        <div><span>External actions</span><strong>Disabled</strong></div>
      </section>

      <section className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><p className="label">WF-006</p><h2>Governed handoff trace</h2></div><span className="pill">{decisions.length} recent decisions</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,.7fr) minmax(0,1.3fr)", gap: 18 }}>
          <div className="data-list">
            {decisions.length ? decisions.map((decision) => (
              <Link key={decision.id} href={`/workflow/traceability?decision=${decision.id}`} style={{ display: "block", padding: "14px 0", borderBottom: "1px solid #e7eaf0", textDecoration: "none" }}>
                <strong>{decision.decision_key} · {decision.title}</strong>
                <span style={{ display: "block", marginTop: 5, color: "#717b8e", fontSize: ".82rem" }}>{decision.risk_level} risk · {decision.status} · {formatDate(decision.decided_at ?? decision.created_at)}</span>
              </Link>
            )) : <p className="empty-state">No decisions recorded.</p>}
          </div>

          {selected ? <article style={{ border: "1px solid #dfe4ec", borderRadius: 16, padding: 20, background: "#f8f9fb" }}>
            <div className="panel-heading"><div><p className="label">Selected decision</p><h2>{selected.title}</h2></div><div className="row-meta"><span>{selected.risk_level} risk</span><b className={selected.status === "approved" ? "state-active" : "state-paused"}>{selected.status}</b></div></div>

            <div className="compact-list">
              <div><strong>Decision</strong><span><Link href={`/decisions?decision=${selected.id}&status=${selected.status}`}>{selected.decision_key}</Link></span></div>
              <div><strong>Human CEO finalized</strong><span>{formatDate(selected.decided_at)}</span></div>
              <div><strong>Approval Request</strong><span>{approval ? <Link href={`/approvals?approval=${approval.id}`}>{approval.status} · {approval.risk_level} risk</Link> : "Not required / not created"}</span></div>
              <div><strong>Project</strong><span>{project ? <Link href="/projects/operating">{project.project_code} · {project.name} · {project.stage ?? "stage not set"} · {project.progress_percent ?? 0}%</Link> : "No linked project"}</span></div>
              <div><strong>Source meeting</strong><span>{meeting ? <Link href={`/meetings/room?meeting=${meeting.id}`}>{meeting.title} · {meeting.status}</Link> : "No meeting relationship found"}</span></div>
            </div>

            <div style={{ marginTop: 22 }}>
              <p className="label">Linked execution actions</p>
              {actions.length ? <div className="compact-list">{actions.map((action) => (
                <div key={action.id}>
                  <strong><Link href={`/actions?action=${action.id}&status=${action.status}`}>{action.action_code ?? "Action"} · {action.title}</Link></strong>
                  <span>{action.status} · {action.risk_level ?? "unclassified"} risk · {action.handoff_source ?? "legacy/direct"} · authorized {formatDate(action.authorized_at)}</span>
                </div>
              ))}</div> : <p className="empty-state">No Action Item is linked to this decision. For a newly approved decision, this indicates the execution handoff has not occurred.</p>}
            </div>

            <div style={{ marginTop: 20, padding: 14, borderRadius: 12, background: "#fff" }}>
              <p className="label">Governance interpretation</p>
              <p style={{ color: "#596579", lineHeight: 1.65, marginBottom: 0 }}>
                An approved decision can create an accountable Action Item only after Human CEO finalization. High/Critical decisions additionally require an approved Approval Request. This trace is observational; it does not authorize external execution.
              </p>
            </div>
          </article> : <p className="empty-state">Select a decision to inspect its execution chain.</p>}
        </div>
      </section>
    </main>
  );
}
