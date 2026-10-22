import type { SupabaseClient } from "@supabase/supabase-js";

/** Exact domain capabilities; never use canonical action expansion for confidential data. */
export async function canCrm(client: SupabaseClient, organizationId: string, capability: string, resourceType = "company", resourceId = organizationId): Promise<boolean> {
  const { data, error } = await client.rpc("crm_can", { p_organization_id: organizationId, p_capability: capability, p_resource_type: resourceType, p_resource_id: resourceId });
  return !error && data === true;
}
export async function requireCrm(client: SupabaseClient, organizationId: string, capability: string, resourceType = "company", resourceId = organizationId) {
  if (!await canCrm(client, organizationId, capability, resourceType, resourceId)) throw new Error("This operation requires explicit authorization.");
}
export const CUSTOMER_FIELDS = "id,name,account_type,customer_status,legal_name,registration_number,vat_number,address,preferred_language,tags,industry,country_code,website_url,phone,owner_user_id,source,notes,created_at,updated_at";
export const CRM_CAPABILITIES = ["customer.read","customer.create","customer.update","customer.archive","contract.read","contract.create","contract.update","contract.approve","contract.manage_access","finance.read","finance.create","finance.update","finance.approve","finance.manage_access","project.read","project.create","project.update","project.assign_manager","project.manage_access"] as const;
