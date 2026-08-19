import { normalizeRole, type NormalizedRole } from "@/lib/trusted-agent-knowledge";

const masteryRoleRules: Array<{
  test: RegExp;
  family: NormalizedRole["roleFamily"];
  canonical: string;
  specs: string[];
}> = [
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

/**
 * Mastery-aware normalization considers both the selected position and the
 * expertise entered in Agent Builder while preserving the raw role title.
 * Unsupported general roles fail closed later at the mastery benchmark gate.
 */
export function normalizeMasterRole(rawRoleTitle: string, expertise = ""): NormalizedRole {
  const raw = rawRoleTitle.trim().replace(/\s+/g, " ");
  const combined = `${raw} ${expertise}`.trim().replace(/\s+/g, " ");
  const masteryRule = masteryRoleRules.find((candidate) => candidate.test.test(combined));
  if (masteryRule) {
    return {
      rawRoleTitle: raw,
      canonicalRole: masteryRule.canonical,
      roleFamily: masteryRule.family,
      specializations: masteryRule.specs,
      deterministic: true,
    };
  }

  const base = normalizeRole(combined || raw);
  const unsupportedGeneralFallback = base.roleFamily === "general" && base.specializations.length === 0;
  return {
    ...base,
    rawRoleTitle: raw,
    canonicalRole: unsupportedGeneralFallback ? (raw || "General Professional") : base.canonicalRole,
  };
}
