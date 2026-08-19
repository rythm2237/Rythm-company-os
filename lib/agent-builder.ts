export type AgentProvider = "openai" | "anthropic" | "google";

export type AgentBuilderInput = {
  name: string;
  roleTitle: string;
  expertise: string;
  purpose: string;
  departmentName?: string;
  responsibilities: string[];
  skills: string[];
  kpis: string[];
  language: string;
  workStyle: string;
  authorityLevel: number;
  riskCeiling: string;
  approvalRequirements: string[];
  allowedTools: string[];
};

export type ProviderOption = {
  id: AgentProvider;
  label: string;
  model: string | null;
  configured: boolean;
  description: string;
};

const clean = (value: string) => value.trim();
const bullets = (items: string[]) => items.map(clean).filter(Boolean).map((item) => `- ${item}`).join("\n");

export function buildAgentBlueprint(input: AgentBuilderInput, professionalKnowledgeOverlay?: string) {
  const responsibilities = bullets(input.responsibilities) || "- Define and execute responsibilities appropriate to the role.";
  const skills = bullets(input.skills) || `- Apply expert-level ${clean(input.expertise) || clean(input.roleTitle)} judgment.`;
  const kpis = bullets(input.kpis) || "- Produce accurate, useful, decision-ready work within the assigned mandate.";
  const approvals = bullets(input.approvalRequirements) || "- Escalate consequential external actions and material commitments to the Human CEO.";
  const tools = bullets(input.allowedTools) || "- company_memory\n- projects\n- meetings\n- decisions\n- actions";

  return [
    `# RYTHM AGENT BLUEPRINT`,
    `Agent: ${clean(input.name) || "Unnamed AI Agent"}`,
    `Role: ${clean(input.roleTitle) || "Specialist"}`,
    `Expertise: ${clean(input.expertise) || "Role-specific expertise"}`,
    input.departmentName ? `Department: ${clean(input.departmentName)}` : "",
    `Primary mission: ${clean(input.purpose) || "Support the company within the assigned professional mandate."}`,
    `Language: ${clean(input.language) || "English"}`,
    `Work style: ${clean(input.workStyle) || "Evidence-led, concise, collaborative, and explicit about uncertainty."}`,
    `Authority: A${Math.max(0, Math.min(4, Number(input.authorityLevel) || 0))}`,
    `Risk ceiling: ${clean(input.riskCeiling) || "medium"}`,
    "",
    `## Responsibilities\n${responsibilities}`,
    "",
    `## Core skills\n${skills}`,
    "",
    `## Success measures\n${kpis}`,
    "",
    professionalKnowledgeOverlay ? `## Professional knowledge configuration\n${professionalKnowledgeOverlay}` : "",
    professionalKnowledgeOverlay ? "" : "",
    `## Human approval gates\n${approvals}`,
    "",
    `## Allowed internal tools\n${tools}`,
    "",
    "## RYTHM governance",
    "- You are an AI Agent operating inside a Human CEO-governed RYTHM company.",
    "- Never impersonate a human employee or the Human CEO.",
    "- Stay inside the assigned role, organization context, authority level, and risk ceiling.",
    "- External actions remain disabled unless a separate RYTHM policy explicitly authorizes them.",
    "- Escalate consequential, irreversible, high-risk, financial, legal, privacy, security, or external commitments to the Human CEO.",
    "- Distinguish facts, assumptions, estimates, recommendations, and uncertainty.",
    "- In meetings, contribute an independent professional view and challenge weak assumptions constructively.",
    "- Professional Role Foundation, specialization, Company Knowledge, Agent Experience, conversation, attachments and current task are separate runtime layers; never collapse company-confidential data into transferable professional knowledge.",
  ].filter(Boolean).join("\n");
}

export function getAgentProviderOptions(): ProviderOption[] {
  const openAIModel = process.env.RYTHM_OPENAI_AGENT_MODEL?.trim() || process.env.RYTHM_DRY_RUN_MODEL?.trim() || null;
  const anthropicModel = process.env.RYTHM_ANTHROPIC_AGENT_MODEL?.trim() || null;
  const googleModel = process.env.RYTHM_GEMINI_AGENT_MODEL?.trim() || null;

  return [
    {
      id: "openai",
      label: "OpenAI",
      model: openAIModel,
      configured: Boolean(process.env.OPENAI_API_KEY && openAIModel),
      description: "General-purpose reasoning and agent execution through the OpenAI Responses API.",
    },
    {
      id: "anthropic",
      label: "Anthropic Claude",
      model: anthropicModel,
      configured: Boolean(process.env.ANTHROPIC_API_KEY && anthropicModel),
      description: "Claude-based reasoning with an independent provider runtime.",
    },
    {
      id: "google",
      label: "Google Gemini",
      model: googleModel,
      configured: Boolean(process.env.GEMINI_API_KEY && googleModel),
      description: "Gemini runtime for multimodal and long-context agent workflows.",
    },
  ];
}

export function parseList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
