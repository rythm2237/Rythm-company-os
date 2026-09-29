import type { Metadata } from "next";
import Link from "next/link";
import { PUBLIC_TEMPLATES } from "@/lib/public-experience/content";
import { createPublicMetadata } from "@/lib/seo/site";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { commercialSetupPath, commercialSignupPath, selectedCommercialOffer } from "@/lib/commercial/selection";
import { getCommercialCatalog } from "@/lib/commercial/catalog";

export const metadata: Metadata = createPublicMetadata("/templates");
export const dynamic = "force-dynamic";

export default async function PublicTemplatesPage() {
  const offers = await getCommercialCatalog();
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: memberships } = user
    ? await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).limit(1)
    : { data: null };
  const hasOrganization = Boolean(memberships?.length);

  return (
    <main>
      <section className="public-page-hero templates-hero">
        <div><p className="marketing-kicker">READY COMPANY DISCOVERY</p><h1>Choose from the same governed company catalog that RYTHM provisions.</h1><p>Reserve your company, then request assisted B2B activation. Signup does not place an order or charge you.</p></div>
        <div><p>The Ready Companies below mirror the current Production catalog. Choosing one preserves your intent through account setup and commercial activation; provisioning remains tenant-isolated and approval-governed.</p><Link className="marketing-text-link" href="/demo?surface=templates">Explore the operating model in Demo <span aria-hidden="true">→</span></Link></div>
      </section>
      <section className="marketing-section public-template-grid" aria-label="Public company templates">
        {PUBLIC_TEMPLATES.map((template) => {
          const selection = selectedCommercialOffer(template.productCode, template.templateKey);
          const offer = offers.find((item) => item.offer_code === selection.offerCode);
          const href = template.templateKey
            ? hasOrganization
              ? `/studio/templates?template=${encodeURIComponent(template.templateKey)}`
              : user
                ? commercialSetupPath(selection)
                : commercialSignupPath(selection)
            : hasOrganization
              ? "/studio/builder"
              : user
                ? commercialSetupPath(selection)
                : commercialSignupPath(selection);

          return (
            <article key={template.id}>
              <p className="marketing-kicker">{template.family}{template.maturity === "preview" ? " · Preview — not launch-ready" : ""}</p>
              <h2>{template.name}</h2>
              <p className="template-audience"><strong>Best for:</strong> {template.audience}</p>
              <p>{template.description}</p>
              {template.templateKey === "ready_software_company_v1" ? <p><strong>Requires Custom AI Company with Company Studio — {offer?.price_label ?? "see Pricing"}.</strong> The Ready AI Company plan has insufficient Agent capacity for this 19-Agent template.</p> : null}
              {template.templateKey === "ready_ai_advertising_agency_v1" ? <p><strong>Ready AI Company — {offer?.price_label ?? "see Pricing"}.</strong></p> : null}
              <div className="template-counts"><span><strong>{template.departments || "Custom"}</strong> Departments</span><span><strong>{template.agents || "Custom"}</strong> AI Agents</span></div>
              <ul>{template.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
              {template.maturity === "preview"
                ? <Link href="/demo?surface=templates">{template.cta} <span aria-hidden="true">→</span></Link>
                : <Link href={href}>{template.cta ?? "Choose this company"} <span aria-hidden="true">→</span></Link>}
            </article>
          );
        })}
      </section>
    </main>
  );
}
