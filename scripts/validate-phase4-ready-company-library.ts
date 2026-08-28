import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260828090000_ready_ai_company_library.sql", "utf8");
const standardMigration = readFileSync("supabase/migrations/20260828101500_ready_company_minimum_standard.sql", "utf8");
const enforcementMigration = readFileSync("supabase/migrations/20260828102500_ready_company_standard_enforcement.sql", "utf8");
const standardDoc = readFileSync("docs/phase4-ready-company-minimum-standard.md", "utf8");
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

mustContain(standardDoc, [
  "Mandatory company functions",
  "Generic Business Connector fallback",
  "Advertising Agency extension",
  "Finance / Accounting",
  "Legal / Compliance",
  "People / Workforce",
  "budget/spend",
  "Meta Marketing",
  "Google Ads",
  "YouTube",
  "TikTok for Business",
  "LinkedIn Marketing",
]);

mustContain(standardMigration, [
  "minimum_standard_version",
  "function_coverage",
  "integration_family_coverage",
  "generic_connector_fallback",
  "generic_business_api",
  "accounting_erp",
  "crm_sales",
  "website_cms",
  "legal_contracts",
  "people_hris",
  "meta_marketing",
  "google_ads",
  "youtube",
  "tiktok_business",
  "linkedin_marketing",
  "advertising_finance_accounting_manager",
  "advertising_legal_compliance_counsel",
  "advertising_operations_people_manager",
  "'budget.modify','restricted','human_only'",
  "provider_adapters_must_be_verified_before_execution",
  "maturity='preview'",
  "ready_company_minimum_standard_status",
]);

mustContain(enforcementMigration, [
  "company_templates_stable_minimum_standard_check",
  "company_templates_advertising_extension_check",
  "finance_accounting",
  "legal_compliance",
  "people_workforce",
  "generic_business_api",
  "meta_marketing",
  "google_ads",
  "youtube",
  "tiktok_business",
  "linkedin_marketing",
  "spend_requires_human_ceo",
]);

// Contracts for not-yet-verified external adapters must fail closed rather than pretending to be live.
for (const provider of ["generic_business_api", "meta_marketing", "google_ads", "youtube", "tiktok_business", "linkedin_marketing"]) {
  assert.ok(standardMigration.includes(`('${provider}'`) || standardMigration.includes(`  ('${provider}'`), `Missing provider contract: ${provider}`);
}
assert.ok(standardMigration.includes("false,'1.0.0'"), "Unverified provider adapters must be registered disabled");
assert.ok(!standardMigration.includes("'budget.modify','autonomous'"), "Advertising budget changes must never be autonomous");
assert.ok(!standardMigration.includes("'budget.modify','approval_required'"), "Advertising spend must remain Human CEO controlled by default");

// Marketplace UI must preserve the same governed provisioning and immutable-version semantics.
mustContain(page, [
  "RYTHM READY COMPANY MARKETPLACE",
  "Immutable catalog releases",
  "template_snapshot_digest",
  "provisionCompanyTemplate",
  "agent_template_refs",
]);
assert.ok(page.includes("supported_product_codes.includes"), "Marketplace must enforce active product entitlement before provisioning");
assert.ok(page.includes("max_active_agents >= template.agent_template_refs.length"), "Marketplace must enforce Agent capacity before provisioning");
assert.ok(page.includes('template.template_key === "ready_software_company_v1"'), "Legacy Software project blueprint must not be offered to unrelated ready-company templates");

mustContain(actions, [
  'rpc("provision_company_template_v2"',
  "version%20snapshot%20is%20locked",
  "external%20actions%20remain%20disabled",
]);

console.log("Phase 4 Ready AI Company Library + Minimum Standard contract validation passed.");