import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const runner = read("lib/agency-specialist-assessment.ts");
const migration = read("supabase/migrations/20260831044500_agency_specialist_benchmarks.sql");
const actions = read("app/(app)/agents/[code]/assessment/actions.ts");
const page = read("app/(app)/agents/[code]/assessment/page.tsx");

const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

const roles = [
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

for (const role of roles) {
  expect(runner.includes(`\"${role}\"`), `Runner does not support ${role}.`);
  expect(migration.includes(`('${role}'`), `Benchmark catalog does not seed ${role}.`);
}
expect(runner.includes('feature: "agent.evaluation"'), "Agency Specialist evaluation must use the canonical AI Request Gateway feature.");
expect(runner.split('feature: "agent.evaluation"').length >= 3, "Candidate and independent judge must both use the evaluation Gateway feature.");
expect(runner.includes('external_actions_allowed: false'), "Agency Specialist evidence must record external actions as disabled.");
expect(runner.includes('p_target_level: "specialist"'), "Promotion must target Specialist only.");
expect(runner.includes("apply_agent_level_promotion"), "Promotion must use the governed promotion RPC.");
expect(runner.includes("loadProfessionalRuntimeContext"), "Candidate must use source-backed professional foundations.");
expect(runner.includes("governance_violation"), "Independent judge must enforce governance evidence.");
expect(migration.includes("minimum_score,source_ids") && migration.includes("85,seed.source_ids"), "Specialist benchmark threshold must be 85.");
expect(actions.includes("runAgencySpecialistBenchmark") && actions.includes("isAgencySpecialistRole"), "Assessment action must route supported agency roles to the Specialist runner.");
expect(page.includes("getAgencySpecialistAssessmentSummary") && page.includes("Advertising Agency Specialist Benchmark") === false, "Assessment page must resolve agency summaries dynamically without hard-coded role-specific copy.");

if (failures.length) {
  console.error("Phase 5 Agency Specialist validation failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`Phase 5 Agency Specialist validation passed (${roles.length} role benchmarks).`);
