import Link from "next/link";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { getAgentProviderOptions } from "@/lib/agent-builder";
import AgentBuilderWizard from "./AgentBuilderWizard";
import { cloneAgent, generateAgent, setAgentStatus } from "./actions";

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
  runtime_provider?: string | null;
  runtime_model?: string | null;
};

type DepartmentRow = { id: string; name: string };
type PageProps = { searchParams: Promise<{ error?: string; message?: string }> };

export default async function AgentStudioPage({ searchParams }: PageProps) {
  const context = await requireActiveOwnerOrganizationContext();
  const params = await searchParams;

  if (!context.entitlement.agent_builder_enabled) {
    return <main className="page-shell"><section className="panel"><p className="eyebrow">RYTHM COMPANY STUDIO</p><h1>Agent Studio</h1><p>Agent Builder is not enabled for this organization&apos;s entitlement.</p><Link href="/command-center">Return to Command Center</Link></section></main>;
  }

  const entitlement = context.entitlement;
  const providers = getAgentProviderOptions();

  const [{ data: agentData }, { data: departmentData }] = await Promise.all([
    context.supabase.from("agents").select("id,agent_code,name,role_title,purpose,authority_level,risk_ceiling,language,agent_status,external_actions_allowed,department_id,runtime_provider,runtime_model").eq("organization_id", context.organizationId).order("agent_code"),
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
        <h1>Agent Builder</h1>
        <p>Build a governed AI specialist in a few guided steps. RYTHM progressively creates the Agent Blueprint, then the AI provider you select turns it into the final system instruction.</p>
        <p>Every generated Agent is explicitly AI, starts <strong>Paused</strong>, and cannot perform external actions in Public Beta.</p>
        <p><strong>Agent capacity:</strong> {activeAgents.length} / {entitlement.max_active_agents}</p>
        <p><Link href="/studio/templates">Template Library</Link> · <Link href="/studio/builder">Company Builder</Link> · <Link href="/agents">Workforce directory</Link> · <Link href="/meetings">Boardroom</Link></p>
      </section>

      {params.message ? <p className="form-success" role="status">{params.message}</p> : null}
      {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

      <section className="panel">
        <h2>Create an AI Agent</h2>
        {!canCreate ? <p>Agent creation is currently unavailable or the organization has reached its plan limit.</p> : (
          <AgentBuilderWizard
            action={generateAgent}
            departments={departments}
            existingAgents={activeAgents.map((agent) => ({ id: agent.id, name: agent.name, role_title: agent.role_title }))}
            providers={providers}
          />
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
                <p>Brain: <strong>{agent.runtime_provider ?? "OpenAI"}</strong>{agent.runtime_model ? ` · ${agent.runtime_model}` : ""}</p>
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
