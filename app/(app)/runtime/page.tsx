import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type Risk = "low" | "medium" | "high" | "critical";
type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "blocked";
type Agent = { id: string; agent_code: string; name: string; role_title: string; enabled: boolean; risk_ceiling: Risk };
type Run = {
  id: string;
  agent_id: string;
  trigger_type: string;
  input_summary: string;
  status: RunStatus;
  risk_level: Risk;
  execution_mode: string;
  budget_cap_usd: number;
  requires_human_approval: boolean;
  approval_request_id: string | null;
  cancellation_note: string | null;
  created_at: string;
  finished_at: string | null;
};
type Approval = { id: string; status: string };
type Audit = { id: number; event_type: string; actor_type: string; risk_level: Risk; created_at: string };
type Props = { searchParams: Promise<{ run?: string; status?: string; message?: string; error?: string }> };

const statuses = new Set<RunStatus>(["queued", "running", "succeeded", "failed", "cancelled", "blocked"]);
const riskRank: Record<Risk, number> = { low: 0, medium: 1, high: 2, critical: 3 };
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

async function requestRun(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await ownerContext();
  const agentId = String(formData.get("agentId") ?? "");
  const triggerType = String(formData.get("triggerType") ?? "manual_ceo").trim();
  const inputSummary = String(formData.get("inputSummary") ?? "").trim();
  const riskLevel = String(formData.get("riskLevel") ?? "low") as Risk;
  const budgetCap = Number(formData.get("budgetCapUsd") ?? 0);

  if (!agentId || inputSummary.length < 10 || !(riskLevel in riskRank) || !Number.isFinite(budgetCap) || budgetCap < 0) {
    redirect("/runtime?error=Complete%20all%20required%20run%20request%20fields.");
  }

  const { data: agent } = await supabase.from("agents")
    .select("id, name, enabled, risk_ceiling").eq("id", agentId).eq("organization_id", organizationId).maybeSingle();
  if (!agent) redirect("/runtime?error=Agent%20not%20found.");
  if (riskRank[riskLevel] > riskRank[agent.risk_ceiling as Risk]) {
    redirect("/runtime?error=Requested%20risk%20exceeds%20the%20agent%20risk%20ceiling.");
  }

  const requiresApproval = riskLevel === "high" || riskLevel === "critical";
  const initialStatus: RunStatus = !agent.enabled || requiresApproval ? "blocked" : "queued";
  const { data: run, error } = await supabase.from("agent_runs").insert({
    organization_id: organizationId,
    agent_id: agentId,
    trigger_type: triggerType,
    input_summary: inputSummary,
    status: initialStatus,
    risk_level: riskLevel,
    execution_mode: "dry_run",
    budget_cap_usd: budgetCap,
    requires_human_approval: requiresApproval,
    requested_by_user_id: user.id,
  }).select("id").single();
  if (error || !run) redirect(`/runtime?error=${encodeURIComponent(error?.message ?? "Run request could not be created.")}`);

  let approvalId: string | null = null;
  if (requiresApproval) {
    const { data: approval, error: approvalError } = await supabase.from("approval_requests").insert({
      organization_id: organizationId,
      subject_type: "agent_run",
      subject_id: run.id,
      title: `Authorize dry-run: ${agent.name}`,
      summary: inputSummary,
      risk_level: riskLevel,
      status: "pending",
      conditions: ["Dry-run only", "No external actions", `Budget cap: $${budgetCap.toFixed(2)}`],
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    }).select("id").single();
    if (approvalError || !approval) redirect(`/runtime?run=${run.id}&error=${encodeURIComponent(approvalError?.message ?? "Approval request could not be created.")}`);
    approvalId = approval.id;
    await supabase.from("agent_runs").update({ approval_request_id: approvalId }).eq("id", run.id).eq("organization_id", organizationId);
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "agent_run.requested",
    object_type: "agent_run",
    object_id: run.id,
    risk_level: riskLevel,
    payload: { agent_id: agentId, status: initialStatus, execution_mode: "dry_run", budget_cap_usd: budgetCap, approval_request_id: approvalId },
  });

  revalidatePath("/runtime");
  revalidatePath("/approvals");
  revalidatePath("/command-center");
  redirect(`/runtime?run=${run.id}&status=${initialStatus}&message=Dry-run%20request%20created.`);
}

