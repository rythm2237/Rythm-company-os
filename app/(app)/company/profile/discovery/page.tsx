import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { validateDiscovery } from "@/lib/business-discovery";
import DiscoveryForm from "./DiscoveryForm";

export const dynamic="force-dynamic";
const path="/company/profile/discovery";
function fail(message:string):never { redirect(path+"?error="+encodeURIComponent(message)); }

async function saveDiscovery(expectedOrg:string,expectedUpdatedAt:string,form:FormData) {
  "use server";
  const {supabase,organizationId,user}=await requireActiveOwnerOrganizationContext();
  if(organizationId!==expectedOrg) fail("Active organization changed. Reload and review your current organization.");
  const profile=validateDiscovery(form);
  if(!profile) fail("Review the required mission, vision, field lengths and confirmation.");
  const confirmation=await supabase.from("audit_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("event_type","organization.profile_updated").eq("actor_type","user");
  if(confirmation.error) fail("Profile confirmation could not be checked. No changes saved.");
  if((confirmation.count??0)>0) redirect("/company/profile");
  // Optimistic concurrency and tenant scope: do not replace a concurrently edited profile.
  const {data,error}=await supabase.from("organizations").update({mission:profile.mission,vision:profile.vision,updated_at:new Date().toISOString()}).eq("id",organizationId).eq("updated_at",expectedUpdatedAt).select("id").maybeSingle();
  if(error||!data) fail("Profile changed or could not be saved. Reload and review before retrying.");
  const audit=await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"organization.profile_updated",object_type:"organization",object_id:organizationId,risk_level:"medium",payload:{source:"w19_business_discovery",owner_confirmed:true}});
  if(audit.error) fail("Profile text was saved, but confirmation could not be recorded. Review and retry; launch remains unconfirmed.");
  revalidatePath("/company/profile");revalidatePath("/company/launch");revalidatePath("/company");
  redirect("/company/launch?message=Business%20profile%20confirmed.");
}

export default async function BusinessDiscoveryPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const {supabase,organizationId}=await requireActiveOwnerOrganizationContext();
  const params=await searchParams;
  const [org,installation,confirmation]=await Promise.all([
    supabase.from("organizations").select("name,mission,vision,default_currency,timezone,updated_at").eq("id",organizationId).single(),
    supabase.from("organization_template_installations").select("template_key").eq("organization_id",organizationId).limit(2),
    supabase.from("audit_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("event_type","organization.profile_updated").eq("actor_type","user"),
  ]);
  if(confirmation.error||installation.error||org.error||!org.data) return <main className="command-shell"><section className="panel"><h1>Business discovery unavailable</h1><p role="alert">Your company context could not be verified. Nothing has been saved.</p><Link href="/company/launch">Return to launch checklist</Link></section></main>;
  if((confirmation.count??0)>0) redirect("/company/profile");
  const key=installation.data?.length===1?installation.data[0].template_key:"";
  return <main className="command-shell ops-shell"><header className="command-header"><div><p className="eyebrow">READY COMPANY · BUSINESS DISCOVERY</p><h1>Review {org.data.name} business profile</h1><p className="subtitle">Confirm essential business decisions now; complete legal details, integrations and other launch requirements separately.</p></div><Link href="/company/profile" className="secondary-button">Full company profile</Link></header>
    {params.error?<p className="form-error" role="alert">{params.error}</p>:null}
    <section className="panel"><DiscoveryForm key={organizationId+":"+org.data.updated_at} templateKey={key} mission={org.data.mission??""} vision={org.data.vision??""} currency={org.data.default_currency??""} timezone={org.data.timezone??""} action={saveDiscovery.bind(null,organizationId,org.data.updated_at)}/></section>
  </main>;
}
