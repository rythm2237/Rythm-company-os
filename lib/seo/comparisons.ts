export type ComparisonRow = Readonly<{
  criterion: string;
  rythm: string;
  competitor: string;
}>;

export type ComparisonSource = Readonly<{
  label: string;
  href: string;
}>;

export type ComparisonDefinition = Readonly<{
  slug: string;
  competitor: string;
  title: string;
  summary: string;
  competitorSummary: string;
  bestForCompetitor: string;
  bestForRythm: string;
  rows: readonly ComparisonRow[];
  questions: readonly Readonly<{ question: string; answer: string }>[];
  sources: readonly ComparisonSource[];
}>;

export const COMPARISON_REVIEW_DATE = "2026-09-01";

export const COMPARISONS: readonly ComparisonDefinition[] = [
  {
    slug: "lindy",
    competitor: "Lindy",
    title: "RYTHM Company OS vs Lindy",
    summary:
      "Compare a governed AI company operating system with an AI teammate designed to work across business tools. The right choice depends on whether you need task-level assistance or an explicit organizational operating model.",
    competitorSummary:
      "Lindy describes its product as an AI teammate that connects to company tools and performs work for a team. Its public documentation models Agents through prompts, models, skills, and exit conditions, and its public pricing is credit-based.",
    bestForCompetitor:
      "Teams prioritizing a conversational AI teammate, rapid task automation, and broad tool-connected workflows without first modeling a whole company structure.",
    bestForRythm:
      "Organizations that want specialized role-based AI teams, Company Memory, meetings, decisions, approvals, execution records, and final consequential authority retained by a Human CEO.",
    rows: [
      { criterion: "Primary product model", rythm: "Governed AI workforce and company operating system.", competitor: "AI teammate and Agent automation platform." },
      { criterion: "Core organizing unit", rythm: "Organization, departments, roles, reporting lines, projects, meetings, decisions, and approvals.", competitor: "Agents configured with prompts, models, skills, and exit conditions." },
      { criterion: "Human authority", rythm: "Human CEO authority and approval boundaries are part of the product model.", competitor: "Human review can be designed into workflows; verify the chosen workflow and plan configuration." },
      { criterion: "Integrations", rythm: "A governed capability gateway with permissions, risk, approval, and rollout checks; current availability is provider- and tenant-dependent.", competitor: "Positioned around connecting an AI teammate to business tools." },
      { criterion: "Pricing model", rythm: "Public Beta offers combine plan pricing with AI usage; implementation is separate where applicable.", competitor: "Public plans use per-user subscriptions and pooled credits; current amounts should be checked on Lindy's pricing page." },
    ],
    questions: [
      { question: "Is RYTHM a Lindy replacement?", answer: "Not automatically. The overlap is business AI Agents, but Lindy emphasizes an AI teammate and tool-connected tasks while RYTHM emphasizes a governed organizational operating model. Evaluate the actual workflow, integrations, authority, and operating evidence you need." },
      { question: "Which is better for a full AI workforce?", answer: "RYTHM is designed around departments, role families, reporting, Company Memory, multi-agent work, human decisions, and traceability. Lindy may be the better fit when the immediate need is a flexible AI teammate across existing tools." },
    ],
    sources: [
      { label: "Lindy product overview", href: "https://www.lindy.ai/" },
      { label: "Lindy Agent documentation", href: "https://docs.lindy.ai/fundamentals/lindy-101/ai-agents" },
      { label: "Lindy pricing", href: "https://www.lindy.ai/pricing" },
    ],
  },
  {
    slug: "relevance-ai",
    competitor: "Relevance AI",
    title: "RYTHM Company OS vs Relevance AI",
    summary:
      "Compare two products that use AI workforce language. Relevance AI emphasizes building and orchestrating Agents and Workforces; RYTHM emphasizes operating a governed company structure under Human CEO authority.",
    competitorSummary:
      "Relevance AI describes itself as a low/no-code platform for building AI Agents and multi-agent Workforces. Its public Workforce documentation highlights a visual canvas for connecting and monitoring specialized Agents.",
    bestForCompetitor:
      "Teams that want a low/no-code Agent and Workforce builder, visual multi-agent process design, and a broad automation ecosystem.",
    bestForRythm:
      "Teams that want AI roles embedded in a company model with departments, reporting lines, Company Memory, meetings, decisions, approvals, and governed execution records.",
    rows: [
      { criterion: "Primary product model", rythm: "Governed AI workforce plus company operating system.", competitor: "Low/no-code AI Agent and Workforce builder." },
      { criterion: "Core organizing unit", rythm: "The organization and its operating loop.", competitor: "Agents, tools, tasks, and visual Workforces that own processes." },
      { criterion: "Multi-agent collaboration", rythm: "Role-based deliberation is connected to company context, decisions, approvals, and traceability.", competitor: "A visual canvas connects specialized Agents into coordinated Workforces." },
      { criterion: "Governance emphasis", rythm: "Human CEO decision rights, authority levels, risk ceilings, scoped capability checks, and approval records.", competitor: "Public enterprise materials describe controls such as SSO, RBAC, audit logs, evaluations, and smart escalations; availability varies by plan." },
      { criterion: "Best starting question", rythm: "How should an AI-enabled company be structured and governed?", competitor: "Which business process should a team of Agents automate?" },
    ],
    questions: [
      { question: "Are RYTHM and Relevance AI in the same category?", answer: "They overlap strongly in AI workforce and multi-agent intent. Relevance AI is primarily a builder and orchestration platform; RYTHM adds an explicit company operating model with Human CEO authority and organizational records." },
      { question: "Which has more integrations?", answer: "Relevance AI publicly markets a broad integration catalog. RYTHM currently documents a smaller governed gateway whose availability depends on configured providers, tenant entitlement, scopes, risk, approval, environment, and rollout. Verify each required integration before buying either product." },
    ],
    sources: [
      { label: "Relevance AI product overview", href: "https://relevanceai.com/" },
      { label: "Relevance AI Workforce", href: "https://relevanceai.com/workforce" },
      { label: "Relevance AI Workforce documentation", href: "https://relevanceai.com/docs/get-started/core-concepts/workforces" },
      { label: "Relevance AI pricing", href: "https://relevanceai.com/pricing" },
    ],
  },
  {
    slug: "crewai",
    competitor: "CrewAI",
    title: "RYTHM Company OS vs CrewAI",
    summary:
      "Compare a managed company operating environment with an open-source and enterprise multi-agent platform. CrewAI is a strong developer-oriented orchestration choice; RYTHM starts from the business organization and its governance.",
    competitorSummary:
      "CrewAI describes an open-source and enterprise platform for designing Agents, orchestrating crews, and automating flows. Its public documentation includes guardrails, memory, knowledge, observability, a code-first API, and builder experiences.",
    bestForCompetitor:
      "Developer and platform teams that need programmable multi-agent orchestration, open-source control, custom flows, and infrastructure-level flexibility.",
    bestForRythm:
      "Founders and business operators who want a managed organizational model with defined AI roles, Company Memory, meetings, decisions, approvals, and execution governance.",
    rows: [
      { criterion: "Primary product model", rythm: "Governed AI workforce and company operating system.", competitor: "Multi-agent framework and enterprise Agent platform." },
      { criterion: "Primary user", rythm: "Business operator, founder, Human CEO, and cross-functional team.", competitor: "Developer, AI engineer, platform team, and enterprise automation builder." },
      { criterion: "Build approach", rythm: "Configure a company template or custom organization and operate through product workflows.", competitor: "Build Agents, crews, and flows through code-first and visual tools." },
      { criterion: "Organizational records", rythm: "Departments, reporting, projects, meetings, decisions, approvals, economics, and traceability are first-class concepts.", competitor: "Agent orchestration, flows, memory, knowledge, guardrails, and observability are first-class concepts." },
      { criterion: "Infrastructure control", rythm: "Managed product boundaries and a governed execution gateway.", competitor: "Greater framework-level flexibility, including open-source implementation and exportable/code-first workflows." },
    ],
    questions: [
      { question: "Can CrewAI build what RYTHM does?", answer: "A capable engineering team can use CrewAI to build custom multi-agent systems and business workflows. RYTHM packages a specific company operating model, UI, authority structure, records, and governance so buyers do not begin with a framework implementation project." },
      { question: "Which is better for developers?", answer: "CrewAI is generally the more direct fit when open-source code, custom orchestration, and framework control are primary. RYTHM is the more direct fit when the desired product is an operating environment for a governed AI organization." },
    ],
    sources: [
      { label: "CrewAI product overview", href: "https://crewai.com/" },
      { label: "CrewAI open source", href: "https://crewai.com/open-source" },
      { label: "CrewAI documentation", href: "https://docs.crewai.com/" },
    ],
  },
  {
    slug: "microsoft-copilot-studio",
    competitor: "Microsoft Copilot Studio",
    title: "RYTHM Company OS vs Microsoft Copilot Studio",
    summary:
      "Compare a governed AI company operating system with Microsoft's platform for building and managing custom Agents and workflows. The biggest decision is organizational operating model versus Microsoft-centered Agent creation and distribution.",
    competitorSummary:
      "Microsoft describes Copilot Studio as a platform for building, launching, and managing custom AI Agents and workflows. Public licensing documentation uses Copilot Credits and distinguishes prepaid capacity from pay-as-you-go usage.",
    bestForCompetitor:
      "Organizations centered on Microsoft 365, Power Platform, Azure, and Microsoft governance that want to build and distribute custom Agents in that ecosystem.",
    bestForRythm:
      "Organizations that want a vendor-spanning company model with specialized AI roles, Human CEO authority, Company Memory, multi-agent operations, decisions, approvals, and traceability.",
    rows: [
      { criterion: "Primary product model", rythm: "Governed AI workforce and company operating system.", competitor: "Enterprise platform for creating and managing custom Agents and Agent flows." },
      { criterion: "Ecosystem center", rythm: "Provider-spanning operating model; supported connections are governed and rollout-dependent.", competitor: "Microsoft 365, Power Platform, Azure, and the broader Microsoft enterprise ecosystem." },
      { criterion: "Core organizing unit", rythm: "Company, departments, roles, reporting, projects, meetings, decisions, approvals, and execution records.", competitor: "Agents, topics/instructions, knowledge, tools, channels, flows, environments, and Microsoft administration." },
      { criterion: "Governance", rythm: "Human CEO authority, role permissions, risk ceilings, approval gates, verification, and execution ledger.", competitor: "Microsoft environment, identity, data, connector, admin, lifecycle, and enterprise policy controls." },
      { criterion: "Commercial model", rythm: "Public Beta plan pricing plus AI usage and optional implementation.", competitor: "Copilot Credit capacity or pay-as-you-go consumption; licensing and regional prices should be verified in current Microsoft guidance." },
    ],
    questions: [
      { question: "Is RYTHM built on Microsoft Copilot Studio?", answer: "No such dependency is claimed. RYTHM is presented as its own company operating environment. Microsoft 365 appears in RYTHM's governed integration contracts, but actual availability depends on provider configuration, entitlement, permissions, and rollout." },
      { question: "Which is better for a Microsoft enterprise?", answer: "Copilot Studio may be the better fit when Microsoft identity, data, channels, governance, and Power Platform are mandatory. RYTHM may be the better fit when the purchasing intent is a ready organizational operating model rather than an Agent-building platform." },
    ],
    sources: [
      { label: "Microsoft Copilot Studio overview", href: "https://www.microsoft.com/en-gb/microsoft-365-copilot/microsoft-copilot-studio" },
      { label: "Microsoft Copilot Studio documentation", href: "https://learn.microsoft.com/en-us/microsoft-copilot-studio/" },
      { label: "Microsoft Copilot Studio licensing", href: "https://learn.microsoft.com/en-us/microsoft-copilot-studio/billing-licensing" },
      { label: "Microsoft Copilot Studio pricing", href: "https://www.microsoft.com/en-gb/microsoft-365-copilot/pricing/copilot-studio" },
    ],
  },
] as const;

export function getComparison(slug: string) {
  const comparison = COMPARISONS.find((item) => item.slug === slug);
  if (!comparison) throw new Error(`No comparison definition exists for ${slug}`);
  return comparison;
}
