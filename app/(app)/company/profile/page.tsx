import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}
function nullable(formData: FormData, key: string) {
  return value(formData, key) || null;
}

async function saveCompanyProfile(formData: FormData) {
  "use server";
  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();
  const name = value(formData, "name");
  const mission = value(formData, "mission");
  const vision = value(formData, "vision");
  const legalName = value(formData, "legalName");
  if (!name || !mission || !vision) redirect("/company/profile?error=Company%20name%2C%20mission%20and%20vision%20are%20required.");

  const countryCode = value(formData, "countryCode").toUpperCase().slice(0, 2);
  const currency = value(formData, "currency").toUpperCase().slice(0, 3) || "EUR";
  const timezone = value(formData, "timezone") || "UTC";
  const registeredAddress = {
    line1: value(formData, "addressLine1"),
    line2: value(formData, "addressLine2"),
    city: value(formData, "city"),
    postal_code: value(formData, "postalCode"),
    country_code: countryCode,
  };

  const { error } = await supabase.from("organizations").update({
    name,
    mission,
    vision,
    legal_name: legalName || name,
    legal_entity_type: nullable(formData, "legalEntityType"),
    registration_number: nullable(formData, "registrationNumber"),
    tax_id: nullable(formData, "taxId"),
    vat_id: nullable(formData, "vatId"),
    country_code: countryCode || null,
    registered_address: registeredAddress,
    website_url: nullable(formData, "websiteUrl"),
    primary_email: nullable(formData, "primaryEmail"),
    primary_phone: nullable(formData, "primaryPhone"),
    default_currency: currency,
    timezone,
    updated_at: new Date().toISOString(),
  }).eq("id", organizationId);

  if (error) redirect(`/company/profile?error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "organization.profile_updated",
    object_type: "organization",
    object_id: organizationId,
    risk_level: "medium",
    payload: { name, country_code: countryCode, currency, timezone },
  });
  revalidatePath("/company/profile");
  revalidatePath("/company/launch");
  revalidatePath("/company");
  redirect("/company/profile?message=Company%20profile%20updated.");
}

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

export default async function CompanyProfilePage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, organizationId } = await requireOwnerOrganizationContext();
  const { data: org } = await supabase.from("organizations").select("*").eq("id", organizationId).single();
  if (!org) redirect("/company");
  const address = (org.registered_address && typeof org.registered_address === "object" ? org.registered_address : {}) as Record<string, string>;

  return <main className="command-shell ops-shell">
    <header className="command-header">
      <div><p className="eyebrow">COMPANY PROFILE</p><h1>Edit your company information.</h1><p className="subtitle">This profile remains editable after launch. Changes update the canonical company identity used by the workspace and its governed AI workforce.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link className="secondary-button" href="/company/launch">Setup & readiness</Link><Link className="secondary-button" href="/company">Company administration</Link></div>
    </header>
    {params.message ? <p className="ops-message">{params.message}</p> : null}
    {params.error ? <p className="form-error">{params.error}</p> : null}

    <section className="panel ops-section">
      <div className="panel-heading"><div><p className="label">CORE IDENTITY</p><h2>Business profile</h2></div><span className="pill">Always editable</span></div>
      <form action={saveCompanyProfile} className="ops-form-grid">
        <label><span>Company name</span><input name="name" defaultValue={org.name ?? ""} required /></label>
        <label><span>Legal name</span><input name="legalName" defaultValue={org.legal_name ?? org.name ?? ""} /></label>
        <label style={{gridColumn:"1 / -1"}}><span>Mission</span><textarea name="mission" defaultValue={org.mission ?? ""} rows={4} required placeholder="What does the company exist to do?" /></label>
        <label style={{gridColumn:"1 / -1"}}><span>Vision</span><textarea name="vision" defaultValue={org.vision ?? ""} rows={4} required placeholder="What future is the company trying to create?" /></label>

        <label><span>Entity type</span><input name="legalEntityType" defaultValue={org.legal_entity_type ?? ""} placeholder="Kft., Ltd., LLC..." /></label>
        <label><span>Registration number</span><input name="registrationNumber" defaultValue={org.registration_number ?? ""} /></label>
        <label><span>Tax ID</span><input name="taxId" defaultValue={org.tax_id ?? ""} /></label>
        <label><span>VAT ID</span><input name="vatId" defaultValue={org.vat_id ?? ""} /></label>
        <label><span>Country code</span><input name="countryCode" defaultValue={org.country_code ?? ""} maxLength={2} placeholder="HU" /></label>
        <label><span>Default currency</span><input name="currency" defaultValue={org.default_currency ?? "EUR"} maxLength={3} /></label>
        <label><span>Timezone</span><input name="timezone" defaultValue={org.timezone ?? "UTC"} placeholder="Europe/Budapest" /></label>
        <label><span>Website</span><input name="websiteUrl" defaultValue={org.website_url ?? ""} type="url" placeholder="https://company.com" /></label>
        <label><span>Primary email</span><input name="primaryEmail" defaultValue={org.primary_email ?? ""} type="email" /></label>
        <label><span>Primary phone</span><input name="primaryPhone" defaultValue={org.primary_phone ?? ""} /></label>
        <label><span>Address line 1</span><input name="addressLine1" defaultValue={address.line1 ?? ""} /></label>
        <label><span>Address line 2</span><input name="addressLine2" defaultValue={address.line2 ?? ""} /></label>
        <label><span>City</span><input name="city" defaultValue={address.city ?? ""} /></label>
        <label><span>Postal code</span><input name="postalCode" defaultValue={address.postal_code ?? ""} /></label>
        <div style={{gridColumn:"1 / -1",display:"flex",gap:10,flexWrap:"wrap"}}><button className="primary-button" type="submit">Save company profile</button><Link className="secondary-button" href="/company/launch">Review launch readiness</Link></div>
      </form>
    </section>

    <section className="panel" style={{marginTop:18}}>
      <p className="label">OTHER COMPANY SETTINGS</p><h2>Keep the operating context current.</h2><p style={{color:"#667085",lineHeight:1.7}}>Company knowledge, legal documents, integrations and Agent-specific knowledge remain independently editable after launch.</p>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href="/company-library">Company knowledge</Link><Link className="secondary-button" href="/integrations">Integrations</Link><Link className="secondary-button" href="/agents">Agent workforce</Link></div>
    </section>
  </main>;
}
