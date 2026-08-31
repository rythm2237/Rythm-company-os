"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { runNextProfessionalBenchmark } from "@/lib/agent-professional-assessment";
import { isAgencySpecialistRole, runAgencySpecialistBenchmark } from "@/lib/agency-specialist-assessment";

export async function runProfessionalBenchmark(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const agentCode = String(formData.get("agentCode") ?? "").trim();
  if (!agentCode) redirect("/agents?error=Agent%20code%20is%20required.");

  try {
    const { data: agent } = await context.supabase
      .from("agents")
      .select("canonical_role")
      .eq("organization_id", context.organizationId)
      .ilike("agent_code", agentCode)
      .maybeSingle();
    if (!agent) throw new Error("Agent is not part of this company.");

    const assessmentContext = {
      supabase: context.supabase,
      organizationId: context.organizationId,
      userId: context.user.id,
      organizationName: context.organization.name,
    };
    const result = isAgencySpecialistRole(agent.canonical_role)
      ? await runAgencySpecialistBenchmark(assessmentContext, agentCode)
      : await runNextProfessionalBenchmark(assessmentContext, agentCode);

    const promotion = result.promotion?.promoted ? ` · promoted to ${result.promotion.target}` : "";
    revalidatePath(`/agents/${agentCode.toLowerCase()}`);
    revalidatePath(`/agents/${agentCode.toLowerCase()}/assessment`);
    redirect(`/agents/${agentCode.toLowerCase()}/assessment?message=${encodeURIComponent(`${result.scenario}: ${result.score}/100 · ${result.verdict}${promotion}`)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Professional benchmark failed.";
    redirect(`/agents/${agentCode.toLowerCase()}/assessment?error=${encodeURIComponent(message)}`);
  }
}
