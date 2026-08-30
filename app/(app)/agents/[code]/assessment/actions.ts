"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { runNextProfessionalBenchmark } from "@/lib/agent-professional-assessment";

export async function runProfessionalBenchmark(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const agentCode = String(formData.get("agentCode") ?? "").trim();
  if (!agentCode) redirect("/agents?error=Agent%20code%20is%20required.");

  try {
    const result = await runNextProfessionalBenchmark({
      supabase: context.supabase,
      organizationId: context.organizationId,
      userId: context.user.id,
      organizationName: context.organization.name,
    }, agentCode);
    const promotion = result.promotion?.promoted ? ` · promoted to ${result.promotion.target}` : "";
    revalidatePath(`/agents/${agentCode.toLowerCase()}`);
    revalidatePath(`/agents/${agentCode.toLowerCase()}/assessment`);
    redirect(`/agents/${agentCode.toLowerCase()}/assessment?message=${encodeURIComponent(`${result.scenario}: ${result.score}/100 · ${result.verdict}${promotion}`)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Professional benchmark failed.";
    redirect(`/agents/${agentCode.toLowerCase()}/assessment?error=${encodeURIComponent(message)}`);
  }
}
