import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOrganizationContext, requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { AgentPortrait } from "@/app/components/agent-portrait";
import styles from "../agents.module.css";

export const dynamic="force-dynamic";

function titleCase(value?:string|null){return value?value.charAt(0).toUpperCase()+value.slice(1):"Unclassified";}

async function setAgentRuntime(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await requireOwnerOrganizationContext();
  const agentId=String(formData.get("agentId")??"");
  const requestedEnabled=String(formData.get("enabled")??"")==="true";
  const {data:agent}=await supabase.from("agents").select("id,agent_code,enabled").eq("id",agentId).eq("organization_id",organizationId).maybeSingle();
  if(!agent) return;
  if(agent.agent_code==="T-001") redirect("/agents/t-001");
  if(Boolean(agent.enabled)===requestedEnabled) return;
  const {error}=await supabase.from("agents").update({enabled:requestedEnabled}).eq("id",agentId).eq("organization_id",organizationId);
  if(error){console.error("agent_runtime_state_update_failed",{agentId,error});redirect(`/agents/${agent.agent_code.toLowerCase()}?error=Agent%20runtime%20state%20could%20not%20be%20updated.`);}
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:requestedEnabled?"agent.runtime_enabled":"agent.runtime_paused",object_type:"agent",object_id:agentId,risk_level:"medium",payload:{agent_code:agent.agent_code,enabled:requestedEnabled,human_authority:"Human CEO / Owner",external_actions:false}});
  revalidatePath("/agents");revalidatePath(`/agents/${agent.agent_code.toLowerCase()}`);revalidatePath("/meetings/room");
}

