import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const specialistRunner = read("lib/agency-specialist-assessment.ts");
const progressionRunner = read("lib/agency-level-progression.ts");
const specialistMigration = read("supabase/migrations/20260831044500_agency_specialist_benchmarks.sql");
const progressionMigration = read("supabase/migrations/20260831071000_continuous_agency_level_benchmarks.sql");
const coverageMigration = read("supabase/migrations/20260831104500_workforce_benchmark_coverage.sql");
const remediation = read("supabase/migrations/20260831053500_specialist_remediation_readiness.sql");
const actions = read("app/(app)/agents/[code]/assessment/actions.ts");
const page = read("app/(app)/agents/[code]/assessment/page.tsx");
const pending = read("app/(app)/agents/[code]/assessment/PendingBenchmarkButton.tsx");

const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

const originalAgencyRoles = [
  "Advertising Strategy Director",
  "Advertising Creative Director",
  "Advertising Copywriter",
  "Advertising Content Specialist",
  "Performance Marketing Specialist",
  "Advertising Analytics Specialist",
  "Advertising Account Manager",
  "Graphic Designer",
  "Finance Operations Manager",
  "Legal & Compliance Advisor",
];

for (const role of originalAgencyRoles) {
  expect(specialistRunner.includes(`\"${role}\"`), `Specialist runner does not support ${role}.`);
  expect(specialistMigration.includes(`('${role}'`), `Specialist benchmark catalog does not seed ${role}.`);
}

const coverageRoles = [
  "Customer Support & Communications Manager",
  "People & AI Workforce Operations Manager",
  "Full-Stack Web Developer",
  "Executive Orchestrator & AI Chief of Staff",
];

for (const role of coverageRoles) {
  expect(specialistRunner.includes(`\"${role}\"`), `Coverage audit role is not enabled by the Specialist runner: ${role}.`);
}
expect(coverageMigration.includes("'People & AI Workforce Operations Manager'"), "Coverage migration must publish People/AI Workforce Operations benchmarks.");
expect(coverageMigration.includes("'Full-Stack Web Developer'"), "Coverage migration must publish Full-Stack Web Developer benchmarks.");
expect(coverageMigration.includes("'Executive Orchestrator & AI Chief of Staff'"), "Coverage migration must publish Executive Orchestrator benchmarks.");
expect(coverageMigration.includes("'Customer Support & Communications Manager'"), "Coverage migration must fail-closed over Communications coverage.");
expect(coverageMigration.includes("workforce-specialist-"), "Coverage migration must publish Specialist scenarios.");
for (const target of ["senior", "lead", "principal", "director"]) {
  expect(coverageMigration.includes(`advertising_agency_${target}`), `Coverage migration must extend ${target} progression to newly covered roles.`);
}
expect(coverageMigration.includes("Full-Stack Web Engineering — Source-Backed Foundation v2"), "Paused Full-Stack Agents must be pre-bound to the verified v2 foundation.");
expect(coverageMigration.includes("raise exception 'Benchmark coverage migration incomplete"), "Coverage migration must fail closed if an audited Associate role still lacks Specialist coverage.");

expect(specialistRunner.includes('feature: "agent.evaluation"'), "Agency Specialist evaluation must use the canonical AI Request Gateway feature.");
expect(specialistRunner.split('feature: "agent.evaluation"').length >= 3, "Candidate and independent judge must both use the evaluation Gateway feature.");
expect(specialistRunner.includes('external_actions_allowed: false'), "Agency Specialist evidence must record external actions as disabled.");
expect(specialistRunner.includes('p_target_level: "specialist"'), "Associate promotion must target Specialist.");
expect(specialistRunner.includes("apply_agent_level_promotion"), "Specialist promotion must use the governed promotion RPC.");
expect(specialistRunner.includes("loadProfessionalRuntimeContext"), "Candidate must use source-backed professional foundations.");
expect(specialistRunner.includes("Do not invent product features"), "Candidate instructions must explicitly prevent unverified product capability claims.");
expect(specialistRunner.includes('String(existing.verdict).toUpperCase() === "PASS"'), "A failed Specialist attempt must be retryable while a passed result remains reusable.");
expect(specialistRunner.includes("supersedes_evaluation_id"), "Remediation evidence must preserve the superseded attempt reference.");
expect(remediation.includes("distinct on (r.suite_version,r.scenario_id)"), "Readiness must use the latest valid attempt per suite and scenario.");
expect(remediation.includes("Claim discipline: never state a product feature"), "Copywriter production instructions must be hardened after claim-discipline failure.");

for (const target of ["senior", "lead", "principal", "director"]) {
  expect(progressionMigration.includes(`advertising_agency_${target}`), `Continuous progression catalog does not publish ${target} benchmark.`);
}
expect(progressionMigration.includes("cross join scenario_seed"), "Every higher-level agency suite must include the common domain/holdout/adversarial progression contract.");
expect(progressionRunner.includes('const LEVELS = ["associate", "specialist", "senior", "lead", "principal", "director"]'), "Professional progression ladder is incomplete.");
expect(progressionRunner.includes("nextProfessionalLevel"), "Next-level target resolution is missing.");
expect(progressionRunner.includes("runAgencySpecialistBenchmark"), "Associate → Specialist must preserve the proven Specialist runner.");
expect(progressionRunner.includes('counts_toward_experience: false'), "Higher-level synthetic benchmarks must never count as validated real-world experience.");
expect(!progressionRunner.includes('counts_toward_experience: true'), "Higher-level benchmark runner must not synthesize real-world experience.");
expect(progressionRunner.includes("apply_agent_level_promotion"), "Higher-level promotion must use the governed promotion RPC.");
expect(progressionRunner.includes('feature: "agent.evaluation"'), "Higher-level progression must use the canonical AI Request Gateway.");
expect(progressionRunner.includes("supersedes_evaluation_id"), "Higher-level failed attempts must support governed remediation history.");
expect(actions.includes("runAgencyNextLevelBenchmark") && actions.includes("isAgencyProgressionRole"), "Assessment action must route governed progression roles to continuous next-level progression.");
expect(actions.includes("&status=${resultStatus}"), "Assessment redirect must preserve pass/fail presentation semantics.");
expect(page.includes("Current certified level") && page.includes("Next target level"), "Assessment UI must make current and next level explicit.");
expect(page.includes("Run ${titleCase(targetLevel)} benchmark"), "Assessment UI must expose the next-level benchmark action.");
expect(page.includes("Enable the Agent runtime from its profile") && page.includes("becomes available immediately after activation"), "Paused Agents must explain how benchmark access becomes available after activation.");
expect(page.includes("PendingBenchmarkButton") && page.includes('query.status === "fail" ? "form-error" : "form-success"'), "Assessment page must show running state and render failed benchmarks as failures.");
expect(pending.includes("useFormStatus") && pending.includes("Benchmark running…") && pending.includes("disabled={pending}"), "Benchmark submit control must visibly disable duplicate submissions while running.");

if (failures.length) {
  console.error("Phase 5 Agent progression validation failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`Phase 5 continuous progression validation passed (${originalAgencyRoles.length + coverageRoles.length} governed roles; Specialist through Director ladder).`);
