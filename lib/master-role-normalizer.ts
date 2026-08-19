import { normalizeRole, type NormalizedRole } from "@/lib/trusted-agent-knowledge";

type MasteryRoleRule = {
  test: RegExp;
  family: NormalizedRole["roleFamily"];
  canonical: string;
  specs: string[];
};

const explicitRoleRules: MasteryRoleRule[] = [
  {
    test: /\bfull[-\s]?stack\s+(web\s+)?(developer|engineer)\b/i,
    family: "technology",
    canonical: "Full-Stack Web Developer",
    specs: ["web_development"],
  },
  {
    test: /\bfront[-\s]?end\s+(web\s+)?(developer|engineer)\b/i,
    family: "technology",
    canonical: "Front-End Web Developer",
    specs: ["web_development"],
  },
  {
    test: /\bback[-\s]?end\s+(web\s+)?(developer|engineer)\b/i,
    family: "technology",
    canonical: "Back-End Web Developer",
    specs: ["web_development"],
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
