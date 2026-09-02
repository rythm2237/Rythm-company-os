import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOrganizationContext, requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { AgentPortrait } from "@/app/components/agent-portrait";
import {
  asOperationalReadiness,
  operationalReadinessLabel,
} from "@/lib/agents/operational-readiness";
import styles from "../agents.module.css";

export const dynamic="force-dynamic";

function titleCase(value?:string|null){return value?value.charAt(0).toUpperCase()+value.slice(1):"Unclassified";}
function formatDate(value?:string|null){if(!value)return "Not scheduled";const date=new Date(value);return Number.isNaN(date.getTime())?"Unknown":date.toLocaleDateString("en-GB",{year:"numeric",month:"short",day:"numeric"});}

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

async function approvePositionContract(formData:FormData){
  "use server";
  const {supabase,organizationId}=await requireOwnerOrganizationContext();
  const agentId=String(formData.get("agentId")??"");
  const agentCode=String(formData.get("agentCode")??"").toLowerCase();
  const {data:agent}=await supabase.from("agents").select("id").eq("id",agentId).eq("organization_id",organizationId).maybeSingle();
  if(!agent)redirect("/agents?error=Agent%20not%20found.");
  const {error}=await supabase.rpc("approve_agent_position_contract_v1",{target_agent_id:agentId});
  if(error)redirect(`/agents/${agentCode}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/agents");revalidatePath(`/agents/${agentCode}`);
  redirect(`/agents/${agentCode}?message=Position%20contract%20approved.%20Operational%20readiness%20still%20requires%20verified%20work.`);
}

async function promoteAutonomy(formData:FormData){
  "use server";
  const {supabase,organizationId}=await requireOwnerOrganizationContext();
  const agentId=String(formData.get("agentId")??"");const agentCode=String(formData.get("agentCode")??"").toLowerCase();
  const targetLevel=Number(formData.get("targetLevel")??0);const reviewReason=String(formData.get("reviewReason")??"").trim();
  const {data:agent}=await supabase.from("agents").select("id").eq("id",agentId).eq("organization_id",organizationId).maybeSingle();
  if(!agent)redirect("/agents?error=Agent%20not%20found.");
  const {error}=await supabase.rpc("promote_agent_autonomy_v1",{target_agent_id:agentId,target_level:targetLevel,target_review_reason:reviewReason});
  if(error)redirect(`/agents/${agentCode}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/agents");revalidatePath(`/agents/${agentCode}`);
  redirect(`/agents/${agentCode}?message=${encodeURIComponent(`Agent autonomy promoted to L${targetLevel}. External actions still require Gateway policy and human approval.`)}`);
}

export default async function AgentProfile({params,searchParams}:{params:Promise<{code:string}>;searchParams:Promise<{error?:string;message?:string}>}){
  const {code}=await params;const query=await searchParams;
  const {supabase,organizationId,role}=await requireOrganizationContext();
  const {data:agent}=await supabase.from("agents").select("id, agent_code, display_name, name, role_title, purpose, department, avatar_url, presence_status, enabled, risk_ceiling, authority_level, work_style, supported_languages, identity, permissions, specification_version, external_actions_allowed, agent_asset_profiles(current_level,level_score,certification_status,certification_version,certified_at,last_assessed_at,valuation_status,valuation_readiness_score,marketplace_eligible,canonical_name,identity_locked)").eq("organization_id",organizationId).ilike("agent_code",code).maybeSingle();
  if(!agent)notFound();
  const rawAsset=(agent as any).agent_asset_profiles;const asset=Array.isArray(rawAsset)?rawAsset[0]??null:rawAsset??null;
  const {data:foundationBinding}=await supabase.from("agent_role_foundation_bindings").select("role_foundation_id,foundation_version").eq("organization_id",organizationId).eq("agent_id",agent.id).eq("status","active").limit(1).maybeSingle();
  const {data:foundation}=foundationBinding?await supabase.from("role_foundations").select("id,title,summary,role_family,canonical_role,version,source_ids,freshness_class,last_verified_at,next_review_at").eq("id",foundationBinding.role_foundation_id).maybeSingle():{data:null};
  const sourceIds=(foundation?.source_ids??[]) as string[];
  const {data:knowledgeSources}=sourceIds.length?await supabase.from("knowledge_source_registry").select("id,source_name,publisher,base_domain,canonical_url,source_type,authority_level,freshness_class,jurisdiction,last_verified_at,next_review_at").in("id",sourceIds).eq("enabled",true).order("authority_level"):{data:[] as any[]};
  const {count:validatedExperience}=await supabase.from("agent_experience_events").select("id",{count:"exact",head:true}).eq("agent_id",agent.id).eq("counts_toward_experience",true).not("validated_at","is",null);
  const {count:benchmarkEvidence}=await supabase.from("agent_experience_events").select("id",{count:"exact",head:true}).eq("agent_id",agent.id).in("event_type",["benchmark","holdout","adversarial"]);
  const {data:pendingRequest}=await supabase.from("agent_certification_requests").select("id,status,requested_at").eq("agent_id",agent.id).in("status",["pending","in_review"]).order("requested_at",{ascending:false}).limit(1).maybeSingle();
  const [{data:readinessRaw,error:readinessError},{data:positionContract},{data:workAssignments}]=await Promise.all([
    supabase.rpc("agent_operational_readiness_v1",{target_agent_id:agent.id}),
    supabase.from("agent_position_contracts").select("id,contract_version,position_title,mission,responsibilities,task_boundaries,success_metrics,escalation_triggers,required_capabilities,status,approved_at").eq("agent_id",agent.id).order("contract_version",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("agent_work_assignments").select("id,title,status,outcome_status,verification_status,quality_score,created_at,completed_at").eq("agent_id",agent.id).order("created_at",{ascending:false}).limit(5),
  ]);
  const readiness=asOperationalReadiness(readinessRaw,agent.id);
  const owner=role==="owner";
  const nextAutonomyLevel=readiness.autonomy_level+1;
  const canPromoteAutonomy=owner&&readiness.autonomy_status!=="locked"&&nextAutonomyLevel<=4&&(
    (nextAutonomyLevel===2&&["ready_with_supervision","ready_limited","ready_independent"].includes(readiness.readiness_state))||
    (nextAutonomyLevel===3&&["ready_limited","ready_independent"].includes(readiness.readiness_state))||
    (nextAutonomyLevel===4&&readiness.readiness_state==="ready_independent")
  );
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">DIGITAL EMPLOYEE PROFILE</p><h1>{agent.display_name??agent.name}</h1><p className="subtitle">{agent.role_title}</p><div className={styles.levelRow}><span className={styles.levelBadge}>{titleCase(asset?.current_level)}</span>{asset?.level_score!=null?<span className={styles.scoreBadge}>{asset.level_score}/100 in level</span>:null}{asset?.certification_status==="verified"?<span className={styles.verifiedBadge}>RYTHM Verified</span>:<span className={styles.unverifiedBadge}>{titleCase(asset?.certification_status)}</span>}</div></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href={`/agents/${agent.agent_code.toLowerCase()}/assessment`}>Professional assessment</Link><Link className="secondary-button" href="/agents">Agent organization</Link></div></header>
    {query.error?<p className="form-error">{query.error}</p>:null}{query.message?<p className="form-success">{query.message}</p>:null}
    <section className={styles.profileGrid}>
      <article className={`panel ${styles.profileCard}`}><div className={styles.profilePortrait}><AgentPortrait agentCode={agent.agent_code} avatarUrl={agent.avatar_url} alt={agent.display_name??agent.name}/></div><div className={styles.profileBody}><p className="label">{agent.department}</p><h2>{agent.display_name??agent.name}</h2><p style={{color:"#596579",fontWeight:700}}>{agent.role_title}</p><div className="compact-list"><div><strong>AI identity</strong><span>{asset?.canonical_name??agent.display_name??agent.name}</span></div><div><strong>Status</strong><span>{agent.presence_status}</span></div><div><strong>Agent code</strong><span>{agent.agent_code}</span></div><div><strong>Specification</strong><span>v{agent.specification_version}</span></div><div><strong>Languages</strong><span>{(agent.supported_languages??[]).join(" · ")}</span></div></div></div></article>
      <div className={styles.profileDetails}>
        <article className="panel"><p className="label">Professional standing</p><h2>{titleCase(asset?.current_level)} · {asset?.level_score!=null?`${asset.level_score}/100`:"not scored"}</h2><p style={{color:"#596579",lineHeight:1.7}}>Level and score are separate. The score measures performance within the currently certified level. Promotion requires additional independent evaluations and validated experience.</p><div className="compact-list"><div><strong>Certification</strong><span>{titleCase(asset?.certification_status)}</span></div><div><strong>Evaluation evidence</strong><span>{benchmarkEvidence??0} recorded</span></div><div><strong>Validated experience</strong><span>{validatedExperience??0} events</span></div><div><strong>Valuation readiness</strong><span>{asset?.valuation_readiness_score??0}/100 · {String(asset?.valuation_status??"not_ready").replace("_"," ")}</span></div><div><strong>Marketplace</strong><span>{asset?.marketplace_eligible?"Eligible":"Not yet eligible"}</span></div></div>{owner?<div style={{marginTop:16}}>{pendingRequest?<p className="security-note">RYTHM level assessment: {pendingRequest.status.replace("_"," ")}.</p>:<form action={requestLevelAssessment}><input type="hidden" name="agentId" value={agent.id}/><button type="submit" className="secondary-button">Request RYTHM level assessment</button><p className="security-note" style={{marginTop:10}}>You can request assessment; the final certified level is evidence-based and cannot be self-assigned.</p></form>}</div>:null}</article>
        <article className="panel"><p className="label">Operational position readiness</p><h2>{operationalReadinessLabel(readiness.readiness_state)} · {readiness.readiness_score}/100</h2>{readinessError?<p className="form-error">Apply the operational-readiness migration to enable this evidence model.</p>:<><p style={{color:"#596579",lineHeight:1.7}}>Professional knowledge and benchmarks do not prove that this Agent can own a position. This score uses governed execution and independently verified work outcomes.</p><div className="compact-list"><div><strong>Position contract</strong><span>{positionContract?.status??"missing"} · v{positionContract?.contract_version??"—"}</span></div><div><strong>Autonomy</strong><span>L{readiness.autonomy_level} · {readiness.autonomy_status}</span></div><div><strong>Verified work</strong><span>{readiness.successful_work_count} successful / {readiness.verified_work_count} reviewed</span></div><div><strong>Operational executions</strong><span>{readiness.agent_run_success_count+readiness.agent_tool_success_count+readiness.ai_task_execution_success_count} successful</span></div><div><strong>Agent-initiated tool use</strong><span>{readiness.agent_tool_success_count} successful · {readiness.agent_tool_failure_count} failed</span></div><div><strong>Verified external actions</strong><span>{readiness.verified_external_action_count}</span></div><div><strong>Governance violations</strong><span>{readiness.governance_violation_count}</span></div></div>{readiness.blockers.length?<div style={{marginTop:14}}>{readiness.blockers.map(blocker=><p key={blocker.code} className="security-note"><strong>{blocker.code}</strong> — {blocker.message}</p>)}</div>:null}{owner&&positionContract?.status==="draft"?<form action={approvePositionContract} style={{marginTop:16}}><input type="hidden" name="agentId" value={agent.id}/><input type="hidden" name="agentCode" value={agent.agent_code}/><button type="submit" className="secondary-button">Approve position contract</button><p className="security-note" style={{marginTop:10}}>Approval confirms the role boundary only. It does not mark the Agent ready or increase autonomy.</p></form>:null}{canPromoteAutonomy?<form action={promoteAutonomy} className="auth-form" style={{marginTop:16}}><input type="hidden" name="agentId" value={agent.id}/><input type="hidden" name="agentCode" value={agent.agent_code}/><input type="hidden" name="targetLevel" value={nextAutonomyLevel}/><label>Autonomy review reason<input name="reviewReason" minLength={10} required placeholder="Evidence supporting the next autonomy level"/></label><button type="submit" className="secondary-button">Promote to L{nextAutonomyLevel}</button><p className="security-note" style={{marginTop:10}}>Promotion is evidence-gated and incremental. External actions continue to require Gateway policy and human approval.</p></form>:null}</>}</article>
        <article className="panel"><p className="label">Recent governed work</p><h2>Position evidence ledger</h2>{(workAssignments??[]).length?<div className="compact-list">{(workAssignments??[]).map((assignment:any)=><div key={assignment.id}><strong>{assignment.title}</strong><span>{assignment.status} · {assignment.verification_status}{assignment.quality_score!=null?` · ${assignment.quality_score}/100`:""}</span></div>)}</div>:<p className="security-note">No governed work assignment has been recorded. Use “Give task” after the position contract is approved.</p>}</article>
        <article className="panel"><p className="label">Professional knowledge provenance</p><h2>{foundation?.title??"No professional foundation bound"}</h2>{foundation?<><p style={{color:"#596579",lineHeight:1.7}}>{foundation.summary}</p><div className="compact-list"><div><strong>Canonical role</strong><span>{foundation.canonical_role??foundation.role_family}</span></div><div><strong>Foundation version</strong><span>v{foundation.version}</span></div><div><strong>Verified</strong><span>{formatDate(foundation.last_verified_at)}</span></div><div><strong>Next source review</strong><span>{formatDate(foundation.next_review_at)}</span></div><div><strong>Knowledge sources</strong><span>{knowledgeSources?.length??0} verified references</span></div></div><div style={{display:"grid",gap:10,marginTop:16}}>{(knowledgeSources??[]).map((source:any)=><div key={source.id} style={{border:"1px solid #e1e6ef",borderRadius:14,padding:"12px 14px",display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}><div><strong style={{display:"block"}}>{source.source_name}</strong><span style={{color:"#69758a",fontSize:13}}>{source.publisher} · {source.base_domain} · {source.authority_level} authority{source.jurisdiction?` · ${source.jurisdiction}`:""}</span></div><a className="secondary-button" href={source.canonical_url} target="_blank" rel="noreferrer">View source</a></div>)}</div><p className="security-note" style={{marginTop:14}}>Source-backed professional knowledge is platform-managed and separate from Company Knowledge, Direct Agent Knowledge and model-general knowledge.</p></>:<p className="security-note">This Agent has no active professional foundation binding yet.</p>}</article>
        <article className="panel"><p className="label">Role charter</p><h2>Mandate and operating style</h2><p style={{color:"#596579",lineHeight:1.75}}>{agent.purpose}</p><p style={{color:"#596579",lineHeight:1.75}}>{agent.work_style}</p></article>
        <article className="panel"><p className="label">Governance</p><div className="compact-list"><div><strong>Authority level</strong><span>{agent.authority_level}</span></div><div><strong>Risk ceiling</strong><span>{agent.risk_ceiling}</span></div><div><strong>Runtime state</strong><span>{agent.enabled?"Enabled":"Paused"}</span></div><div><strong>External actions</strong><span>{agent.external_actions_allowed?"Eligible only through Gateway policy":"Disabled"}</span></div></div>{owner&&agent.agent_code!=="T-001"?<form action={setAgentRuntime} style={{marginTop:16}}><input type="hidden" name="agentId" value={agent.id}/><input type="hidden" name="enabled" value={agent.enabled?"false":"true"}/><button type="submit" className={agent.enabled?"secondary-button":undefined}>{agent.enabled?"Pause agent runtime":"Enable agent runtime"}</button><p className="security-note" style={{marginTop:10}}>Human CEO / Owner control. Professional level never expands runtime authority.</p></form>:<p className="security-note">T-001 execution remains governed separately and cannot be enabled from this profile.</p>}</article>
        <article className="panel"><p className="label">Future asset model</p><h2>Identity, experience and valuation</h2><p style={{color:"#596579",lineHeight:1.75}}>This Agent now has a persistent identity and an append-only level/experience foundation. Future marketplace valuation will use certified level first, then score within that level, validated experience, reliability, governance and demand. Tenant-private memory is not part of the transferable asset.</p></article>
      </div>
    </section>
  </main>;
}
