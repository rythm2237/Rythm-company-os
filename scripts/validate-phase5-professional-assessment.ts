import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const benchmarkMigration = read("supabase/migrations/20260830171000_gtm_professional_benchmark.sql");
const readinessFix = read("supabase/migrations/20260830171100_fix_professional_readiness_semantics.sql");
const runner = read("lib/agent-professional-assessment.ts");
const contracts = read("lib/ai/gateway-contracts.ts");
const profile = read("app/(app)/agents/[code]/page.tsx");
const assessmentPage = read("app/(app)/agents/[code]/assessment/page.tsx");
const assessmentActions = read("app/(app)/agents/[code]/assessment/actions.ts");
const pendingControl = read("app/(app)/agents/[code]/assessment/PendingBenchmarkButton.tsx");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Phase 5 professional assessment validation failed: ${message}`);
}

assert(benchmarkMigration.includes("create table if not exists public.role_benchmark_scenarios"), "role benchmark scenario registry is missing");
assert(benchmarkMigration.includes("alter table public.role_benchmark_scenarios enable row level security"), "benchmark scenario RLS is missing");
assert(benchmarkMigration.includes("revoke all on table public.role_benchmark_scenarios from anon, authenticated"), "benchmark scenario write surface is not fail-closed");
assert(benchmarkMigration.includes("grant select, references, trigger on table public.role_benchmark_scenarios to authenticated"), "authenticated benchmark access is not read-only");

for (const key of [
  "gtm_market_entry_strategy",
  "gtm_channel_experiment_design",
  "gtm_holdout_conflicting_signals",
  "gtm_adversarial_spend_and_claims",
]) assert(benchmarkMigration.includes(key), `GTM benchmark scenario ${key} is missing`);

for (const source of [
  "Bain Go-to-Market Strategy",
  "Strategic Management I",
  "Google Ads Help",
  "Google Analytics Developer Documentation",
  "LinkedIn Marketing Solutions",
  "Meta Business Help Center",
  "FTC Advertising & Marketing",
]) assert(benchmarkMigration.includes(source), `GTM benchmark source ${source} is missing`);

assert(benchmarkMigration.includes("if v_role <> 'service_role' then raise exception 'service_role required'"), "professional promotion is not service-role gated");
assert(benchmarkMigration.includes("'authority_change',false"), "professional promotion must explicitly preserve runtime authority");
assert(readinessFix.includes("where r.agent_id=p_agent_id;"), "readiness must evaluate the complete result history");
assert(!readinessFix.includes("where r.agent_id=p_agent_id and r.verdict='PASS';"), "failed evaluations must not disappear from readiness average/count");
assert(readinessFix.includes("v_requires_adversarial := coalesce((v_requirements->>'adversarial_required')::boolean,false)"), "adversarial evidence must be target-level driven");
assert(readinessFix.includes("count(*) filter(where r.verdict='PASS')"), "readiness should retain explicit pass count without hiding failures");

assert(contracts.includes('| "agent.evaluation"'), "AI Gateway assessment feature is missing");
assert(runner.includes("executeAiRequest"), "professional assessment must use the canonical AI Gateway");
assert(runner.includes('feature: "agent.evaluation"'), "professional assessment is not routed as Agent evaluation");
assert(runner.includes("loadProfessionalRuntimeContext"), "candidate benchmark must use the source-backed professional foundation");
assert(!runner.includes('from "@/lib/ai/agent-provider"'), "professional assessment must not call the provider layer directly");
assert(!runner.includes("runAgent("), "professional assessment must not bypass the AI Gateway");
assert(runner.includes("counts_toward_experience: false"), "synthetic benchmark evidence must not count as real-world experience");
assert(!runner.includes("counts_toward_experience: true"), "benchmark runner must never synthesize validated real-world experience");
assert(runner.includes("governanceViolation"), "governance violation must participate in benchmark verdict");
assert(runner.includes("attemptSequentialPromotion"), "promotion must be sequential and readiness-gated");
assert(runner.includes('current === "associate" ? "specialist"'), "Associate must promote to Specialist before Senior");

assert(profile.includes("Professional assessment"), "Agent profile does not expose professional assessment workspace");
assert(profile.includes("/assessment"), "Agent profile assessment navigation is missing");
assert(assessmentActions.includes("requireOwnerOrganizationContext"), "benchmark execution is not owner-gated");
assert(assessmentActions.includes("runNextProfessionalBenchmark"), "assessment action is not connected to the governed runner");
assert(assessmentPage.includes("PendingBenchmarkButton") && pendingControl.includes("Benchmark running…"), "professional assessment execution control is missing");
assert(pendingControl.includes("disabled={pending}"), "professional assessment must disable duplicate submissions while running");
assert(assessmentPage.includes("never count as validated real-world experience") || assessmentPage.includes("never count as real-world experience"), "UI must disclose benchmark/experience separation");
assert(assessmentPage.includes("cannot publish, spend money, change pricing"), "UI must disclose execution boundaries");

console.log("Phase 5 professional assessment validation passed.");
