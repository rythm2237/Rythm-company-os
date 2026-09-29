import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { provisionCompany } from "./actions";
import { commercialSetupPath, commercialTemplateName, selectedCommercialOffer } from "@/lib/commercial/selection";

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

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1);

  if (memberships?.length) {
    const { data: entitlement } = await supabase.from("organization_entitlements")
      .select("status").eq("organization_id", memberships[0].organization_id).maybeSingle();
    if (entitlement?.status === "active" && selectedTemplate) {
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
            capabilities are provisioned only after commercial and payment / invoice confirmation.
          </p>
          {selectedTemplate ? <p className="security-note"><strong>Selected Ready Company:</strong> {commercialTemplateName(selectedTemplate)}</p> : null}
        </div>
        {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}
        <form action={provisionCompany} className="auth-form">
          <input type="hidden" name="templateKey" value={selectedTemplate}/>
          <label>Company name<input name="companyName" required minLength={2} maxLength={120} autoComplete="organization"/></label>
          {selectedTemplate ? (
            <p className="security-note"><strong>Required product:</strong> {selectedProduct === "ready_company" ? "Ready AI Company — €249/month + AI usage" : "Custom AI Company with Company Studio — €699/month + AI usage"}</p>
          ) : <label>Product
            <select name="productCode" defaultValue={selectedProduct}>
              <option value="ready_company">Ready AI Company — €249/month + AI usage</option>
              <option value="company_studio">Custom AI Company with Company Studio — €699/month + AI usage</option>
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
