import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { provisionCompany } from "./actions";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; product?: string }> };

const selfServeProducts = new Set(["ready_company", "company_studio"]);

export default async function CompanySetupPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/setup/company");

  const metadataProduct = typeof user.user_metadata?.selected_product_code === "string"
    ? user.user_metadata.selected_product_code
    : "";
  const requestedProduct = params.product ?? metadataProduct;
  const selectedProduct = selfServeProducts.has(requestedProduct)
    ? requestedProduct
    : "company_studio";

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1);

  if (memberships?.length) redirect("/command-center");

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="company-setup-title">
        <div>
          <p className="eyebrow">COMPANY PROVISIONING</p>
          <h1 id="company-setup-title" className="auth-title">Create your RYTHM company workspace</h1>
          <p className="auth-copy">This creates an isolated Organization owned by your Human CEO account. Commercial activation remains separately controlled during Public Beta.</p>
        </div>
        {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}
        <form action={provisionCompany} className="auth-form">
          <label>Company name<input name="companyName" required minLength={2} maxLength={120} autoComplete="organization"/></label>
          <label>Product
            <select name="productCode" defaultValue={selectedProduct}>
              <option value="ready_company">Ready AI Company — €249/month + AI usage</option>
              <option value="company_studio">Custom AI Company with Company Studio — €699/month + AI usage</option>
            </select>
          </label>
          <button type="submit">Provision company workspace</button>
        </form>
        <p className="security-note">Provisioning does not activate autonomous external actions, publish content, spend money, or bypass Human CEO approvals.</p>
      </section>
    </main>
  );
}
