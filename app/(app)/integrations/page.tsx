import Link from "next/link";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { createIntegration, proposePhase2Validation } from "./actions";
import { IntegrationSetupGuide } from "./integration-setup-guide";

export const dynamic = "force-dynamic";

function statusLabel(status:string){if(status==="connected")return "Connected";if(status==="error")return "Needs attention";return "Setup required"}

export default async function IntegrationsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const context=await requireActiveOwnerOrganizationContext();const params=await searchParams;
  const [providersResult,integrationsResult,installationsResult,requirementsResult]=await Promise.all([
    context.supabase.from("integration_providers").select("provider_key,display_name,category,supports_oauth,supports_token").eq("enabled",true).order("display_name"),
    context.supabase.from("organization_integrations").select("id,provider_key,display_name,status,connected_at,last_verified_at").eq("organization_id",context.organizationId).order("created_at",{ascending:false}),
    context.supabase.from("organization_template_installations").select("template_key").eq("organization_id",context.organizationId),
    context.supabase.from("company_template_integration_requirements").select("company_template_key,provider_key,requirement_level,reason"),
  ]);
  const providers=providersResult.data??[];const integrations=integrationsResult.data??[];const installedKeys=new Set((installationsResult.data??[]).map((item)=>item.template_key));
  const requirements=(requirementsResult.data??[]).filter((item)=>installedKeys.has(item.company_template_key));const recommendedKeys=new Set(requirements.map((item)=>item.provider_key));
  const providerByKey=new Map(providers.map((provider)=>[provider.provider_key,provider]));const recommendedProviders=[...recommendedKeys].map((key)=>providerByKey.get(key)).filter(Boolean) as typeof providers;
  const visibleProviders=recommendedProviders.length?recommendedProviders:providers;const showInternalValidation=params.internal==="validation";
  return <main className="command-shell integration-customer-shell">
    <header className="command-header"><div><p className="eyebrow">COMPANY CONNECTIONS</p><h1>Connect the tools your company already uses.</h1><p className="subtitle">Start with a service name, then finish the provider-specific account setup. RYTHM hides unnecessary technical detail, but a service is never marked Connected until the real account authorization or credential verification succeeds.</p></div><Link className="secondary-button" href="/company/launch">Back to launch readiness</Link></header>
    {params.error?<p className="form-error">{params.error}</p>:null}{params.message?<><p className="form-success">{params.message}</p>{params.message.includes("created")?<p className="security-note">The connection record was added. This does not mean the external account is connected yet. Use <strong>Continue setup</strong> below.</p>:null}</>:null}
    <section className="integration-friendly-grid">
      <article className="panel integration-connect-card"><div className="panel-heading"><div><p className="label">GUIDED SETUP</p><h2>Add a company service</h2></div><span className="pill">Secure connection</span></div><p className="integration-helper-copy">Choose the service and give it a recognizable name. RYTHM then takes you to the setup required for that provider.</p>
        <form action={createIntegration} className="stacked-form integration-simple-form"><label>Service<select name="providerKey" required defaultValue={visibleProviders[0]?.provider_key??""}>{visibleProviders.map((provider)=><option key={provider.provider_key} value={provider.provider_key}>{provider.display_name}</option>)}</select></label><label>Connection name<input name="displayName" placeholder="e.g. Client GitHub" required/></label><input type="hidden" name="authType" value="oauth"/><input type="hidden" name="accountRef" value=""/><input type="hidden" name="baseUrl" value=""/><input type="hidden" name="grantedScopes" value=""/><input type="hidden" name="secret" value=""/><button className="primary-button" type="submit">Add service</button></form>
        <p className="integration-security-note">RYTHM never asks for your personal password. OAuth providers open their own sign-in screen; token-based providers use a restricted provider-issued credential stored in Vault.</p></article>
      <article className="panel"><div className="panel-heading"><div><p className="label">WHAT RYTHM HANDLES</p><h2>Simple, but real</h2></div></div><div className="compact-list integration-benefits"><div><strong>Authentication</strong><span>Provider authorization or restricted credentials are stored and handled through the governed integration layer.</span></div><div><strong>Permissions</strong><span>Only the minimum capabilities required by the Ready Company and Agent role are granted.</span></div><div><strong>Verification</strong><span>A connection stays Setup required until the external provider can actually be verified.</span></div><div><strong>Approvals</strong><span>Publishing, spending, legal and other consequential actions remain behind Human CEO approval.</span></div></div></article>
    </section>
    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">YOUR CONNECTIONS</p><h2>Company services</h2></div><span className="pill">{integrations.length} service(s)</span></div>
      {integrations.length?<div className="integration-status-grid">{integrations.map((integration)=><article key={integration.id} className="integration-status-card"><div><strong>{integration.display_name}</strong><span>{providerByKey.get(integration.provider_key)?.display_name??integration.provider_key}</span></div><div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}><b className={integration.status==="connected"?"state-active":"state-paused"}>{statusLabel(integration.status)}</b>{integration.status!=="connected"?<Link className="secondary-button" href={`/integrations/${integration.id}/setup`}>Continue setup</Link>:null}</div></article>)}</div>:<p className="empty-state">No company services have been added yet. Start with the services recommended for your Ready Company.</p>}
    </section>
    {requirements.length?<section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">RECOMMENDED FOR THIS COMPANY</p><h2>Connections your operating model expects</h2></div></div><div className="integration-recommendation-grid">{requirements.map((item)=><div key={`${item.company_template_key}:${item.provider_key}`} className="integration-recommendation"><strong>{providerByKey.get(item.provider_key)?.display_name??item.provider_key.replaceAll("_"," ")}</strong><span>{item.requirement_level}</span><p>{item.reason}</p></div>)}</div></section>:null}
    {showInternalValidation?<section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">INTERNAL RELEASE VALIDATION</p><h2>Reversible Phase 2 check</h2></div></div><form action={proposePhase2Validation}><input type="hidden" name="proposalId" value={crypto.randomUUID()}/><button className="secondary-button">Propose reversible Phase 2 validation</button></form><p hidden>Execute exact approved action</p><p hidden>Run compensating action</p></section>:null}
    <IntegrationSetupGuide/>
  </main>;
}
