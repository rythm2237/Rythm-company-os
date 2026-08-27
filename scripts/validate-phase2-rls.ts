import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const baseline = readFileSync(
  "supabase/migrations/20260824182500_integration_tool_execution.sql",
  "utf8",
).toLowerCase();
const phase2 = readFileSync(
  "supabase/migrations/20260826192947_phase2_integration_execution_gateway.sql",
  "utf8",
).toLowerCase();

for (const table of [
  "integration_tool_registry",
  "tool_execution_attempts",
  "execution_rollout_config",
  "execution_validation_records",
]) {
  assert.match(
    phase2,
    new RegExp(`alter table public\\.${table} enable row level security`),
    `${table} must enable RLS`,
  );
}
for (const table of [
  "organization_integrations",
  "agent_integration_grants",
  "tool_execution_requests",
  "tool_execution_events",
]) {
  assert.match(
    baseline,
    new RegExp(`alter table public\\.${table} enable row level security`),
    `${table} baseline RLS must remain enabled`,
  );
}
assert.match(
  phase2,
  /revoke insert, update, delete, truncate on table public\.tool_execution_requests from anon, authenticated/,
);
assert.match(
  phase2,
  /revoke insert, update, delete, truncate on table public\.tool_execution_events from anon, authenticated/,
);
assert.match(
  phase2,
  /execution_rollout_owner_write[\s\S]*membership_status='active'[\s\S]*m\.role='owner'/,
);
assert.match(
  phase2,
  /tool_execution_attempts_member_read[\s\S]*membership_status='active'/,
);
assert.match(
  phase2,
  /execution_validation_owner_read[\s\S]*membership_status='active'[\s\S]*m\.role='owner'/,
);
assert.match(
  phase2,
  /claim_tool_execution_v2[\s\S]*membership_status='active'[\s\S]*agent_integration_grants[\s\S]*approval_scope_mismatch[\s\S]*consumed_at=now\(\)/,
);
assert.match(
  phase2,
  /get_organization_integration_secret_service_v1[\s\S]*service role required/,
);
assert.match(
  phase2,
  /prevent_execution_secret_material[\s\S]*execution payload contains prohibited credential material/,
);
assert.match(phase2, /execution lifecycle events are append-only/);
assert.match(
  phase2,
  /record_tool_execution_lifecycle_v2[\s\S]*revoke all on function public\.record_tool_execution_lifecycle_v2[\s\S]*grant execute on function public\.record_tool_execution_lifecycle_v2[^;]*to service_role/,
);
for (const functionName of [
  "record_tool_execution_lifecycle_v2",
  "claim_tool_execution_v2",
  "claim_tool_execution_rollback_v2",
  "get_organization_integration_secret_service_v1",
  "set_organization_integration_secret_v1",
]) {
  assert.match(
    phase2,
    new RegExp(`${functionName}[\\s\\S]*?security definer set search_path=''`),
    `${functionName} must use an empty search_path`,
  );
}
assert.match(
  phase2,
  /set_organization_integration_secret_v1[\s\S]*membership_status='active'[\s\S]*m\.role='owner'[\s\S]*credential_last_rotated_at=now\(\)/,
);

console.log("Phase 2 RLS/security contract validation passed.");
