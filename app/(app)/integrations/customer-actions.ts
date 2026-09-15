"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function createCustomerIntegration(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const providerKey = text(formData.get("providerKey"));
  const displayName = text(formData.get("displayName"));
  const projectId = text(formData.get("projectId"));
  if (!providerKey || !displayName) {
    redirect(`/integrations?error=${encodeURIComponent("Service and connection name are required.")}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`);
  }

  const { data: provider } = await context.supabase
    .from("integration_providers")
    .select("provider_key,display_name,supports_oauth,supports_token")
    .eq("provider_key", providerKey)
    .eq("enabled", true)
    .maybeSingle();
  if (!provider) {
    redirect(`/integrations?error=${encodeURIComponent("This service is not available for customer setup.")}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`);
  }

  const { data: integration, error } = await context.supabase
    .from("organization_integrations")
    .insert({
      organization_id: context.organizationId,
      provider_key: providerKey,
      display_name: displayName,
      account_ref: null,
      base_url: null,
      auth_type: provider.supports_oauth ? "oauth" : "token",
      granted_scopes: [],
      status: "disconnected",
      connected_by_user_id: context.user.id,
      metadata: {
        customer_setup: true,
        setup_state: "created_not_authorized",
        project_context: projectId || null,
      },
    })
    .select("id")
    .single();

  if (error || !integration) {
    redirect(`/integrations?error=${encodeURIComponent(error?.message ?? "Service could not be added.")}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`);
  }

  revalidatePath("/integrations");
  const message = provider.supports_oauth
    ? `${provider.display_name} was added. No external account is connected yet. Continue below to authorize the provider.`
    : `${provider.display_name} was added. No external account is connected yet. Continue below to verify a restricted provider credential.`;
  const query = new URLSearchParams({ message });
  if (projectId) query.set("project", projectId);
  redirect(`/integrations/${integration.id}/setup?${query.toString()}`);
}
