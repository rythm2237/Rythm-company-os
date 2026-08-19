"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { buildAgentBlueprint, getAgentProviderOptions, parseList, type AgentBuilderInput, type AgentProvider } from "@/lib/agent-builder";
import { generateSystemInstruction } from "@/lib/ai/agent-provider";
import { getRuntimeConfig } from "@/lib/runtime-config";
import {
  acquireMissingFoundation,
  bindKnowledgePackage,
  buildKnowledgeInstructionOverlay,
  resolveKnowledgePackage,
  type ResolvedKnowledgePackage,
} from "@/lib/trusted-agent-knowledge";
import { acquireMissingSpecializations } from "@/lib/trusted-specialization-acquisition";
import { normalizeMasterRole } from "@/lib/master-role-normalizer";

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "The Agent request could not be completed.";
  if (/not active|not enabled|limit reached|owner authority|invalid|cannot|not found|not configured|empty Agent instruction|request failed|incomplete|foundation|knowledge|specialization|coverage|provision|trusted source|master|benchmark/i.test(message)) return message;
  return "The Agent request could not be completed. Refresh and retry.";
}

type ProvisioningContext = Awaited<ReturnType<typeof requireActiveOwnerOrganizationContext>>;

async function resolveWithSpecializationAcquisition(
  context: ProvisioningContext,
  agentId: string,
  roleTitle: string,
  expertise: string,
  provider: AgentProvider,
  model: string,
) {
  const normalized = normalizeMasterRole(roleTitle, expertise);
  try {
    return await resolveKnowledgePackage(context.supabase, normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("Professional specialization coverage is missing")) throw error;
    await acquireMissingSpecializations({
      supabase: context.supabase,
      organizationId: context.organizationId,
      agentId,
      normalized,
      provider,
      model,
    });
    return resolveKnowledgePackage(context.supabase, normalized);
  }
}

async function resolveOrAcquireKnowledge(
  context: ProvisioningContext,
  agentId: string,
  roleTitle: string,
  expertise: string,
  provider: AgentProvider,
  model: string,
) {
  const normalized = normalizeMasterRole(roleTitle, expertise);
  let knowledge = await resolveWithSpecializationAcquisition(context, agentId, roleTitle, expertise, provider, model);
  if (knowledge.fallbackUsed && normalized.roleFamily !== "general") {
    await context.supabase.from("agent_knowledge_provisioning_events").insert({
      organization_id: context.organizationId,
      agent_id: agentId,
      event_type: "acquisition_triggered",
      role_family: normalized.roleFamily,
      canonical_role: normalized.canonicalRole,
      metadata: { reason: "missing_active_foundation", mastery_required: true },
    });
    const acquiredId = await acquireMissingFoundation({ supabase: context.supabase, normalized, provider, model });
    if (acquiredId) knowledge = await resolveWithSpecializationAcquisition(context, agentId, roleTitle, expertise, provider, model);
    if (knowledge.fallbackUsed) throw new Error("Professional foundation could not be completed. No trusted source coverage was available for this position.");
  }
  return knowledge;
}

async function ensureKnowledgeBindings(
  context: ProvisioningContext,
  agentId: string,
  knowledge: ResolvedKnowledgePackage,
) {
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
    const { error: supersedeError } = await context.supabase
      .from("agent_role_foundation_bindings")
      .update({ status: "superseded" })
      .eq("id", activeFoundation.id)
      .eq("organization_id", context.organizationId);
    if (supersedeError) throw new Error(`Could not supersede old professional foundation: ${supersedeError.message}`);
    await context.supabase
      .from("agent_specialization_bindings")
      .update({ status: "detached" })
      .eq("organization_id", context.organizationId)
      .eq("agent_id", agentId)
      .eq("status", "active");
    await bindKnowledgePackage(context.supabase, context.organizationId, agentId, knowledge);
    return;
  }

  const { data: existingSpecs } = await context.supabase
    .from("agent_specialization_bindings")
    .select("specialization_id")
    .eq("organization_id", context.organizationId)
    .eq("agent_id", agentId)
    .eq("status", "active");
  const existingIds = new Set((existingSpecs ?? []).map((row: { specialization_id: string }) => row.specialization_id));
  const missing = knowledge.specializations.filter((item) => !existingIds.has(item.id));
  if (missing.length) {
    const { error } = await context.supabase.from("agent_specialization_bindings").insert(
      missing.map((item) => ({
        organization_id: context.organizationId,
        agent_id: agentId,
        specialization_id: item.id,
        status: "active",
      })),
    );
    if (error) throw new Error(`Could not bind specialization: ${error.message}`);
  }
  await context.supabase
    .from("agents")
    .update({ foundation_update_available: knowledge.updateAvailable })
    .eq("organization_id", context.organizationId)
    .eq("id", agentId);
}

