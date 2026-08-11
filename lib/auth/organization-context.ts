import { cookies } from "next/headers";
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

export async function resolveOrganizationContext(): Promise<OrganizationContext | null> {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membershipData, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", user.id);

  if (membershipError) {
    console.error("organization_context_membership_query_failed", membershipError);
    return null;
  }

  const membershipRows = (membershipData ?? []) as MembershipRow[];
  if (!membershipRows.length) return null;

  const organizationIds = [...new Set(membershipRows.map((row) => row.organization_id))];
  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations")
    .select("id,name,slug,status,owner_user_id")
    .in("id", organizationIds);

  if (organizationError) {
    console.error("organization_context_organization_query_failed", organizationError);
    return null;
  }

  const organizationMap = new Map(
    ((organizationData ?? []) as OrganizationRow[]).map((organization) => [organization.id, organization]),
  );

  const memberships = membershipRows
    .map((membership) => {
      const organization = organizationMap.get(membership.organization_id);
      return organization ? { ...membership, organization } : null;
    })
    .filter((value): value is MembershipRow & { organization: OrganizationRow } => Boolean(value));

  if (!memberships.length) return null;

  const cookieStore = await cookies();
  const requestedOrganizationId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? "";
  const selectedMembership =
    memberships.find((item) => item.organization_id === requestedOrganizationId) ??
    memberships.find((item) => item.role === "owner") ??
    memberships[0];

  const { data: entitlementData, error: entitlementError } = await supabase
    .rpc("resolve_organization_entitlement", { target_org_id: selectedMembership.organization_id })
    .maybeSingle();

  if (entitlementError) {
    console.error("organization_context_entitlement_query_failed", entitlementError);
  }

  return {
    supabase,
    user: { id: user.id, email: user.email ?? undefined },
    organizationId: selectedMembership.organization_id,
    organization: selectedMembership.organization,
    role: selectedMembership.role,
    memberships,
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
