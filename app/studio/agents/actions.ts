"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";

function list(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "The Agent request could not be completed.";
  if (/not enabled|limit reached|owner authority|invalid|cannot|not found/i.test(message)) return message;
  return "The Agent request could not be completed. Refresh and retry.";
}

export async function createAgent(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const { error } = await context.supabase.rpc("create_agent_v1", {
    target_org_id: context.organizationId,
    target_name: String(formData.get("name") ?? ""),
    target_role_title: String(formData.get("roleTitle") ?? ""),
    target_purpose: String(formData.get("purpose") ?? ""),
    target_department_id: String(formData.get("departmentId") ?? "") || null,
    target_reports_to_agent_id: String(formData.get("reportsToAgentId") ?? "") || null,
    target_authority_level: Number(formData.get("authorityLevel") ?? 1),
    target_risk_ceiling: String(formData.get("riskCeiling") ?? "medium"),
    target_language: String(formData.get("language") ?? "English"),
    target_responsibilities: list(formData.get("responsibilities")),
    target_skills: list(formData.get("skills")),
    target_kpis: list(formData.get("kpis")),
    target_human_approval_requirements: list(formData.get("approvalRequirements")),
    target_allowed_tools: list(formData.get("allowedTools")),
  });
  if (error) redirect(`/studio/agents?error=${encodeURIComponent(safeError(error))}`);
  revalidatePath("/studio/agents");
  revalidatePath("/agents");
  redirect("/studio/agents?message=AI%20Agent%20created%20in%20Paused%20state.");
}

export async function updateAgent(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const agentId = String(formData.get("agentId") ?? "");
  const { error } = await context.supabase.rpc("update_agent_v1", {
    target_agent_id: agentId,
    target_name: String(formData.get("name") ?? ""),
    target_role_title: String(formData.get("roleTitle") ?? ""),
    target_purpose: String(formData.get("purpose") ?? ""),
    target_department_id: String(formData.get("departmentId") ?? "") || null,
    target_reports_to_agent_id: String(formData.get("reportsToAgentId") ?? "") || null,
    target_authority_level: Number(formData.get("authorityLevel") ?? 1),
    target_risk_ceiling: String(formData.get("riskCeiling") ?? "medium"),
    target_language: String(formData.get("language") ?? "English"),
    target_responsibilities: list(formData.get("responsibilities")),
    target_skills: list(formData.get("skills")),
    target_kpis: list(formData.get("kpis")),
    target_human_approval_requirements: list(formData.get("approvalRequirements")),
    target_allowed_tools: list(formData.get("allowedTools")),
  });
  if (error) redirect(`/studio/agents/${agentId}?error=${encodeURIComponent(safeError(error))}`);
  revalidatePath(`/studio/agents/${agentId}`);
  revalidatePath("/studio/agents");
  revalidatePath("/agents");
  redirect(`/studio/agents/${agentId}?message=Agent%20profile%20updated.`);
}

export async function setAgentStatus(formData: FormData) {
  await requireOwnerOrganizationContext();
  const agentId = String(formData.get("agentId") ?? "");
  const status = String(formData.get("status") ?? "paused");
  const context = await requireOwnerOrganizationContext();
  const { error } = await context.supabase.rpc("set_agent_status_v1", {
    target_agent_id: agentId,
    target_status: status,
  });
  if (error) redirect(`/studio/agents?error=${encodeURIComponent(safeError(error))}`);
  revalidatePath("/studio/agents");
  revalidatePath("/agents");
  redirect(`/studio/agents?message=${encodeURIComponent(`Agent status changed to ${status}.`)}`);
}

export async function cloneAgent(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const agentId = String(formData.get("agentId") ?? "");
  const { error } = await context.supabase.rpc("clone_agent_v1", { target_agent_id: agentId });
  if (error) redirect(`/studio/agents?error=${encodeURIComponent(safeError(error))}`);
  revalidatePath("/studio/agents");
  revalidatePath("/agents");
  redirect("/studio/agents?message=Agent%20cloned.%20The%20clone%20starts%20Paused.");
}
