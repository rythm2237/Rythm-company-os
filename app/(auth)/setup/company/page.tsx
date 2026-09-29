import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { provisionCompany } from "./actions";
import { commercialSetupPath, commercialTemplateName, selectedCommercialOffer } from "@/lib/commercial/selection";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";
import { getCommercialCatalog } from "@/lib/commercial/catalog";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; product?: string; template?: string }> };

export default async function CompanySetupPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const selection = selectedCommercialOffer(params.product, params.template);
    redirect(`/login?next=${encodeURIComponent(commercialSetupPath(selection))}`);
  }

  const metadataProduct = typeof user.user_metadata?.selected_product_code === "string"
    ? user.user_metadata.selected_product_code
    : "";
  const requestedProduct = params.product ?? metadataProduct;
  const metadataTemplate = typeof user.user_metadata?.selected_template_key === "string"
    ? user.user_metadata.selected_template_key
    : "";
  // An explicit product-only URL overrides an earlier template in user metadata.
  const requestedTemplate = params.template ?? (params.product ? "" : metadataTemplate);
  const selection = selectedCommercialOffer(requestedProduct, requestedTemplate);
  const selectedProduct = selection.productCode;
  const selectedTemplate = selection.templateKey;
  const offers = await getCommercialCatalog();
  const readyPrice = offers.find((item) => item.offer_code === "ready_ai_company")?.price_label ?? "see Pricing";
  const studioPrice = offers.find((item) => item.offer_code === "custom_ai_company")?.price_label ?? "see Pricing";

  const organizationContext = await resolveOrganizationContext();
  if (organizationContext) {
    if (isOrganizationEntitlementActive(organizationContext.entitlement) && selectedTemplate) {
      redirect(`/studio/templates?template=${encodeURIComponent(selectedTemplate)}`);
    }
    redirect("/activation");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="company-setup-title">
        <div>
          <p className="eyebrow">COMMERCIAL SETUP</p>
          <h1 id="company-setup-title" className="auth-title">Reserve your RYTHM company</h1>
          <p className="auth-copy">
            This creates an isolated organization shell and a locked product entitlement. Product
            capabilities remain locked until RYTHM confirms your invoice and payment. This step does not place an order or charge you.
          </p>
          {selectedTemplate ? <p className="security-note"><strong>Selected Ready Company:</strong> {commercialTemplateName(selectedTemplate)}</p> : null}
        </div>
        {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}
        <form action={provisionCompany} className="auth-form">
          <input type="hidden" name="templateKey" value={selectedTemplate}/>
          <label>Company name<input name="companyName" required minLength={2} maxLength={120} autoComplete="organization"/></label>
          {selectedTemplate ? (
            <p className="security-note"><strong>Required product:</strong> {selectedProduct === "ready_company" ? `Ready AI Company — ${readyPrice}` : `Custom AI Company with Company Studio — ${studioPrice}`}</p>
          ) : <label>Product
            <select name="productCode" defaultValue={selectedProduct}>
              <option value="ready_company">Ready AI Company — {readyPrice}</option>
              <option value="company_studio">Custom AI Company with Company Studio — {studioPrice}</option>
            </select>
          </label>}
          {selectedTemplate ? <input type="hidden" name="productCode" value={selectedProduct} /> : null}
          <button type="submit">Continue to commercial activation</button>
        </form>
        <p className="security-note">
          No Agent, template, Company Builder capability, autonomous external action, publishing,
          or spending is activated by this step.
        </p>
      </section>
    </main>
  );
}
