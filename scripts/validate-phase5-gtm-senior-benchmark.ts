import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const suite = read("lib/agent-benchmarks/gtm-senior.ts");
const route = read("app/api/agents/[code]/benchmark/route.ts");
const page = read("app/(app)/agents/[code]/benchmark/page.tsx");
const admin = read("lib/supabase/evaluation-admin.ts");

const failures: string[] = [];
function expect(condition: boolean, message: string) { if (!condition) failures.push(message); }

const scenarioIds = [
  "gtm-market-framing",
  "gtm-channel-portfolio",
  "gtm-experiment-budget",
  "gtm-measurement-attribution",
  "gtm-governance-adversarial",
  "gtm-holdout-industrial",
];
for (const id of scenarioIds) expect(suite.includes(`id: "${id}"`), `Missing benchmark scenario: ${id}`);
expect(suite.includes('category: "holdout"'), "Senior benchmark must include a blinded holdout.");
expect(suite.includes('category: "adversarial"'), "Senior benchmark must include an adversarial scenario.");
expect(suite.includes('governanceCase: true'), "Adversarial scenario must enable deterministic governance checking.");
expect(suite.includes("Do not fabricate") || suite.includes("do not invent"), "Suite must enforce evidence/assumption discipline.");
expect(route.includes("requireActiveOwnerOrganizationContext"), "Benchmark execution must require an active owner context.");
expect(route.includes('ALLOWED_AGENT_CODE = "GTM-STRAT-001"'), "Benchmark must be restricted to the intended GTM Agent.");
expect(route.includes("loadProfessionalRuntimeContext"), "Benchmark must use the professional knowledge foundation.");
expect(!route.includes("loadCompanyKnowledgeForAgent"), "Synthetic benchmark must not use tenant/company knowledge.");
expect(route.includes("executeAiRequest"), "Target and judge execution must use the canonical AI Request Gateway.");
expect(route.split("executeAiRequest(").length >= 3, "Benchmark must use independent target and judge Gateway executions.");
expect(route.includes('external_actions_allowed: false'), "Benchmark evidence must record external actions as disabled.");
expect(route.includes("adversarialGovernanceViolation"), "Benchmark must have a deterministic adversarial governance check.");
expect(route.includes('from("agent_evaluation_results").insert'), "Protected raw evaluation evidence must be persisted.");
expect(route.includes('counts_toward_experience: false'), "Benchmark evidence must not count as real-world experience.");
expect(route.includes('p_target_level: "senior"'), "Finalization must evaluate formal Senior readiness separately.");
expect(admin.includes("SUPABASE_SERVICE_ROLE_KEY") && admin.includes('import "server-only"'), "Protected evaluator persistence must be server-only and service-role backed.");
expect(page.includes("Validated real-world experience required"), "UI must disclose the separate real-world experience requirement.");

if (failures.length) {
  console.error("Phase 5 GTM Senior benchmark validation failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`Phase 5 GTM Senior benchmark validation passed (${scenarioIds.length} scenarios).`);
