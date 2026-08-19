import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { retryAgentProvisioning, updateAgent } from "../actions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> };

type AgentRow = {
  id:string; name:string; role_title:string; purpose:string; department_id:string|null; reports_to_agent_id:string|null;
  authority_level:number; risk_ceiling:string; language:string; responsibilities:string[]; skills:string[]; kpis:string[];
  human_approval_requirements:string[]; allowed_tools:string[]; agent_status:string; external_actions_allowed:boolean;
  canonical_role:string|null; role_family:string|null; specializations:string[]; provisioning_status:string; provisioning_error:string|null;
  last_knowledge_review_at:string|null; foundation_update_available:boolean;
};
type DepartmentRow = { id:string; name:string };
type ManagerRow = { id:string; name:string; role_title:string; agent_status:string };
type FoundationRow = { id:string; title:string; version:string; last_verified_at:string; next_review_at:string|null; status:string };
type SpecializationRow = { id:string; title:string; version:string; last_verified_at:string; next_review_at:string|null };

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().slice(0, 10);
}

export default async function AgentEditPage({ params, searchParams }: PageProps) {
  const context = await requireActiveOwnerOrganizationContext();
  const { id } = await params;
  const query = await searchParams;

  if (!context.entitlement.agent_builder_enabled) {
    return (
      <main className="page-shell"><section className="panel">
        <p className="eyebrow">RYTHM COMPANY STUDIO</p>
        <h1>Agent Studio</h1>
        <p>Agent Builder is not enabled for this organization&apos;s entitlement.</p>
        <Link href="/command-center">Return to Command Center</Link>
      </section></main>
    );
  }

  const [{ data: agentData }, { data: departmentData }, { data: managerData }, { data: bindingData }, { data: specializationBindings }] = await Promise.all([
    context.supabase.from("agents").select("id,name,role_title,purpose,department_id,reports_to_agent_id,authority_level,risk_ceiling,language,responsibilities,skills,kpis,human_approval_requirements,allowed_tools,agent_status,external_actions_allowed,canonical_role,role_family,specializations,provisioning_status,provisioning_error,last_knowledge_review_at,foundation_update_available").eq("id", id).eq("organization_id", context.organizationId).maybeSingle(),
    context.supabase.from("departments").select("id,name").eq("organization_id", context.organizationId).eq("status", "active").order("name"),
    context.supabase.from("agents").select("id,name,role_title,agent_status").eq("organization_id", context.organizationId).neq("id", id).neq("agent_status", "archived").order("name"),
    context.supabase.from("agent_role_foundation_bindings").select("role_foundation_id,foundation_version").eq("organization_id", context.organizationId).eq("agent_id", id).eq("status", "active").limit(1).maybeSingle(),
    context.supabase.from("agent_specialization_bindings").select("specialization_id").eq("organization_id", context.organizationId).eq("agent_id", id).eq("status", "active"),
  ]);

  if (!agentData) notFound();
  const agent = agentData as AgentRow;
  const departments = (departmentData ?? []) as DepartmentRow[];
  const managers = (managerData ?? []) as ManagerRow[];

  let foundation: FoundationRow | null = null;
  if (bindingData?.role_foundation_id) {
    const { data } = await context.supabase.from("role_foundations").select("id,title,version,last_verified_at,next_review_at,status").eq("id", bindingData.role_foundation_id).maybeSingle();
    foundation = (data ?? null) as FoundationRow | null;
  }
  const specializationIds = (specializationBindings ?? []).map((item: { specialization_id: string }) => item.specialization_id);
  let specializationRows: SpecializationRow[] = [];
  if (specializationIds.length) {
    const { data } = await context.supabase.from("role_specializations").select("id,title,version,last_verified_at,next_review_at").in("id", specializationIds).eq("active", true);
    specializationRows = (data ?? []) as SpecializationRow[];
  }
  const staleByDate = Boolean(foundation?.next_review_at && Date.parse(foundation.next_review_at) <= Date.now()) || specializationRows.some((item) => item.next_review_at && Date.parse(item.next_review_at) <= Date.now());
  const updateAvailable = agent.foundation_update_available || staleByDate;
  const professionalVerified = agent.provisioning_status === "ready" && Boolean(foundation) && foundation?.status === "active";

  return <main className="page-shell">
    <section className="panel">
      <p className="eyebrow">RYTHM COMPANY STUDIO · AI AGENT</p>
      <h1>Edit {agent.name}</h1>
      <p>Status: <strong>{agent.agent_status}</strong> · Professional provisioning: <strong>{agent.provisioning_status}</strong> · External actions: <strong>{agent.external_actions_allowed ? "Allowed" : "Disabled"}</strong></p>
      <p>Governance rule: external actions remain disabled in Public Beta regardless of profile edits.</p>
      {agent.provisioning_status === "ready" && agent.agent_status !== "archived" ? <p><Link href={`/studio/agents/${agent.id}/run`}><strong>Open Chat / Run Console</strong></Link></p> : null}
      {agent.provisioning_status === "failed" ? <form action={retryAgentProvisioning}><input type="hidden" name="agentId" value={agent.id} /><button type="submit">Retry professional provisioning</button></form> : null}
    </section>

    {query.message ? <p className="form-success" role="status">{query.message}</p> : null}
    {query.error ? <p className="form-error" role="alert">{query.error}</p> : null}
    {agent.provisioning_status === "failed" && agent.provisioning_error ? <p className="form-error" role="alert">{agent.provisioning_error}</p> : null}

    <section className="panel">
      <p className="eyebrow">KNOWLEDGE &amp; COMPETENCY</p>
      <h2>Professional readiness</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))", gap:".75rem" }}>
        <div><small>Professional Foundation</small><p><strong>{foundation ? `${foundation.title} v${foundation.version}` : "Not bound"}</strong></p></div>
        <div><small>Canonical Role</small><p><strong>{agent.canonical_role ?? agent.role_title}</strong></p></div>
        <div><small>Specialization</small><p><strong>{specializationRows.length ? specializationRows.map((item) => item.title).join(", ") : "None"}</strong></p></div>
        <div><small>Professional Knowledge</small><p><strong>{professionalVerified ? "Verified" : agent.provisioning_status}</strong></p></div>
        <div><small>Company Knowledge</small><p><strong>{agent.provisioning_status === "ready" ? "Connected · live / role-filtered" : "Pending"}</strong></p></div>
        <div><small>Memory</small><p><strong>Active · transfer scope enforced</strong></p></div>
        <div><small>Last Knowledge Review</small><p><strong>{formatDate(agent.last_knowledge_review_at ?? foundation?.last_verified_at)}</strong></p></div>
        <div><small>Update Available</small><p><strong>{updateAvailable ? "Yes" : "No"}</strong></p></div>
      </div>
      <p style={{ opacity:.72, marginBottom:0 }}>This profile exposes readiness metadata only. Confidential Company Knowledge content is never displayed here.</p>
    </section>

    <section className="panel">
      {agent.agent_status === "archived" ? <p>Archived Agents are immutable in V1.</p> : <form action={updateAgent} className="auth-form">
        <input type="hidden" name="agentId" value={agent.id} />
        <label>Agent name<input name="name" defaultValue={agent.name} required minLength={2} maxLength={120} /></label>
        <label>Role title<input name="roleTitle" defaultValue={agent.role_title} required minLength={2} maxLength={160} /></label>
        <label>Purpose<textarea name="purpose" rows={4} defaultValue={agent.purpose} required minLength={10} /></label>
        <label>Department<select name="departmentId" defaultValue={agent.department_id ?? ""}><option value="">Executive Office / unassigned</option>{departments.map((department)=><option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        <label>Reports to<select name="reportsToAgentId" defaultValue={agent.reports_to_agent_id ?? ""}><option value="">Human CEO / no AI manager</option>{managers.map((manager)=><option key={manager.id} value={manager.id}>{manager.name} — {manager.role_title}</option>)}</select></label>
        <label>Authority level<select name="authorityLevel" defaultValue={String(agent.authority_level)}><option value="0">A0 — advisory only</option><option value="1">A1 — low authority</option><option value="2">A2 — bounded operational authority</option><option value="3">A3 — high authority, approval constrained</option><option value="4">A4 — maximum internal authority</option></select></label>
        <label>Risk ceiling<select name="riskCeiling" defaultValue={agent.risk_ceiling}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label>Language<input name="language" defaultValue={agent.language} /></label>
        <label>Responsibilities<textarea name="responsibilities" rows={4} defaultValue={(agent.responsibilities ?? []).join("\n")} /></label>
        <label>Skills<textarea name="skills" rows={4} defaultValue={(agent.skills ?? []).join("\n")} /></label>
        <label>KPIs<textarea name="kpis" rows={4} defaultValue={(agent.kpis ?? []).join("\n")} /></label>
        <label>Human approval requirements<textarea name="approvalRequirements" rows={4} defaultValue={(agent.human_approval_requirements ?? []).join("\n")} /></label>
        <label>Allowed internal tools<textarea name="allowedTools" rows={4} defaultValue={(agent.allowed_tools ?? []).join("\n")} /></label>
        <button type="submit">Save governed Agent profile</button>
      </form>}
    </section>
    <p><Link href="/studio/agents">Back to Agent Studio</Link></p>
  </main>;
}
