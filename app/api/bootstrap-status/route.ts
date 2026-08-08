import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createAuthServerClient();
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ service:"RYTHM Company OS", status:"unauthorized" }, { status:401 });

  const { data:membership } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id",user.id)
    .eq("role","owner")
    .maybeSingle();
  if (!membership) return NextResponse.json({ service:"RYTHM Company OS", status:"forbidden" }, { status:403 });

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id,name,slug,status,owner_user_id")
    .eq("id", membership.organization_id)
    .maybeSingle();

  if (organizationError) {
    console.error("bootstrap_organization_query_failed", organizationError);
    return NextResponse.json({ service:"RYTHM Company OS", status:"error", code:"ORGANIZATION_QUERY_FAILED" }, { status:500 });
  }

  if (!organization) {
    return NextResponse.json({ service:"RYTHM Company OS", status:"pending", organization:"missing", agentB001:"unknown", companyMemory:"unknown" }, { status:404 });
  }

  const [{ data: agent, error: agentError }, { count: memoryCount, error: memoryError }] = await Promise.all([
    supabase
      .from("agents")
      .select("id,agent_code,name,role_title,authority_level,risk_ceiling,enabled,specification_version")
      .eq("organization_id", organization.id)
      .eq("agent_code", "B-001")
      .maybeSingle(),
    supabase
      .from("company_memory")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id),
  ]);

  if (agentError || memoryError) {
    console.error("bootstrap_diagnostic_query_failed", agentError ?? memoryError);
    return NextResponse.json({ service:"RYTHM Company OS", status:"error", code:"BOOTSTRAP_QUERY_FAILED" }, { status:500 });
  }

  return NextResponse.json({
    service: "RYTHM Company OS",
    status: agent ? "ready" : "partial",
    organization: {
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      ownerLinked: Boolean(organization.owner_user_id),
    },
    agentB001: agent
      ? {
          code: agent.agent_code,
          name: agent.name,
          role: agent.role_title,
          authorityLevel: agent.authority_level,
          riskCeiling: agent.risk_ceiling,
          enabled: agent.enabled,
          specificationVersion: agent.specification_version,
        }
      : "missing",
    companyMemoryRecords: memoryCount ?? 0,
  });
}
