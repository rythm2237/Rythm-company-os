import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

const ORGANIZATION_EXPORT_TABLES = [
  "action_items",
  "agent_runs",
  "agents",
  "approval_requests",
  "audit_events",
  "company_builder_drafts",
  "company_events",
  "company_memory",
  "decisions",
  "departments",
  "entity_relationships",
  "intake_items",
  "meeting_agent_messages",
  "meeting_agent_participants",
  "meeting_agent_sessions",
  "meeting_legal_reviews",
  "meeting_participants",
  "meetings",
  "operational_incidents",
  "organization_entitlements",
  "organization_members",
  "organization_support_access",
  "organization_template_installations",
  "project_agents",
  "project_context_documents",
  "project_kpis",
  "project_milestones",
  "project_progress_events",
  "project_progress_nodes",
  "project_resources",
  "project_strategy_analyses",
  "project_strategy_briefs",
  "projects",
  "runtime_policies",
  "strategy_work_requests",
] as const;

function safeFilenamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "organization";
}

export async function GET(request: NextRequest) {
  const supabase = await createAuthServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const requestedOrganizationId = request.nextUrl.searchParams.get("organizationId");
  let organizationId = requestedOrganizationId;

  if (!organizationId) {
    const { data: profile, error: profileError } = await supabase
      .from("customer_profiles")
      .select("active_organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("privacy_export_profile_lookup_failed", profileError);
      return NextResponse.json({ error: "EXPORT_LOOKUP_FAILED" }, { status: 500 });
    }

    organizationId = profile?.active_organization_id ?? null;
  }

  if (!organizationId) {
    return NextResponse.json({ error: "ORGANIZATION_REQUIRED" }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (membershipError) {
    console.error("privacy_export_membership_lookup_failed", membershipError);
    return NextResponse.json({ error: "EXPORT_LOOKUP_FAILED" }, { status: 500 });
  }

  if (!membership) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const [{ data: organization, error: organizationError }, { data: profile, error: customerProfileError }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", organizationId).single(),
    supabase.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  if (organizationError || customerProfileError || !organization) {
    console.error("privacy_export_identity_data_failed", organizationError ?? customerProfileError);
    return NextResponse.json({ error: "EXPORT_FAILED" }, { status: 500 });
  }

  const exportedTables: Record<string, unknown[]> = {};

  for (const table of ORGANIZATION_EXPORT_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("organization_id", organizationId)
      .range(0, 9999);

    if (error) {
      console.error("privacy_export_table_failed", { table, code: error.code });
      return NextResponse.json({ error: "EXPORT_FAILED", table }, { status: 500 });
    }

    exportedTables[table] = data ?? [];
  }

  const generatedAt = new Date().toISOString();
  const exportPayload = {
    schemaVersion: "2026-08-14.1",
    generatedAt,
    scope: "organization-owner-export",
    requester: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    customerProfile: profile,
    organization,
    tables: exportedTables,
    notes: [
      "This export contains active RYTHM application data available to the authenticated organization owner at generation time.",
      "Provider backups, security secrets, privileged credentials, anti-abuse signals, and data outside the requester's authorized organization are not included.",
    ],
  };

  const filename = `rythm-data-export-${safeFilenamePart(organization.slug ?? organization.name)}-${generatedAt.slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