async function finalizeMasterProvisioning(
  context: ProvisioningContext,
  agentId: string,
  input: AgentBuilderInput,
  provider: AgentProvider,
  model: string,
) {
  const knowledge = await resolveOrAcquireKnowledge(context, agentId, input.roleTitle, input.expertise, provider, model);
  await ensureKnowledgeBindings(context, agentId, knowledge);

  await context.supabase.from("agents").update({
    raw_role_title: knowledge.normalized.rawRoleTitle,
    canonical_role: knowledge.normalized.canonicalRole,
    role_family: knowledge.normalized.roleFamily,
    specializations: knowledge.normalized.specializations,
    company_knowledge_connected: true,
    company_knowledge_detached_at: null,
    professional_competency_level: "advanced",
    mastery_status: "pending",
    mastery_verified_at: null,
  }).eq("organization_id", context.organizationId).eq("id", agentId);

  await context.supabase.from("agent_knowledge_provisioning_events").insert({
    organization_id: context.organizationId,
    agent_id: agentId,
    event_type: "company_knowledge_connected",
    role_family: knowledge.normalized.roleFamily,
    canonical_role: knowledge.normalized.canonicalRole,
    metadata: { mode: "live_company_library_role_filtered", duplicated_into_foundation: false },
  });

  const masteryOverlay = [
    buildKnowledgeInstructionOverlay(knowledge),
    "MASTER-LEVEL PROFESSIONAL COMPETENCY GATE",
    "RYTHM evaluates this Agent against an internal Master-level Professional Competency Benchmark before Ready.",
    "This is a professional capability benchmark, not an academic degree, license, certification, or regulated professional credential.",
    "Use Company Library information as live tenant-scoped evidence only. Never absorb confidential company content into transferable professional knowledge.",
  ].join("\n");

  const blueprint = buildAgentBlueprint(input, masteryOverlay);
  const systemInstructions = await generateSystemInstruction({
    provider,
    model,
    blueprint,
    timeoutMs: getRuntimeConfig().agentTimeoutMs,
  });

  const { data: mastery, error: masteryError } = await context.supabase.rpc("verify_agent_mastery_v1", {
    target_agent_id: agentId,
  });
  if (masteryError) throw new Error(`Master-level competency verification failed: ${masteryError.message}`);
  if (!mastery || String((mastery as { status?: string }).status) !== "verified") {
    throw new Error("Master-level competency verification did not return a verified result.");
  }

  const { error: completeError } = await context.supabase.rpc("complete_agent_knowledge_provisioning_v1", {
    target_agent_id: agentId,
    target_system_instructions: systemInstructions,
  });
  if (completeError) throw completeError;
}

function agentInputFromRow(agent: any, departmentName: string): AgentBuilderInput {
  return {
    name: String(agent.name ?? "").trim(),
    roleTitle: String(agent.role_title ?? "").trim(),
    expertise: Array.isArray(agent.skills) && agent.skills.length ? agent.skills.join(", ") : String(agent.role_title ?? "").trim(),
    purpose: String(agent.purpose ?? "").trim(),
    departmentName,
    responsibilities: Array.isArray(agent.responsibilities) ? agent.responsibilities.map(String) : [],
    skills: Array.isArray(agent.skills) ? agent.skills.map(String) : [],
    kpis: Array.isArray(agent.kpis) ? agent.kpis.map(String) : [],
    language: String(agent.language ?? "English"),
    workStyle: String(agent.work_style ?? "Evidence-led and concise"),
    authorityLevel: Number(agent.authority_level ?? 1),
    riskCeiling: String(agent.risk_ceiling ?? "medium"),
    approvalRequirements: Array.isArray(agent.human_approval_requirements) ? agent.human_approval_requirements.map(String) : [],
    allowedTools: Array.isArray(agent.allowed_tools) ? agent.allowed_tools.map(String) : [],
  };
}

