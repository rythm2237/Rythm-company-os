import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function requireEvidence(haystack: string, needle: string, label: string) {
  if (!haystack.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

const migration = source(
  "supabase/migrations/20260902170000_operational_agent_readiness.sql",
);
const gateway = source("lib/integrations/execution-gateway.ts");
const directory = source("app/(app)/agents/page.tsx");
const profile = source("app/(app)/agents/[code]/page.tsx");
const taskPage = source("app/(app)/agents/[code]/task/page.tsx");

for (const [needle, label] of [
  ["agent_position_contracts", "position contract"],
  ["agent_autonomy_profiles", "autonomy profile"],
  ["agent_work_assignments", "work assignment ledger"],
  ["agent_work_assignment_events", "append-only work events"],
  ["agent_operational_readiness_v1", "operational readiness function"],
  ["organization_agent_operational_readiness_v1", "organization readiness function"],
  ["POSITION_CONTRACT_UNAPPROVED", "truthful contract blocker"],
  ["NO_VERIFIED_WORK", "verified-work blocker"],
  ["NO_OPERATIONAL_EXECUTION", "execution blocker"],
  ["requested_by='agent'", "Agent-initiated tool evidence"],
  ["verification_result->>'status'='verified'", "external verification evidence"],
  ["counts_toward_experience=true", "validated experience evidence"],
  ["enforce_agent_autonomy_on_execution_v1", "database autonomy guard"],
] as const) requireEvidence(migration, needle, label);

requireEvidence(
  migration,
  "Synthetic evaluation is not operational experience",
  "anti-hallucination contract boundary",
);
requireEvidence(
  migration,
  "Exactly one execution evidence reference is required",
  "real execution linkage",
);
requireEvidence(
  migration,
  "Terminal, Agent-owned execution evidence is required",
  "terminal evidence validation",
);
requireEvidence(
  migration,
  "revoke all on public.agent_position_contracts",
  "fail-closed table grants",
);
requireEvidence(
  migration,
  "Service role required",
  "service-only outcome recording",
);

requireEvidence(gateway, "agent_autonomy_profiles", "Gateway autonomy lookup");
requireEvidence(gateway, "autonomyAllowsRequest", "Gateway autonomy authorization");
requireEvidence(gateway, "autonomyRequiresApproval", "Gateway approval escalation");
requireEvidence(directory, "Position readiness", "directory readiness display");
requireEvidence(profile, "Operational position readiness", "profile readiness display");
requireEvidence(taskPage, "No synthetic experience", "assignment evidence disclosure");
requireEvidence(taskPage, "reviewWorkOutcome", "human outcome verification");
requireEvidence(
  source("app/(app)/agents/[code]/task/actions.ts"),
  "record_agent_work_outcome_v1",
  "Agent console evidence linkage",
);

console.log(
  "Operational Agent readiness validation passed: contracts, autonomy, real-work evidence, Gateway enforcement and UI disclosure are present.",
);
