import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { createIntegration, grantAgentCapability, revokeAgentCapability, rotateIntegrationSecret } from "./actions";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const context = await requireActiveOwnerOrganizationContext();
  const params = await searchParams;
  const [providersResult, capabilitiesResult, integrationsResult, agentsResult, grantsResult, executionsResult] = await Promise.all([
    context.supabase.from("integration_providers").select("provider_key,display_name,category,supports_oauth,supports_token").eq("enabled", true).order("display_name"),
    context.supabase.from("integration_capabilities").select("provider_key,capability_key,risk_level,default_approval_mode,description").order("provider_key").order("capability_key"),
    context.supabase.from("organization_integrations").select("id,provider_key,display_name,account_ref,base_url,auth_type,status,connected_at,last_verified_at").eq("organization_id", context.organizationId).order("created_at", { ascending:false }),
    context.supabase.from("agents").select("id,name,role_title,agent_status").eq("organization_id", context.organizationId).neq("agent_status","archived").order("name"),
    context.supabase.from("agent_integration_grants").select("id,agent_id,integration_id,capability_key,approval_mode,enabled").eq("organization_id", context.organizationId).eq("enabled", true).order("created_at", { ascending:false }),
    context.supabase.from("tool_execution_requests").select("id,agent_id,integration_id,capability_key,operation,target_ref,risk_level,approval_mode,status,latency_ms,created_at").eq("organization_id", context.organizationId).order("created_at", { ascending:false }).limit(30),
  ]);
  const providers = providersResult.data ?? [], capabilities = capabilitiesResult.data ?? [], integrations = integrationsResult.data ?? [], agents = agentsResult.data ?? [], grants = grantsResult.data ?? [], executions = executionsResult.data ?? [];
  const agentName = new Map(agents.map(a=>[a.id,a.name]));
  const integrationName = new Map(integrations.map(i=>[i.id,`${i.display_name} · ${i.provider_key}`]));

  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM INTEGRATION GATEWAY</p><h1>Connections, permissions and governed execution.</h1><p className="subtitle">Connect company-owned services, grant least-privilege capabilities to Agents, and keep sensitive actions behind approval gates.</p></div></header>
    {params.error?<p className="form-error">{params.error}</p>:null}{params.message?<p className="form-success">{params.message}</p>:null}

    <section className="executive-grid">
      <article className="panel"><div className="panel-heading"><div><p className="label">Company connections</p><h2>Connect a provider</h2></div><span className="pill">Vault secured</span></div>
        <form action={createIntegration} className="stacked-form">
          <label>Provider<select name="providerKey" required>{providers.map(p=><option key={p.provider_key} value={p.provider_key}>{p.display_name}</option>)}</select></label>
          <label>Connection name<input name="displayName" placeholder="Production GitHub" required /></label>
          <label>Account / team / project reference<input name="accountRef" placeholder="org, team, project or account id" /></label>
          <label>Base URL (optional)<input name="baseUrl" placeholder="https://api.example.com" /></label>
          <label>Authentication<select name="authType"><option value="token">Token / API key</option><option value="oauth">OAuth</option><option value="service_account">Service account</option></select></label>
          <label>Credential<input name="secret" type="password" autoComplete="new-password" placeholder="Stored only in Supabase Vault" /></label>
          <button className="primary-button" type="submit">Create connection</button>
        </form>
      </article>
      <article className="panel"><div className="panel-heading"><div><p className="label">Policy model</p><h2>Execution authority</h2></div></div>
        <div className="compact-list"><div><strong>Autonomous</strong><span>Low/medium-risk, scoped actions can run without a human click.</span></div><div><strong>Approval required</strong><span>The Agent prepares the exact action; Owner/Admin must approve before execution.</span></div><div><strong>Human only</strong><span>Restricted destructive or ownership/payment actions cannot be delegated to an Agent.</span></div><div><strong>Secrets</strong><span>Credentials remain in Vault and are never written to prompts, logs, or public tenant tables.</span></div></div>
      </article>
    </section>

    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">Connected services</p><h2>Company Integration Registry</h2></div><span className="pill">{integrations.length} connection(s)</span></div><div className="data-list">
      {integrations.length?integrations.map(i=><div className="data-row" key={i.id}><div><strong>{i.display_name} · {i.provider_key}</strong><span>{i.account_ref||"No account reference"} · {i.auth_type} · {i.status}</span></div><form action={rotateIntegrationSecret} style={{display:"flex",gap:8}}><input type="hidden" name="integrationId" value={i.id}/><input name="secret" type="password" placeholder="Rotate credential" required/><button className="secondary-button">Update</button></form></div>):<p className="empty-state">No company integrations connected yet.</p>}
    </div></section>

    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">Least privilege</p><h2>Agent capability grants</h2></div></div>
      <form action={grantAgentCapability} className="stacked-form" style={{maxWidth:780}}>
        <label>Agent<select name="agentId" required><option value="">Select Agent</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name} — {a.role_title}</option>)}</select></label>
        <label>Connection<select name="integrationId" required><option value="">Select connection</option>{integrations.map(i=><option key={i.id} value={i.id}>{i.display_name} — {i.provider_key}</option>)}</select></label>
        <label>Capability<select name="capabilityKey" required><option value="">Select capability</option>{capabilities.map(c=><option key={`${c.provider_key}:${c.capability_key}`} value={c.capability_key}>{c.provider_key} · {c.capability_key} · {c.risk_level}</option>)}</select></label>
        <label>Authority<select name="approvalMode" required><option value="autonomous">Autonomous</option><option value="approval_required">Approval required</option><option value="human_only">Human only</option></select></label>
        <button className="primary-button">Grant capability</button>
      </form>
      <div className="data-list" style={{marginTop:18}}>{grants.length?grants.map(g=><div className="data-row" key={g.id}><div><strong>{agentName.get(g.agent_id)??"Agent"} · {g.capability_key}</strong><span>{integrationName.get(g.integration_id)??"Connection"} · {g.approval_mode}</span></div><form action={revokeAgentCapability}><input type="hidden" name="grantId" value={g.id}/><button className="secondary-button">Revoke</button></form></div>):<p className="empty-state">No Agent integration grants yet.</p>}</div>
    </section>

    <section className="panel panel-wide" style={{marginTop:18}}><div className="panel-heading"><div><p className="label">Execution audit</p><h2>Recent tool requests</h2></div><span className="pill">latest 30</span></div><div className="data-list">{executions.length?executions.map(e=><div className="data-row" key={e.id}><div><strong>{e.capability_key} · {e.operation}</strong><span>{agentName.get(e.agent_id??"")??"Human"} · {integrationName.get(e.integration_id)??"Connection"} · {e.risk_level} · {e.approval_mode}</span><span>{e.target_ref??"No target"}</span></div><div className="row-meta"><b className={e.status==="succeeded"?"state-active":"state-paused"}>{e.status}</b>{e.latency_ms!=null?<span>{e.latency_ms} ms</span>:null}</div></div>):<p className="empty-state">No external tool executions recorded yet.</p>}</div></section>
  </main>;
}
