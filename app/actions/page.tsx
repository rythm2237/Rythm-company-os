import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type ActionStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";
type ActionRow = {
  id: string;
  meeting_id: string | null;
  decision_id: string | null;
  title: string;
  description: string | null;
  status: ActionStatus;
  priority: number;
  assigned_user_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
};
type AuditRow = { id: number; event_type: string; actor_type: string; risk_level: string; created_at: string };
type Props = { searchParams: Promise<{ action?: string; status?: string; priority?: string; message?: string; error?: string }> };

const statuses = new Set<ActionStatus>(["open", "in_progress", "blocked", "completed", "cancelled"]);
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
  return { supabase, user, organizationId: membership.organization_id as string };
}

async function createAction(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await ownerContext();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = Number(formData.get("priority") ?? 3);
  const dueValue = String(formData.get("dueAt") ?? "").trim();
  if (title.length < 3 || !Number.isInteger(priority) || priority < 1 || priority > 5) {
    redirect("/actions?error=Valid%20title%20and%20priority%201-5%20are%20required.");
  }
  const dueAt = dueValue ? new Date(dueValue) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) redirect("/actions?error=Invalid%20due%20date.");

  const { data, error } = await supabase.from("action_items").insert({
    organization_id: organizationId,
    title,
    description: description || null,
    status: "open",
    priority,
    assigned_user_id: user.id,
    due_at: dueAt?.toISOString() ?? null,
  }).select("id").single();
  if (error || !data) redirect(`/actions?error=${encodeURIComponent(error?.message ?? "Action item could not be created.")}`);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "action.created",
    object_type: "action_item",
    object_id: data.id,
    risk_level: priority <= 2 ? "medium" : "low",
    payload: { title, priority, due_at: dueAt?.toISOString() ?? null },
  });
  revalidatePath("/actions");
  revalidatePath("/command-center");
  redirect(`/actions?action=${data.id}&status=open&message=Action%20item%20created.`);
}

async function updateAction(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await ownerContext();
  const actionId = String(formData.get("actionId") ?? "");
  const nextStatus = String(formData.get("nextStatus") ?? "") as ActionStatus;
  const note = String(formData.get("note") ?? "").trim();
  const priority = Number(formData.get("priority") ?? 3);
  const dueValue = String(formData.get("dueAt") ?? "").trim();
  if (!actionId || !statuses.has(nextStatus) || note.length < 3 || !Number.isInteger(priority) || priority < 1 || priority > 5) {
    redirect(`/actions?action=${actionId}&error=Status%2C%20priority%2C%20and%20a%20transition%20note%20are%20required.`);
  }
  const { data: current } = await supabase.from("action_items")
    .select("id, title, status").eq("organization_id", organizationId).eq("id", actionId).maybeSingle();
  if (!current) redirect("/actions?error=Action%20item%20not%20found.");
  if (["completed", "cancelled"].includes(current.status)) redirect(`/actions?action=${actionId}&error=Final%20action%20items%20are%20immutable.`);

  const dueAt = dueValue ? new Date(dueValue) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) redirect(`/actions?action=${actionId}&error=Invalid%20due%20date.`);
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase.from("action_items").update({
    status: nextStatus,
    priority,
    due_at: dueAt?.toISOString() ?? null,
    completed_at: nextStatus === "completed" ? now : null,
    assigned_user_id: user.id,
  }).eq("organization_id", organizationId).eq("id", actionId).eq("status", current.status).select("id").maybeSingle();
  if (error || !updated) redirect(`/actions?action=${actionId}&error=${encodeURIComponent(error?.message ?? "Action item could not be updated.")}`);

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: `action.${nextStatus}`,
    object_type: "action_item",
    object_id: actionId,
    risk_level: nextStatus === "blocked" ? "medium" : "low",
    payload: { title: current.title, previous_status: current.status, status: nextStatus, priority, note, due_at: dueAt?.toISOString() ?? null },
  });
  revalidatePath("/actions");
  revalidatePath("/command-center");
  redirect(`/actions?action=${actionId}&status=${nextStatus}&message=Action%20item%20updated.`);
}

