import Link from "next/link";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { AgentPortrait } from "@/app/components/agent-portrait";
import styles from "./agents.module.css";

export const dynamic = "force-dynamic";

type AssetProfile = { current_level:string; level_score:number|null; certification_status:string; valuation_status:string; marketplace_eligible:boolean };
type Agent = { id:string; agent_code:string; display_name:string|null; name:string; role_title:string; department:string|null; avatar_url:string|null; presence_status:string; enabled:boolean; risk_ceiling:string; work_style:string|null; agent_status:string; agent_asset_profiles?:AssetProfile|AssetProfile[]|null };

function assetOf(agent:Agent){const value=agent.agent_asset_profiles;return Array.isArray(value)?value[0]??null:value??null;}
function levelLabel(level?:string|null){if(!level)return "Unclassified";return level.charAt(0).toUpperCase()+level.slice(1);}

export default async function AgentDirectory({searchParams}:{searchParams:Promise<{q?:string}>}){
  const context=await requireOrganizationContext();
  const query=await searchParams;
  const search=String(query.q??"").trim().toLowerCase();
  const {data}=await context.supabase.from("agents").select("id, agent_code, display_name, name, role_title, department, avatar_url, presence_status, enabled, risk_ceiling, work_style, agent_status, agent_asset_profiles(current_level,level_score,certification_status,valuation_status,marketplace_eligible)").eq("organization_id",context.organizationId).neq("agent_status","archived").order("agent_code");
  const allAgents=(data??[]) as Agent[];
  const agents=search?allAgents.filter(agent=>[agent.display_name,agent.name,agent.role_title,agent.department,agent.agent_code].filter(Boolean).some(value=>String(value).toLowerCase().includes(search))):allAgents;

  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM DIGITAL WORKFORCE</p><h1>Agent organization</h1><p className="subtitle">Find an Agent quickly, expand only the one you need, then give tasks or manage its professional profile.</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link className="secondary-button" href="/company/launch">Launch readiness</Link><Link className="secondary-button" href="/meetings/room">Open boardroom</Link>{context.entitlement?.agent_builder_enabled?<Link className="secondary-button" href="/studio/agents">Agent Studio</Link>:null}</div></header>
    <section className="organization-banner"><div><span>Organization</span><strong>{context.organization.name}</strong></div><div><span>Human authority</span><strong>Human CEO governed</strong></div><div><span>Knowledge model</span><strong>Company + direct Agent knowledge</strong></div></section>
    <section className={styles.frameworkNote}><strong>Professional ladder</strong><span>Associate → Specialist → Senior → Lead → Principal → Director</span><small>Professional level and runtime authority remain separate. Knowledge uploads do not expand permissions or execution authority.</small></section>

    <section className={styles.directoryTools} aria-label="Agent directory tools">
      <form className={styles.searchForm} action="/agents" method="get">
        <label htmlFor="agent-search">Search agents</label>
        <div className={styles.searchRow}><input id="agent-search" name="q" defaultValue={query.q??""} placeholder="Search by name, position, department or code"/><button type="submit">Search</button>{search?<Link href="/agents" className={styles.clearSearch}>Clear</Link>:null}</div>
      </form>
      <span className={styles.resultCount}>{agents.length} of {allAgents.length} agents</span>
    </section>

    {allAgents.length===0?<section className="panel"><p>No AI Agents exist in this organization yet.</p>{context.entitlement?.company_builder_enabled?<p><Link href="/studio/builder">Build company structure</Link> · <Link href="/studio/templates">Install a template</Link> · <Link href="/studio/agents">Create an Agent</Link></p>:null}</section>:agents.length===0?<section className="panel"><p>No agents match “{query.q}”.</p><p><Link href="/agents">Show all agents</Link></p></section>:<section className={styles.agentList}>
      {agents.map(agent=>{const asset=assetOf(agent);const code=agent.agent_code.toLowerCase();return <details key={agent.id} className={styles.agentAccordion}>
        <summary className={styles.agentSummary}>
          <div className={styles.summaryPortrait}><AgentPortrait agentCode={agent.agent_code} avatarUrl={agent.avatar_url} alt={agent.display_name??agent.name} className={styles.portrait}/></div>
          <div className={styles.summaryIdentity}><strong>{agent.display_name??agent.name}</strong><span>{agent.role_title}</span></div>
          <div className={styles.summaryMeta}><span className={styles.levelBadge}>{levelLabel(asset?.current_level)}</span><b className={agent.enabled?styles.runtimeActive:styles.runtimePaused}>{agent.enabled?"Active":"Paused"}</b></div>
          <span className={styles.chevron} aria-hidden="true">⌄</span>
        </summary>
        <div className={styles.accordionBody}>
          <div className={styles.agentDetailGrid}>
            <div><span>Department</span><strong>{agent.department??"Executive Office"}</strong></div>
            <div><span>Agent code</span><strong>{agent.agent_code}</strong></div>
            <div><span>Presence</span><strong>{agent.presence_status.replace("_"," ")}</strong></div>
            <div><span>Risk ceiling</span><strong>{agent.risk_ceiling}</strong></div>
          </div>
          <div className={styles.levelRow}><span className={styles.levelBadge}>{levelLabel(asset?.current_level)}</span>{asset?.level_score!=null?<span className={styles.scoreBadge}>{asset.level_score}/100</span>:null}{asset?.certification_status==="verified"?<span className={styles.verifiedBadge}>RYTHM Verified</span>:<span className={styles.unverifiedBadge}>{asset?.certification_status??"unverified"}</span>}</div>
          {agent.work_style?<p className={styles.workStyle}>{agent.work_style}</p>:null}
          <div className={styles.accordionActions}><Link href={`/agents/${code}/task`} className={`${styles.actionButton} ${styles.primaryAction}`}>Give task</Link><Link href={`/agents/${code}`} className={styles.actionButton}>Open profile</Link><Link href={`/agents/${code}/assessment`} className={styles.actionButton}>Professional assessment</Link><Link href={`/agents/${code}/knowledge`} className={styles.actionButton}>Add knowledge</Link></div>
        </div>
      </details>})}
    </section>}
  </main>;
}
