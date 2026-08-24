"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";

function text(value: FormDataEntryValue | null) { return String(value ?? "").trim(); }
function fail(message: string): never { redirect(`/integrations?error=${encodeURIComponent(message)}`); }

export async function createIntegration(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const providerKey = text(formData.get("providerKey"));
  const displayName = text(formData.get("displayName"));
  const accountRef = text(formData.get("accountRef")) || null;
  const baseUrl = text(formData.get("baseUrl")) || null;
  const authType = text(formData.get("authType")) || "token";
  const secret = text(formData.get("secret"));
  if (!providerKey || !displayName) fail("Provider and connection name are required.");
  const { data: integration, error } = await context.supabase.from("organization_integrations").insert({
    organization_id: context.organizationId,
    provider_key: providerKey,
    display_name: displayName,
    account_ref: accountRef,
    base_url: baseUrl,
    auth_type: authType,
    status: secret ? "disconnected" : "disconnected",
    connected_by_user_id: context.user.id,
  }).select("id").single();
  if (error || !integration) fail(error?.message ?? "Integration could not be created.");
  if (secret) {
    const { error: secretError } = await context.supabase.rpc("set_organization_integration_secret_v1", { target_integration_id: integration.id, secret_value: secret });
    if (secretError) fail(`Connection created, but credential could not be stored: ${secretError.message}`);
  }
  revalidatePath("/integrations");
  redirect("/integrations?message=Integration%20connection%20created.");
}

export async function rotateIntegrationSecret(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const integrationId = text(formData.get("integrationId"));
  const secret = text(formData.get("secret"));
  if (!integrationId || !secret) fail("Connection and credential are required.");
  const { error } = await context.supabase.rpc("set_organization_integration_secret_v1", { target_integration_id: integrationId, secret_value: secret });
  if (error) fail(error.message);
  revalidatePath("/integrations");
  redirect("/integrations?message=Credential%20updated%20securely.");
}

export async function grantAgentCapability(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const agentId = text(formData.get("agentId"));
  const integrationId = text(formData.get("integrationId"));
  const capabilityKey = text(formData.get("capabilityKey"));
  const approvalMode = text(formData.get("approvalMode"));
  if (!agentId || !integrationId || !capabilityKey || !approvalMode) fail("Agent, connection, capability and approval mode are required.");
  const { data: integration } = await context.supabase.from("organization_integrations").select("provider_key").eq("id", integrationId).eq("organization_id", context.organizationId).maybeSingle();
  if (!integration) fail("Connection is not part of this company.");
  const { data: capability } = await context.supabase.from("integration_capabilities").select("risk_level,default_approval_mode").eq("provider_key", integration.provider_key).eq("capability_key", capabilityKey).maybeSingle();
  if (!capability) fail("Capability is not valid for this provider.");
  if (capability.default_approval_mode === "human_only" && approvalMode !== "human_only") fail("This capability is Human Only and cannot be delegated.");
  if (capability.default_approval_mode === "approval_required" && approvalMode === "autonomous") fail("This high-risk capability requires approval and cannot be autonomous.");
  const { error } = await context.supabase.from("agent_integration_grants").upsert({
    organization_id: context.organizationId,
    agent_id: agentId,
    integration_id: integrationId,
    capability_key: capabilityKey,
    approval_mode: approvalMode,
    enabled: true,
    granted_by_user_id: context.user.id,
  }, { onConflict: "agent_id,integration_id,capability_key" });
  if (error) fail(error.message);
  revalidatePath("/integrations");
  redirect("/integrations?message=Agent%20permission%20updated.");
}

export async function revokeAgentCapability(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const grantId = text(formData.get("grantId"));
  if (!grantId) fail("Grant is required.");
  const { error } = await context.supabase.from("agent_integration_grants").update({ enabled: false }).eq("id", grantId).eq("organization_id", context.organizationId);
  if (error) fail(error.message);
  revalidatePath("/integrations");
}

export async function applyTemplateIntegrationProfile(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const integrationId = text(formData.get("integrationId"));
  const templateKey = text(formData.get("templateKey")) || "ready_software_company_v1";
  if (!integrationId) fail("Select a connected integration.");
  const { data, error } = await context.supabase.rpc("apply_company_template_integration_profile_v1", {
    target_org_id: context.organizationId,
    target_integration_id: integrationId,
    target_template_key: templateKey,
  });
  if (error || data == null) {
    console.error("template_integration_profile_failed", { organizationId: context.organizationId, integrationId, templateKey, error });
    fail(error?.message ?? "Recommended integration grants could not be applied.");
  }
  revalidatePath("/integrations");
  revalidatePath("/studio/templates");
  redirect(`/integrations?message=${encodeURIComponent(`${data} recommended least-privilege grants applied. Restricted capabilities remain Human Only.`)}`);
}
