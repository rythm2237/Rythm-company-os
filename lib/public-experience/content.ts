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
    id: "nova-commerce",
    name: "Nova Commerce Operations",
    family: "Ready Company",
    audience: "Commerce teams coordinating growth, customer experience, finance, and operations.",
    description:
      "A governed operating company with executive coordination, specialist departments, and approval-led execution.",
    departments: 4,
    agents: 12,
    capabilities: ["Executive command", "Growth planning", "Operations review", "Finance analysis"],
  },
  {
    id: "professional-services",
    name: "Professional Services Company",
    family: "Ready Company",
    audience: "Advisory and delivery businesses that need a repeatable operating cadence.",
    description:
      "A client-delivery structure connecting requirements, research, planning, quality review, and accountable actions.",
    departments: 4,
    agents: 10,
    capabilities: ["Client intake", "Delivery planning", "Quality review", "Executive reporting"],
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
  },
  {
    id: "integration-office",
    name: "AI Integration Office",
    family: "Enterprise Workforce",
    audience: "Transformation and shared-service teams deploying governed AI roles alongside human departments.",
    description:
      "A reference workforce led by a Human Integration Director with AI program, process, data, research, and automation roles.",
    departments: 3,
    agents: 8,
    capabilities: ["Program governance", "Process analysis", "Department participation", "Executive oversight"],
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

