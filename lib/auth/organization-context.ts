import { redirect } from "next/navigation";
import { cache } from "react";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import type { CostStrategy, ModelTier } from "@/lib/ai/routing-types";

export const ACTIVE_ORGANIZATION_COOKIE = "rythm_active_org";

type MembershipRow = {
  organization_id: string;
  role: string;
};

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  owner_user_id: string | null;
  legal_name?: string | null;
  legal_entity_type?: string | null;
  registration_number?: string | null;
  tax_id?: string | null;
  vat_id?: string | null;
  country_code?: string | null;
  registered_address?: Record<string, unknown> | null;
  operating_address?: Record<string, unknown> | null;
  website_url?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  default_currency?: string | null;
  timezone?: string | null;
};

type OrganizationListRow = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  organization_status: string;
  owner_user_id: string | null;
  membership_role: string;
  is_active: boolean;
};

export type OrganizationEntitlement = {
  organization_id: string;
  product_code: "ready_company" | "custom_company" | "company_studio";
  plan_code: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  ai_budget_limit: number;
  company_template_access: boolean;
  company_builder_enabled: boolean;
  agent_builder_enabled: boolean;
  agent_create_enabled: boolean;
  agent_clone_enabled: boolean;
  agent_archive_enabled: boolean;
  agent_structure_edit_enabled: boolean;
  workflow_edit_enabled: boolean;
  max_active_agents: number;
  max_departments: number;
  max_projects: number;
  support_tier: string;
  allowed_model_tiers: ModelTier[];
  advanced_reasoning_enabled: boolean;
  preferred_cost_strategy: CostStrategy;
  max_ai_context_tokens: number | null;
  max_ai_cost_per_request: number | null;
};

export function isOrganizationEntitlementActive(entitlement: OrganizationEntitlement | null | undefined, now = new Date()) {
  if (!entitlement || entitlement.status !== "active") return false;
  const startsAt = entitlement.starts_at ? new Date(entitlement.starts_at) : null;
  const endsAt = entitlement.ends_at ? new Date(entitlement.ends_at) : null;
  if (startsAt && Number.isFinite(startsAt.valueOf()) && startsAt > now) return false;
  if (endsAt && Number.isFinite(endsAt.valueOf()) && endsAt <= now) return false;
  return true;
}

export type OrganizationContext = {
  supabase: Awaited<ReturnType<typeof createAuthServerClient>>;
  user: { id: string; email?: string };
  organizationId: string;
  organization: OrganizationRow;
  role: string;
  memberships: Array<MembershipRow & { organization: OrganizationRow }>;
  entitlement: OrganizationEntitlement | null;
};

const organizationProfileFields = "id,name,slug,status,owner_user_id,legal_name,legal_entity_type,registration_number,tax_id,vat_id,country_code,registered_address,operating_address,website_url,primary_email,primary_phone,default_currency,timezone";
const organizationEntitlementFields = "organization_id,product_code,plan_code,status,starts_at,ends_at,ai_budget_limit,company_template_access,company_builder_enabled,agent_builder_enabled,agent_create_enabled,agent_clone_enabled,agent_archive_enabled,agent_structure_edit_enabled,workflow_edit_enabled,max_active_agents,max_departments,max_projects,support_tier,allowed_model_tiers,advanced_reasoning_enabled,preferred_cost_strategy,max_ai_context_tokens,max_ai_cost_per_request";

async function legacyMembershipFallback(supabase: Awaited<ReturnType<typeof createAuthServerClient>>, userId: string) {
  const { data: membershipData } = await supabase.from("organization_members").select("organization_id,role").eq("user_id", userId);
  const membershipRows = (membershipData ?? []) as MembershipRow[];
  if (!membershipRows.length) return [];
  const organizationIds = [...new Set(membershipRows.map((row) => row.organization_id))];
  const { data: organizationData } = await supabase.from("organizations").select(organizationProfileFields).in("id", organizationIds);
  const organizationMap = new Map(((organizationData ?? []) as OrganizationRow[]).map((organization) => [organization.id, organization]));
  return membershipRows.map((membership) => {
    const organization = organizationMap.get(membership.organization_id);
    return organization ? { ...membership, organization, isActive: false } : null;
  }).filter((value): value is MembershipRow & { organization: OrganizationRow; isActive: boolean } => Boolean(value));
}

async function resolveOrganizationContextUncached(): Promise<OrganizationContext | null> {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: organizationListData, error: organizationListError } = await supabase.rpc("list_my_organizations");
  let memberships: Array<MembershipRow & { organization: OrganizationRow; isActive: boolean }> = [];
  if (!organizationListError && organizationListData) {
    memberships = (organizationListData as OrganizationListRow[]).map((row) => ({
      organization_id: row.organization_id,
      role: row.membership_role,
      isActive: row.is_active,
      organization: { id: row.organization_id, name: row.organization_name, slug: row.organization_slug, status: row.organization_status, owner_user_id: row.owner_user_id },
    }));
  } else {
    memberships = await legacyMembershipFallback(supabase, user.id);
  }
  if (!memberships.length) return null;
  const selectedMembership = memberships.find((item) => item.isActive) ?? memberships.find((item) => item.role === "owner") ?? memberships[0];
  const [{ data: profileData, error: profileError }, { data: entitlementData, error: entitlementError }] = await Promise.all([
    supabase.from("organizations").select(organizationProfileFields).eq("id", selectedMembership.organization_id).maybeSingle(),
    supabase.from("organization_entitlements").select(organizationEntitlementFields).eq("organization_id", selectedMembership.organization_id).maybeSingle(),
  ]);
  if (profileError && !organizationListError) console.error("organization_context_profile_query_failed", profileError);
  if (entitlementError && !organizationListError) console.error("organization_context_entitlement_query_failed", entitlementError);
  const organization = (profileData as OrganizationRow | null) ?? selectedMembership.organization;
  return {
    supabase,
    user: { id: user.id, email: user.email ?? undefined },
    organizationId: selectedMembership.organization_id,
    organization,
    role: selectedMembership.role,
    memberships: memberships.map(({ isActive: _isActive, ...membership }) => membership),
    entitlement: (entitlementData as OrganizationEntitlement | null) ?? null,
  };
}

export const resolveOrganizationContext = cache(resolveOrganizationContextUncached);

export async function requireOrganizationContext(): Promise<OrganizationContext> {
  const context = await resolveOrganizationContext();
  if (!context) redirect("/setup/company");
  return context;
}

export async function requireOwnerOrganizationContext(): Promise<OrganizationContext> {
  const context = await resolveOrganizationContext();
  if (!context) redirect("/setup/company");
  if (context.role !== "owner") redirect("/command-center?error=Owner%20authorization%20required.");
  return context;
}

export async function requireActiveOwnerOrganizationContext(): Promise<OrganizationContext & { entitlement: OrganizationEntitlement }> {
  const context = await requireOwnerOrganizationContext();
  if (!isOrganizationEntitlementActive(context.entitlement)) redirect("/activation?reason=entitlement_inactive");
  return context as OrganizationContext & { entitlement: OrganizationEntitlement };
}
