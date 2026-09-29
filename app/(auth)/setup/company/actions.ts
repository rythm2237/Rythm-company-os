"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/organization-context";
import { commercialSetupPath, selectedCommercialOffer } from "@/lib/commercial/selection";

export async function provisionCompany(formData: FormData) {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const selection = selectedCommercialOffer(String(formData.get("productCode") ?? ""), String(formData.get("templateKey") ?? ""));
  const { productCode, templateKey } = selection;
  const setupPath = commercialSetupPath(selection);

  if (companyName.length < 2 || companyName.length > 120) {
    redirect(`${setupPath}&error=${encodeURIComponent("Enter a valid company name and product.")}`);
  }

  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(setupPath)}`);

  {
    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        selected_product_code: productCode,
        selected_template_key: templateKey || null,
      },
    });
    if (metadataError) {
      console.error("selected_template_intent_persist_failed", { userId: user.id, templateKey, error: metadataError });
      redirect(`${setupPath}&error=${encodeURIComponent("Your selection could not be saved. Please try again.")}`);
    }
  }

  // This RPC creates only the isolated customer organization shell, Owner membership,
  // and a PENDING commercial entitlement. Active commercial capabilities remain
  // fail-closed until RYTHM confirms payment/invoice status and activates entitlement.
  const { data: organizationId, error } = await supabase.rpc("provision_commercial_company_v1", {
    target_company_name: companyName,
    target_product_code: productCode,
    target_template_key: templateKey || null,
  });

  if (error || !organizationId) {
    console.error("customer_organization_provision_failed", { userId: user.id, error });
    redirect(`${setupPath}&error=${encodeURIComponent("Company setup could not be completed. No commercial activation was performed.")}`);
  }

  const organizationIdString = String(organizationId);
  const { data: activeOrganizationId, error: contextError } = await supabase.rpc("set_active_organization", {
    target_org_id: organizationIdString,
  });

  if (contextError || String(activeOrganizationId ?? "") !== organizationIdString) {
    console.error("new_organization_context_activation_failed", {
      userId: user.id,
      organizationId: organizationIdString,
      error: contextError,
    });
    redirect(`${setupPath}&error=${encodeURIComponent("Company setup was created, but its active context could not be selected. Contact RYTHM support before continuing.")}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationIdString, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  const templateQuery = templateKey ? `&template=${encodeURIComponent(templateKey)}` : "";
  redirect(`/activation?stage=payment_pending${templateQuery}`);
}
