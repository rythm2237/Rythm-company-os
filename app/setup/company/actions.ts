"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/organization-context";

const productCodes = new Set(["ready_company", "custom_company", "company_studio"]);

export async function provisionCompany(formData: FormData) {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const productCode = String(formData.get("productCode") ?? "company_studio");

  if (companyName.length < 2 || companyName.length > 120 || !productCodes.has(productCode)) {
    redirect(`/setup/company?error=${encodeURIComponent("Enter a valid company name and product.")}`);
  }

  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/setup/company");

  const { data: organizationId, error } = await supabase.rpc("provision_customer_organization", {
    target_company_name: companyName,
    target_product_code: productCode,
    target_plan_code: "public_beta",
  });

  if (error || !organizationId) {
    console.error("customer_organization_provision_failed", { userId: user.id, error });
    redirect(`/setup/company?error=${encodeURIComponent("Company provisioning could not be completed. No commercial activation was performed.")}`);
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
    redirect(`/setup/company?error=${encodeURIComponent("Company was provisioned, but its active context could not be selected. Contact RYTHM support before continuing.")}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationIdString, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/command-center?message=Company%20workspace%20provisioned.%20Commercial%20entitlement%20is%20pending%20activation.");
}
