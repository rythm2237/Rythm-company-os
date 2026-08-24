import { normalizeRole, type NormalizedRole } from "@/lib/trusted-agent-knowledge";

type MasteryRoleRule = {
  test: RegExp;
  family: NormalizedRole["roleFamily"];
  canonical: string;
  specs: string[];
};

const explicitRoleRules: MasteryRoleRule[] = [
  { test: /product\s+manager|product\s+owner/i, family: "general", canonical: "Senior Product Manager", specs: ["product_management"] },
  { test: /business\s+analyst/i, family: "analytics", canonical: "Senior Business Analyst", specs: ["business_analysis"] },
  { test: /cto|chief\s+technology|solution\s+architect|software\s+architect|principal\s+architect/i, family: "technology", canonical: "CTO / Principal Solution Architect", specs: ["software_architecture"] },
  { test: /database\s+engineer|postgres(?:ql)?\s+(engineer|dba)|database\s+architect/i, family: "technology", canonical: "Senior PostgreSQL & Database Engineer", specs: ["postgres_database_engineering"] },
  { test: /devops|site\s+reliability|cloud\s+engineer|platform\s+engineer/i, family: "technology", canonical: "Senior DevOps / Cloud Engineer", specs: ["devops_cloud"] },
  { test: /quality\s+(assurance|engineer)|qa\s+(engineer|lead)|test\s+engineer/i, family: "technology", canonical: "Senior QA / Test Engineer", specs: ["quality_engineering"] },
  { test: /application\s+security|appsec|product\s+security/i, family: "technology", canonical: "Senior Application Security Engineer", specs: ["application_security"] },
  { test: /technical\s+writer|documentation\s+engineer|api\s+writer/i, family: "technology", canonical: "Senior Technical Documentation Engineer", specs: ["technical_documentation"] },
  { test: /ai\s+(automation\s+)?engineer|automation\s+engineer|agent\s+engineer/i, family: "technology", canonical: "Senior AI & Automation Engineer", specs: ["ai_automation"] },
  { test: /customer\s+support|communications?\s+manager|support\s+manager/i, family: "general", canonical: "Customer Support & Communications Manager", specs: ["customer_support_communications"] },
  { test: /sales\s+(and|&)\s+crm|crm\s+manager|sales\s+operations/i, family: "general", canonical: "Sales & CRM Manager", specs: ["sales_crm"] },
  { test: /people\s+(and|&)\s+ai|workforce\s+operations|people\s+operations/i, family: "general", canonical: "People & AI Workforce Operations Manager", specs: ["people_ai_workforce_ops"] },
  { test: /finance\s+manager|finops|management\s+accountant/i, family: "analytics", canonical: "Finance Manager & FinOps Analyst", specs: ["finance", "finops_accounting"] },
  { test: /seo.*geo|geo.*growth|growth\s+engineer|technical\s+seo/i, family: "marketing", canonical: "SEO / GEO & Growth Engineer", specs: ["seo", "geo_growth"] },
  {
    test: /\bfull[-\s]?stack\s+(web\s+)?(developer|engineer)\b/i,
    family: "technology",
    canonical: "Full-Stack Web Developer",
    specs: ["web_development", "frontend_engineering", "backend_engineering"],
  },
  {
    test: /\bfront[-\s]?end\s+(web\s+)?(developer|engineer)\b/i,
    family: "technology",
    canonical: "Front-End Web Developer",
    specs: ["web_development", "frontend_engineering"],
  },
  {
    test: /\bback[-\s]?end\s+(web\s+)?(developer|engineer)\b/i,
    family: "technology",
    canonical: "Back-End Web Developer",
    specs: ["web_development", "backend_engineering"],
  },
  {
    test: /\bweb\s+(developer|engineer)\b/i,
    family: "technology",
    canonical: "Web Developer",
    specs: ["web_development"],
  },
  {
    test: /chief\s+of\s+staff|executive\s+orchestrat|executive\s+office/i,
    family: "general",
    canonical: "Executive Orchestrator & AI Chief of Staff",
    specs: ["executive_orchestration"],
  },
  {
    test: /corporate\s+development|strateg(y|ic)/i,
    family: "general",
    canonical: "Strategy & Corporate Development Advisor",
    specs: ["strategy_corporate_development"],
  },
  {
    test: /research|intelligence/i,
    family: "analytics",
    canonical: "Research & Intelligence Analyst",
    specs: ["research_intelligence"],
  },
  {
    test: /runtime\s+assurance|ai\s+systems?\s+validation|model\s+validation|ai\s+assurance|tevv/i,
    family: "technology",
    canonical: "AI Systems Validation Specialist",
    specs: ["ai_runtime_assurance"],
  },
];

const ambiguousDeveloper = /\b(software\s+(developer|engineer)|application\s+(developer|engineer)|developer|engineer)\b/i;
const webExpertiseSignal = /\b(next\.?js|react|typescript|javascript|html5?|css3?|full[-\s]?stack|front[-\s]?end|back[-\s]?end|web\s+app(?:lication)?s?|rest\s+apis?|supabase|vercel)\b/i;

function fromRule(rawRoleTitle: string, rule: MasteryRoleRule): NormalizedRole {
  return {
    rawRoleTitle,
    canonicalRole: rule.canonical,
    roleFamily: rule.family,
    specializations: rule.specs,
    deterministic: true,
  };
}

/**
 * Mastery-aware normalization considers both the selected position and Core
 * expertise while preserving the raw role title. An explicit recognized
 * position always wins; expertise is a secondary discriminator for ambiguous
 * titles such as "Developer" or "Software Engineer".
 *
 * Unsupported general roles still fail closed later at the mastery benchmark.
 */
export function normalizeMasterRole(rawRoleTitle: string, expertise = ""): NormalizedRole {
  const raw = rawRoleTitle.trim().replace(/\s+/g, " ");
  const cleanExpertise = expertise.trim().replace(/\s+/g, " ");

  const explicitRule = explicitRoleRules.find((candidate) => candidate.test.test(raw));
  if (explicitRule) return fromRule(raw, explicitRule);

  const baseFromTitle = normalizeRole(raw);
  if (baseFromTitle.roleFamily !== "general" || baseFromTitle.specializations.length > 0) {
    return { ...baseFromTitle, rawRoleTitle: raw };
  }

  if (ambiguousDeveloper.test(raw) && webExpertiseSignal.test(cleanExpertise)) {
    return {
      rawRoleTitle: raw,
      canonicalRole: "Full-Stack Web Developer",
      roleFamily: "technology",
      specializations: ["web_development"],
      deterministic: true,
    };
  }

  const expertiseRule = explicitRoleRules.find((candidate) => candidate.test.test(cleanExpertise));
  if (expertiseRule) return fromRule(raw, expertiseRule);

  const baseFromExpertise = normalizeRole(cleanExpertise);
  if (baseFromExpertise.roleFamily !== "general" || baseFromExpertise.specializations.length > 0) {
    return { ...baseFromExpertise, rawRoleTitle: raw };
  }

  return {
    ...baseFromTitle,
    rawRoleTitle: raw,
    canonicalRole: raw || "General Professional",
  };
}
