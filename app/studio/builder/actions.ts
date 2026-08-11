"use server";

import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";

type ProposedDepartment = {
  key: string;
  name: string;
  description: string;
};

type ProposedAgent = {
  role_code: string;
  name: string;
  role: string;
  department_key: string;
  purpose: string;
  authority_level: number;
  risk_ceiling: "low" | "medium" | "high";
  responsibilities: string[];
  skills: string[];
};

function splitList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeAuthority(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(4, Math.max(0, Math.trunc(parsed)));
}

function createProposal(companyType: string, services: string[], capabilities: string[], authority: number) {
  const departments: ProposedDepartment[] = [
    { key: "strategy", name: "Strategy", description: "Company direction, planning and cross-functional synthesis." },
    { key: "operations", name: "Operations", description: "Internal execution planning, process coordination and action follow-through." },
    { key: "delivery", name: "Customer & Delivery", description: "Requirement intake, service delivery coordination and quality control." },
    { key: "analytics", name: "Analytics", description: "Measurement, evidence review and performance interpretation." },
  ];

  const serviceContext = services.length ? services.join(", ") : companyType;
  const capabilityContext = capabilities.length ? capabilities.join(", ") : "general business operations";

  const agents: ProposedAgent[] = [
    {
      role_code: "STRATEGY_ANALYST",
      name: "Strategy Analyst",
      role: "Strategy Analyst",
      department_key: "strategy",
      purpose: `Develop governed strategy for ${serviceContext}.`,
      authority_level: Math.min(authority, 2),
      risk_ceiling: "medium",
      responsibilities: ["Analyze company goals", "Develop strategic options", "Surface assumptions and trade-offs"],
      skills: ["Strategy", "Business analysis", "Structured reasoning"],
    },
    {
      role_code: "OPERATIONS_ANALYST",
      name: "Operations Analyst",
      role: "Operations Analyst",
      department_key: "operations",
      purpose: `Translate approved direction into operational plans for ${capabilityContext}.`,
      authority_level: Math.min(authority, 2),
      risk_ceiling: "medium",
      responsibilities: ["Develop execution plans", "Track operational dependencies", "Create governed action recommendations"],
      skills: ["Operations planning", "Process analysis", "Prioritization"],
    },
    {
      role_code: "DELIVERY_MANAGER",
      name: "Delivery Manager",
      role: "Delivery Manager",
      department_key: "delivery",
      purpose: `Structure requirements and coordinate delivery for ${serviceContext}.`,
      authority_level: Math.min(authority, 1),
      risk_ceiling: "medium",
      responsibilities: ["Structure requirements", "Coordinate internal handoffs", "Track delivery gaps"],
      skills: ["Requirements analysis", "Coordination", "Quality control"],
    },
    {
      role_code: "ANALYTICS_SPECIALIST",
      name: "Analytics Specialist",
      role: "Analytics Specialist",
      department_key: "analytics",
      purpose: "Define measurement approaches and interpret available evidence without inventing data.",
      authority_level: Math.min(authority, 1),
      risk_ceiling: "medium",
      responsibilities: ["Define KPIs", "Assess data quality", "Interpret performance evidence"],
      skills: ["Analytics", "Measurement design", "Evidence assessment"],
    },
  ];

  return { departments, agents };
}

export async function createCompanyBuilderDraft(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const entitlement = context.entitlement;

  if (!entitlement?.company_builder_enabled) {
    redirect("/studio/builder?error=Company%20Builder%20is%20not%20enabled%20for%20this%20organization.");
  }

  const companyName = String(formData.get("companyName") ?? "").trim();
  const companyType = String(formData.get("companyType") ?? "").trim();
  const businessModel = String(formData.get("businessModel") ?? "").trim();
  const companySizeIntent = String(formData.get("companySizeIntent") ?? "").trim();
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "English").trim() || "English";
  const authority = normalizeAuthority(String(formData.get("desiredAiAuthority") ?? "1"));
  const primaryServices = splitList(formData.get("primaryServices"));
  const requiredCapabilities = splitList(formData.get("requiredCapabilities"));

  if (companyName.length < 2 || companyName.length > 120 || companyType.length < 2) {
    redirect("/studio/builder?error=Enter%20a%20valid%20company%20name%20and%20company%20type.");
  }

  const proposal = createProposal(companyType, primaryServices, requiredCapabilities, authority);

  const { data, error } = await context.supabase
    .from("company_builder_drafts")
    .insert({
      organization_id: context.organizationId,
      created_by_user_id: context.user.id,
      company_name: companyName,
      company_type: companyType,
      primary_services: primaryServices,
      business_model: businessModel || "Not specified",
      company_size_intent: companySizeIntent || "Lean",
      required_capabilities: requiredCapabilities,
      desired_ai_authority: authority,
      preferred_language: preferredLanguage,
      proposed_structure: proposal,
      status: "reviewed",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("company_builder_draft_create_failed", { organizationId: context.organizationId, error });
    redirect("/studio/builder?error=Company%20proposal%20could%20not%20be%20created.");
  }

  redirect(`/studio/builder?draft=${encodeURIComponent(String(data.id))}&message=Company%20proposal%20created.%20Review%20it%20before%20building.`);
}

export async function buildCompanyFromDraft(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const draftId = String(formData.get("draftId") ?? "").trim();

  if (!draftId) redirect("/studio/builder?error=Builder%20draft%20is%20required.");

  const { data, error } = await context.supabase.rpc("build_company_from_draft", {
    target_draft_id: draftId,
  });

  if (error) {
    console.error("company_builder_build_failed", { organizationId: context.organizationId, draftId, error });
    redirect(`/studio/builder?draft=${encodeURIComponent(draftId)}&error=Company%20build%20could%20not%20be%20completed.`);
  }

  const result = data as { agents_created?: number; departments_created?: number } | null;
  const message = `Company built with ${result?.departments_created ?? 0} departments and ${result?.agents_created ?? 0} AI Agents. Agents are paused and external actions remain disabled.`;
  redirect(`/command-center?message=${encodeURIComponent(message)}`);
}
