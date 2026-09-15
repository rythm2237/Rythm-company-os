import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { IntegrationGuideButton } from "../../integration-guide-button";

export const dynamic = "force-dynamic";

const providerHelp:Record<string,{title:string;intro:string;credentialLabel:string;credentialHelp:string;scopes:string}>={
  github:{title:"Connect GitHub",intro:"Use a GitHub access token for this validation flow. RYTHM stores it in Vault; it is not exposed to Agents or company records.",credentialLabel:"GitHub access token",credentialHelp:"Create a fine-grained token in GitHub for the organization/repositories you want RYTHM to access. Start read-only for validation.",scopes:"repo:read read:user"},
  cloudflare:{title:"Connect Cloudflare",intro:"Use a restricted Cloudflare API token for the account or zone you want this company to manage.",credentialLabel:"Cloudflare API token",credentialHelp:"Create a token with only the resources and permissions needed by this company.",scopes:"read"},
  vercel:{title:"Connect Vercel",intro:"Use a restricted Vercel token for the team/account that owns the intended deployment project.",credentialLabel:"Vercel access token",credentialHelp:"Create a provider token for the intended Vercel account. Project selection and production deployment authority are handled separately.",scopes:"deployment.read"},
  supabase:{title:"Connect Supabase",intro:"Use a restricted Supabase credential for the intended account or project. Project/resource selection remains separate from the company connection.",credentialLabel:"Supabase access token",credentialHelp:"Use a provider-issued token with the minimum access required for discovery/validation. Database writes require separate governed capability.",scopes:"project.read"},
  ahrefs:{title:"Connect Ahrefs",intro:"Connect SEO research data when the company or client has an Ahrefs subscription.",credentialLabel:"Ahrefs API credential",credentialHelp:"Use the provider-issued API credential for the intended account. This service is normally supporting evidence rather than a universal project blocker.",scopes:"read"},
  semrush:{title:"Connect Semrush",intro:"Connect SEO and market-research data when available to the company or client.",credentialLabel:"Semrush API credential",credentialHelp:"Use the provider-issued credential for the intended account and keep access read-only for research by default.",scopes:"read"},
};

function value(formData:FormData,key:string){return String(formData.get(key)??"").trim()}

async function saveCredential(formData:FormData){
  "use server";
  const context=await requireActiveOwnerOrganizationContext();
  const integrationId=value(formData,"integrationId");
  const secret=value(formData,"secret");
  const grantedScopes=value(formData,"grantedScopes").split(/[\s,]+/).filter(Boolean);
  if(!integrationId||!secret) redirect(`/integrations/${integrationId}/setup?error=${encodeURIComponent("A connection credential is required.")}`);
  const {data:integration}=await context.supabase.from("organization_integrations").select("id").eq("id",integrationId).eq("organization_id",context.organizationId).maybeSingle();
  if(!integration) redirect("/integrations?error=Connection%20not%20found.");
  const {error}=await context.supabase.rpc("set_organization_integration_secret_v1",{target_integration_id:integrationId,secret_value:secret});
  if(error) redirect(`/integrations/${integrationId}/setup?error=${encodeURIComponent(error.message)}`);
  await context.supabase.from("organization_integrations").update({granted_scopes:grantedScopes,status:"disconnected",updated_at:new Date().toISOString()}).eq("id",integrationId).eq("organization_id",context.organizationId);
  revalidatePath("/integrations");
  revalidatePath(`/integrations/${integrationId}/setup`);
  redirect(`/integrations/${integrationId}/setup?message=${encodeURIComponent("Credential saved securely. The connection is still not marked Connected until provider verification succeeds.")}`);
}

export default async function IntegrationSetupPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{message?:string;error?:string}>}){
  const {id}=await params;const query=await searchParams;const context=await requireActiveOwnerOrganizationContext();
  const {data:integration}=await context.supabase.from("organization_integrations").select("id,provider_key,display_name,status,granted_scopes,last_verified_at").eq("id",id).eq("organization_id",context.organizationId).maybeSingle();
  if(!integration) redirect("/integrations?error=Connection%20not%20found.");
  const {data:provider}=await context.supabase.from("integration_providers").select("display_name,supports_oauth,supports_token").eq("provider_key",integration.provider_key).maybeSingle();
  const help=providerHelp[integration.provider_key]??{title:`Connect ${provider?.display_name??integration.provider_key}`,intro:"Finish the secure account connection. RYTHM keeps technical detail out of normal Agent workflows while preserving real verification.",credentialLabel:"Secure access credential",credentialHelp:"Use a provider-issued credential with the minimum permissions needed for this company.",scopes:"read"};
  return <main className="command-shell"><span hidden data-integration-guide-provider={integration.provider_key}/><header className="command-header"><div><p className="eyebrow">CONNECTION SETUP</p><h1>{help.title}</h1><p className="subtitle">{help.intro}</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><IntegrationGuideButton providerKey={integration.provider_key} label="Keep guide open"/><Link className="secondary-button" href="/integrations">Back to connections</Link></div></header>
    {query.message?<p className="form-success">{query.message}</p>:null}{query.error?<p className="form-error">{query.error}</p>:null}
    <section className="panel" style={{maxWidth:760}}><div className="panel-heading"><div><p className="label">{provider?.display_name??integration.provider_key}</p><h2>{integration.display_name}</h2></div><span data-guide-target="verify" className={integration.status==="connected"?"state-active":"state-paused"}>{integration.status==="connected"?"Connected":"Setup required"}</span></div>
      {integration.status==="connected"?<p>This connection has been verified. Return to the project to choose the exact repository, property, site, account or workspace and grant only the capabilities that project needs.</p>:provider?.supports_token?<form action={saveCredential} className="stacked-form"><input type="hidden" name="integrationId" value={integration.id}/><input type="hidden" name="grantedScopes" value={help.scopes}/><label>{help.credentialLabel}<input data-guide-target="credential" type="password" name="secret" autoComplete="off" required placeholder="Paste the provider-issued token"/></label><p className="integration-security-note">{help.credentialHelp}</p><button data-guide-target="start-setup" className="primary-button" type="submit">Save securely & continue</button></form>:<div data-guide-target="credential"><p>This provider uses account authorization. Start its provider sign-in flow when available, then return to RYTHM for verification.</p><p className="integration-security-note">The service remains <strong>Setup required</strong> until authorization and verification succeed. RYTHM never pretends a provider is connected.</p></div>}
      {integration.last_verified_at?<p className="security-note">Last verified: {new Date(integration.last_verified_at).toLocaleString()}</p>:null}
    </section>
  </main>;
}
