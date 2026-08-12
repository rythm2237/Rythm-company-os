import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { updateAgent } from "../actions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> };

type AgentRow = {
  id:string; name:string; role_title:string; purpose:string; department_id:string|null; reports_to_agent_id:string|null;
  authority_level:number; risk_ceiling:string; language:string; responsibilities:string[]; skills:string[]; kpis:string[];
  human_approval_requirements:string[]; allowed_tools:string[]; agent_status:string; external_actions_allowed:boolean;
};
type DepartmentRow = { id:string; name:string };
type ManagerRow = { id:string; name:string; role_title:string; agent_status:string };

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

  const [{ data: agentData }, { data: departmentData }, { data: managerData }] = await Promise.all([
    context.supabase.from("agents").select("id,name,role_title,purpose,department_id,reports_to_agent_id,authority_level,risk_ceiling,language,responsibilities,skills,kpis,human_approval_requirements,allowed_tools,agent_status,external_actions_allowed").eq("id", id).eq("organization_id", context.organizationId).maybeSingle(),
    context.supabase.from("departments").select("id,name").eq("organization_id", context.organizationId).eq("status", "active").order("name"),
    context.supabase.from("agents").select("id,name,role_title,agent_status").eq("organization_id", context.organizationId).neq("id", id).neq("agent_status", "archived").order("name"),
  ]);

  if (!agentData) notFound();
  const agent = agentData as AgentRow;
  const departments = (departmentData ?? []) as DepartmentRow[];
  const managers = (managerData ?? []) as ManagerRow[];

  return <main className="page-shell">
    <section className="panel">
      <p className="eyebrow">RYTHM COMPANY STUDIO · AI AGENT</p>
      <h1>Edit {agent.name}</h1>
      <p>Status: <strong>{agent.agent_status}</strong> · External actions: <strong>{agent.external_actions_allowed ? "Allowed" : "Disabled"}</strong></p>
      <p>Governance rule: external actions remain disabled in Public Beta regardless of profile edits.</p>
    </section>

    {query.message ? <p className="form-success" role="status">{query.message}</p> : null}
    {query.error ? <p className="form-error" role="alert">{query.error}</p> : null}

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
