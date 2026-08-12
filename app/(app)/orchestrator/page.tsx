import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type QueueItem = {
  id: string;
  kind: "approval" | "decision" | "meeting" | "action";
  title: string;
  status: string;
  severity: number;
  context: string;
  href: string;
  dueAt: string | null;
};

type PageProps = {
  searchParams: Promise<{ message?: string; error?: string }>;
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Not set";

const riskScore = (risk: string) => ({ critical: 100, high: 80, medium: 50, low: 20 }[risk] ?? 10);

async function getOwnerContext() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (!membership) redirect("/login?error=Owner%20authorization%20required.");
  return { supabase, user, organizationId: membership.organization_id as string };
}

async function createExecutiveReview(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await getOwnerContext();
  const focus = String(formData.get("focus") ?? "").trim();
  const agendaItems = String(formData.get("agenda") ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (focus.length < 3 || agendaItems.length === 0) {
    redirect("/orchestrator?error=Review%20focus%20and%20at%20least%20one%20agenda%20item%20are%20required.");
  }

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      organization_id: organizationId,
      title: `Executive Review: ${focus}`,
      purpose: "Human CEO review cycle generated from the Executive Orchestrator priority queue.",
      status: "draft",
      agenda: agendaItems,
      human_join_allowed: true,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (error || !meeting) {
    redirect(`/orchestrator?error=${encodeURIComponent(error?.message ?? "Executive review could not be created.")}`);
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "orchestrator.review_cycle_created",
    object_type: "meeting",
    object_id: meeting.id,
    risk_level: "medium",
    payload: {
      focus,
      agenda_count: agendaItems.length,
      authority: "Human CEO / Owner",
      automation: "human_triggered",
    },
  });

  revalidatePath("/orchestrator");
  revalidatePath("/meetings");
  revalidatePath("/command-center");
  redirect(`/meetings?status=draft&meeting=${meeting.id}&message=Executive%20review%20cycle%20created.`);
}

export default async function ExecutiveOrchestratorPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { supabase, organizationId } = await getOwnerContext();
  const now = new Date();
  const nowIso = now.toISOString();

  const [approvalsResult, decisionsResult, meetingsResult, actionsResult] = await Promise.all([
    supabase
      .from("approval_requests")
      .select("id, title, summary, risk_level, status, expires_at, created_at")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("decisions")
      .select("id, title, context, risk_level, status, created_at")
      .eq("organization_id", organizationId)
      .in("status", ["draft", "review"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("meetings")
      .select("id, title, purpose, status, scheduled_for, created_at")
      .eq("organization_id", organizationId)
      .in("status", ["draft", "scheduled", "running"])
      .order("scheduled_for", { ascending: true, nullsFirst: false })
      .limit(50),
    supabase
      .from("action_items")
      .select("id, title, description, status, priority, due_at, created_at")
      .eq("organization_id", organizationId)
      .in("status", ["open", "in_progress", "blocked"])
      .order("priority", { ascending: true })
      .limit(100),
  ]);

  const approvals = approvalsResult.data ?? [];
  const decisions = decisionsResult.data ?? [];
  const meetings = meetingsResult.data ?? [];
  const actions = actionsResult.data ?? [];

  const queue: QueueItem[] = [
    ...approvals.map((item) => ({
      id: item.id,
      kind: "approval" as const,
      title: item.title,
      status: item.status,
      severity: riskScore(item.risk_level) + (item.expires_at && item.expires_at < nowIso ? 40 : 0),
      context: `${item.risk_level} risk · ${item.summary}`,
      href: `/approvals?approval=${item.id}`,
      dueAt: item.expires_at,
    })),
    ...decisions.map((item) => ({
      id: item.id,
      kind: "decision" as const,
      title: item.title,
      status: item.status,
      severity: riskScore(item.risk_level) + (item.status === "review" ? 10 : 0),
      context: `${item.risk_level} risk · ${item.context}`,
      href: `/decisions?decision=${item.id}`,
      dueAt: null,
    })),
    ...meetings.map((item) => ({
      id: item.id,
      kind: "meeting" as const,
      title: item.title,
      status: item.status,
      severity: item.status === "running" ? 65 : item.status === "scheduled" ? 35 : 20,
      context: item.purpose,
      href: `/meetings?meeting=${item.id}&status=${item.status}`,
      dueAt: item.scheduled_for,
    })),
    ...actions.map((item) => {
      const overdue = Boolean(item.due_at && item.due_at < nowIso);
      return {
        id: item.id,
        kind: "action" as const,
        title: item.title,
        status: item.status,
        severity: (6 - item.priority) * 12 + (item.status === "blocked" ? 35 : 0) + (overdue ? 30 : 0),
        context: `${item.description ?? "No description"}${overdue ? " · OVERDUE" : ""}`,
        href: `/actions?action=${item.id}&status=${item.status}`,
        dueAt: item.due_at,
      };
    }),
  ].sort((a, b) => b.severity - a.severity).slice(0, 25);

  const overdueActions = actions.filter((item) => item.due_at && item.due_at < nowIso && item.status !== "completed").length;
  const blockedActions = actions.filter((item) => item.status === "blocked").length;
  const criticalApprovals = approvals.filter((item) => item.risk_level === "critical" || item.risk_level === "high").length;
  const health = criticalApprovals > 0 || blockedActions > 0 || overdueActions > 0 ? "Attention required" : "Controlled";
  const defaultAgenda = queue.slice(0, 8).map((item) => `[${item.kind.toUpperCase()}] ${item.title}`).join("\n");

  const metrics = [
    ["Pending approvals", approvals.length],
    ["Open decisions", decisions.length],
    ["Active meetings", meetings.length],
    ["Open actions", actions.length],
    ["Blocked actions", blockedActions],
    ["Overdue actions", overdueActions],
  ] as const;

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">RYTHM EXECUTIVE ORCHESTRATOR</p>
          <h1>Unified Human CEO operating queue</h1>
          <p className="subtitle">
            Aggregate governance, decisions, meetings, and execution into one prioritized control plane. No autonomous execution is enabled.
          </p>
        </div>
        <Link className="secondary-button" href="/command-center">Command Center</Link>
      </header>

      <section className="organization-banner">
        <div><span>Operating health</span><strong>{health}</strong></div>
        <div><span>Authority</span><strong>Human CEO / Owner</strong></div>
        <div><span>Execution mode</span><strong>Read-only intelligence · Human-triggered writes</strong></div>
      </section>

      {params.message ? <p className="form-success">{params.message}</p> : null}
      {params.error ? <p className="form-error">{params.error}</p> : null}

      <section className="metrics-grid" aria-label="Orchestrator metrics">
        {metrics.map(([label, value]) => (
          <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></article>
        ))}
      </section>

      <section className="executive-grid" style={{ marginTop: 18 }}>
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div><p className="label">Cross-module prioritization</p><h2>Executive priority queue</h2></div>
            <span className="pill">{queue.length} ranked items</span>
          </div>
          <div className="data-list">
            {queue.length ? queue.map((item, index) => (
              <Link key={`${item.kind}-${item.id}`} href={item.href} className="data-row" style={{ textDecoration: "none" }}>
                <div>
                  <strong>{index + 1}. {item.title}</strong>
                  <span>{item.kind} · {item.status} · Score {item.severity}{item.dueAt ? ` · ${formatDate(item.dueAt)}` : ""}</span>
                  <span>{item.context.length > 150 ? `${item.context.slice(0, 147)}...` : item.context}</span>
                </div>
                <div className="row-meta"><b className={item.severity >= 80 ? "state-paused" : "state-active"}>{item.severity >= 80 ? "Escalated" : "Tracked"}</b></div>
              </Link>
            )) : <p className="empty-state">No active executive work is waiting.</p>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="label">Human-triggered orchestration</p><h2>Create review cycle</h2></div></div>
          <form action={createExecutiveReview} className="auth-form" style={{ marginTop: 0 }}>
            <label>Review focus<input name="focus" defaultValue="Priority and blocker review" minLength={3} required /></label>
            <label>
              Agenda generated from priority queue
              <textarea name="agenda" defaultValue={defaultAgenda} rows={10} required style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} />
            </label>
            <button type="submit">Create governed executive review</button>
            <p className="security-note">This creates a Draft meeting only. The Human CEO must explicitly start and complete it.</p>
          </form>
        </article>
      </section>

      <section className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><p className="label">Operating flow</p><h2>Connected governance lifecycle</h2></div></div>
        <div className="grid">
          <Link className="card" href="/approvals" style={{ textDecoration: "none" }}><span>1</span><h3>Approval</h3><p>Authorize consequential work.</p></Link>
          <Link className="card" href="/decisions" style={{ textDecoration: "none" }}><span>2</span><h3>Decision</h3><p>Resolve alternatives with rationale.</p></Link>
          <Link className="card" href="/meetings" style={{ textDecoration: "none" }}><span>3</span><h3>Meeting</h3><p>Coordinate review and preserve minutes.</p></Link>
          <Link className="card" href="/actions" style={{ textDecoration: "none" }}><span>4</span><h3>Action</h3><p>Track accountable execution to closure.</p></Link>
        </div>
      </section>
    </main>
  );
}
