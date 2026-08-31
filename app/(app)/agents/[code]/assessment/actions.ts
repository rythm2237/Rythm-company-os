"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { runNextProfessionalBenchmark } from "@/lib/agent-professional-assessment";
import { isAgencyProgressionRole, runAgencyNextLevelBenchmark } from "@/lib/agency-level-progression";

export async function runProfessionalBenchmark(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const agentCode = String(formData.get("agentCode") ?? "").trim();
  if (!agentCode) redirect("/agents?error=Agent%20code%20is%20required.");

  let resultMessage = "";
  let resultStatus = "pass";
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
    const result = isAgencyProgressionRole(agent.canonical_role)
      ? await runAgencyNextLevelBenchmark(assessmentContext, agentCode)
      : await runNextProfessionalBenchmark(assessmentContext, agentCode);

    const promotion = result.promotion?.promoted ? ` · promoted to ${result.promotion.target}` : "";
    resultMessage = `${result.scenario}: ${result.score}/100 · ${result.verdict}${promotion}`;
    resultStatus = String(result.verdict).toUpperCase() === "PASS" ? "pass" : "fail";
    revalidatePath("/agents");
    revalidatePath(`/agents/${agentCode.toLowerCase()}`);
    revalidatePath(`/agents/${agentCode.toLowerCase()}/assessment`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Professional benchmark failed.";
    redirect(`/agents/${agentCode.toLowerCase()}/assessment?error=${encodeURIComponent(message)}`);
  }

  redirect(`/agents/${agentCode.toLowerCase()}/assessment?message=${encodeURIComponent(resultMessage)}&status=${resultStatus}`);
}
