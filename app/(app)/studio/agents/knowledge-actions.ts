"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";

export async function reconnectAgentCompanyKnowledge(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const agentId = String(formData.get("agentId") ?? "");
  const { error } = await context.supabase.rpc("reconnect_agent_company_knowledge_v1", { target_agent_id: agentId });
  if (error) redirect(`/studio/agents/${agentId}?error=${encodeURIComponent(error.message || "Company Knowledge could not be reconnected.")}`);
  revalidatePath(`/studio/agents/${agentId}`);
  revalidatePath(`/studio/agents/${agentId}/run`);
  redirect(`/studio/agents/${agentId}?message=${encodeURIComponent("Live Company Knowledge reconnected.")}`);
}
