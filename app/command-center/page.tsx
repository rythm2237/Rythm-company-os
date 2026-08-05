import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { logout } from "./actions";

export const dynamic = "force-dynamic";

type AgentRow = { agent_code: string; name: string; role_title: string; enabled: boolean; authority_level: number; risk_ceiling: string };
type ApprovalRow = { id: string; title: string; risk_level: string; status: string; created_at: string };
type MeetingRow = { id: string; title: string; status: string; scheduled_for: string | null };
type ActionRow = { id: string; title: string; status: string; priority: number; due_at: string | null };

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Not scheduled";

export default async function CommandCenterPage() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (membershipError || !membership) {
    return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">ACCESS DENIED</p><h1 className="auth-title">Owner authorization required</h1><p className="auth-copy">This account is authenticated but is not registered as an Owner.</p><form action={logout}><button type="submit">Sign out</button></form></section></main>;
  }

  const organizationId = membership.organization_id;
  const [organizationResult, agentsResult, memoryResult, approvalsResult, meetingsResult, actionsResult, decisionsResult, runsResult] = await Promise.all([
    supabase.from("organizations").select("name, slug, status, mission, vision").eq("id", organizationId).single(),
    supabase.from("agents").select("agent_code, name, role_title, enabled, authority_level, risk_ceiling").eq("organization_id", organizationId).order("agent_code"),
    supabase.from("company_memory").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("approval_requests").select("id, title, risk_level, status, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(5),
    supabase.from("meetings").select("id, title, status, scheduled_for").eq("organization_id", organizationId).order("scheduled_for", { ascending: true, nullsFirst: false }).limit(5),
    supabase.from("action_items").select("id, title, status, priority, due_at").eq("organization_id", organizationId).neq("status", "completed").order("priority").limit(6),
    supabase.from("decisions").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("agent_runs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);

  const organization = organizationResult.data;
  const agents = (agentsResult.data ?? []) as AgentRow[];
  const approvals = (approvalsResult.data ?? []) as ApprovalRow[];
  const meetings = (meetingsResult.data ?? []) as MeetingRow[];
  const actions = (actionsResult.data ?? []) as ActionRow[];
  const metrics = [
    ["Registered agents", agents.length],
    ["Enabled agents", agents.filter((agent) => agent.enabled).length],
    ["Memory records", memoryResult.count ?? 0],
    ["Pending approvals", approvals.filter((item) => item.status === "pending").length],
    ["Decisions", decisionsResult.count ?? 0],
    ["Agent runs", runsResult.count ?? 0],
  ] as const;

  return (
    <main className="command-shell">
      <header className="command-header"><div><p className="eyebrow">RYTHM EXECUTIVE COMMAND CENTER</p><h1>Human CEO control plane</h1><p className="subtitle">Authenticated as {user.email}. Consequential authority remains under your control.</p></div><form action={logout}><button className="secondary-button" type="submit">Sign out</button></form></header>
      <section className="organization-banner"><div><span>Organization</span><strong>{organization?.name ?? "RYTHM"}</strong></div><div><span>Role</span><strong>Human CEO / Owner</strong></div><div><span>Status</span><strong>{organization?.status ?? "approved"}</strong></div></section>
      <section className="metrics-grid" aria-label="Company Core metrics">{metrics.map(([label, value]) => <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>

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