export default async function ActionItemEngine({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, organizationId } = await ownerContext();
  const selectedStatus = statuses.has(params.status as ActionStatus) ? params.status as ActionStatus : "open";
  const selectedPriority = ["1", "2", "3", "4", "5"].includes(params.priority ?? "") ? Number(params.priority) : null;

  let query = supabase.from("action_items")
    .select("id, meeting_id, decision_id, title, description, status, priority, assigned_user_id, due_at, completed_at, created_at")
    .eq("organization_id", organizationId).eq("status", selectedStatus)
    .order("priority", { ascending: true }).order("due_at", { ascending: true, nullsFirst: false }).limit(100);
  if (selectedPriority) query = query.eq("priority", selectedPriority);
  const actions = ((await query).data ?? []) as ActionRow[];
  const selectedId = params.action ?? actions[0]?.id ?? null;
  const selected = selectedId ? (await supabase.from("action_items")
    .select("id, meeting_id, decision_id, title, description, status, priority, assigned_user_id, due_at, completed_at, created_at")
    .eq("organization_id", organizationId).eq("id", selectedId).maybeSingle()).data as ActionRow | null : null;
  const audit = selected ? ((await supabase.from("audit_events")
    .select("id, event_type, actor_type, risk_level, created_at")
    .eq("organization_id", organizationId).eq("object_type", "action_item").eq("object_id", selected.id)
    .order("created_at", { ascending: false }).limit(25)).data ?? []) as AuditRow[] : [];
  const isFinal = selected ? ["completed", "cancelled"].includes(selected.status) : false;

  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM ACTION ITEM ENGINE</p><h1>Accountable execution control</h1><p className="subtitle">Capture commitments, assign priority and due dates, control lifecycle transitions, and preserve execution accountability.</p></div><Link className="secondary-button" href="/command-center">Command Center</Link></header>
    <section className="organization-banner"><div><span>Authority</span><strong>Human CEO / Owner</strong></div><div><span>Lifecycle</span><strong>Open → In progress / Blocked → Completed</strong></div><div><span>Readiness</span><strong>Operational Readiness 89%</strong></div></section>
    {params.message ? <p className="form-success">{params.message}</p> : null}{params.error ? <p className="form-error">{params.error}</p> : null}
    <section className="panel panel-wide" style={{ marginTop: 18 }}>
      <div className="panel-heading"><div><p className="label">Execution register</p><h2>Action Item Inbox</h2></div><span className="pill">{actions.length} matching items</span></div>
      <form method="get" style={{ display: "grid", gridTemplateColumns: "220px 220px auto", gap: 10, marginBottom: 18 }}>
        <select name="status" defaultValue={selectedStatus}><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
        <select name="priority" defaultValue={selectedPriority?.toString() ?? ""}><option value="">All priorities</option><option value="1">1 — Highest</option><option value="2">2 — High</option><option value="3">3 — Normal</option><option value="4">4 — Low</option><option value="5">5 — Lowest</option></select>
        <button className="secondary-button">Apply filters</button>
      </form>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,.7fr) minmax(0,1.35fr) minmax(300px,.8fr)", gap: 18 }}>
        <div className="data-list">{actions.length ? actions.map(a => <Link key={a.id} href={`/actions?status=${selectedStatus}&priority=${selectedPriority ?? ""}&action=${a.id}`} style={{ display: "block", padding: "15px 0", borderBottom: "1px solid #e7eaf0", textDecoration: "none" }}><strong>{a.title}</strong><span style={{ display: "block", marginTop: 6, color: "#717b8e", fontSize: ".82rem" }}>Priority {a.priority} · {a.status} · Due {formatDate(a.due_at)}</span></Link>) : <p className="empty-state">No action items match these filters.</p>}</div>
        {selected ? <article style={{ border: "1px solid #dfe4ec", borderRadius: 16, padding: 20, background: "#f8f9fb" }}>
          <div className="panel-heading"><div><p className="label">Action details</p><h2>{selected.title}</h2></div><div className="row-meta"><span>Priority {selected.priority}</span><b className={selected.status === "completed" ? "state-active" : "state-paused"}>{selected.status}</b></div></div>
          <p style={{ color: "#596579", lineHeight: 1.65 }}>{selected.description ?? "No description recorded."}</p>
          <div className="compact-list"><div><strong>Created</strong><span>{formatDate(selected.created_at)}</span></div><div><strong>Due</strong><span>{formatDate(selected.due_at)}</span></div><div><strong>Completed</strong><span>{formatDate(selected.completed_at)}</span></div><div><strong>Source</strong><span>{selected.meeting_id ? `Meeting ${selected.meeting_id}` : selected.decision_id ? `Decision ${selected.decision_id}` : "Direct CEO action"}</span></div></div>
          {!isFinal ? <form action={updateAction} className="auth-form" style={{ marginTop: 20 }}><input type="hidden" name="actionId" value={selected.id} /><label>Status<select name="nextStatus" defaultValue={selected.status}><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label><label>Priority<select name="priority" defaultValue={selected.priority.toString()}><option value="1">1 — Highest</option><option value="2">2 — High</option><option value="3">3 — Normal</option><option value="4">4 — Low</option><option value="5">5 — Lowest</option></select></label><label>Due date<input name="dueAt" type="datetime-local" /></label><label>Transition note<textarea name="note" minLength={3} required rows={4} style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10 }} /></label><button>Update action item</button></form> : <p className="security-note">Final action items are immutable.</p>}
          <div style={{ marginTop: 22 }}><p className="label">Audit trail</p><div className="compact-list">{audit.length ? audit.map(e => <div key={e.id}><strong>{e.event_type}</strong><span>{e.actor_type} · {e.risk_level} risk · {formatDate(e.created_at)}</span></div>) : <p className="empty-state">No audit events recorded.</p>}</div></div>
        </article> : <p className="empty-state">Select an action item to inspect.</p>}
        <form action={createAction} className="auth-form" style={{ marginTop: 0, alignSelf: "start", padding: 18, border: "1px solid #dfe4ec", borderRadius: 16, background: "#f8f9fb" }}><div><p className="label">Human CEO entry</p><h3>Create action item</h3></div><label>Title<input name="title" minLength={3} required /></label><label>Description<textarea name="description" rows={4} style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10 }} /></label><label>Priority<select name="priority" defaultValue="3"><option value="1">1 — Highest</option><option value="2">2 — High</option><option value="3">3 — Normal</option><option value="4">4 — Low</option><option value="5">5 — Lowest</option></select></label><label>Due date<input name="dueAt" type="datetime-local" /></label><button>Create governed action</button></form>
      </div>
    </section>
  </main>;
}
