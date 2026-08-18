"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { buildAgentBlueprint, getAgentProviderOptions, parseList, type AgentProvider } from "@/lib/agent-builder";
import { generateSystemInstruction } from "@/lib/ai/agent-provider";
import { getRuntimeConfig } from "@/lib/runtime-config";

function list(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "The Agent request could not be completed.";
  if (/not active|not enabled|limit reached|owner authority|invalid|cannot|not found|not configured|empty Agent instruction|request failed|incomplete/i.test(message)) return message;
  return "The Agent request could not be completed. Refresh and retry.";
}

export async function generateAgent(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  if (!context.entitlement.agent_builder_enabled || !context.entitlement.agent_create_enabled) {
    redirect("/studio/agents?error=Agent%20creation%20is%20not%20enabled%20for%20this%20organization.");
  }

  const provider = String(formData.get("provider") ?? "openai") as AgentProvider;
  const providerOption = getAgentProviderOptions().find((option) => option.id === provider);
  if (!providerOption || !providerOption.configured || !providerOption.model) {
    redirect(`/studio/agents?error=${encodeURIComponent("The selected AI provider is not configured yet.")}`);
  }

  const input = {
    name: String(formData.get("name") ?? "").trim(),
    roleTitle: String(formData.get("roleTitle") ?? "").trim(),
    expertise: String(formData.get("expertise") ?? "").trim(),
    purpose: String(formData.get("purpose") ?? "").trim(),
    departmentName: String(formData.get("departmentName") ?? "").trim(),
    responsibilities: parseList(formData.get("responsibilities")),
    skills: parseList(formData.get("skills")),
    kpis: parseList(formData.get("kpis")),
    language: String(formData.get("language") ?? "English").trim() || "English",
    workStyle: String(formData.get("workStyle") ?? "Evidence-led and concise").trim(),
    authorityLevel: Number(formData.get("authorityLevel") ?? 1),
    riskCeiling: String(formData.get("riskCeiling") ?? "medium"),
    approvalRequirements: parseList(formData.get("approvalRequirements")),
    allowedTools: parseList(formData.get("allowedTools")),
  };

  if (input.name.length < 2 || input.roleTitle.length < 2 || input.purpose.length < 10 || input.expertise.length < 2) {
    redirect(`/studio/agents?error=${encodeURIComponent("Complete the Agent role, expertise, name, and mission before generating.")}`);
  }

  const blueprint = buildAgentBlueprint(input);
  let systemInstructions = "";
  try {
    systemInstructions = await generateSystemInstruction({
      provider,
      model: providerOption.model,
      blueprint,
      timeoutMs: getRuntimeConfig().agentTimeoutMs,
    });
  } catch (error) {
    redirect(`/studio/agents?error=${encodeURIComponent(safeError(error))}`);
  }

  const { error } = await context.supabase.rpc("create_agent_v2", {
    target_org_id: context.organizationId,
    target_name: input.name,
    target_role_title: input.roleTitle,
    target_purpose: input.purpose,
    target_system_instructions: systemInstructions,
    target_runtime_provider: provider,
    target_runtime_model: providerOption.model,
    target_department_id: String(formData.get("departmentId") ?? "") || null,
    target_reports_to_agent_id: String(formData.get("reportsToAgentId") ?? "") || null,
    target_authority_level: input.authorityLevel,
    target_risk_ceiling: input.riskCeiling,
    target_language: input.language,
    target_work_style: input.workStyle,
    target_responsibilities: input.responsibilities,
    target_skills: input.skills,
    target_kpis: input.kpis,
    target_human_approval_requirements: input.approvalRequirements,
    target_allowed_tools: input.allowedTools,
  });
  if (error) redirect(`/studio/agents?error=${encodeURIComponent(safeError(error))}`);
  revalidatePath("/studio/agents");
  revalidatePath("/agents");
  redirect(`/studio/agents?message=${encodeURIComponent(`${input.name} generated with ${providerOption.label} and saved in Paused state.`)}`);
}

export async function createAgent(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
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
  const context = await requireActiveOwnerOrganizationContext();
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
  const agentId = String(formData.get("agentId") ?? "");
  const status = String(formData.get("status") ?? "paused");
  const context = await requireActiveOwnerOrganizationContext();
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
  const context = await requireActiveOwnerOrganizationContext();
  const agentId = String(formData.get("agentId") ?? "");
  const { error } = await context.supabase.rpc("clone_agent_v1", { target_agent_id: agentId });
  if (error) redirect(`/studio/agents?error=${encodeURIComponent(safeError(error))}`);
  revalidatePath("/studio/agents");
  revalidatePath("/agents");
  redirect("/studio/agents?message=Agent%20cloned.%20The%20clone%20starts%20Paused.");
}
