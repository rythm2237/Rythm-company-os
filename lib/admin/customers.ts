import "server-only";
import { requirePlatformAdmin } from "@/lib/admin/authorization";

export type Customer = {
  id: string; name: string; status: string; website_url: string | null; country_code: string | null;
  created_at: string; owner_name: string | null; owner_email: string | null;
  plan_code: string | null; product_code: string | null; entitlement_status: string | null;
  onboarding_status: string | null; user_count: number; agent_count: number;
  active_agent_count: number; integration_count: number; last_activity: string | null;
};
export type CustomerDetail = {
  company: { id: string; name: string; slug: string; status: string; mission: string | null; vision: string | null; website_url: string | null; country_code: string | null; timezone: string | null; primary_email: string | null; primary_phone: string | null; created_at: string; owner_user_id: string | null };
  entitlement: { product_code: string; plan_code: string; status: string; starts_at: string | null; ends_at: string | null; max_active_agents: number; agent_builder_enabled: boolean; agent_create_enabled: boolean; agent_archive_enabled: boolean } | null;
  users: Array<{ user_id: string; name: string | null; email: string | null; role: string; membership_status: string; joined_at: string; onboarding_status: string | null }>;
  agents: Array<{ id: string; agent_code: string; name: string; role_title: string; purpose: string; agent_status: string; enabled: boolean; department: string | null; runtime_provider: string | null; runtime_model: string | null; created_at: string; allowed_tools: string[]; authority_level: number; risk_ceiling: string; recorded_cost_usd: number | null; last_activity: string | null; creator_id: string | null }>;
  integrations: Array<{ provider_key: string; display_name: string; status: string; enabled: boolean; last_verified_at: string | null; last_health_check_at: string | null; last_error_at: string | null }>;
  usage: { agent_cost_usd: number | null; projects: number; meetings: number; agent_runs: number; workspace_ai_requests: number; last_agent_run: string | null };
  billing: Array<{ status: string; currency: string; current_period_start: string | null; current_period_end: string | null; cancel_at_period_end: boolean }>;
  activity: Array<{ id: number; event_type: string; object_type: string; object_id: string | null; actor_user_id: string | null; actor_agent_id: string | null; created_at: string }>;
  last_activity: string | null;
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
