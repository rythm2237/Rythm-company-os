import Link from "next/link";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { AgentPortrait } from "@/app/components/agent-portrait";
import styles from "./agents.module.css";

export const dynamic = "force-dynamic";

type Agent = { id:string; agent_code:string; display_name:string|null; name:string; role_title:string; department:string|null; avatar_url:string|null; presence_status:string; enabled:boolean; risk_ceiling:string; work_style:string|null; agent_status:string };

export default async function AgentDirectory(){
  const context = await requireOrganizationContext();
  const {data}=await context.supabase.from("agents").select("id, agent_code, display_name, name, role_title, department, avatar_url, presence_status, enabled, risk_ceiling, work_style, agent_status").eq("organization_id",context.organizationId).neq("agent_status","archived").order("agent_code");
  const agents=(data??[]) as Agent[];
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM DIGITAL WORKFORCE</p><h1>Agent organization</h1><p className="subtitle">AI workforce for the active organization only. Roles, presence and governed authority remain tenant-scoped.</p></div><div><Link className="secondary-button" href="/meetings/room">Open boardroom</Link>{context.entitlement?.agent_builder_enabled ? <Link className="secondary-button" href="/studio/agents">Agent Studio</Link> : null}</div></header>
    <section className="organization-banner"><div><span>Organization</span><strong>{context.organization.name}</strong></div><div><span>Human authority</span><strong>Human CEO governed</strong></div><div><span>External actions</span><strong>Disabled by default</strong></div></section>
    {agents.length === 0 ? <section className="panel"><p>No AI Agents exist in this organization yet.</p>{context.entitlement?.company_builder_enabled ? <p><Link href="/studio/builder">Build company structure</Link> · <Link href="/studio/templates">Install a template</Link> · <Link href="/studio/agents">Create an Agent</Link></p> : null}</section> : <section className={styles.directoryGrid}>
      {agents.map(agent=><Link key={agent.id} href={`/agents/${agent.agent_code.toLowerCase()}`} className={styles.agentCard}>
        <div className={styles.portraitWrap}>
          <AgentPortrait agentCode={agent.agent_code} avatarUrl={agent.avatar_url} alt={agent.display_name??agent.name} className={styles.portrait}/>
          <span className={styles.presence}>{agent.presence_status.replace("_"," ")}</span>
        </div>
        <div className={styles.cardBody}><p className="label">{agent.department??"Executive Office"}</p><h2>{agent.display_name??agent.name}</h2><p className={styles.role}>{agent.role_title}</p><p className={styles.workStyle}>{agent.work_style}</p><div className={`row-meta ${styles.meta}`}><span>{agent.agent_code}</span><span>{agent.risk_ceiling} risk ceiling</span><b className={agent.enabled?"state-active":"state-paused"}>{agent.agent_status === "enabled" ? "Enabled" : "Paused"}</b></div></div>
      </Link>)}
    </section>}
  </main>;
}
