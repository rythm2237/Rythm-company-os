/** Product-admin registry. Status is deliberately conservative; repository evidence is
 * not proof that a tenant has a connected provider or a verified production workflow. */
export const capabilityStatuses = [
  "PRODUCTION_VERIFIED", "IMPLEMENTED_NOT_PRODUCTION_VERIFIED", "BETA",
  "PARTIAL", "PLANNED", "BLOCKED", "DEPRECATED",
] as const;
export type CapabilityStatus = typeof capabilityStatuses[number];

export type CapabilityRecord = {
  id: string;
  name: string;
  status: CapabilityStatus;
  evidence: readonly string[];
  gap: string;
};

export const capabilityRegistry: readonly CapabilityRecord[] = [
  { id: "software-template", name: "Software Company template", status: "IMPLEMENTED_NOT_PRODUCTION_VERIFIED", evidence: ["supabase/migrations/20260824200000_software_company_template.sql", "scripts/validate-software-company-template.ts"], gap: "Recheck current Production template and an actual provisioned company." },
  { id: "organization-map", name: "Organization map", status: "PARTIAL", evidence: ["components/company-branding/CompanyChart.tsx", "lib/company-chart.ts"], gap: "Manager review and delegation routing are described in the UI but are not automatically enforced." },
  { id: "project-os", name: "Project Mission Control", status: "IMPLEMENTED_NOT_PRODUCTION_VERIFIED", evidence: ["app/(app)/projects/operating/page.tsx", "lib/projects/project-progress.ts"], gap: "Verify a live project from analysis through completion and outcome evidence." },
  { id: "objective-intake", name: "Objective-first project intake and analysis brief", status: "IMPLEMENTED_NOT_PRODUCTION_VERIFIED", evidence: ["app/(app)/projects/page.tsx", "components/projects/project-os-controls.tsx", "components/projects/ProjectAnalysisBrief.tsx"], gap: "Verify creation, analysis and executive review with a real Production project." },
  { id: "executive-inbox", name: "Executive attention queue", status: "PARTIAL", evidence: ["app/(app)/attention/page.tsx", "app/(app)/approvals/page.tsx"], gap: "The queue mixes decisions with operational attention and is not yet a single decision card workflow." },
  { id: "governed-execution", name: "Integration & Execution Gateway", status: "IMPLEMENTED_NOT_PRODUCTION_VERIFIED", evidence: ["lib/projects/project-proposal-execution.ts", "lib/integrations/connections/platform-readiness.ts"], gap: "Verify provider-specific capability and approval paths with connected resources." },
  { id: "software-delivery", name: "Software delivery end to end", status: "PARTIAL", evidence: ["supabase/migrations/20260824200000_software_company_template.sql", "lib/projects/project-operating-system.ts"], gap: "No verified build, review, QA, security, preview, approval, deploy and monitor run for one customer project." },
  { id: "version-history", name: "Customer-facing software version history and restore", status: "PLANNED", evidence: [], gap: "Design a governed view over provider commits, previews and deployments, then implement safe restore." },
  { id: "outcome-learning", name: "Measured outcome learning", status: "PARTIAL", evidence: ["lib/projects/project-progress.ts"], gap: "Tie measured production outcomes to subsequent agent recommendations and verify the loop." },
] as const;
