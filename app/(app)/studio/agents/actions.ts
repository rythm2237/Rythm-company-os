"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { buildAgentBlueprint, getAgentProviderOptions, parseList, type AgentProvider } from "@/lib/agent-builder";
import { generateSystemInstruction } from "@/lib/ai/agent-provider";
import { getRuntimeConfig } from "@/lib/runtime-config";
import {
  acquireMissingFoundation,
  bindKnowledgePackage,
  buildKnowledgeInstructionOverlay,
  normalizeRole,
  resolveKnowledgePackage,
  type ResolvedKnowledgePackage,
} from "@/lib/trusted-agent-knowledge";

function list(value: FormDataEntryValue | null) {
  return String(value ?? "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "The Agent request could not be completed.";
  if (/not active|not enabled|limit reached|owner authority|invalid|cannot|not found|not configured|empty Agent instruction|request failed|incomplete|foundation|knowledge|specialization|coverage|provision/i.test(message)) return message;
  return "The Agent request could not be completed. Refresh and retry.";
}

type ProvisioningContext = Awaited<ReturnType<typeof requireActiveOwnerOrganizationContext>>;

async function resolveOrAcquireKnowledge(context: ProvisioningContext, agentId: string, roleTitle: string, provider: AgentProvider, model: string) {
  const normalized = normalizeRole(roleTitle);
  let knowledge = await resolveKnowledgePackage(context.supabase, normalized);
  if (knowledge.fallbackUsed && normalized.roleFamily !== "general") {
    await context.supabase.from("agent_knowledge_provisioning_events").insert({
      organization_id: context.organizationId,
      agent_id: agentId,
      event_type: "acquisition_triggered",
      role_family: normalized.roleFamily,
      canonical_role: normalized.canonicalRole,
      metadata: { reason: "missing_active_foundation" },
    });
    const acquiredId = await acquireMissingFoundation({ supabase: context.supabase, normalized, provider, model });
    if (acquiredId) knowledge = await resolveKnowledgePackage(context.supabase, normalized);
    if (knowledge.fallbackUsed) throw new Error("Professional foundation could not be completed. No trusted source coverage was available for this position.");
  }
  return knowledge;
}

async function ensureKnowledgeBindings(context: ProvisioningContext, agentId: string, knowledge: ResolvedKnowledgePackage) {
  const { data: activeFoundation } = await context.supabase
    .from("agent_role_foundation_bindings")
    .select("id,role_foundation_id")
    .eq("organization_id", context.organizationId)
    .eq("agent_id", agentId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!activeFoundation) {
    await bindKnowledgePackage(context.supabase, context.organizationId, agentId, knowledge);
    return;
  }

  if (activeFoundation.role_foundation_id !== knowledge.foundation.id) {
    const { error: supersedeError } = await context.supabase.from("agent_role_foundation_bindings").update({ status: "superseded" }).eq("id", activeFoundation.id).eq("organization_id", context.organizationId);
    if (supersedeError) throw new Error(`Could not supersede old professional foundation: ${supersedeError.message}`);
    await context.supabase.from("agent_specialization_bindings").update({ status: "detached" }).eq("organization_id", context.organizationId).eq("agent_id", agentId).eq("status", "active");
    await bindKnowledgePackage(context.supabase, context.organizationId, agentId, knowledge);
    return;
  }

  const { data: existingSpecs } = await context.supabase.from("agent_specialization_bindings").select("specialization_id").eq("organization_id", context.organizationId).eq("agent_id", agentId).eq("status", "active");
  const existingIds = new Set((existingSpecs ?? []).map((row: { specialization_id: string }) => row.specialization_id));
  const missing = knowledge.specializations.filter((item) => !existingIds.has(item.id));
  if (missing.length) {
    const { error } = await context.supabase.from("agent_specialization_bindings").insert(missing.map((item) => ({ organization_id: context.organizationId, agent_id: agentId, specialization_id: item.id, status: "active" })));
    if (error) throw new Error(`Could not bind specialization: ${error.message}`);
  }
  await context.supabase.from("agents").update({ foundation_update_available: knowledge.updateAvailable }).eq("organization_id", context.organizationId).eq("id", agentId);
}

async function finalizeProfessionalProvisioning(context: ProvisioningContext, agentId: string, input: Parameters<typeof buildAgentBlueprint>[0], provider: AgentProvider, model: string) {
  const knowledge = await resolveOrAcquireKnowledge(context, agentId, input.roleTitle, provider, model);
  await ensureKnowledgeBindings(context, agentId, knowledge);
  await context.supabase.from("agent_knowledge_provisioning_events").insert({
    organization_id: context.organizationId,
    agent_id: agentId,
    event_type: "company_knowledge_connected",
    role_family: knowledge.normalized.roleFamily,
    canonical_role: knowledge.normalized.canonicalRole,
    metadata: { mode: "live_role_filtered", duplicated_into_foundation: false },
  });

  const blueprint = buildAgentBlueprint(input, buildKnowledgeInstructionOverlay(knowledge));
  const systemInstructions = await generateSystemInstruction({ provider, model, blueprint, timeoutMs: getRuntimeConfig().agentTimeoutMs });
  const { error: completeError } = await context.supabase.rpc("complete_agent_knowledge_provisioning_v1", { target_agent_id: agentId, target_system_instructions: systemInstructions });
  if (completeError) throw completeError;
}

export async function generateAgent(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  if (!context.entitlement.agent_builder_enabled || !context.entitlement.agent_create_enabled) redirect("/studio/agents?error=Agent%20creation%20is%20not%20enabled%20for%20this%20organization.");

  const provider = String(formData.get("provider") ?? "openai") as AgentProvider;
  const providerOption = getAgentProviderOptions().find((option) => option.id === provider);
  if (!providerOption || !providerOption.configured || !providerOption.model) redirect(`/studio/agents?error=${encodeURIComponent("The selected AI provider is not configured yet.")}`);

  const input = {
    name: String(formData.get("name") ?? "").trim(), roleTitle: String(formData.get("roleTitle") ?? "").trim(), expertise: String(formData.get("expertise") ?? "").trim(), purpose: String(formData.get("purpose") ?? "").trim(), departmentName: String(formData.get("departmentName") ?? "").trim(),
    responsibilities: parseList(formData.get("responsibilities")), skills: parseList(formData.get("skills")), kpis: parseList(formData.get("kpis")), language: String(formData.get("language") ?? "English").trim() || "English", workStyle: String(formData.get("workStyle") ?? "Evidence-led and concise").trim(), authorityLevel: Number(formData.get("authorityLevel") ?? 1), riskCeiling: String(formData.get("riskCeiling") ?? "medium"), approvalRequirements: parseList(formData.get("approvalRequirements")), allowedTools: parseList(formData.get("allowedTools")),
  };
  if (input.name.length < 2 || input.roleTitle.length < 2 || input.purpose.length < 10 || input.expertise.length < 2) redirect(`/studio/agents?error=${encodeURIComponent("Complete the Agent role, expertise, name, and mission before generating.")}`);

  const normalized = normalizeRole(input.roleTitle);
  const { data: createdAgentId, error: createError } = await context.supabase.rpc("create_agent_provisioning_v3", {
    target_org_id: context.organizationId, target_name: input.name, target_role_title: input.roleTitle, target_purpose: input.purpose, target_runtime_provider: provider, target_runtime_model: providerOption.model,
    target_raw_role_title: normalized.rawRoleTitle, target_canonical_role: normalized.canonicalRole, target_role_family: normalized.roleFamily, target_specializations: normalized.specializations,
    target_department_id: String(formData.get("departmentId") ?? "") || null, target_reports_to_agent_id: String(formData.get("reportsToAgentId") ?? "") || null,
    target_authority_level: input.authorityLevel, target_risk_ceiling: input.riskCeiling, target_language: input.language, target_work_style: input.workStyle, target_responsibilities: input.responsibilities, target_skills: input.skills, target_kpis: input.kpis, target_human_approval_requirements: input.approvalRequirements, target_allowed_tools: input.allowedTools,
  });
  if (createError || !createdAgentId) redirect(`/studio/agents?error=${encodeURIComponent(safeError(createError ?? new Error("Provisioning Agent could not be created.")))}`);
  const agentId = String(createdAgentId);

  try {
    await finalizeProfessionalProvisioning(context, agentId, input, provider, providerOption.model);
  } catch (error) {
    await context.supabase.rpc("fail_agent_knowledge_provisioning_v1", { target_agent_id: agentId, target_error: safeError(error) });
    revalidatePath("/studio/agents"); revalidatePath(`/studio/agents/${agentId}`); revalidatePath("/agents");
    redirect(`/studio/agents/${agentId}?error=${encodeURIComponent(safeError(error))}`);
  }

  revalidatePath("/studio/agents"); revalidatePath(`/studio/agents/${agentId}`); revalidatePath("/agents");
  redirect(`/studio/agents/${agentId}?message=${encodeURIComponent(`${input.name} professional provisioning completed. The Agent is knowledge-ready and remains Paused for governance.`)}`);
}

export async function retryAgentProvisioning(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const agentId = String(formData.get("agentId") ?? "");
  const { data: agent, error } = await context.supabase.from("agents").select("id,name,role_title,purpose,department_id,authority_level,risk_ceiling,language,work_style,responsibilities,skills,kpis,human_approval_requirements,allowed_tools,runtime_provider,runtime_model,agent_status").eq("organization_id", context.organizationId).eq("id", agentId).maybeSingle();
  if (error || !agent) redirect(`/studio/agents?error=${encodeURIComponent("Agent not found in this organization.")}`);
  if (agent.agent_status === "archived") redirect(`/studio/agents/${agentId}?error=${encodeURIComponent("Archived Agents cannot be provisioned.")}`);
  const provider = String(agent.runtime_provider ?? "openai") as AgentProvider;
  const model = String(agent.runtime_model ?? "").trim();
  if (!model || !["openai", "anthropic", "google"].includes(provider)) redirect(`/studio/agents/${agentId}?error=${encodeURIComponent("This Agent has no supported configured runtime for provisioning.")}`);

  const { data: department } = agent.department_id ? await context.supabase.from("departments").select("name").eq("organization_id", context.organizationId).eq("id", agent.department_id).maybeSingle() : { data: null };
  const retryInput = {
    name: String(agent.name), roleTitle: String(agent.role_title), expertise: (agent.skills ?? []).join(", ") || String(agent.role_title), purpose: String(agent.purpose), departmentName: department?.name ?? "",
    responsibilities: agent.responsibilities ?? [], skills: agent.skills ?? [], kpis: agent.kpis ?? [], language: agent.language ?? "English", workStyle: agent.work_style ?? "Evidence-led and concise", authorityLevel: Number(agent.authority_level ?? 1), riskCeiling: String(agent.risk_ceiling ?? "medium"), approvalRequirements: agent.human_approval_requirements ?? [], allowedTools: agent.allowed_tools ?? [],
  };
  await context.supabase.from("agents").update({ provisioning_status: "provisioning", provisioning_error: null, provisioning_started_at: new Date().toISOString() }).eq("organization_id", context.organizationId).eq("id", agentId);

  try {
    await finalizeProfessionalProvisioning(context, agentId, retryInput, provider, model);
  } catch (provisioningError) {
    await context.supabase.rpc("fail_agent_knowledge_provisioning_v1", { target_agent_id: agentId, target_error: safeError(provisioningError) });
    revalidatePath(`/studio/agents/${agentId}`);
    redirect(`/studio/agents/${agentId}?error=${encodeURIComponent(safeError(provisioningError))}`);
  }

  revalidatePath("/studio/agents"); revalidatePath(`/studio/agents/${agentId}`); revalidatePath("/agents");
  redirect(`/studio/agents/${agentId}?message=${encodeURIComponent("Professional provisioning completed successfully.")}`);
}

export async function createAgent(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const { error } = await context.supabase.rpc("create_agent_v1", { target_org_id: context.organizationId, target_name: String(formData.get("name") ?? ""), target_role_title: String(formData.get("roleTitle") ?? ""), target_purpose: String(formData.get("purpose") ?? ""), target_department_id: String(formData.get("departmentId") ?? "") || null, target_reports_to_agent_id: String(formData.get("reportsToAgentId") ?? "") || null, target_authority_level: Number(formData.get("authorityLevel") ?? 1), target_risk_ceiling: String(formData.get("riskCeiling") ?? "medium"), target_language: String(formData.get("language") ?? "English"), target_responsibilities: list(formData.get("responsibilities")), target_skills: list(formData.get("skills")), target_kpis: list(formData.get("kpis")), target_human_approval_requirements: list(formData.get("approvalRequirements")), target_allowed_tools: list(formData.get("allowedTools")) });
  if (error) redirect(`/studio/agents?error=${encodeURIComponent(safeError(error))}`);
  revalidatePath("/studio/agents"); revalidatePath("/agents"); redirect("/studio/agents?message=AI%20Agent%20created%20in%20Paused%20state.");
}

export async function updateAgent(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext(); const agentId = String(formData.get("agentId") ?? "");
  const { error } = await context.supabase.rpc("update_agent_v1", { target_agent_id: agentId, target_name: String(formData.get("name") ?? ""), target_role_title: String(formData.get("roleTitle") ?? ""), target_purpose: String(formData.get("purpose") ?? ""), target_department_id: String(formData.get("departmentId") ?? "") || null, target_reports_to_agent_id: String(formData.get("reportsToAgentId") ?? "") || null, target_authority_level: Number(formData.get("authorityLevel") ?? 1), target_risk_ceiling: String(formData.get("riskCeiling") ?? "medium"), target_language: String(formData.get("language") ?? "English"), target_responsibilities: list(formData.get("responsibilities")), target_skills: list(formData.get("skills")), target_kpis: list(formData.get("kpis")), target_human_approval_requirements: list(formData.get("approvalRequirements")), target_allowed_tools: list(formData.get("allowedTools")) });
  if (error) redirect(`/studio/agents/${agentId}?error=${encodeURIComponent(safeError(error))}`);
  revalidatePath(`/studio/agents/${agentId}`); revalidatePath("/studio/agents"); revalidatePath("/agents"); redirect(`/studio/agents/${agentId}?message=Agent%20profile%20updated.`);
}

export async function setAgentStatus(formData: FormData) {
  const agentId = String(formData.get("agentId") ?? ""); const status = String(formData.get("status") ?? "paused"); const context = await requireActiveOwnerOrganizationContext();
  const { error } = await context.supabase.rpc("set_agent_status_v1", { target_agent_id: agentId, target_status: status });
  if (error) redirect(`/studio/agents?error=${encodeURIComponent(safeError(error))}`);
  revalidatePath("/studio/agents"); revalidatePath("/agents"); redirect(`/studio/agents?message=${encodeURIComponent(`Agent status changed to ${status}.`)}`);
}

export async function cloneAgent(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext(); const agentId = String(formData.get("agentId") ?? "");
  const { error } = await context.supabase.rpc("clone_agent_v1", { target_agent_id: agentId });
  if (error) redirect(`/studio/agents?error=${encodeURIComponent(safeError(error))}`);
  revalidatePath("/studio/agents"); revalidatePath("/agents"); redirect("/studio/agents?message=Agent%20cloned.%20The%20clone%20starts%20Paused.");
}
