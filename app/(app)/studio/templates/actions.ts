"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function templateFailure(message: string): never {
  redirect(`/studio/templates?error=${encodeURIComponent(message)}`);
}

export async function provisionCompanyTemplate(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const templateKey = value(formData, "templateKey");
  const templateVersion = value(formData, "templateVersion") || "1.0";

  if (!context.entitlement.company_template_access) {
    redirect("/studio/templates?error=Company%20Template%20Library%20is%20not%20enabled%20for%20this%20organization.");
  }
  if (!templateKey) redirect("/studio/templates?error=Select%20a%20company%20template.");

  const { data, error } = await context.supabase.rpc("provision_company_template_v2", {
    target_org_id: context.organizationId,
    target_template_key: templateKey,
    target_template_version: templateVersion,
  });

  if (error || !data) {
    console.error("company_template_provision_failed", { organizationId: context.organizationId, templateKey, templateVersion, error });
    templateFailure(error?.message ?? "Company template could not be provisioned.");
  }

  revalidatePath("/studio/templates");
  revalidatePath("/company");
  revalidatePath("/company/launch");
  revalidatePath("/command-center");
  redirect(`/company/launch?template=${encodeURIComponent(templateKey)}&message=Ready%20company%20provisioned.%20Complete%20the%20launch%20checklist%20before%20starting%20operations.`);
}

export async function provisionAgentTemplate(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const templateKey = value(formData, "templateKey");
  const templateVersion = value(formData, "templateVersion") || "1.0";
  if (!templateKey) templateFailure("Select an Agent template.");
  if (!context.entitlement.agent_builder_enabled || !context.entitlement.agent_create_enabled) {
    templateFailure("Agent creation is not enabled for this organization.");
  }
  const { data, error } = await context.supabase.rpc("provision_agent_template_v1", {
    target_org_id: context.organizationId,
    target_agent_template_key: templateKey,
    target_agent_template_version: templateVersion,
  });
  if (error || !data) {
    console.error("agent_template_provision_failed", { organizationId: context.organizationId, templateKey, templateVersion, error });
    templateFailure(error?.message ?? "Agent template could not be provisioned.");
  }
  revalidatePath("/studio/templates");
  revalidatePath("/studio/agents");
  redirect("/studio/templates?message=Agent%20template%20provisioned%20with%20verified%20professional%20knowledge%20and%20paused%20authority.");
}

export async function startSoftwareProjectBlueprint(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const projectName = value(formData, "projectName");
  if (projectName.length < 2) templateFailure("Enter a project name.");
  const { data, error } = await context.supabase.rpc("start_software_project_blueprint_v1", {
    target_org_id: context.organizationId,
    target_project_name: projectName,
  });
  if (error || !data) {
    console.error("software_project_blueprint_failed", { organizationId: context.organizationId, projectName, error });
    templateFailure(error?.message ?? "Project blueprint could not be started.");
  }
  revalidatePath("/projects");
  revalidatePath("/studio/templates");
  redirect(`/projects/operating?project=${data}&message=Software%20delivery%20workflow%20created.%20Start%20with%20the%20founder%2Fcustomer%20product%20brief.`);
}