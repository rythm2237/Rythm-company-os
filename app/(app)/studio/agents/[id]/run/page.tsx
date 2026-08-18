import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import AgentRunConsole from "./AgentRunConsole";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

type AgentRow = {
  id: string;
  name: string;
  role_title: string;
  purpose: string;
  agent_status: string;
  runtime_provider: string | null;
  runtime_model: string | null;
  system_instructions: string | null;
};

export default async function AgentRunPage({ params }: PageProps) {
  const context = await requireActiveOwnerOrganizationContext();
  const { id } = await params;

  if (!context.entitlement.agent_builder_enabled) {
    return <main className="page-shell"><section className="panel"><h1>Agent Console unavailable</h1><p>Agent Builder is not enabled for this organization.</p></section></main>;
  }

  const { data } = await context.supabase
    .from("agents")
    .select("id,name,role_title,purpose,agent_status,runtime_provider,runtime_model,system_instructions")
    .eq("id", id)
    .eq("organization_id", context.organizationId)
    .maybeSingle();

  if (!data) notFound();
  const agent = data as AgentRow;
  if (agent.agent_status === "archived") {
    return <main className="page-shell"><section className="panel"><p className="eyebrow">SAFE AGENT CONSOLE</p><h1>{agent.name}</h1><p>Archived Agents cannot be run.</p><Link href="/studio/agents">Back to Agent Studio</Link></section></main>;
  }

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">RYTHM COMPANY STUDIO · DIRECT AGENT TEST</p>
        <h1>Chat / Run {agent.name}</h1>
        <p>{agent.purpose}</p>
        <p><Link href={`/studio/agents/${agent.id}`}>Edit Agent</Link> · <Link href="/studio/agents">Back to Agent Studio</Link></p>
      </section>

      {!agent.system_instructions || !agent.runtime_model ? (
        <section className="panel">
          <h2>Runtime not ready</h2>
          <p>This Agent needs a generated system instruction and runtime model before it can be tested.</p>
        </section>
      ) : (
        <AgentRunConsole
          agentId={agent.id}
          agentName={agent.name}
          roleTitle={agent.role_title}
          status={agent.agent_status}
          provider={agent.runtime_provider ?? "openai"}
          model={agent.runtime_model}
        />
      )}
    </main>
  );
}
