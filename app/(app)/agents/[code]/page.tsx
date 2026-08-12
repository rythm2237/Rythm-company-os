import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { AgentPortrait } from "@/app/components/agent-portrait";
import styles from "../agents.module.css";

export const dynamic="force-dynamic";

async function setAgentRuntime(formData:FormData){
  "use server";
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id,role").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) redirect("/login?error=Owner%20authorization%20required.");
  const agentId=String(formData.get("agentId")??"");
  const requestedEnabled=String(formData.get("enabled")??"")==="true";
  const {data:agent}=await supabase.from("agents").select("id,agent_code,enabled").eq("id",agentId).eq("organization_id",membership.organization_id).maybeSingle();
  if(!agent) return;
  if(agent.agent_code==="T-001") redirect("/agents/t-001");
  if(Boolean(agent.enabled)===requestedEnabled) return;
  const {error}=await supabase.from("agents").update({enabled:requestedEnabled}).eq("id",agentId).eq("organization_id",membership.organization_id);
  if(error){
    console.error("agent_runtime_state_update_failed",{agentId,error});
    redirect(`/agents/${agent.agent_code.toLowerCase()}?error=Agent%20runtime%20state%20could%20not%20be%20updated.`);
  }
  await supabase.from("audit_events").insert({organization_id:membership.organization_id,actor_type:"user",actor_user_id:user.id,event_type:requestedEnabled?"agent.runtime_enabled":"agent.runtime_paused",object_type:"agent",object_id:agentId,risk_level:"medium",payload:{agent_code:agent.agent_code,enabled:requestedEnabled,human_authority:"Human CEO / Owner",external_actions:false}});
  revalidatePath("/agents");
  revalidatePath(`/agents/${agent.agent_code.toLowerCase()}`);
  revalidatePath("/meetings/room");
}

export default async function AgentProfile({params,searchParams}:{params:Promise<{code:string}>;searchParams:Promise<{error?:string}>}){
  const {code}=await params;
  const query=await searchParams;
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id,role").eq("user_id",user.id).maybeSingle(); if(!membership) redirect("/login");
  const {data:agent}=await supabase.from("agents").select("id, agent_code, display_name, name, role_title, purpose, department, avatar_url, presence_status, enabled, risk_ceiling, authority_level, work_style, supported_languages, identity, permissions, specification_version").eq("organization_id",membership.organization_id).ilike("agent_code",code).maybeSingle();
  if(!agent) notFound();
  const owner=membership.role==="owner";
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">DIGITAL EMPLOYEE PROFILE</p><h1>{agent.display_name??agent.name}</h1><p className="subtitle">{agent.role_title}</p></div><Link className="secondary-button" href="/agents">Agent organization</Link></header>
    {query.error?<p className="form-error">{query.error}</p>:null}
    <section className={styles.profileGrid}>
      <article className={`panel ${styles.profileCard}`}><div className={styles.profilePortrait}><AgentPortrait agentCode={agent.agent_code} avatarUrl={agent.avatar_url} alt={agent.display_name??agent.name}/></div><div className={styles.profileBody}><p className="label">{agent.department}</p><h2>{agent.display_name??agent.name}</h2><p style={{color:"#596579",fontWeight:700}}>{agent.role_title}</p><div className="compact-list"><div><strong>Status</strong><span>{agent.presence_status}</span></div><div><strong>Agent code</strong><span>{agent.agent_code}</span></div><div><strong>Specification</strong><span>v{agent.specification_version}</span></div><div><strong>Languages</strong><span>{(agent.supported_languages??[]).join(" · ")}</span></div></div></div></article>
      <div className={styles.profileDetails}><article className="panel"><p className="label">Role charter</p><h2>Mandate and operating style</h2><p style={{color:"#596579",lineHeight:1.75}}>{agent.purpose}</p><p style={{color:"#596579",lineHeight:1.75}}>{agent.work_style}</p></article><article className="panel"><p className="label">Governance</p><div className="compact-list"><div><strong>Authority level</strong><span>{agent.authority_level}</span></div><div><strong>Risk ceiling</strong><span>{agent.risk_ceiling}</span></div><div><strong>Runtime state</strong><span>{agent.enabled?"Enabled":"Paused"}</span></div><div><strong>External actions</strong><span>Disabled</span></div></div>{owner&&agent.agent_code!=="T-001"?<form action={setAgentRuntime} style={{marginTop:16}}><input type="hidden" name="agentId" value={agent.id}/><input type="hidden" name="enabled" value={agent.enabled?"false":"true"}/><button type="submit" className={agent.enabled?"secondary-button":undefined}>{agent.enabled?"Pause agent runtime":"Enable agent runtime"}</button><p className="security-note" style={{marginTop:10}}>Human CEO / Owner control. Paused agents cannot be selected or executed in governed Boardroom sessions.</p></form>:<p className="security-note">T-001 execution remains governed separately and cannot be enabled from this profile.</p>}</article><article className="panel"><p className="label">Machine-readable profile</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:12,color:"#596579"}}>{JSON.stringify({identity:agent.identity,permissions:agent.permissions},null,2)}</pre></article></div>
    </section>
  </main>;
}