async function updateRun(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await ownerContext();
  const runId = String(formData.get("runId") ?? "");
  const transition = String(formData.get("transition") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const { data: run } = await supabase.from("agent_runs")
    .select("id, status, risk_level, requires_human_approval, approval_request_id")
    .eq("id", runId).eq("organization_id", organizationId).maybeSingle();
  if (!run) redirect("/runtime?error=Run%20request%20not%20found.");

  if (transition === "cancel") {
    if (note.length < 3) redirect(`/runtime?run=${runId}&error=Cancellation%20note%20is%20required.`);
    const { error } = await supabase.from("agent_runs").update({ status: "cancelled", cancellation_note: note, finished_at: new Date().toISOString() })
      .eq("id", runId).eq("organization_id", organizationId).in("status", ["queued", "blocked"]);
    if (error) redirect(`/runtime?run=${runId}&error=${encodeURIComponent(error.message)}`);
    await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: "agent_run.cancelled", object_type: "agent_run", object_id: runId, risk_level: run.risk_level, payload: { note } });
    revalidatePath("/runtime");
    redirect(`/runtime?run=${runId}&status=cancelled&message=Run%20request%20cancelled.`);
  }

  if (transition === "release" && run.status === "blocked") {
    const { error } = await supabase.from("agent_runs").update({ status: "queued" })
      .eq("id", runId).eq("organization_id", organizationId).eq("status", "blocked");
    if (error) redirect(`/runtime?run=${runId}&error=${encodeURIComponent(error.message)}`);
    await supabase.from("audit_events").insert({ organization_id: organizationId, actor_type: "user", actor_user_id: user.id, event_type: "agent_run.released_to_queue", object_type: "agent_run", object_id: runId, risk_level: run.risk_level, payload: { execution_remains_disabled: true } });
    revalidatePath("/runtime");
    redirect(`/runtime?run=${runId}&status=queued&message=Run%20released%20to%20the%20dry-run%20queue.`);
  }

  redirect(`/runtime?run=${runId}&error=This%20run%20transition%20is%20not%20allowed.`);
}