async function requestLevelAssessment(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await requireOwnerOrganizationContext();
  const agentId=String(formData.get("agentId")??"");
  const {data:agent}=await supabase.from("agents").select("id,agent_code,specification_version").eq("id",agentId).eq("organization_id",organizationId).maybeSingle();
  if(!agent)return;
  const {data:existing}=await supabase.from("agent_certification_requests").select("id").eq("agent_id",agentId).in("status",["pending","in_review"]).limit(1).maybeSingle();
  if(existing)redirect(`/agents/${agent.agent_code.toLowerCase()}?message=Assessment%20request%20is%20already%20pending.`);
  const {data:asset}=await supabase.from("agent_asset_profiles").select("current_level,level_score,certification_status,last_assessed_at").eq("agent_id",agentId).maybeSingle();
  const {count:validatedExperience}=await supabase.from("agent_experience_events").select("id",{count:"exact",head:true}).eq("agent_id",agentId).eq("counts_toward_experience",true).not("validated_at","is",null);
  const {error}=await supabase.from("agent_certification_requests").insert({agent_id:agentId,organization_id:organizationId,requested_by:user.id,evidence_snapshot:{current_level:asset?.current_level??"associate",level_score:asset?.level_score??null,certification_status:asset?.certification_status??"unverified",last_assessed_at:asset?.last_assessed_at??null,validated_experience_events:validatedExperience??0,specification_version:agent.specification_version}});
  if(error)redirect(`/agents/${agent.agent_code.toLowerCase()}?error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"agent.level_assessment_requested",object_type:"agent",object_id:agentId,risk_level:"low",payload:{agent_code:agent.agent_code}});
  revalidatePath(`/agents/${agent.agent_code.toLowerCase()}`);
  redirect(`/agents/${agent.agent_code.toLowerCase()}?message=RYTHM%20level%20assessment%20requested.`);
}

export default async function AgentProfile({params,searchParams}:{params:Promise<{code:string}>;searchParams:Promise<{error?:string;message?:string}>}){
  const {code}=await params;const query=await searchParams;
  const {supabase,organizationId,role}=await requireOrganizationContext();
  const {data:agent}=await supabase.from("agents").select("id, agent_code, display_name, name, role_title, purpose, department, avatar_url, presence_status, enabled, risk_ceiling, authority_level, work_style, supported_languages, identity, permissions, specification_version, agent_asset_profiles(current_level,level_score,certification_status,certification_version,certified_at,last_assessed_at,valuation_status,valuation_readiness_score,marketplace_eligible,canonical_name,identity_locked)").eq("organization_id",organizationId).ilike("agent_code",code).maybeSingle();
  if(!agent)notFound();
  const rawAsset=(agent as any).agent_asset_profiles;const asset=Array.isArray(rawAsset)?rawAsset[0]??null:rawAsset??null;
  const {count:validatedExperience}=await supabase.from("agent_experience_events").select("id",{count:"exact",head:true}).eq("agent_id",agent.id).eq("counts_toward_experience",true).not("validated_at","is",null);
  const {count:benchmarkEvidence}=await supabase.from("agent_experience_events").select("id",{count:"exact",head:true}).eq("agent_id",agent.id).in("event_type",["benchmark","holdout","adversarial"]);
  const {data:pendingRequest}=await supabase.from("agent_certification_requests").select("id,status,requested_at").eq("agent_id",agent.id).in("status",["pending","in_review"]).order("requested_at",{ascending:false}).limit(1).maybeSingle();
  const owner=role==="owner";
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">DIGITAL EMPLOYEE PROFILE</p><h1>{agent.display_name??agent.name}</h1><p className="subtitle">{agent.role_title}</p><div className={styles.levelRow}><span className={styles.levelBadge}>{titleCase(asset?.current_level)}</span>{asset?.level_score!=null?<span className={styles.scoreBadge}>{asset.level_score}/100 in level</span>:null}{asset?.certification_status==="verified"?<span className={styles.verifiedBadge}>RYTHM Verified</span>:<span className={styles.unverifiedBadge}>{titleCase(asset?.certification_status)}</span>}</div></div><Link className="secondary-button" href="/agents">Agent organization</Link></header>
    {query.error?<p className="form-error">{query.error}</p>:null}{query.message?<p className="form-success">{query.message}</p>:null}
    <section className={styles.profileGrid}>
      <article className={`panel ${styles.profileCard}`}><div className={styles.profilePortrait}><AgentPortrait agentCode={agent.agent_code} avatarUrl={agent.avatar_url} alt={agent.display_name??agent.name}/></div><div className={styles.profileBody}><p className="label">{agent.department}</p><h2>{agent.display_name??agent.name}</h2><p style={{color:"#596579",fontWeight:700}}>{agent.role_title}</p><div className="compact-list"><div><strong>AI identity</strong><span>{asset?.canonical_name??agent.display_name??agent.name}</span></div><div><strong>Status</strong><span>{agent.presence_status}</span></div><div><strong>Agent code</strong><span>{agent.agent_code}</span></div><div><strong>Specification</strong><span>v{agent.specification_version}</span></div><div><strong>Languages</strong><span>{(agent.supported_languages??[]).join(" · ")}</span></div></div></div></article>
      <div className={styles.profileDetails}>
        <article className="panel"><p className="label">Professional standing</p><h2>{titleCase(asset?.current_level)} · {asset?.level_score!=null?`${asset.level_score}/100`:"not scored"}</h2><p style={{color:"#596579",lineHeight:1.7}}>Level and score are separate. The score measures performance within the currently certified level. Promotion requires additional independent evaluations and validated experience.</p><div className="compact-list"><div><strong>Certification</strong><span>{titleCase(asset?.certification_status)}</span></div><div><strong>Evaluation evidence</strong><span>{benchmarkEvidence??0} recorded</span></div><div><strong>Validated experience</strong><span>{validatedExperience??0} events</span></div><div><strong>Valuation readiness</strong><span>{asset?.valuation_readiness_score??0}/100 · {String(asset?.valuation_status??"not_ready").replace("_"," ")}</span></div><div><strong>Marketplace</strong><span>{asset?.marketplace_eligible?"Eligible":"Not yet eligible"}</span></div></div>{owner?<div style={{marginTop:16}}>{pendingRequest?<p className="security-note">RYTHM level assessment: {pendingRequest.status.replace("_"," ")}.</p>:<form action={requestLevelAssessment}><input type="hidden" name="agentId" value={agent.id}/><button type="submit" className="secondary-button">Request RYTHM level assessment</button><p className="security-note" style={{marginTop:10}}>You can request assessment; the final certified level is evidence-based and cannot be self-assigned.</p></form>}</div>:null}</article>
        <article className="panel"><p className="label">Role charter</p><h2>Mandate and operating style</h2><p style={{color:"#596579",lineHeight:1.75}}>{agent.purpose}</p><p style={{color:"#596579",lineHeight:1.75}}>{agent.work_style}</p></article>
        <article className="panel"><p className="label">Governance</p><div className="compact-list"><div><strong>Authority level</strong><span>{agent.authority_level}</span></div><div><strong>Risk ceiling</strong><span>{agent.risk_ceiling}</span></div><div><strong>Runtime state</strong><span>{agent.enabled?"Enabled":"Paused"}</span></div><div><strong>External actions</strong><span>Disabled</span></div></div>{owner&&agent.agent_code!=="T-001"?<form action={setAgentRuntime} style={{marginTop:16}}><input type="hidden" name="agentId" value={agent.id}/><input type="hidden" name="enabled" value={agent.enabled?"false":"true"}/><button type="submit" className={agent.enabled?"secondary-button":undefined}>{agent.enabled?"Pause agent runtime":"Enable agent runtime"}</button><p className="security-note" style={{marginTop:10}}>Human CEO / Owner control. Professional level never expands runtime authority.</p></form>:<p className="security-note">T-001 execution remains governed separately and cannot be enabled from this profile.</p>}</article>
        <article className="panel"><p className="label">Future asset model</p><h2>Identity, experience and valuation</h2><p style={{color:"#596579",lineHeight:1.75}}>This Agent now has a persistent identity and an append-only level/experience foundation. Future marketplace valuation will use certified level first, then score within that level, validated experience, reliability, governance and demand. Tenant-private memory is not part of the transferable asset.</p></article>
      </div>
    </section>
  </main>;
}
