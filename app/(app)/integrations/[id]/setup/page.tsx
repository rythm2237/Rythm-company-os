import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

const providerHelp:Record<string,{title:string;intro:string;credentialLabel:string;credentialHelp:string;scopes:string}>={
  github:{title:"Connect GitHub",intro:"Use a GitHub access token for this validation flow. RYTHM stores it in Vault; it is not exposed to Agents or company records.",credentialLabel:"GitHub access token",credentialHelp:"Create a fine-grained token in GitHub for the organization/repositories you want RYTHM to access. Start read-only for validation.",scopes:"repo:read read:user"},
  cloudflare:{title:"Connect Cloudflare",intro:"Use a restricted Cloudflare API token for the account or zone you want this company to manage.",credentialLabel:"Cloudflare API token",credentialHelp:"Create a token with only the resources and permissions needed by this company.",scopes:"read"},
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
  const help=providerHelp[integration.provider_key]??{title:`Connect ${provider?.display_name??integration.provider_key}`,intro:"Finish the secure account connection. RYTHM keeps the technical details out of normal Agent workflows.",credentialLabel:"Secure access credential",credentialHelp:"Use a provider-issued credential with the minimum permissions needed for this company.",scopes:"read"};
  return <main className="command-shell"><header className="command-header"><div><p className="eyebrow">CONNECTION SETUP</p><h1>{help.title}</h1><p className="subtitle">{help.intro}</p></div><Link className="secondary-button" href="/integrations">Back to connections</Link></header>
    {query.message?<p className="form-success">{query.message}</p>:null}{query.error?<p className="form-error">{query.error}</p>:null}
    <section className="panel" style={{maxWidth:760}}><div className="panel-heading"><div><p className="label">{provider?.display_name??integration.provider_key}</p><h2>{integration.display_name}</h2></div><span className={integration.status==="connected"?"state-active":"state-paused"}>{integration.status==="connected"?"Connected":"Setup required"}</span></div>
      {integration.status==="connected"?<p>This connection has been verified. You can return to Integrations to review permissions and usage.</p>:provider?.supports_token?<form action={saveCredential} className="stacked-form"><input type="hidden" name="integrationId" value={integration.id}/><input type="hidden" name="grantedScopes" value={help.scopes}/><label>{help.credentialLabel}<input type="password" name="secret" autoComplete="off" required placeholder="Paste the provider-issued token"/></label><p className="integration-security-note">{help.credentialHelp}</p><button className="primary-button" type="submit">Save securely & continue</button></form>:<div><p>This provider uses account authorization. The connector must open the provider sign-in flow and return to RYTHM for verification.</p><p className="integration-security-note">This connection will remain <strong>Setup required</strong> until that authorization flow is available and verified. RYTHM will not pretend it is connected.</p></div>}
      {integration.last_verified_at?<p className="security-note">Last verified: {new Date(integration.last_verified_at).toLocaleString()}</p>:null}
    </section>
  </main>;
}
