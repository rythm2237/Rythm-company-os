import type { Metadata } from "next";
import Link from "next/link";
import { PUBLIC_TEMPLATES } from "@/lib/public-experience/content";
import { createPublicMetadata } from "@/lib/seo/site";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const metadata: Metadata = createPublicMetadata("/templates");
export const dynamic = "force-dynamic";

export default async function PublicTemplatesPage() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: memberships } = user
    ? await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).limit(1)
    : { data: null };
  const hasOrganization = Boolean(memberships?.length);

  return (
    <main>
      <section className="public-page-hero templates-hero">
        <div><p className="marketing-kicker">READY COMPANY DISCOVERY</p><h1>Choose from the same governed company catalog that RYTHM provisions.</h1></div>
        <div><p>The Ready Companies below mirror the current Production catalog. Choosing one preserves your intent through account setup and commercial activation; provisioning remains tenant-isolated and approval-governed.</p><Link className="marketing-text-link" href="/demo?surface=templates">Explore the operating model in Demo <span aria-hidden="true">→</span></Link></div>
      </section>
      <section className="marketing-section public-template-grid" aria-label="Public company templates">
        {PUBLIC_TEMPLATES.map((template) => {
          const product = template.productCode ?? "ready_company";
          const templateQuery = template.templateKey ? `&template=${encodeURIComponent(template.templateKey)}` : "";
          const href = template.templateKey
            ? hasOrganization
              ? `/studio/templates?template=${encodeURIComponent(template.templateKey)}`
              : user
                ? `/setup/company?product=${product}${templateQuery}`
                : `/signup?product=${product}${templateQuery}`
            : hasOrganization
              ? "/studio/builder"
              : user
                ? `/setup/company?product=${product}`
                : `/signup?product=${product}`;

          return (
            <article key={template.id}>
              <p className="marketing-kicker">{template.family}</p>
              <h2>{template.name}</h2>
              <p className="template-audience"><strong>Best for:</strong> {template.audience}</p>
              <p>{template.description}</p>
              <div className="template-counts"><span><strong>{template.departments || "Custom"}</strong> Departments</span><span><strong>{template.agents || "Custom"}</strong> AI Agents</span></div>
              <ul>{template.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
              <Link href={href}>{template.cta ?? "Choose this company"} <span aria-hidden="true">→</span></Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
