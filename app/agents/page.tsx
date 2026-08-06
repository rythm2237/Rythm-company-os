import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { AgentPortrait } from "@/app/components/agent-portrait";
import styles from "./agents.module.css";

export const dynamic = "force-dynamic";

type Agent = { id:string; agent_code:string; display_name:string|null; name:string; role_title:string; department:string|null; avatar_url:string|null; presence_status:string; enabled:boolean; risk_ceiling:string; work_style:string|null };

async function context(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).maybeSingle();
  if(!membership) redirect("/login");
  return {supabase,organizationId:membership.organization_id as string};
}

export default async function AgentDirectory(){
  const {supabase,organizationId}=await context();
  const {data}=await supabase.from("agents").select("id, agent_code, display_name, name, role_title, department, avatar_url, presence_status, enabled, risk_ceiling, work_style").eq("organization_id",organizationId).order("agent_code");
  const agents=(data??[]) as Agent[];
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM DIGITAL WORKFORCE</p><h1>Agent organization</h1><p className="subtitle">A human-readable view of the company’s digital workforce, roles, presence and governed authority.</p></div><Link className="secondary-button" href="/meetings/room">Open boardroom</Link></header>
    <section className="organization-banner"><div><span>Visual standard</span><strong>Professional realism</strong></div><div><span>Meeting format</span><strong>Round-table boardroom</strong></div><div><span>Commercial model</span><strong>White-label ready</strong></div></section>
    <section className={styles.directoryGrid}>
      {agents.map(agent=><Link key={agent.id} href={`/agents/${agent.agent_code.toLowerCase()}`} className={styles.agentCard}>
        <div className={styles.portraitWrap}>
          <AgentPortrait agentCode={agent.agent_code} avatarUrl={agent.avatar_url} alt={agent.display_name??agent.name} className={styles.portrait}/>
          <span className={styles.presence}>{agent.presence_status.replace("_"," ")}</span>
        </div>
        <div className={styles.cardBody}><p className="label">{agent.department??"Executive Office"}</p><h2>{agent.display_name??agent.name}</h2><p className={styles.role}>{agent.role_title}</p><p className={styles.workStyle}>{agent.work_style}</p><div className={`row-meta ${styles.meta}`}><span>{agent.agent_code}</span><span>{agent.risk_ceiling} risk ceiling</span><b className={agent.enabled?"state-active":"state-paused"}>{agent.enabled?"Enabled":"Paused"}</b></div></div>
      </Link>)}
    </section>
  </main>;
}
