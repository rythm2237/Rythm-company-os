"use server";

import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";

export async function provisionCompanyTemplate(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const templateKey = String(formData.get("templateKey") ?? "").trim();
  const templateVersion = String(formData.get("templateVersion") ?? "1.0").trim();

  if (!context.entitlement?.company_template_access) {
    redirect("/studio/templates?error=Company%20Template%20Library%20is%20not%20enabled%20for%20this%20organization.");
  }

  if (!templateKey) {
    redirect("/studio/templates?error=Select%20a%20company%20template.");
  }

  const { data, error } = await context.supabase.rpc("provision_company_template", {
    target_org_id: context.organizationId,
    target_template_key: templateKey,
    target_template_version: templateVersion,
  });

  if (error || !data) {
    console.error("company_template_provision_failed", {
      organizationId: context.organizationId,
      templateKey,
      templateVersion,
      error,
    });
    redirect("/studio/templates?error=Company%20template%20could%20not%20be%20provisioned.%20The%20organization%20must%20be%20empty%20in%20V1.");
  }

  redirect("/command-center?message=Company%20template%20provisioned.%20The%20AI%20Agent%20workforce%20is%20visible%20but%20paused%2C%20and%20external%20actions%20remain%20disabled.");
}
