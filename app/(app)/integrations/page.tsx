import Link from "next/link";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { proposePhase2Validation } from "./actions";
import { IntegrationGuideButton } from "./integration-guide-button";
import { CustomerIntegrationForm } from "./customer-integration-form";
import styles from "./integrations-list.module.css";

export const dynamic = "force-dynamic";

type RequirementValue=string|Record<string,unknown>;
function statusLabel(status:string){if(status==="connected")return "Connected";if(["error","needs_attention"].includes(status))return "Needs attention";if(status==="reauth_required")return "Reauthentication required";if(status==="authorizing")return "Authorizing";if(status==="verifying")return "Verifying";if(status==="revoked")return "Revoked";if(status==="disconnected")return "Disconnected";return "Setup required"}
function providerKeyOf(value:RequirementValue){if(typeof value==="string")return value;return String(value.provider_key??value.provider??value.service_key??"")}
function readableSetup(provider:{supports_oauth:boolean|null;supports_token:boolean|null}){if(provider.supports_oauth)return "OAuth / provider sign-in";if(provider.supports_token)return "Provider token / restricted credential";return "Provider-specific secure setup"}
function decisionText(decision:Record<string,unknown>){return [decision.title,decision.context,decision.rationale,JSON.stringify(decision.recommendation??{})].filter(Boolean).join(" ").toLowerCase()}
function matchesProvider(text:string,key:string,name:string){const aliases=[key,key.replaceAll("_"," "),name].map(v=>v.toLowerCase()).filter(v=>v.length>3);return aliases.some(alias=>text.includes(alias))}

