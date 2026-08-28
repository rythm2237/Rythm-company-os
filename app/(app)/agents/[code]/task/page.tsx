import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import AgentTaskConsole from "./AgentTaskConsole";

export const dynamic = "force-dynamic";

export default async function AgentTaskPage({params}:{params:Promise<{code:string}>}) {
  const {code}=await params;
  const context=await requireActiveOwnerOrganizationContext();
  const {data:agent}=await context.supabase.from("agents")
    .select("id,agent_code,display_name,name,role_title,purpose,enabled")
    .eq("organization_id",context.organizationId)
    .ilike("agent_code",code)
    .maybeSingle();
  if(!agent) notFound();
  const name=agent.display_name??agent.name;
  return <main className="command-shell">
    <header className="command-header">
      <div><p className="eyebrow">AGENT WORKSPACE · GOVERNED TASK</p><h1>{name}</h1><p className="subtitle">{agent.role_title}. Assign an internal task using normal language; model selection is handled by RYTHM Adaptive Routing.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link className="secondary-button" href={`/agents/${agent.agent_code.toLowerCase()}`}>Agent profile</Link><Link className="secondary-button" href="/agents">All Agents</Link></div>
    </header>
    {!agent.enabled?<p className="form-error">This Agent is paused. Open the Agent profile and enable its runtime before assigning work.</p>:null}
    <section className="panel"><p className="label">GOVERNANCE</p><h2>Internal analysis and recommendations only</h2><p style={{color:"#667085",lineHeight:1.7}}>This interface can reason over Company Knowledge and Direct Agent Knowledge. It cannot publish, spend money, change credentials, make legal commitments or perform destructive external actions. Those actions remain behind the Execution Gateway and Human approval.</p></section>
    <AgentTaskConsole agentCode={agent.agent_code} agentName={name}/>
  </main>;
}
