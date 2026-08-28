import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260828090000_ready_ai_company_library.sql", "utf8");
const page = readFileSync("app/(app)/studio/templates/page.tsx", "utf8");
const actions = readFileSync("app/(app)/studio/templates/actions.ts", "utf8");

const mustContain = (source: string, values: string[]) => values.forEach((value) => assert.ok(source.includes(value), `Missing Phase 4 contract: ${value}`));

mustContain(migration, [
  "ready_saas_startup_v1",
  "array['ready_company','custom_company','company_studio']",
  '"agent_count":10',
  "agents_initial_status",
  "external_actions_allowed",
  "template_snapshot",
  "template_snapshot_digest",
  "extensions.digest",
  "Installed company template snapshots are immutable",
  "human_ceo_authority",
  "high_risk_requires_approval",
  "production_release_requires_approval",
  "tenant_isolation_required",
  "saas_startup_delivery_v1",
  "company_template_integration_profiles",
  "company_template_integration_requirements",
]);

assert.ok(!migration.includes("grant execute on function public.capture_company_template_installation_snapshot_v1"), "Snapshot trigger must not become a callable customer RPC");
assert.ok(migration.includes("revoke insert,update,delete,truncate on public.company_templates from anon,authenticated"), "Catalog must remain read-only to customers");

mustContain(page, [
  "RYTHM READY COMPANY LIBRARY · PHASE 4",
  "Version snapshot isolation",
  "template_snapshot_digest",
  "Provision this company",
  "external execution authority are never copied",
]);
assert.ok(page.includes('template.template_key === "ready_software_company_v1"'), "Legacy Software project blueprint must not be offered to unrelated ready-company templates");

mustContain(actions, [
  'rpc("provision_company_template_v2"',
  "version%20snapshot%20is%20locked",
  "external%20actions%20remain%20disabled",
]);

console.log("Phase 4 Ready AI Company Library contract validation passed.");