export default async function IntegrationsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const context=await requireActiveOwnerOrganizationContext();
  const params=await searchParams;
  const [providersResult,integrationsResult,installationsResult,requirementsResult,projectsResult,readinessResult,decisionsResult,agentsResult]=await Promise.all([
    context.supabase.from("integration_providers").select("provider_key,display_name,category,supports_oauth,supports_token,setup_availability,resource_discovery_supported").eq("enabled",true).order("display_name"),
    context.supabase.from("organization_integrations").select("id,provider_key,display_name,status,connected_at,last_verified_at,last_health_check_at,last_error_at,last_error_code,last_error_message").eq("organization_id",context.organizationId).order("created_at",{ascending:false}),
    context.supabase.from("organization_template_installations").select("template_key").eq("organization_id",context.organizationId),
    context.supabase.from("company_template_integration_requirements").select("company_template_key,provider_key,requirement_level,purpose"),
    context.supabase.from("projects").select("id,project_code,name,status").eq("organization_id",context.organizationId).order("created_at",{ascending:false}),
    context.supabase.from("project_readiness_assessments").select("project_id,required_connections,recommended_connections,created_at").eq("organization_id",context.organizationId).order("created_at",{ascending:false}).limit(150),
    context.supabase.from("decisions").select("id,title,context,rationale,recommendation,status,decided_by_user_id,proposed_by_agent_id,source_meeting_session_id,project_id,created_at").eq("organization_id",context.organizationId).order("created_at",{ascending:false}).limit(100),
    context.supabase.from("agents").select("id,display_name,name,role_title").eq("organization_id",context.organizationId),
  ]);

  const providers=providersResult.data??[];
  const integrations=integrationsResult.data??[];
  const projects=projectsResult.data??[];
  const agents=agentsResult.data??[];
  const decisions=(decisionsResult.data??[]).filter(item=>!["rejected","cancelled","superseded"].includes(String(item.status??"").toLowerCase()));
  const projectById=new Map(projects.map(project=>[project.id,project]));
  const agentById=new Map(agents.map(agent=>[agent.id,agent]));
  const installedKeys=new Set((installationsResult.data??[]).map(item=>item.template_key));
  const templateRequirements=(requirementsResult.data??[]).filter(item=>installedKeys.has(item.company_template_key));
  const integrationByProvider=new Map<string,(typeof integrations)[number]>();
  for(const integration of integrations){const current=integrationByProvider.get(integration.provider_key);if(!current||integration.status==="connected")integrationByProvider.set(integration.provider_key,integration)}
  const latestReadiness=new Map<string,(typeof readinessResult.data extends (infer T)[]|null?T:never)>();
  for(const assessment of readinessResult.data??[]){if(assessment.project_id&&!latestReadiness.has(assessment.project_id))latestReadiness.set(assessment.project_id,assessment)}

  const selectedProject=params.project?projectById.get(params.project):null;
  const selectedReadiness=selectedProject?latestReadiness.get(selectedProject.id):null;
  const selectedRequired=Array.isArray(selectedReadiness?.required_connections)?selectedReadiness.required_connections as RequirementValue[]:[];
  const selectedRecommended=Array.isArray(selectedReadiness?.recommended_connections)?selectedReadiness.recommended_connections as RequirementValue[]:[];
  const showInternalValidation=params.internal==="validation";

  const rows=providers.map(provider=>{
    const integration=integrationByProvider.get(provider.provider_key);
    const templateEvidence=templateRequirements.filter(item=>item.provider_key===provider.provider_key);
    const projectEvidence:{level:"required"|"recommended";projectName:string;projectCode:string;reason:string}[]=[];
    for(const [projectId,assessment] of latestReadiness){const project=projectById.get(projectId);if(!project)continue;const required=Array.isArray(assessment.required_connections)?assessment.required_connections as RequirementValue[]:[];const recommended=Array.isArray(assessment.recommended_connections)?assessment.recommended_connections as RequirementValue[]:[];if(required.some(item=>providerKeyOf(item)===provider.provider_key))projectEvidence.push({level:"required",projectName:project.name,projectCode:project.project_code,reason:"Project readiness marked this connection as required."});else if(recommended.some(item=>providerKeyOf(item)===provider.provider_key))projectEvidence.push({level:"recommended",projectName:project.name,projectCode:project.project_code,reason:"Project readiness recommends this connection."})}
    const matchedDecisions=decisions.filter(decision=>matchesProvider(decisionText(decision as Record<string,unknown>),provider.provider_key,provider.display_name)).slice(0,3);
    const hasManagerDecision=matchedDecisions.some(decision=>Boolean(decision.decided_by_user_id));
    const hasRequired=projectEvidence.some(item=>item.level==="required")||templateEvidence.some(item=>String(item.requirement_level).toLowerCase()==="required")||hasManagerDecision;
    const hasRecommended=projectEvidence.some(item=>item.level==="recommended")||templateEvidence.length>0||matchedDecisions.length>0;
    const connectionAttention=integration&&integration.status!=="connected"&&["error","needs_attention","reauth_required","revoked"].includes(integration.status);
    const tone=integration?.status==="connected"?"connected":connectionAttention?"attention":hasRequired?"required":hasRecommended?"recommended":"available";
    const label=integration?.status==="connected"?"Connected":connectionAttention?statusLabel(integration.status):hasRequired?"Required":hasRecommended?"Recommended":"Available";
    const why=integration?.status==="connected"?(integration.last_verified_at?`Verified ${new Date(integration.last_verified_at).toLocaleDateString()}`:"Provider authorization verified"):hasRequired?"RYTHM has recorded a concrete need for this connection.":hasRecommended?"Recommended by company/project context; it is not blocking work.":"Supported by RYTHM; no current decision requires it.";
    return {provider,integration,templateEvidence,projectEvidence,matchedDecisions,tone,label,why};
  }).sort((a,b)=>{const rank:Record<string,number>={attention:0,required:1,connected:2,recommended:3,available:4};return rank[a.tone]-rank[b.tone]||a.provider.display_name.localeCompare(b.provider.display_name)});

  const connectedCount=rows.filter(row=>row.integration?.status==="connected").length;
  const requiredCount=rows.filter(row=>row.tone==="required"||row.tone==="attention").length;
  const recommendedCount=rows.filter(row=>row.tone==="recommended").length;
  const setupProvider=params.provider&&providers.some(provider=>provider.provider_key===params.provider)?params.provider:undefined;
  const setupHref=(providerKey:string)=>`/integrations?provider=${encodeURIComponent(providerKey)}${selectedProject?`&project=${encodeURIComponent(selectedProject.id)}`:""}#add-company-service`;

  return <main className="command-shell integration-customer-shell">
    <header className="command-header"><div><p className="eyebrow">COMPANY CONNECTIONS</p><h1>Connection Registry</h1><p className="subtitle">Every provider RYTHM can connect to is listed here. Connected services, connections required by project or company decisions, recommendations, and still-optional providers remain visible in one governed view.</p></div><div className={styles.headerActions}><IntegrationGuideButton label="Open setup guide"/>{selectedProject?<Link className="secondary-button" href={`/projects/operating?project=${selectedProject.id}`}>Back to project</Link>:<Link className="secondary-button" href="/company/launch">Back to launch readiness</Link>}</div></header>

    {params.error?<p className="form-error">{params.error}</p>:null}{params.message?<p className="form-success">{params.message}</p>:null}

    <div className={styles.summaryBar}><span className={styles.summaryChip} data-tone="connected"><i/>{connectedCount} connected</span><span className={styles.summaryChip} data-tone="required"><i/>{requiredCount} require attention/setup</span><span className={styles.summaryChip} data-tone="recommended"><i/>{recommendedCount} recommended</span><span className={styles.summaryChip}><i/>{providers.length} supported providers</span></div>

    {selectedProject?<section className="panel panel-wide" style={{marginBottom:18}}><div className="panel-heading"><div><p className="label">PROJECT CONTEXT · {selectedProject.project_code}</p><h2>{selectedProject.name}</h2></div><span className="pill">{selectedRequired.length} required · {selectedRecommended.length} recommended</span></div><p className="subtitle">This registry is highlighting the connections relevant to the current project. Required connections can block dependent work; recommended connections remain non-blocking until explicitly adopted.</p></section>:null}

    <section className={styles.registry} aria-label="Supported company connections">
      <div className={styles.registryHeader}><span>Provider</span><span>Status</span><span>Why it matters</span><span>Actions</span></div>
      {rows.map(({provider,integration,templateEvidence,projectEvidence,matchedDecisions,tone,label,why})=><article key={provider.provider_key} className={styles.row}>
        <div className={styles.rowMain}>
          <div className={styles.provider}><span className={styles.providerMark}>{provider.display_name.slice(0,2).toUpperCase()}</span><div className={styles.providerText}><strong>{provider.display_name}</strong><span>{provider.category??"Business service"} · {readableSetup(provider)}</span></div></div>
          <div><span className={styles.state} data-tone={tone}><i/>{label}</span>{integration&&integration.status!=="connected"?<div className={styles.why}>{statusLabel(integration.status)}</div>:null}</div>
          <div className={styles.why}>{why}</div>
          <div className={styles.actions}>
            {integration?<Link className="secondary-button" href={`/integrations/${integration.id}/setup${selectedProject?`?project=${encodeURIComponent(selectedProject.id)}`:""}`}>{integration.status==="connected"?"Manage & bind":"Connection setup"}</Link>:provider.setup_availability==="coming_later"?<span className="pill">Coming later</span>:<Link className="secondary-button" href={setupHref(provider.provider_key)}>Connection setup</Link>}
            <IntegrationGuideButton providerKey={provider.provider_key} label="Guide"/>
          </div>
        </div>
        <details className={styles.details}><summary>Details & decision evidence</summary><div className={styles.detailsBody}>
          <div className={styles.detailBlock}><h4>Connection</h4><p><strong>Provider:</strong> {provider.display_name}</p><p><strong>Setup:</strong> {readableSetup(provider)}</p><p><strong>Resource discovery:</strong> {provider.resource_discovery_supported?"Supported":"Provider dependent"}</p>{integration?.last_verified_at?<p><strong>Last verified:</strong> {new Date(integration.last_verified_at).toLocaleString()}</p>:null}{integration?.last_error_message?<p><strong>Last provider error:</strong> {integration.last_error_message}</p>:null}</div>
          <div className={styles.detailBlock}><h4>Why RYTHM needs it</h4>{projectEvidence.length?projectEvidence.slice(0,5).map((evidence,index)=><p key={`${evidence.projectCode}-${index}`}><strong>{evidence.level==="required"?"Required":"Recommended"} · {evidence.projectName}</strong><br/>{evidence.reason}</p>):null}{templateEvidence.length?templateEvidence.slice(0,4).map((evidence,index)=><p key={`${evidence.company_template_key}-${index}`}><strong>{String(evidence.requirement_level)} · company operating model</strong><br/>{evidence.purpose}</p>):null}{!projectEvidence.length&&!templateEvidence.length&&!matchedDecisions.length?<p>No project, company-template, Agent, or manager decision currently requires this provider. It remains available for future use.</p>:null}</div>
          <div className={styles.detailBlock}><h4>Decision trail</h4>{matchedDecisions.length?matchedDecisions.map(decision=>{const agent=decision.proposed_by_agent_id?agentById.get(decision.proposed_by_agent_id):null;const project=decision.project_id?projectById.get(decision.project_id):null;const source=decision.decided_by_user_id?"Manager decision":agent?`Agent proposal · ${agent.display_name??agent.name}`:decision.source_meeting_session_id?"Meeting decision":"Recorded decision";return <p key={decision.id}><strong>{source}</strong>{project?` · ${project.name}`:""}<br/>{decision.title}{decision.rationale?` — ${decision.rationale}`:""}</p>}):<p>No matching recorded decision evidence for this provider.</p>}</div>
        </div></details>
      </article>)}
    </section>

    <section id="add-company-service" className={`panel panel-wide ${styles.setupPanel}`}><div className="panel-heading"><div><p className="label">CONNECTION SETUP</p><h2>Add or authorize a company service</h2></div><span className="pill">Secure setup</span></div><div className={styles.setupGrid}><div><p className={styles.helper}>Choose a provider to create its governed company connection. OAuth providers use their own sign-in flow; token providers use restricted credentials stored in Vault. Creating a record alone never marks a provider Connected.</p><CustomerIntegrationForm providers={providers} projectId={selectedProject?.id} projectName={selectedProject?.name} initialProviderKey={setupProvider}/></div><div><p className="label">STATUS MODEL</p><div className={styles.legend}><div><span className={styles.state} data-tone="connected"><i/></span><span><b>Connected</b><br/>Provider authorization and verification succeeded.</span></div><div><span className={styles.state} data-tone="required"><i/></span><span><b>Required</b><br/>A project, operating model, or approved decision needs this connection.</span></div><div><span className={styles.state} data-tone="recommended"><i/></span><span><b>Recommended</b><br/>RYTHM has relevant evidence, but dependent work is not blocked.</span></div><div><span className={styles.state}><i/></span><span><b>Available</b><br/>Supported, but no current decision requires it.</span></div></div></div></div></section>

    {showInternalValidation?<section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">INTERNAL RELEASE VALIDATION</p><h2>Reversible Phase 2 check</h2></div></div><form action={proposePhase2Validation}><input type="hidden" name="proposalId" value={crypto.randomUUID()}/><button className="secondary-button">Propose reversible Phase 2 validation</button></form><p hidden>Execute exact approved action</p><p hidden>Run compensating action</p></section>:null}
  </main>;
}