export async function generateMasterAgent(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  if (!context.entitlement.agent_builder_enabled || !context.entitlement.agent_create_enabled) {
    redirect("/studio/agents?error=Agent%20creation%20is%20not%20enabled%20for%20this%20organization.");
  }

  const provider = String(formData.get("provider") ?? "openai") as AgentProvider;
  const providerOption = getAgentProviderOptions().find((option) => option.id === provider);
  if (!providerOption || !providerOption.configured || !providerOption.model) {
    redirect(`/studio/agents?error=${encodeURIComponent("The selected AI provider is not configured yet.")}`);
  }

  const input: AgentBuilderInput = {
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

  const normalized = normalizeMasterRole(input.roleTitle, input.expertise);
  const { data: createdAgentId, error: createError } = await context.supabase.rpc("create_agent_provisioning_v3", {
    target_org_id: context.organizationId,
    target_name: input.name,
    target_role_title: input.roleTitle,
    target_purpose: input.purpose,
    target_runtime_provider: provider,
    target_runtime_model: providerOption.model,
    target_raw_role_title: normalized.rawRoleTitle,
    target_canonical_role: normalized.canonicalRole,
    target_role_family: normalized.roleFamily,
    target_specializations: normalized.specializations,
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

  if (createError || !createdAgentId) {
    redirect(`/studio/agents?error=${encodeURIComponent(safeError(createError ?? new Error("Provisioning Agent could not be created.")))}`);
  }

  const agentId = String(createdAgentId);
  try {
    await finalizeMasterProvisioning(context, agentId, input, provider, providerOption.model);
  } catch (error) {
    await context.supabase.from("agents").update({
      professional_competency_level: "advanced",
      mastery_status: "failed",
      mastery_verified_at: null,
    }).eq("organization_id", context.organizationId).eq("id", agentId);
    await context.supabase.rpc("fail_agent_knowledge_provisioning_v1", {
      target_agent_id: agentId,
      target_error: safeError(error),
    });
    revalidatePath("/studio/agents");
    revalidatePath(`/studio/agents/${agentId}`);
    revalidatePath("/agents");
    redirect(`/studio/agents/${agentId}?error=${encodeURIComponent(safeError(error))}`);
  }

  revalidatePath("/studio/agents");
  revalidatePath(`/studio/agents/${agentId}`);
  revalidatePath("/agents");
  redirect(`/studio/agents/${agentId}?message=${encodeURIComponent(`${input.name} is professionally provisioned and verified against the RYTHM Master-level competency benchmark. The Agent remains Paused for governance.`)}`);
}

export async function retryMasterAgentProvisioning(formData: FormData) {
  const context = await requireActiveOwnerOrganizationContext();
  const agentId = String(formData.get("agentId") ?? "").trim();
  const { data: agent, error } = await context.supabase.from("agents")
    .select("id,name,role_title,purpose,department_id,authority_level,risk_ceiling,language,work_style,responsibilities,skills,kpis,human_approval_requirements,allowed_tools,runtime_provider,runtime_model,agent_status")
    .eq("organization_id", context.organizationId).eq("id", agentId).maybeSingle();
  if (error || !agent) redirect(`/studio/agents?error=${encodeURIComponent("Agent not found in this organization.")}`);
  if (agent.agent_status === "archived") redirect(`/studio/agents/${agentId}?error=${encodeURIComponent("Archived Agents cannot be provisioned.")}`);

  const provider = String(agent.runtime_provider ?? "openai").toLowerCase() as AgentProvider;
  const model = String(agent.runtime_model ?? "").trim();
  if (!model || !["openai", "anthropic", "google"].includes(provider)) {
    redirect(`/studio/agents/${agentId}?error=${encodeURIComponent("This Agent has no supported configured runtime for provisioning.")}`);
  }

  const { data: department } = agent.department_id
    ? await context.supabase.from("departments").select("name").eq("organization_id", context.organizationId).eq("id", agent.department_id).maybeSingle()
    : { data: null };
  const input = agentInputFromRow(agent, String(department?.name ?? ""));

  await context.supabase.from("agents").update({
    provisioning_status: "provisioning",
    provisioning_error: null,
    provisioning_started_at: new Date().toISOString(),
    professional_competency_level: "advanced",
    mastery_status: "pending",
    mastery_verified_at: null,
  }).eq("organization_id", context.organizationId).eq("id", agentId);

  try {
    await finalizeMasterProvisioning(context, agentId, input, provider, model);
  } catch (provisioningError) {
    await context.supabase.from("agents").update({ mastery_status: "failed", mastery_verified_at: null })
      .eq("organization_id", context.organizationId).eq("id", agentId);
    await context.supabase.rpc("fail_agent_knowledge_provisioning_v1", {
      target_agent_id: agentId,
      target_error: safeError(provisioningError),
    });
    revalidatePath(`/studio/agents/${agentId}`);
    redirect(`/studio/agents/${agentId}?error=${encodeURIComponent(safeError(provisioningError))}`);
  }

  revalidatePath("/studio/agents");
  revalidatePath(`/studio/agents/${agentId}`);
  revalidatePath("/agents");
  redirect(`/studio/agents/${agentId}?message=${encodeURIComponent("Professional provisioning and Master-level competency verification completed successfully.")}`);
}