export default async function RuntimePage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, organizationId } = await ownerContext();
  const selectedStatus = statuses.has(params.status as RunStatus) ? params.status as RunStatus : "blocked";
  const [agentsResult, runsResult] = await Promise.all([
    supabase.from("agents").select("id, agent_code, name, role_title, enabled, risk_ceiling").eq("organization_id", organizationId).order("agent_code"),
    supabase.from("agent_runs").select("id, agent_id, trigger_type, input_summary, status, risk_level, execution_mode, budget_cap_usd, requires_human_approval, approval_request_id, cancellation_note, created_at, finished_at")
      .eq("organization_id", organizationId).eq("status", selectedStatus).order("created_at", { ascending: false }).limit(100),
  ]);
  const agents = (agentsResult.data ?? []) as Agent[];
  const runs = (runsResult.data ?? []) as Run[];
  const selectedId = params.run ?? runs[0]?.id ?? null;
  const selected = selectedId ? (await supabase.from("agent_runs")
    .select("id, agent_id, trigger_type, input_summary, status, risk_level, execution_mode, budget_cap_usd, requires_human_approval, approval_request_id, cancellation_note, created_at, finished_at")
    .eq("organization_id", organizationId).eq("id", selectedId).maybeSingle()).data as Run | null : null;
  const selectedAgent = selected ? agents.find((agent) => agent.id === selected.agent_id) ?? null : null;
  const approval = selected?.approval_request_id ? (await supabase.from("approval_requests").select("id, status").eq("id", selected.approval_request_id).maybeSingle()).data as Approval | null : null;
  const audit = selected ? ((await supabase.from("audit_events").select("id, event_type, actor_type, risk_level, created_at")
    .eq("organization_id", organizationId).eq("object_type", "agent_run").eq("object_id", selected.id).order("created_at", { ascending: false }).limit(25)).data ?? []) as Audit[] : [];
  const canRelease = selected?.status === "blocked" && (!selected.requires_human_approval || approval?.status === "approved") && selectedAgent?.enabled;
  const canCancel = selected?.status === "queued" || selected?.status === "blocked";

  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM AGENT RUNTIME</p><h1>Human-governed execution control plane</h1><p className="subtitle">Register dry-run requests, enforce risk ceilings and budget caps, route high-risk work through Approval Engine, and preserve execution audit history.</p></div><Link className="secondary-button" href="/orchestrator">Executive Orchestrator</Link></header>
    <section className="organization-banner"><div><span>Execution mode</span><strong>Dry-run only</strong></div><div><span>External actions</span><strong>Disabled</strong></div><div><span>Authority</span><strong>Human CEO / Owner</strong></div></section>
    {params.message ? <p className="form-success">{params.message}</p> : null}{params.error ? <p className="form-error">{params.error}</p> : null}
    <section className="panel panel-wide" style={{ marginTop: 18 }}>
      <div className="panel-heading"><div><p className="label">Execution governance</p><h2>Agent Run Queue</h2></div><span className="pill">{runs.length} {selectedStatus} runs</span></div>
      <form method="get" style={{ display: "grid", gridTemplateColumns: "240px auto", gap: 10, marginBottom: 18 }}><select name="status" defaultValue={selectedStatus}><option value="blocked">Blocked</option><option value="queued">Queued</option><option value="cancelled">Cancelled</option><option value="running">Running</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option></select><button className="secondary-button">Apply filter</button></form>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,.7fr) minmax(0,1.35fr) minmax(300px,.8fr)", gap: 18 }}>
        <div className="data-list">{runs.length ? runs.map(run => <Link key={run.id} href={`/runtime?status=${selectedStatus}&run=${run.id}`} style={{ display: "block", padding: "15px 0", borderBottom: "1px solid #e7eaf0", textDecoration: "none" }}><strong>{agents.find(a => a.id === run.agent_id)?.name ?? "Agent"}</strong><span style={{ display: "block", marginTop: 6, color: "#717b8e", fontSize: ".82rem" }}>{run.risk_level} risk · ${Number(run.budget_cap_usd).toFixed(2)} cap · {run.status}</span></Link>) : <p className="empty-state">No runs match this status.</p>}</div>
        {selected ? <article style={{ border: "1px solid #dfe4ec", borderRadius: 16, padding: 20, background: "#f8f9fb" }}>
          <div className="panel-heading"><div><p className="label">Run request</p><h2>{selectedAgent?.name ?? "Agent run"}</h2></div><div className="row-meta"><span>{selected.risk_level} risk</span><b className={selected.status === "queued" ? "state-active" : "state-paused"}>{selected.status}</b></div></div>
          <p style={{ color: "#596579", lineHeight: 1.65 }}>{selected.input_summary}</p>
          <div className="compact-list"><div><strong>Agent</strong><span>{selectedAgent?.agent_code} · {selectedAgent?.role_title}</span></div><div><strong>Agent state</strong><span>{selectedAgent?.enabled ? "Enabled" : "Paused"}</span></div><div><strong>Execution</strong><span>{selected.execution_mode} · runtime disabled</span></div><div><strong>Budget cap</strong><span>${Number(selected.budget_cap_usd).toFixed(2)}</span></div><div><strong>Created</strong><span>{formatDate(selected.created_at)}</span></div><div><strong>Finished</strong><span>{formatDate(selected.finished_at)}</span></div><div><strong>Human approval</strong><span>{selected.requires_human_approval ? approval?.status ?? "pending" : "Not required"}</span></div></div>
          {approval ? <Link className="secondary-button" href={`/approvals?approval=${approval.id}`} style={{ display: "inline-block", marginTop: 16, textDecoration: "none" }}>Open linked approval</Link> : null}
          {(canRelease || canCancel) ? <form action={updateRun} className="auth-form" style={{ marginTop: 20 }}><input type="hidden" name="runId" value={selected.id} />{canCancel ? <label>Transition note<textarea name="note" rows={3} style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10 }} /></label> : null}<div style={{ display: "grid", gridTemplateColumns: canRelease && canCancel ? "1fr 1fr" : "1fr", gap: 10 }}>{canRelease ? <button name="transition" value="release">Release to dry-run queue</button> : null}{canCancel ? <button name="transition" value="cancel" style={{ background: "#8f2335" }}>Cancel request</button> : null}</div></form> : null}
          <div style={{ marginTop: 22 }}><p className="label">Audit trail</p><div className="compact-list">{audit.length ? audit.map(event => <div key={event.id}><strong>{event.event_type}</strong><span>{event.actor_type} · {event.risk_level} risk · {formatDate(event.created_at)}</span></div>) : <p className="empty-state">No audit events recorded.</p>}</div></div>
        </article> : <p className="empty-state">Select a run request to inspect.</p>}
        <form action={requestRun} className="auth-form" style={{ marginTop: 0, alignSelf: "start", padding: 18, border: "1px solid #dfe4ec", borderRadius: 16, background: "#f8f9fb" }}><div><p className="label">Human CEO entry</p><h3>Request dry-run</h3></div><label>Agent<select name="agentId" required defaultValue=""><option value="" disabled>Select an agent</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.agent_code} — {agent.name} ({agent.enabled ? "enabled" : "paused"})</option>)}</select></label><label>Trigger type<input name="triggerType" defaultValue="manual_ceo" required /></label><label>Input summary<textarea name="inputSummary" minLength={10} required rows={6} style={{ width: "100%", resize: "vertical", padding: 12, border: "1px solid #cfd6e2", borderRadius: 10 }} /></label><label>Risk level<select name="riskLevel" defaultValue="low"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><label>Budget cap (USD)<input name="budgetCapUsd" type="number" min="0" step="0.01" defaultValue="0" required /></label><button>Create governed dry-run request</button><p className="security-note">This records a controlled request only. It cannot execute an agent or perform an external action.</p></form>
      </div>
    </section>
  </main>;
}
