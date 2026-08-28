import Link from "next/link";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { createIntegration, proposePhase2Validation } from "./actions";
import { IntegrationSetupGuide } from "./integration-setup-guide";

export const dynamic = "force-dynamic";

function statusLabel(status:string){
  if(status==="connected") return "Connected";
  if(status==="error") return "Needs attention";
  return "Setup required";
}

export default async function IntegrationsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const context=await requireActiveOwnerOrganizationContext();
  const params=await searchParams;
  const [providersResult,integrationsResult,installationsResult,requirementsResult]=await Promise.all([
    context.supabase.from("integration_providers").select("provider_key,display_name,category,supports_oauth,supports_token").eq("enabled",true).order("display_name"),
    context.supabase.from("organization_integrations").select("id,provider_key,display_name,status,connected_at,last_verified_at").eq("organization_id",context.organizationId).order("created_at",{ascending:false}),
    context.supabase.from("organization_template_installations").select("template_key").eq("organization_id",context.organizationId),
    context.supabase.from("company_template_integration_requirements").select("company_template_key,provider_key,requirement_level,reason"),
  ]);
  const providers=providersResult.data??[];
  const integrations=integrationsResult.data??[];
  const installedKeys=new Set((installationsResult.data??[]).map((item)=>item.template_key));
  const requirements=(requirementsResult.data??[]).filter((item)=>installedKeys.has(item.company_template_key));
  const recommendedKeys=new Set(requirements.map((item)=>item.provider_key));
  const providerByKey=new Map(providers.map((provider)=>[provider.provider_key,provider]));
  const recommendedProviders=[...recommendedKeys].map((key)=>providerByKey.get(key)).filter(Boolean) as typeof providers;
  const visibleProviders=recommendedProviders.length?recommendedProviders:providers;
  const showInternalValidation=params.internal==="validation";

  return <main className="command-shell integration-customer-shell">
    <header className="command-header">
      <div><p className="eyebrow">COMPANY CONNECTIONS</p><h1>Connect the tools your company already uses.</h1><p className="subtitle">Choose a service and RYTHM guides you through the secure connection. API keys, scopes, base URLs and other technical configuration stay out of the normal customer experience.</p></div>
      <Link className="secondary-button" href="/company/launch">Back to launch readiness</Link>
    </header>
    {params.error?<p className="form-error">{params.error}</p>:null}
    {params.message?<p className="form-success">{params.message}</p>:null}

    <section className="integration-friendly-grid">
      <article className="panel integration-connect-card">
        <div className="panel-heading"><div><p className="label">GUIDED SETUP</p><h2>Add a company service</h2></div><span className="pill">Secure connection</span></div>
        <p className="integration-helper-copy">Select the service you want to connect. RYTHM keeps credentials and technical permissions behind the scenes and only asks you for information a normal account owner would recognize.</p>
        <form action={createIntegration} className="stacked-form integration-simple-form">
          <label>Service
            <select name="providerKey" required defaultValue={visibleProviders[0]?.provider_key??""}>
              {visibleProviders.map((provider)=><option key={provider.provider_key} value={provider.provider_key}>{provider.display_name}</option>)}
            </select>
          </label>
          <label>Connection name
            <input name="displayName" placeholder="e.g. Company Google account" required/>
          </label>
          <input type="hidden" name="authType" value="oauth"/>
          <input type="hidden" name="accountRef" value=""/>
          <input type="hidden" name="baseUrl" value=""/>
          <input type="hidden" name="grantedScopes" value=""/>
          <input type="hidden" name="secret" value=""/>
          <button className="primary-button" type="submit">Start secure setup</button>
        </form>
        <p className="integration-security-note">RYTHM never asks for your personal password. When a provider supports account authorization, you sign in on that provider&apos;s own secure page. Providers that are not yet production-authorized remain unavailable for execution until their connector is verified.</p>
      </article>

      <article className="panel">
        <div className="panel-heading"><div><p className="label">WHAT RYTHM HANDLES</p><h2>No technical setup required</h2></div></div>
        <div className="compact-list integration-benefits">
          <div><strong>Authentication</strong><span>OAuth, service credentials and token storage are handled through the governed integration layer.</span></div>
          <div><strong>Permissions</strong><span>RYTHM applies least-privilege permissions based on the company template and Agent responsibilities.</span></div>
          <div><strong>Approvals</strong><span>Publishing, spending, legal and other consequential actions remain behind Human CEO approval.</span></div>
          <div><strong>Safety</strong><span>Credentials stay in Vault and are never placed in Agent prompts or ordinary company records.</span></div>
        </div>
      </article>
    </section>

    <section className="panel panel-wide" style={{marginTop:18}}>
      <div className="panel-heading"><div><p className="label">YOUR CONNECTIONS</p><h2>Connected company services</h2></div><span className="pill">{integrations.length} service(s)</span></div>
      {integrations.length?<div className="integration-status-grid">{integrations.map((integration)=><article key={integration.id} className="integration-status-card"><div><strong>{integration.display_name}</strong><span>{providerByKey.get(integration.provider_key)?.display_name??integration.provider_key}</span></div><b className={integration.status==="connected"?"state-active":"state-paused"}>{statusLabel(integration.status)}</b></article>)}</div>:<p className="empty-state">No company services have been added yet. Start with the services recommended for your Ready Company.</p>}
    </section>

    {requirements.length?<section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">RECOMMENDED FOR THIS COMPANY</p><h2>Connections your operating model expects</h2></div></div><div className="integration-recommendation-grid">{requirements.map((item)=><div key={`${item.company_template_key}:${item.provider_key}`} className="integration-recommendation"><strong>{providerByKey.get(item.provider_key)?.display_name??item.provider_key.replaceAll("_"," ")}</strong><span>{item.requirement_level}</span><p>{item.reason}</p></div>)}</div></section>:null}

    {showInternalValidation?<section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">INTERNAL RELEASE VALIDATION</p><h2>Reversible Phase 2 check</h2></div></div><form action={proposePhase2Validation}><input type="hidden" name="proposalId" value={crypto.randomUUID()}/><button className="secondary-button">Propose reversible Phase 2 validation</button></form></section>:null}

    <IntegrationSetupGuide/>
  </main>;
}
