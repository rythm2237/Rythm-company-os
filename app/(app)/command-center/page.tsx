import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { logout } from "./actions";

export const dynamic = "force-dynamic";

type AgentRow = {
  agent_code: string;
  name: string;
  role_title: string;
  enabled: boolean;
  authority_level: number;
  risk_ceiling: string;
};
type ApprovalRow = { id: string; title: string; risk_level: string; status: string; created_at: string };
type MeetingRow = { id: string; title: string; status: string; scheduled_for: string | null };
type ActionRow = { id: string; title: string; status: string; priority: number; due_at: string | null };
type MemoryRow = {
  id: string;
  memory_type: string;
  title: string;
  content: Record<string, unknown>;
  source_type: string;
  confidence: number | null;
  status: string;
  valid_from: string;
  valid_until: string | null;
  supersedes_id: string | null;
  created_at: string;
};

type CommandCenterProps = {
  searchParams: Promise<{ memorySearch?: string; memoryType?: string; memoryMessage?: string; memoryError?: string }>;
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Not scheduled";

const previewContent = (content: Record<string, unknown>) => {
  const text = typeof content.text === "string" ? content.text : JSON.stringify(content);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
};

async function getOwnerContext() {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (!membership) redirect("/login?error=Owner%20authorization%20required.");
  return { supabase, user, organizationId: membership.organization_id as string };
}

async function createMemoryRecord(formData: FormData) {
  "use server";

  const { supabase, user, organizationId } = await getOwnerContext();
  const title = String(formData.get("title") ?? "").trim();
  const memoryType = String(formData.get("memoryType") ?? "").trim().toLowerCase();
  const sourceType = String(formData.get("sourceType") ?? "human_ceo").trim();
  const rawContent = String(formData.get("content") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");
  const confidenceValue = Number(formData.get("confidence") ?? 1);
  const supersedesId = String(formData.get("supersedesId") ?? "").trim() || null;

  const allowedStatuses = new Set(["draft", "review", "approved"]);
  if (title.length < 3 || memoryType.length < 2 || rawContent.length < 3 || !allowedStatuses.has(status)) {
    redirect("/command-center?memoryError=Complete%20all%20required%20memory%20fields.#company-memory");
  }

  let content: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawContent) as unknown;
    content = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { text: rawContent };
  } catch {
    content = { text: rawContent };
  }

  const confidence = Number.isFinite(confidenceValue)
    ? Math.min(1, Math.max(0, confidenceValue))
    : 1;

  const { data: created, error } = await supabase
    .from("company_memory")
    .insert({
      organization_id: organizationId,
      memory_type: memoryType,
      title,
      content,
      source_type: sourceType,
      confidence,
      status,
      supersedes_id: supersedesId,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (error || !created) {
    redirect(`/command-center?memoryError=${encodeURIComponent(error?.message ?? "Memory record could not be created.")}#company-memory`);
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "company_memory.created",
    object_type: "company_memory",
    object_id: created.id,
    risk_level: status === "approved" ? "medium" : "low",
    payload: { title, memory_type: memoryType, status, source_type: sourceType },
  });

  revalidatePath("/command-center");
  redirect("/command-center?memoryMessage=Memory%20record%20created.#company-memory");
}

export default async function CommandCenterPage({ searchParams }: CommandCenterProps) {
  const params = await searchParams;
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (membershipError || !membership) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">ACCESS DENIED</p>
          <h1 className="auth-title">Owner authorization required</h1>
          <p className="auth-copy">This account is authenticated but is not registered as an Owner.</p>
          <form action={logout}><button type="submit">Sign out</button></form>
        </section>
      </main>
    );
  }

  const organizationId = membership.organization_id;
  const memorySearch = params.memorySearch?.trim() ?? "";
  const memoryType = params.memoryType?.trim() ?? "";

  let memoryQuery = supabase
    .from("company_memory")
    .select("id, memory_type, title, content, source_type, confidence, status, valid_from, valid_until, supersedes_id, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (memorySearch) memoryQuery = memoryQuery.ilike("title", `%${memorySearch}%`);
  if (memoryType) memoryQuery = memoryQuery.eq("memory_type", memoryType);

  const [organizationResult, agentsResult, memoryResult, approvalsResult, meetingsResult, actionsResult, decisionsResult, runsResult] = await Promise.all([
    supabase.from("organizations").select("name, slug, status, mission, vision").eq("id", organizationId).single(),
    supabase.from("agents").select("agent_code, name, role_title, enabled, authority_level, risk_ceiling").eq("organization_id", organizationId).order("agent_code"),
    memoryQuery,
    supabase.from("approval_requests").select("id, title, risk_level, status, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(5),
    supabase.from("meetings").select("id, title, status, scheduled_for").eq("organization_id", organizationId).order("scheduled_for", { ascending: true, nullsFirst: false }).limit(5),
    supabase.from("action_items").select("id, title, status, priority, due_at").eq("organization_id", organizationId).neq("status", "completed").order("priority").limit(6),
    supabase.from("decisions").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("agent_runs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);

  const organization = organizationResult.data;
  const agents = (agentsResult.data ?? []) as AgentRow[];
  const memories = (memoryResult.data ?? []) as MemoryRow[];
  const approvals = (approvalsResult.data ?? []) as ApprovalRow[];
  const meetings = (meetingsResult.data ?? []) as MeetingRow[];
  const actions = (actionsResult.data ?? []) as ActionRow[];
  const memoryTypes = [...new Set(memories.map((memory) => memory.memory_type))].sort();
  const metrics = [
    ["Registered agents", agents.length],
    ["Enabled agents", agents.filter((agent) => agent.enabled).length],
    ["Memory records", memories.length],
    ["Pending approvals", approvals.filter((item) => item.status === "pending").length],
    ["Decisions", decisionsResult.count ?? 0],
    ["Agent runs", runsResult.count ?? 0],
  ] as const;

  return (
    <main className="command-shell">
      <header className="command-header">
        <div>
          <p className="eyebrow">RYTHM EXECUTIVE COMMAND CENTER</p>
          <h1>Human CEO control plane</h1>
          <p className="subtitle">Authenticated as {user.email}. Consequential authority remains under your control.</p>
        </div>
        <form action={logout}><button className="secondary-button" type="submit">Sign out</button></form>
      </header>

      <section className="organization-banner">
        <div><span>Organization</span><strong>{organization?.name ?? "RYTHM"}</strong></div>
        <div><span>Role</span><strong>Human CEO / Owner</strong></div>
        <div><span>Status</span><strong>{organization?.status ?? "approved"}</strong></div>
      </section>

      <section className="metrics-grid" aria-label="Company Core metrics">
        {metrics.map(([label, value]) => <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}
      </section>

      <section id="company-memory" className="panel panel-wide" style={{ marginTop: 18 }}>
        <div className="panel-heading">
          <div><p className="label">Organizational intelligence</p><h2>Company Memory</h2></div>
          <span className="pill">Versioned · traceable · owner governed</span>
        </div>

        {params.memoryMessage ? <p className="form-success" role="status">{params.memoryMessage}</p> : null}
        {params.memoryError ? <p className="form-error" role="alert">{params.memoryError}</p> : null}

        <form method="get" className="memory-filter" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 220px auto", gap: 10, marginBottom: 18 }}>
          <input name="memorySearch" defaultValue={memorySearch} placeholder="Search memory titles" aria-label="Search memory titles" />
          <select name="memoryType" defaultValue={memoryType} aria-label="Filter by memory type">
            <option value="">All memory types</option>
            {memoryTypes.map((type) => <option value={type} key={type}>{type}</option>)}
          </select>
          <button className="secondary-button" type="submit">Filter</button>
        </form>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(300px, .75fr)", gap: 18 }}>
          <div className="data-list">
            {memories.length ? memories.map((memory) => (
              <details className="memory-record" key={memory.id} style={{ padding: "16px 0", borderBottom: "1px solid #e7eaf0" }}>
                <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <div><strong>{memory.title}</strong><span>{memory.memory_type} · {memory.source_type} · {formatDate(memory.created_at)}</span></div>
                  <div className="row-meta"><span>{Math.round((memory.confidence ?? 0) * 100)}% confidence</span><b className={memory.status === "approved" ? "state-active" : "state-paused"}>{memory.status}</b></div>
                </summary>
                <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#f7f8fb" }}>
                  <p style={{ margin: "0 0 10px", color: "#596579", lineHeight: 1.6 }}>{previewContent(memory.content)}</p>
                  <code style={{ fontSize: ".76rem", color: "#788296", wordBreak: "break-all" }}>ID: {memory.id}</code>
                  <p style={{ margin: "8px 0 0", fontSize: ".78rem", color: "#788296" }}>Valid from {formatDate(memory.valid_from)}{memory.valid_until ? ` until ${formatDate(memory.valid_until)}` : ""}{memory.supersedes_id ? ` · Supersedes ${memory.supersedes_id}` : ""}</p>
                </div>
              </details>
            )) : <p className="empty-state">No memory records match this filter.</p>}
          </div>

          <form action={createMemoryRecord} className="auth-form" style={{ marginTop: 0, alignSelf: "start", padding: 18, border: "1px solid #dfe4ec", borderRadius: 16, background: "#f8f9fb" }}>
            <div><p className="label">Human CEO entry</p><h3 style={{ margin: "6px 0 0" }}>Create memory record</h3></div>
            <label>Title<input name="title" minLength={3} required /></label>
            <label>Memory type<input name="memoryType" placeholder="policy, product, lesson..." required /></label>
            <label>Content<textarea name="content" rows={6} placeholder="Plain text or a JSON object" required style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10, font: "inherit" }} /></label>
            <label>Source type<input name="sourceType" defaultValue="human_ceo" required /></label>
            <label>Confidence<input name="confidence" type="number" min="0" max="1" step="0.01" defaultValue="1" required /></label>
            <label>Status<select name="status" defaultValue="draft"><option value="draft">Draft</option><option value="review">Review</option><option value="approved">Approved</option></select></label>
            <label>Supersedes record ID (optional)<input name="supersedesId" type="text" /></label>
            <button type="submit">Create governed memory</button>
          </form>
        </div>
      </section>

      <section className="executive-grid">
        <article className="panel panel-wide"><div className="panel-heading"><div><p className="label">Executive office</p><h2>Agent roster</h2></div><span className="pill">Human approval enforced</span></div><div className="data-list">{agents.length ? agents.map((agent) => <div className="data-row" key={agent.agent_code}><div><strong>{agent.name}</strong><span>{agent.agent_code} · {agent.role_title}</span></div><div className="row-meta"><span>A{agent.authority_level}</span><span>{agent.risk_ceiling} risk</span><b className={agent.enabled ? "state-active" : "state-paused"}>{agent.enabled ? "Enabled" : "Paused"}</b></div></div>) : <p className="empty-state">No agents registered.</p>}</div></article>
        <article className="panel"><div className="panel-heading"><div><p className="label">Governance</p><h2>Approval inbox</h2></div></div><div className="compact-list">{approvals.length ? approvals.map((approval) => <div key={approval.id}><strong>{approval.title}</strong><span>{approval.risk_level} risk · {approval.status}</span></div>) : <p className="empty-state">No approval requests.</p>}</div></article>
        <article className="panel"><div className="panel-heading"><div><p className="label">Coordination</p><h2>Meetings</h2></div></div><div className="compact-list">{meetings.length ? meetings.map((meeting) => <div key={meeting.id}><strong>{meeting.title}</strong><span>{meeting.status} · {formatDate(meeting.scheduled_for)}</span></div>) : <p className="empty-state">No meetings scheduled.</p>}</div></article>
        <article className="panel panel-wide"><div className="panel-heading"><div><p className="label">Execution</p><h2>Open action items</h2></div></div><div className="data-list">{actions.length ? actions.map((action) => <div className="data-row" key={action.id}><div><strong>{action.title}</strong><span>{action.status} · Due {formatDate(action.due_at)}</span></div><div className="row-meta"><span>Priority {action.priority}</span></div></div>) : <p className="empty-state">No open action items.</p>}</div></article>
      </section>

      <section className="control-grid"><article className="control-card"><span className="status-dot safe" /><h2>Authentication</h2><p>Supabase session and Owner authorization are active.</p></article><article className="control-card"><span className="status-dot paused" /><h2>B-001 execution</h2><p>Executive Orchestrator remains disabled until controlled activation.</p></article><article className="control-card"><span className="status-dot paused" /><h2>External actions</h2><p>Publishing, deployment, deletion, and external writes remain blocked.</p></article></section>
    </main>
  );
}
