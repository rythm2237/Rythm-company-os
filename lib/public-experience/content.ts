export type PublicNavigationItem = {
  label: string;
  href: string;
  compact?: boolean;
};

export type ProductTour = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  format: "interactive" | "video";
  status: "available" | "planned";
  href?: string;
};

export type PublicTemplate = {
  id: string;
  name: string;
  family: "Ready Company" | "Custom Company" | "Enterprise Workforce";
  audience: string;
  description: string;
  departments: number;
  agents: number;
  capabilities: string[];
  templateKey?: string;
  productCode?: "ready_company" | "company_studio";
  cta?: string;
};

export const PUBLIC_NAVIGATION: PublicNavigationItem[] = [
  { label: "Product", href: "/product" },
  { label: "Demo", href: "/demo" },
  { label: "Solutions", href: "/solutions" },
  { label: "Templates", href: "/templates" },
  { label: "Pricing", href: "/pricing", compact: true },
  { label: "Enterprise", href: "/enterprise", compact: true },
  { label: "Live AI Meeting", href: "/live-ai-meeting" },
];

export const PRODUCT_TOURS: ProductTour[] = [
  {
    id: "main-product-tour",
    eyebrow: "MAIN PRODUCT TOUR",
    title: "Watch RYTHM in action",
    description:
      "Explore a governed AI company from executive command through meetings, approvals, actions, and traceability.",
    format: "interactive",
    status: "available",
    href: "/demo",
  },
  {
    id: "ai-workforce",
    eyebrow: "MICRO-DEMO",
    title: "How the AI workforce works",
    description: "Roles, reporting lines, activity states, authority, and Human CEO escalation.",
    format: "video",
    status: "planned",
  },
  {
    id: "company-memory",
    eyebrow: "MICRO-DEMO",
    title: "Company Memory",
    description: "How governed context supports work without becoming uncontrolled organizational memory.",
    format: "video",
    status: "planned",
  },
  {
    id: "ai-boardroom",
    eyebrow: "MICRO-DEMO",
    title: "Inside the AI Boardroom",
    description: "Human and AI contributions, decisions, approvals, actions, and a complete operating trace.",
    format: "video",
    status: "planned",
  },
];

export const PUBLIC_TEMPLATES: PublicTemplate[] = [
  {
    id: "saas-startup",
    name: "SaaS Startup",
    family: "Ready Company",
    audience: "Founders and early product teams that need a lean, governed product organization.",
    description:
      "A production-minded AI SaaS company for discovery, product delivery, engineering, quality, growth, and customer operations under Human CEO authority.",
    departments: 6,
    agents: 10,
    capabilities: ["Product discovery", "Engineering delivery", "Quality gates", "Growth operations"],
    templateKey: "ready_saas_startup_v1",
    productCode: "ready_company",
    cta: "Choose SaaS Startup",
  },
  {
    id: "ai-advertising-agency",
    name: "AI Advertising Agency",
    family: "Ready Company",
    audience: "Advertising, creative, and marketing teams that want a governed AI agency workforce.",
    description:
      "A ready-to-operate advertising company with strategy, accounts, creative, content, performance marketing, and analytics roles under Human CEO control.",
    departments: 5,
    agents: 7,
    capabilities: ["Advertising strategy", "Creative production", "Performance planning", "Marketing analytics"],
    templateKey: "ready_ai_advertising_agency_v1",
    productCode: "ready_company",
    cta: "Choose Advertising Agency",
  },
  {
    id: "software-company",
    name: "Software Company",
    family: "Ready Company",
    audience: "Technical founders and mature product teams that need a full software delivery operating system.",
    description:
      "A 19-Agent software company covering product, design, engineering, QA, security, growth, operations, finance, and governed production delivery.",
    departments: 7,
    agents: 19,
    capabilities: ["Product delivery", "Software engineering", "Security review", "Governed deployment"],
    templateKey: "ready_software_company_v1",
    productCode: "company_studio",
    cta: "Choose Software Company",
  },
  {
    id: "custom-operating-company",
    name: "Custom Operating Company",
    family: "Custom Company",
    audience: "Organizations that need their own roles, hierarchy, responsibilities, and workflows.",
    description:
      "A configurable starting architecture for Company Builder and Agent Studio under active commercial entitlement.",
    departments: 0,
    agents: 0,
    capabilities: ["Custom hierarchy", "Agent Builder", "Company Builder", "Governance configuration"],
    productCode: "company_studio",
    cta: "Build a custom company",
  },
];

export const SOLUTION_PATHS = [
  {
    id: "ready",
    eyebrow: "READY-MADE AI COMPANY",
    title: "Start with a company that already knows how to organize the work.",
    audience: "Businesses that want an AI team without designing an organization themselves.",
    description:
      "Choose a governed company pattern with predefined departments, Agents, workflows, and a standard Human CEO control model.",
    outcomes: ["Faster time to first operation", "Defined responsibilities", "Launch-safe customization"],
    href: "/templates",
    cta: "Explore Ready Companies",
  },
  {
    id: "custom",
    eyebrow: "CUSTOM AI COMPANY",
    title: "Design the workforce around the way your business actually operates.",
    audience: "Organizations that require custom roles, hierarchy, responsibilities, and workflows.",
    description:
      "Use Company Builder and Agent Studio to shape a persistent organization within commercial limits and governance ceilings.",
    outcomes: ["Custom departments", "Custom AI roles", "Ongoing structural control"],
    href: "/product#custom-company",
    cta: "Understand Custom Company",
  },
  {
    id: "enterprise",
    eyebrow: "ENTERPRISE AI WORKFORCE",
    title: "Deploy governed AI teams alongside human departments.",
    audience: "Large organizations, departments, transformation teams, and shared-service functions.",
    description:
      "Plan a controlled workforce deployment with departmental participation, human management, advanced governance, and executive oversight.",
    outcomes: ["Departmental rollout", "Human–AI operating model", "Enterprise governance roadmap"],
    href: "/enterprise",
    cta: "Discuss Enterprise Beta",
  },
] as const;
