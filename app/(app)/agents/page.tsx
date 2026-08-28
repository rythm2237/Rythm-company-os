import Link from "next/link";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { AgentPortrait } from "@/app/components/agent-portrait";
import styles from "./agents.module.css";

export const dynamic = "force-dynamic";

type AssetProfile = { current_level:string; level_score:number|null; certification_status:string; valuation_status:string; marketplace_eligible:boolean };
type Agent = { id:string; agent_code:string; display_name:string|null; name:string; role_title:string; department:string|null; avatar_url:string|null; presence_status:string; enabled:boolean; risk_ceiling:string; work_style:string|null; agent_status:string; agent_asset_profiles?:AssetProfile|AssetProfile[]|null };

function assetOf(agent:Agent){const value=agent.agent_asset_profiles;return Array.isArray(value)?value[0]??null:value??null;}
function levelLabel(level?:string|null){if(!level)return "Unclassified";return level.charAt(0).toUpperCase()+level.slice(1);}

export default async function AgentDirectory(){
  const context=await requireOrganizationContext();
  const {data}=await context.supabase.from("agents").select("id, agent_code, display_name, name, role_title, department, avatar_url, presence_status, enabled, risk_ceiling, work_style, agent_status, agent_asset_profiles(current_level,level_score,certification_status,valuation_status,marketplace_eligible)").eq("organization_id",context.organizationId).neq("agent_status","archived").order("agent_code");
  const agents=(data??[]) as Agent[];
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM DIGITAL WORKFORCE</p><h1>Agent organization</h1><p className="subtitle">Give an Agent a task, manage its runtime authority, or add role-specific knowledge directly without writing prompts.</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link className="secondary-button" href="/company/launch">Launch readiness</Link><Link className="secondary-button" href="/meetings/room">Open boardroom</Link>{context.entitlement?.agent_builder_enabled?<Link className="secondary-button" href="/studio/agents">Agent Studio</Link>:null}</div></header>
    <section className="organization-banner"><div><span>Organization</span><strong>{context.organization.name}</strong></div><div><span>Human authority</span><strong>Human CEO governed</strong></div><div><span>Knowledge model</span><strong>Company + direct Agent knowledge</strong></div></section>
    <section className={styles.frameworkNote}><strong>Professional ladder</strong><span>Associate → Specialist → Senior → Lead → Principal → Director</span><small>Professional level and runtime authority remain separate. Knowledge uploads do not expand permissions or execution authority.</small></section>
    {agents.length===0?<section className="panel"><p>No AI Agents exist in this organization yet.</p>{context.entitlement?.company_builder_enabled?<p><Link href="/studio/builder">Build company structure</Link> · <Link href="/studio/templates">Install a template</Link> · <Link href="/studio/agents">Create an Agent</Link></p>:null}</section>:<section className={styles.directoryGrid}>
      {agents.map(agent=>{const asset=assetOf(agent);const code=agent.agent_code.toLowerCase();return <article key={agent.id} className={styles.agentCard}>
        <Link href={`/agents/${code}`} style={{color:"inherit",textDecoration:"none",display:"block"}}>
          <div className={styles.portraitWrap}><AgentPortrait agentCode={agent.agent_code} avatarUrl={agent.avatar_url} alt={agent.display_name??agent.name} className={styles.portrait}/><span className={styles.presence}>{agent.presence_status.replace("_"," ")}</span></div>
          <div className={styles.cardBody}><p className="label">{agent.department??"Executive Office"}</p><h2>{agent.display_name??agent.name}</h2><p className={styles.role}>{agent.role_title}</p><div className={styles.levelRow}><span className={styles.levelBadge}>{levelLabel(asset?.current_level)}</span>{asset?.level_score!=null?<span className={styles.scoreBadge}>{asset.level_score}/100</span>:null}{asset?.certification_status==="verified"?<span className={styles.verifiedBadge}>RYTHM Verified</span>:<span className={styles.unverifiedBadge}>{asset?.certification_status??"unverified"}</span>}</div><p className={styles.workStyle}>{agent.work_style}</p><div className={`row-meta ${styles.meta}`}><span>{agent.agent_code}</span><span>{agent.risk_ceiling} risk ceiling</span><b className={agent.enabled?"state-active":"state-paused"}>{agent.agent_status==="enabled"?"Enabled":"Paused"}</b></div></div>
        </Link>
        <div style={{display:"flex",gap:8,padding:"0 16px 16px",flexWrap:"wrap"}}><Link href={`/agents/${code}/task`} className="primary-button">Give task</Link><Link href={`/agents/${code}`} className="secondary-button">Open profile</Link><Link href={`/agents/${code}/knowledge`} className="secondary-button">Add knowledge</Link></div>
      </article>})}
    </section>}
  </main>;
}
