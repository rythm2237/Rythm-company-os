import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

type RiskLevel = "low" | "medium" | "high" | "critical";
type DecisionStatus = "draft" | "review" | "approved" | "rejected" | "archived";

type DecisionRow = {
  id: string;
  decision_key: string;
  title: string;
  context: string;
  options: unknown;
  recommendation: unknown;
  rationale: string | null;
  risk_level: RiskLevel;
  status: DecisionStatus;
  requires_human_approval: boolean;
  decided_by_user_id: string | null;
  proposed_by_agent_id: string | null;
  decided_at: string | null;
  created_at: string;
};

type ApprovalRow = {
  id: string;
  status: string;
  created_at: string;
};

type AuditRow = {
  id: number;
  event_type: string;
  actor_type: string;
  risk_level: RiskLevel;
  created_at: string;
};

type PageProps = {
  searchParams: Promise<{ decision?: string; status?: string; risk?: string; message?: string; error?: string }>;
};

const statuses = new Set<DecisionStatus>(["draft", "review", "approved", "rejected", "archived"]);
const risks = new Set<RiskLevel>(["low", "medium", "high", "critical"]);

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not set";

const normalizeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : JSON.stringify(item));
};

async function getOwnerContext() {
  const {supabase,user,organizationId}=await requireOwnerOrganizationContext();
  return {supabase,user,organizationId};
}

