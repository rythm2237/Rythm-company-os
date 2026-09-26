import "server-only";
import { requirePlatformAdmin } from "@/lib/admin/authorization";

// Platform support receives service metadata and aggregate counts only.
// Do not add customer-authored content, personal identities, or per-user activity.
export type Customer = {
  id: string; name: string; status: string; created_at: string;
  plan_code: string | null; product_code: string | null; entitlement_status: string | null;
  user_count: number; agent_count: number; active_agent_count: number; integration_count: number;
};
export type CustomerDetail = {
  company: Pick<Customer, "id" | "name" | "status" | "created_at">;
  entitlement: { product_code: string; plan_code: string; status: string; starts_at: string | null; ends_at: string | null; max_active_agents: number; agent_builder_enabled: boolean; agent_create_enabled: boolean; agent_archive_enabled: boolean } | null;
  counts: { users: number; memberships: number; agents: number; enabled_agents: number; archived_agents: number; integrations: number; connected_integrations: number };
};
export async function listCustomers(input: { search: string; status: string; sort: string; page: number }) {
  const { supabase } = await requirePlatformAdmin();
  const { data, error } = await supabase.rpc("platform_customer_list_v1", { p_search: input.search, p_status: input.status, p_sort: input.sort, p_page: input.page });
  if (error || !data) throw new Error("Customer inventory is temporarily unavailable. Please retry.");
  return data as { total: number; items: Customer[] };
}
export async function getCustomer(id: string) {
  const { supabase } = await requirePlatformAdmin();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const { data, error } = await supabase.rpc("platform_customer_detail_v1", { p_organization_id: id });
  if (error) throw new Error("Company details are temporarily unavailable. Please retry.");
  return data as CustomerDetail | null;
}
export function display(value: string | number | null | undefined) { return value === null || value === undefined || value === "" ? "Not provided" : String(value); }
export function date(value: string | null | undefined) { return value ? new Date(value).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC" : "Not recorded"; }
export function product(value: string | null | undefined) { return value ? ({ ready_company: "Ready Company", custom_company: "Custom Company", company_studio: "Company Studio" }[value] ?? value) : "Not provided"; }
