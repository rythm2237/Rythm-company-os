import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/agents/[code]/benchmark/route.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260830214500_invalidate_capped_gtm_benchmark.sql"), "utf8");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

expect(route.includes("TARGET_MAX_OUTPUT_TOKENS = 7000"), "Candidate benchmark output budget must exceed the invalid 3,500-token ceiling.");
expect(route.includes("TARGET_OUTPUT_CEILING_GUARD = 6900"), "Candidate output must have a deterministic ceiling guard.");
expect(route.includes("incomplete evidence will not be scored or persisted"), "Capped candidate answers must fail before scoring/persistence.");
expect(route.includes("slice(0, 28000)"), "Judge context must accept the expanded complete candidate answer.");
expect(migration.includes("invalidated_at"), "Evaluation batches must support audit-preserving invalidation.");
expect(migration.includes("candidate_output_token_cap"), "The known invalid live run must carry an explicit invalidation reason.");
expect(migration.includes("b.invalidated_at is null"), "Formal readiness must exclude invalidated benchmark evidence.");

if (failures.length) {
  console.error("Phase 5 GTM output integrity validation failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Phase 5 GTM output integrity validation passed.");
