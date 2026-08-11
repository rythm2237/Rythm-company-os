import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const ACTIVE_ORGANIZATION_COOKIE = "rythm_active_org";

type MembershipRow = {
  organization_id: string;
  role: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  owner_user_id: string | null;
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
};

export type OrganizationContext = {
  supabase: Awaited<ReturnType<typeof createAuthServerClient>>;
  user: { id: string; email?: string };
  organizationId: string;
  organization: OrganizationRow;
  role: string;
  memberships: Array<MembershipRow & { organization: OrganizationRow }>;
  entitlement: OrganizationEntitlement | null;
};

async function legacyMembershipFallback(
  supabase: Awaited<ReturnType<typeof createAuthServerClient>>,
  userId: string,
) {
  const { data: membershipData } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", userId);

  const membershipRows = (membershipData ?? []) as MembershipRow[];
  if (!membershipRows.length) return [];

  const organizationIds = [...new Set(membershipRows.map((row) => row.organization_id))];
  const { data: organizationData } = await supabase
    .from("organizations")
    .select("id,name,slug,status,owner_user_id")
    .in("id", organizationIds);

  const organizationMap = new Map(
    ((organizationData ?? []) as OrganizationRow[]).map((organization) => [organization.id, organization]),
  );

  return membershipRows
    .map((membership) => {
      const organization = organizationMap.get(membership.organization_id);
      return organization ? { ...membership, organization, isActive: false } : null;
    })
    .filter((value): value is MembershipRow & { organization: OrganizationRow; isActive: boolean } => Boolean(value));
}

export async function resolveOrganizationContext(): Promise<OrganizationContext | null> {
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
      organization: {
        id: row.organization_id,
        name: row.organization_name,
        slug: row.organization_slug,
        status: row.organization_status,
        owner_user_id: row.owner_user_id,
      },
    }));
  } else {
    // Allows Preview/pre-migration login surfaces to render. After Day 2 migration,
    // list_my_organizations() is the canonical membership-discovery path.
    memberships = await legacyMembershipFallback(supabase, user.id);
  }

  if (!memberships.length) return null;

  const selectedMembership =
    memberships.find((item) => item.isActive) ??
    memberships.find((item) => item.role === "owner") ??
    memberships[0];

  const { data: entitlementData, error: entitlementError } = await supabase
    .rpc("resolve_organization_entitlement", { target_org_id: selectedMembership.organization_id })
    .maybeSingle();

  if (entitlementError && !organizationListError) {
    console.error("organization_context_entitlement_query_failed", entitlementError);
  }

  return {
    supabase,
    user: { id: user.id, email: user.email ?? undefined },
    organizationId: selectedMembership.organization_id,
    organization: selectedMembership.organization,
    role: selectedMembership.role,
    memberships: memberships.map(({ isActive: _isActive, ...membership }) => membership),
    entitlement: (entitlementData as OrganizationEntitlement | null) ?? null,
  };
}

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
