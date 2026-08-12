export type DemoSurfaceId =
  | "command"
  | "projects"
  | "actions"
  | "agents"
  | "templates"
  | "builder"
  | "ideas"
  | "boardroom"
  | "traceability"
  | "attention"
  | "executive-review"
  | "economics"
  | "operations-health";

export type DemoSurface = {
  id: DemoSurfaceId;
  label: string;
  group: "Operate" | "Build" | "Govern" | "Review";
  eyebrow: string;
  title: string;
  description: string;
  cards: Array<{ label: string; value: string; detail: string; tone?: "attention" | "healthy" }>;
  timeline: Array<{ title: string; detail: string; meta: string }>;
};

export type DemoAgent = {
  id: string;
  name: string;
  role: string;
  department: string;
  manager: string;
  status: "Working" | "Waiting" | "Needs approval" | "In meeting" | "Paused" | "Offline" | "Blocked";
  authority: string;
  risk: "Low" | "Medium" | "High";
  activity: string;
  recentWork: string;
};

export const NOVA_COMMERCE_DEMO = {
  organization: {
    name: "Nova Commerce",
    descriptor: "Synthetic commerce operations company",
  },
  metrics: [
    { label: "AI Agents", value: "12", detail: "9 working · 1 in meeting" },
    { label: "Departments", value: "4", detail: "Executive · Growth · Operations · Finance" },
    { label: "Active Projects", value: "7", detail: "2 require executive attention" },
    { label: "CEO Approvals", value: "3", detail: "No external action has been taken" },
  ],
  agents: [
    {
      id: "b-001",
      name: "Avery",
      role: "Executive Orchestrator",
      department: "Executive Office",
      manager: "Human CEO",
      status: "Working",
      authority: "A3 · bounded coordination",
      risk: "Medium",
      activity: "Preparing the 16:00 Executive Review",
      recentWork: "Connected the margin-risk decision to two project actions and one approval.",
    },
    {
      id: "g-014",
      name: "Mira",
      role: "Growth Strategist",
      department: "Growth",
      manager: "Avery · Executive Orchestrator",
      status: "Needs approval",
      authority: "A1 · recommendation",
      risk: "Medium",
      activity: "Waiting for CEO approval on the autumn campaign brief",
      recentWork: "Compared three campaign options and surfaced the budget assumptions.",
    },
    {
      id: "o-008",
      name: "Noah",
      role: "Operations Manager",
      department: "Operations",
      manager: "Avery · Executive Orchestrator",
      status: "In meeting",
      authority: "A2 · internal operations",
      risk: "Medium",
      activity: "Participating in the fulfillment-risk Boardroom",
      recentWork: "Mapped the late-supplier issue to affected orders and owners.",
    },
    {
      id: "f-003",
      name: "Lea",
      role: "Finance Analyst",
      department: "Finance",
      manager: "Human CEO",
      status: "Working",
      authority: "A1 · analysis",
      risk: "High",
      activity: "Validating contribution-margin evidence",
      recentWork: "Flagged two assumptions that require human confirmation before decision.",
    },
    {
      id: "r-019",
      name: "Soren",
      role: "Research Analyst",
      department: "Growth",
      manager: "Mira · Growth Strategist",
      status: "Waiting",
      authority: "A0 · advisory",
      risk: "Low",
      activity: "Waiting for a confirmed research question",
      recentWork: "Added source quality notes to the competitor evidence pack.",
    },
    {
      id: "p-011",
      name: "Iris",
      role: "Process Specialist",
      department: "Operations",
      manager: "Noah · Operations Manager",
      status: "Blocked",
      authority: "A1 · process design",
      risk: "Medium",
      activity: "Blocked by missing warehouse exception data",
      recentWork: "Prepared a draft returns process but did not invent the missing baseline.",
    },
  ] satisfies DemoAgent[],
  surfaces: [
    {
      id: "command",
      label: "Command",
      group: "Operate",
      eyebrow: "EXECUTIVE COMMAND",
      title: "The company is operating. Three decisions need you.",
      description: "A Human CEO view of current priorities, workforce activity, risks, and the next governed actions.",
      cards: [
        { label: "Operating pulse", value: "82%", detail: "Stable across 7 active projects", tone: "healthy" },
        { label: "Needs your authority", value: "3", detail: "2 decisions · 1 budget approval", tone: "attention" },
        { label: "Agent activity", value: "9 / 12", detail: "1 meeting · 1 blocked · 1 waiting" },
      ],
      timeline: [
        { title: "Margin risk moved to Executive Review", detail: "Finance evidence and Operations impact are connected.", meta: "8 minutes ago · Avery" },
        { title: "Fulfillment Boardroom started", detail: "Human chair plus three AI specialists are present.", meta: "19 minutes ago · Meeting M-042" },
        { title: "Campaign brief awaits approval", detail: "No external publishing or spend has occurred.", meta: "31 minutes ago · Mira" },
      ],
    },
    {
      id: "projects",
      label: "Projects",
      group: "Operate",
      eyebrow: "PROJECT PORTFOLIO",
      title: "Seven active projects, connected to decisions and accountable work.",
      description: "Projects carry scope, evidence, progress, dependencies, and the operating trace—not just a task list.",
      cards: [
        { label: "Checkout conversion", value: "68%", detail: "Experiment plan in delivery" },
        { label: "Returns redesign", value: "44%", detail: "Blocked by baseline data", tone: "attention" },
        { label: "Autumn campaign", value: "76%", detail: "CEO approval required" },
      ],
      timeline: [
        { title: "Supplier resilience", detail: "Risk review completed; two mitigations proposed.", meta: "Project P-107" },
        { title: "Customer insight loop", detail: "Research brief accepted by the Growth department.", meta: "Project P-103" },
      ],
    },
    {
      id: "actions",
      label: "Actions",
      group: "Operate",
      eyebrow: "ACCOUNTABLE ACTIONS",
      title: "Every action has an owner, origin, status, and approval boundary.",
      description: "RYTHM separates recommendations from authorized action and preserves the decision handoff.",
      cards: [
        { label: "Open actions", value: "18", detail: "12 human-owned · 6 AI-owned" },
        { label: "Awaiting approval", value: "3", detail: "Consequential work remains locked", tone: "attention" },
        { label: "Overdue", value: "1", detail: "Escalated to Operations" },
      ],
      timeline: [
        { title: "Validate carrier-cost assumptions", detail: "Owner: Lea · Finance Analyst", meta: "Due today · Internal analysis" },
        { title: "Approve autumn campaign scope", detail: "Owner: Human CEO", meta: "External spend remains locked" },
      ],
    },
    {
      id: "agents",
      label: "Agents",
      group: "Build",
      eyebrow: "AI WORKFORCE",
      title: "Agents appear as governed organizational members.",
      description: "Open an Agent profile to inspect role, reporting line, activity, authority, risk, and recent work.",
      cards: [
        { label: "Working", value: "9", detail: "Across four departments", tone: "healthy" },
        { label: "Needs approval", value: "1", detail: "Campaign scope" },
        { label: "Blocked", value: "1", detail: "Missing operational evidence", tone: "attention" },
      ],
      timeline: [
        { title: "Avery · Executive Orchestrator", detail: "Preparing Executive Review", meta: "A3 · Medium risk" },
        { title: "Noah · Operations Manager", detail: "In fulfillment-risk Boardroom", meta: "A2 · Medium risk" },
      ],
    },
    {
      id: "templates",
      label: "Templates",
      group: "Build",
      eyebrow: "COMPANY PATTERNS",
      title: "Explore structures before choosing a product.",
      description: "Templates describe a company pattern. They never operate directly and this Demo cannot provision them.",
      cards: [
        { label: "Ready Company packs", value: "6", detail: "Predefined structure and workforce" },
        { label: "Department patterns", value: "14", detail: "Curated role and governance designs" },
        { label: "Provisioning", value: "Locked", detail: "Read-only Demo boundary" },
      ],
      timeline: [
        { title: "Nova Commerce Operations", detail: "4 departments · 12 Agents", meta: "Ready Company" },
        { title: "AI Integration Office", detail: "Human-led enterprise reference workforce", meta: "Enterprise Workforce" },
      ],
    },
    {
      id: "builder",
      label: "Company Builder",
      group: "Build",
      eyebrow: "ORGANIZATION DESIGN",
      title: "Describe, review, then explicitly build.",
      description: "Company Builder proposes departments and roles first. Nothing becomes operational until an authorized Human CEO confirms it.",
      cards: [
        { label: "Draft structure", value: "4", detail: "Departments proposed" },
        { label: "Proposed Agents", value: "11", detail: "All would start Paused" },
        { label: "External actions", value: "Off", detail: "Launch-safe default" },
      ],
      timeline: [
        { title: "Proposal generated", detail: "Based on confirmed company intent and capabilities.", meta: "Draft only" },
        { title: "Human review required", detail: "Authority and risk ceilings are visible before build.", meta: "No mutation in Demo" },
      ],
    },
    {
      id: "ideas",
      label: "Ideas",
      group: "Govern",
      eyebrow: "INTENT INTAKE",
      title: "Ideas enter a governed operating loop.",
      description: "An idea can become evidence, a meeting, a decision, an approval, and accountable work without losing its origin.",
      cards: [
        { label: "New", value: "5", detail: "Awaiting triage" },
        { label: "In review", value: "3", detail: "Evidence being assessed" },
        { label: "Promoted", value: "2", detail: "Connected to active projects" },
      ],
      timeline: [
        { title: "Add subscription replenishment", detail: "Commercial and operational assumptions need validation.", meta: "Idea I-028" },
        { title: "Consolidate supplier scorecards", detail: "Promoted to Operations project discovery.", meta: "Idea I-025" },
      ],
    },
    {
      id: "boardroom",
      label: "Boardroom",
      group: "Govern",
      eyebrow: "GOVERNED MEETING",
      title: "Humans and AI specialists deliberate in the same trace.",
      description: "Agenda, context, contributions, interventions, decisions, actions, and approvals remain connected.",
      cards: [
        { label: "Live meeting", value: "M-042", detail: "Fulfillment risk review", tone: "healthy" },
        { label: "Participants", value: "4", detail: "1 human · 3 AI roles" },
        { label: "Decision state", value: "Open", detail: "Human chair has final authority", tone: "attention" },
      ],
      timeline: [
        { title: "Operations contribution", detail: "Two containment options with dependencies.", meta: "Noah · 4 minutes ago" },
        { title: "Finance intervention", detail: "Cost assumption flagged as unverified.", meta: "Lea · 2 minutes ago" },
      ],
    },
    {
      id: "traceability",
      label: "Traceability",
      group: "Govern",
      eyebrow: "OPERATING TRACE",
      title: "See why work exists and who authorized it.",
      description: "Traceability connects intent, evidence, deliberation, decision, approval, and execution.",
      cards: [
        { label: "Connected events", value: "146", detail: "Across the last 30 days" },
        { label: "Orphan actions", value: "0", detail: "Every action has an origin", tone: "healthy" },
        { label: "Open approvals", value: "3", detail: "Consequential handoffs locked" },
      ],
      timeline: [
        { title: "Idea I-021 → Meeting M-038", detail: "Customer retention hypothesis reviewed.", meta: "Trace T-884" },
        { title: "Decision D-094 → Action A-233", detail: "Human CEO approved an internal experiment.", meta: "Trace T-879" },
      ],
    },
    {
      id: "attention",
      label: "Attention",
      group: "Review",
      eyebrow: "EXECUTIVE ATTENTION",
      title: "Only the exceptions that require human judgment.",
      description: "The system escalates blocked work, approval boundaries, evidence gaps, and meaningful risk changes.",
      cards: [
        { label: "Critical", value: "0", detail: "No critical incidents", tone: "healthy" },
        { label: "High", value: "2", detail: "Margin and supplier risk", tone: "attention" },
        { label: "Approval", value: "3", detail: "Human authority required" },
      ],
      timeline: [
        { title: "Margin assumption changed", detail: "Executive Review requested before campaign approval.", meta: "High · Finance" },
        { title: "Returns redesign blocked", detail: "Baseline data owner notified.", meta: "Medium · Operations" },
      ],
    },
    {
      id: "executive-review",
      label: "Executive Review",
      group: "Review",
      eyebrow: "CEO REVIEW",
      title: "A concise decision surface, backed by full evidence.",
      description: "Review recommendations, dissent, assumptions, implications, and the exact authority being requested.",
      cards: [
        { label: "Ready to decide", value: "2", detail: "Evidence pack complete" },
        { label: "Needs evidence", value: "1", detail: "Margin baseline unconfirmed", tone: "attention" },
        { label: "Deferred", value: "1", detail: "No urgency signal" },
      ],
      timeline: [
        { title: "Autumn campaign scope", detail: "Approve option B with a capped experiment budget.", meta: "Decision D-108" },
        { title: "Supplier containment", detail: "Await the live Boardroom synthesis.", meta: "Decision draft" },
      ],
    },
    {
      id: "economics",
      label: "Economics",
      group: "Review",
      eyebrow: "OPERATING ECONOMICS",
      title: "Usage, cost, and business context stay visible.",
      description: "Model consumption is measured separately from platform entitlement and connected to governed work.",
      cards: [
        { label: "AI budget used", value: "38%", detail: "Within monthly ceiling", tone: "healthy" },
        { label: "Meeting usage", value: "€18.40", detail: "7 governed sessions" },
        { label: "Cost exceptions", value: "0", detail: "No budget breach" },
      ],
      timeline: [
        { title: "Boardroom M-038", detail: "Strategy, research, finance, and Human CEO.", meta: "€3.21 estimated AI usage" },
        { title: "Research pack R-119", detail: "Source analysis and evidence synthesis.", meta: "€1.08 estimated AI usage" },
      ],
    },
    {
      id: "operations-health",
      label: "Operations Health",
      group: "Review",
      eyebrow: "SYSTEM HEALTH",
      title: "The operating environment is healthy and bounded.",
      description: "Runtime status, policy controls, incidents, and blocked dependencies are visible without exposing infrastructure secrets.",
      cards: [
        { label: "Runtime", value: "Healthy", detail: "No active incident", tone: "healthy" },
        { label: "Policy checks", value: "100%", detail: "Last 24 hours" },
        { label: "Blocked workflows", value: "1", detail: "Missing business data, not system failure" },
      ],
      timeline: [
        { title: "Entitlement guard verified", detail: "Commercial mutations remain active-entitlement only.", meta: "Security control" },
        { title: "External actions", detail: "Disabled across the Demo workforce.", meta: "Governance control" },
      ],
    },
  ] satisfies DemoSurface[],
} as const;