async function createDecision(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await getOwnerContext();

  const title = String(formData.get("title") ?? "").trim();
  const context = String(formData.get("context") ?? "").trim();
  const rationale = String(formData.get("rationale") ?? "").trim();
  const riskLevel = String(formData.get("riskLevel") ?? "medium") as RiskLevel;
  const rawOptions = String(formData.get("options") ?? "").split("\n").map((v) => v.trim()).filter(Boolean);
  const recommendation = String(formData.get("recommendation") ?? "").trim();

  if (title.length < 3 || context.length < 10 || rawOptions.length < 2 || !risks.has(riskLevel)) {
    redirect("/decisions?error=Complete%20the%20required%20decision%20fields%20and%20provide%20at%20least%20two%20options.");
  }

  const decisionKey = `DEC-${Date.now()}`;
  const requiresHumanApproval = riskLevel === "high" || riskLevel === "critical";

  const { data: created, error } = await supabase
    .from("decisions")
    .insert({
      organization_id: organizationId,
      decision_key: decisionKey,
      title,
      context,
      options: rawOptions,
      recommendation: recommendation ? { text: recommendation } : null,
      rationale: rationale || null,
      risk_level: riskLevel,
      status: "review",
      requires_human_approval: requiresHumanApproval,
      decided_by_user_id: null,
    })
    .select("id")
    .single();

  if (error || !created) redirect(`/decisions?error=${encodeURIComponent(error?.message ?? "Decision could not be created.")}`);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "decision.created",
    object_type: "decision",
    object_id: created.id,
    risk_level: riskLevel,
    payload: { title, decision_key: decisionKey, requires_human_approval: requiresHumanApproval },
  });

  if (requiresHumanApproval) {
    await supabase.from("approval_requests").insert({
      organization_id: organizationId,
      subject_type: "decision",
      subject_id: created.id,
      title: `Approve decision: ${title}`,
      summary: context,
      risk_level: riskLevel,
      status: "pending",
      conditions: ["Decision cannot be finalized until Human CEO approval is recorded"],
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  revalidatePath("/decisions");
  revalidatePath("/approvals");
  revalidatePath("/command-center");
  redirect(`/decisions?decision=${created.id}&message=Decision%20created%20for%20review.`);
}

async function resolveDecision(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await getOwnerContext();
  const decisionId = String(formData.get("decisionId") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  const rationale = String(formData.get("resolutionRationale") ?? "").trim();

  if (!decisionId || !["approved", "rejected"].includes(resolution) || rationale.length < 3) {
    redirect(`/decisions?decision=${decisionId}&error=A%20valid%20resolution%20and%20CEO%20rationale%20are%20required.`);
  }

  const { data: decision } = await supabase
    .from("decisions")
    .select("id, title, risk_level, status, requires_human_approval")
    .eq("organization_id", organizationId)
    .eq("id", decisionId)
    .maybeSingle();

  if (!decision) redirect("/decisions?error=Decision%20not%20found.");
  if (!["draft", "review"].includes(decision.status)) redirect(`/decisions?decision=${decisionId}&error=Resolved%20decisions%20are%20immutable.`);

  if (resolution === "approved" && decision.requires_human_approval) {
    const { data: approval } = await supabase
      .from("approval_requests")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("subject_type", "decision")
      .eq("subject_id", decisionId)
      .eq("status", "approved")
      .maybeSingle();

    if (!approval) redirect(`/decisions?decision=${decisionId}&error=Approve%20the%20linked%20Approval%20Request%20before%20finalizing%20this%20high-risk%20decision.`);
  }

  const decidedAt = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("decisions")
    .update({ status: resolution, rationale, decided_by_user_id: user.id, decided_at: decidedAt })
    .eq("organization_id", organizationId)
    .eq("id", decisionId)
    .in("status", ["draft", "review"])
    .select("id")
    .maybeSingle();

  if (error || !updated) redirect(`/decisions?decision=${decisionId}&error=${encodeURIComponent(error?.message ?? "Decision could not be resolved.")}`);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: `decision.${resolution}`,
    object_type: "decision",
    object_id: decisionId,
    risk_level: decision.risk_level,
    payload: { title: decision.title, rationale, decided_at: decidedAt, human_authority: "Human CEO / Owner" },
  });

  revalidatePath("/decisions");
  revalidatePath("/command-center");
  redirect(`/decisions?decision=${decisionId}&message=Decision%20${resolution}.`);
}

export default async function DecisionEnginePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { supabase, organizationId } = await getOwnerContext();
  const selectedStatus = statuses.has(params.status as DecisionStatus) ? params.status as DecisionStatus : "review";
  const selectedRisk = risks.has(params.risk as RiskLevel) ? params.risk as RiskLevel : "";

  let query = supabase
    .from("decisions")
    .select("id, decision_key, title, context, options, recommendation, rationale, risk_level, status, requires_human_approval, decided_by_user_id, proposed_by_agent_id, decided_at, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (selectedStatus) query = query.eq("status", selectedStatus);
  if (selectedRisk) query = query.eq("risk_level", selectedRisk);

  const decisions = ((await query).data ?? []) as DecisionRow[];
  const selectedId = params.decision ?? decisions[0]?.id ?? null;
  const selected = selectedId ? ((await supabase
    .from("decisions")
    .select("id, decision_key, title, context, options, recommendation, rationale, risk_level, status, requires_human_approval, decided_by_user_id, proposed_by_agent_id, decided_at, created_at")
    .eq("organization_id", organizationId)
    .eq("id", selectedId)
    .maybeSingle()).data as DecisionRow | null) : null;

  const approval = selected ? ((await supabase
    .from("approval_requests")
    .select("id, status, created_at")
    .eq("organization_id", organizationId)
    .eq("subject_type", "decision")
    .eq("subject_id", selected.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()).data as ApprovalRow | null) : null;

  const audit = selected ? (((await supabase
    .from("audit_events")
    .select("id, event_type, actor_type, risk_level, created_at")
    .eq("organization_id", organizationId)
    .eq("object_type", "decision")
    .eq("object_id", selected.id)
    .order("created_at", { ascending: false })
    .limit(25)).data ?? []) as AuditRow[]) : [];

  const options = selected ? normalizeList(selected.options) : [];
  const recommendation = selected?.recommendation && typeof selected.recommendation === "object" && "text" in selected.recommendation
    ? String((selected.recommendation as { text: unknown }).text)
    : "No recommendation recorded.";

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">RYTHM DECISION ENGINE</p>
          <h1>Governed executive decisions</h1>
          <p className="subtitle">Structure alternatives, record rationale, route high-risk decisions through Approval Engine, and preserve accountability.</p>
        </div>
        <Link className="secondary-button" href="/command-center">Command Center</Link>
      </header>

      <section className="organization-banner">
        <div><span>Authority</span><strong>Human CEO / Owner</strong></div>
        <div><span>Risk routing</span><strong>High and critical → Approval Engine</strong></div>
        <div><span>Final records</span><strong>Immutable after resolution</strong></div>
      </section>

      {params.message ? <p className="form-success" role="status">{params.message}</p> : null}
      {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

      <section className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><p className="label">Decision register</p><h2>Executive Decision Inbox</h2></div><span className="pill">{decisions.length} matching decisions</span></div>
        <form method="get" style={{ display: "grid", gridTemplateColumns: "220px 220px auto", gap: 10, marginBottom: 18 }}>
          <select name="status" defaultValue={selectedStatus}><option value="review">Review</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="archived">Archived</option></select>
          <select name="risk" defaultValue={selectedRisk}><option value="">All risk levels</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <button className="secondary-button" type="submit">Apply filters</button>
        </form>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,.65fr) minmax(0,1.35fr) minmax(300px,.7fr)", gap: 18 }}>
          <div className="data-list">
            {decisions.length ? decisions.map((decision) => (
              <Link key={decision.id} href={`/decisions?status=${selectedStatus}&risk=${selectedRisk}&decision=${decision.id}`} style={{ display: "block", padding: "15px 0", borderBottom: "1px solid #e7eaf0", textDecoration: "none" }}>
                <strong>{decision.title}</strong><span style={{ display: "block", marginTop: 6, color: "#717b8e", fontSize: ".82rem" }}>{decision.decision_key} · {decision.risk_level} risk · {decision.status}</span>
              </Link>
            )) : <p className="empty-state">No decisions match these filters.</p>}
          </div>

          {selected ? <article style={{ border: "1px solid #dfe4ec", borderRadius: 16, padding: 20, background: "#f8f9fb" }}>
            <div className="panel-heading"><div><p className="label">Decision details</p><h2>{selected.title}</h2></div><div className="row-meta"><span>{selected.risk_level} risk</span><b className={selected.status === "approved" ? "state-active" : "state-paused"}>{selected.status}</b></div></div>
            <p style={{ color: "#596579", lineHeight: 1.65 }}>{selected.context}</p>
            <div><p className="label">Options</p><ol style={{ color: "#596579", lineHeight: 1.7 }}>{options.map((option, index) => <li key={`${option}-${index}`}>{option}</li>)}</ol></div>
            <div style={{ padding: 14, borderRadius: 12, background: "#fff" }}><p className="label">Recommendation</p><p style={{ color: "#596579", lineHeight: 1.6 }}>{recommendation}</p></div>
            <div className="compact-list" style={{ marginTop: 16 }}>
              <div><strong>Created</strong><span>{formatDate(selected.created_at)}</span></div>
              <div><strong>Decided</strong><span>{formatDate(selected.decided_at)}</span></div>
              <div><strong>Human approval</strong><span>{selected.requires_human_approval ? `Required · ${approval?.status ?? "not created"}` : "Not required"}</span></div>
            </div>
            {approval ? <Link className="secondary-button" href={`/approvals?approval=${approval.id}`} style={{ display: "inline-block", marginTop: 16, textDecoration: "none" }}>Open linked approval</Link> : null}

            {["draft", "review"].includes(selected.status) ? <form action={resolveDecision} className="auth-form" style={{ marginTop: 20 }}>
              <input type="hidden" name="decisionId" value={selected.id} />
              <label>CEO resolution rationale<textarea name="resolutionRationale" minLength={3} required rows={5} style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} /></label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><button name="resolution" value="approved">Approve decision</button><button name="resolution" value="rejected" style={{ background: "#8f2335" }}>Reject decision</button></div>
            </form> : <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "#fff" }}><p className="label">Final rationale</p><p style={{ color: "#596579", lineHeight: 1.6 }}>{selected.rationale ?? "No rationale recorded."}</p></div>}

            <div style={{ marginTop: 22 }}><p className="label">Audit trail</p><div className="compact-list">{audit.length ? audit.map((event) => <div key={event.id}><strong>{event.event_type}</strong><span>{event.actor_type} · {event.risk_level} risk · {formatDate(event.created_at)}</span></div>) : <p className="empty-state">No audit events recorded.</p>}</div></div>
          </article> : <p className="empty-state">Select a decision to inspect.</p>}

          <form action={createDecision} className="auth-form" style={{ marginTop: 0, alignSelf: "start", padding: 18, border: "1px solid #dfe4ec", borderRadius: 16, background: "#f8f9fb" }}>
            <div><p className="label">Human CEO entry</p><h3 style={{ margin: "6px 0 0" }}>Create decision</h3></div>
            <label>Title<input name="title" minLength={3} required /></label>
            <label>Context<textarea name="context" minLength={10} required rows={5} style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} /></label>
            <label>Options, one per line<textarea name="options" required rows={5} style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} /></label>
            <label>Recommendation<input name="recommendation" /></label>
            <label>Initial rationale<textarea name="rationale" rows={3} style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} /></label>
            <label>Risk level<select name="riskLevel" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            <button type="submit">Create governed decision</button>
          </form>
        </div>
      </section>
    </main>
  );
}
