import Link from "next/link";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { cloneAgent, createAgent, setAgentStatus } from "./actions";

export const dynamic = "force-dynamic";

type AgentRow = {
  id: string;
  agent_code: string;
  name: string;
  role_title: string;
  purpose: string;
  authority_level: number;
  risk_ceiling: string;
  language: string;
  agent_status: string;
  external_actions_allowed: boolean;
  department_id: string | null;
};

type DepartmentRow = { id: string; name: string };

type PageProps = { searchParams: Promise<{ error?: string; message?: string }> };

export default async function AgentStudioPage({ searchParams }: PageProps) {
  const context = await requireOwnerOrganizationContext();
  const params = await searchParams;

  if (!context.entitlement?.agent_builder_enabled) {
    return <main className="page-shell"><section className="panel"><p className="eyebrow">RYTHM COMPANY STUDIO</p><h1>Agent Studio</h1><p>Agent Builder is not enabled for this organization&apos;s entitlement.</p><Link href="/command-center">Return to Command Center</Link></section></main>;
  }

  const entitlement = context.entitlement;

  const [{ data: agentData }, { data: departmentData }] = await Promise.all([
    context.supabase.from("agents").select("id,agent_code,name,role_title,purpose,authority_level,risk_ceiling,language,agent_status,external_actions_allowed,department_id").eq("organization_id", context.organizationId).order("agent_code"),
    context.supabase.from("departments").select("id,name").eq("organization_id", context.organizationId).eq("status", "active").order("name"),
  ]);

  const agents = (agentData ?? []) as AgentRow[];
  const departments = (departmentData ?? []) as DepartmentRow[];
  const activeAgents = agents.filter((agent) => agent.agent_status !== "archived");
  const canCreate = Boolean(entitlement.agent_create_enabled && activeAgents.length < entitlement.max_active_agents);

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">RYTHM COMPANY STUDIO</p>
        <h1>Agent Studio</h1>
        <p>Create and govern AI Agents for <strong>{context.organization.name}</strong>. Every Agent is explicitly AI, starts Paused, and cannot perform external actions in Public Beta.</p>
        <p><strong>Agent capacity:</strong> {activeAgents.length} / {entitlement.max_active_agents}</p>
        <p><Link href="/studio/templates">Template Library</Link> · <Link href="/studio/builder">Company Builder</Link> · <Link href="/agents">Workforce directory</Link></p>
      </section>

      {params.message ? <p className="form-success" role="status">{params.message}</p> : null}
      {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

      <section className="panel">
        <h2>Create AI Agent</h2>
        {!canCreate ? <p>Agent creation is currently unavailable or the organization has reached its plan limit.</p> : (
          <form action={createAgent} className="auth-form">
            <label>Agent name<input name="name" required minLength={2} maxLength={120} placeholder="e.g. Market Research Analyst" /></label>
            <label>Role title<input name="roleTitle" required minLength={2} maxLength={160} placeholder="e.g. Market Research Analyst" /></label>
            <label>Purpose<textarea name="purpose" rows={3} required minLength={10} placeholder="What this AI Agent is responsible for achieving internally." /></label>
            <label>Department<select name="departmentId" defaultValue=""><option value="">Executive Office / unassigned</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
            <label>Reports to<select name="reportsToAgentId" defaultValue=""><option value="">Human CEO / no AI manager</option>{activeAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} — {agent.role_title}</option>)}</select></label>
            <label>Authority level<select name="authorityLevel" defaultValue="1"><option value="0">A0 — advisory only</option><option value="1">A1 — low authority</option><option value="2">A2 — bounded operational authority</option><option value="3">A3 — high authority, approval constrained</option><option value="4">A4 — maximum internal authority</option></select></label>
            <label>Risk ceiling<select name="riskCeiling" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            <label>Language<input name="language" defaultValue="English" /></label>
            <label>Responsibilities<textarea name="responsibilities" rows={3} placeholder="Separate items with commas or new lines" /></label>
            <label>Skills<textarea name="skills" rows={3} placeholder="Separate items with commas or new lines" /></label>
            <label>KPIs<textarea name="kpis" rows={3} placeholder="Separate items with commas or new lines" /></label>
            <label>Human approval requirements<textarea name="approvalRequirements" rows={3} defaultValue={"Consequential external actions\nMaterial financial commitments"} /></label>
            <label>Allowed internal tools<textarea name="allowedTools" rows={3} defaultValue={"company_memory\nprojects\nmeetings\ndecisions\nactions"} /></label>
            <button type="submit">Create AI Agent</button>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>Organization AI workforce</h2>
        {agents.length === 0 ? <p>No AI Agents have been created for this organization yet.</p> : (
          <div className="kpi-grid">
            {agents.map((agent) => (
              <article className="kpi-card" key={agent.id}>
                <p className="eyebrow">{agent.agent_code} · AI AGENT</p>
                <h3>{agent.name}</h3>
                <p>{agent.role_title}</p>
                <p>A{agent.authority_level} · {agent.risk_ceiling} risk · {agent.language}</p>
                <p>Status: <strong>{agent.agent_status}</strong></p>
                <p>External actions: <strong>{agent.external_actions_allowed ? "Allowed" : "Disabled"}</strong></p>
                <p><Link href={`/studio/agents/${agent.id}`}>Edit Agent</Link></p>
                {agent.agent_status !== "archived" ? <div>
                  <form action={setAgentStatus}><input type="hidden" name="agentId" value={agent.id} /><input type="hidden" name="status" value={agent.agent_status === "enabled" ? "paused" : "enabled"} /><button type="submit">{agent.agent_status === "enabled" ? "Pause" : "Enable"}</button></form>
                  {entitlement.agent_clone_enabled ? <form action={cloneAgent}><input type="hidden" name="agentId" value={agent.id} /><button type="submit">Clone</button></form> : null}
                  {entitlement.agent_archive_enabled ? <form action={setAgentStatus}><input type="hidden" name="agentId" value={agent.id} /><input type="hidden" name="status" value="archived" /><button type="submit">Archive</button></form> : null}
                </div> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
