import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildW02Blueprint, assertW02Blueprint, canReadW02, fixtureUuid, W02_STAGING_REF, W02_PRODUCTION_REF } from "./fixtures/w02-blueprint.mjs";

const blueprint = buildW02Blueprint();
assertW02Blueprint(blueprint);
assert.equal(W02_STAGING_REF, "viqjdgohtxqkrdgwtull");
assert.notEqual(W02_STAGING_REF, W02_PRODUCTION_REF);
assert.deepEqual(blueprint, buildW02Blueprint(), "blueprint must be byte-for-byte repeatable");
assert.match(fixtureUuid("org:A"), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(blueprint.negativeCases.length, 37);
assert.equal(blueprint.companies.filter((c) => c.templateKey === "ready_ai_advertising_agency_v1").length, 2);
assert.equal(blueprint.companies.filter((c) => c.templateKey === "ready_software_company_v1").length, 1);

for (const u of blueprint.users) {
  for (const c of blueprint.companies) {
    const member = blueprint.memberships.some((m) => m.companyKey === c.key && m.userKey === u.key);
    assert.equal(canReadW02(blueprint, u.key, c.key), member);
    assert.equal(canReadW02(blueprint, u.key, c.key, "finance.read"), u.key === c.key + "_finance_authorized");
  }
}
for (const negative of blueprint.negativeCases) {
  assert.equal(canReadW02(blueprint, negative.userKey, negative.forbiddenCompanyKey), false);
  assert.equal(canReadW02(blueprint, negative.userKey, negative.forbiddenCompanyKey, "finance.read"), false);
  assert.equal(negative.forbiddenOrganizationId, blueprint.companies.find((c) => c.key === negative.forbiddenCompanyKey).id);
}
for (const key of ["A", "B", "C"]) {
  assert.ok(!canReadW02(blueprint, key + "_owner", key, "finance.read"), "owner must not inherit confidential finance");
  assert.ok(!canReadW02(blueprint, key + "_admin", key, "finance.read"), "executive is not a finance entitlement");
  assert.ok(!canReadW02(blueprint, key + "_project_manager", key, "finance.read"), "manager is not a finance entitlement");
  assert.ok(!canReadW02(blueprint, key + "_finance_restricted", key, "finance.read"));
}
assert.equal(canReadW02(blueprint, "shared", "C"), false);
assert.equal(canReadW02(blueprint, "shared", "A"), true);
assert.equal(canReadW02(blueprint, "shared", "B"), true);

// This is an offline lifecycle simulation, NOT evidence of a successful staging teardown.
const materialized = { users: new Map(), organizations: new Map(), memberships: new Map(), projects: new Map(), grants: new Map() };
function offlineSetup() {
  for (const u of blueprint.users) materialized.users.set(u.key, u.email);
  for (const c of blueprint.companies) {
    materialized.organizations.set(c.id, c);
    materialized.projects.set(c.projectId, c.id);
  }
  for (const m of blueprint.memberships) materialized.memberships.set(m.companyKey + ":" + m.userKey, m.dbRole);
  for (const g of blueprint.grants) materialized.grants.set(g.id, g);
}
function offlineTeardown() {
  materialized.projects.clear();
  materialized.grants.clear();
  materialized.memberships.clear();
  materialized.organizations.clear();
  materialized.users.clear();
}
for (let run = 0; run < 2; run++) {
  offlineSetup();
  assert.equal(materialized.users.size, 19);
  assert.equal(materialized.organizations.size, 3);
  assert.equal(materialized.memberships.size, 20);
  assert.equal(materialized.projects.size, 3);
  assert.equal(materialized.grants.size, 3);
  offlineTeardown();
  assert.ok(Object.values(materialized).every((v) => v.size === 0));
}

const stagingRunner = readFileSync("scripts/fixtures/w02-staging.mjs", "utf8");
assert.match(stagingRunner, /assert\.equal\(ref, W02_STAGING_REF/);
assert.match(stagingRunner, /assert\.equal\(url, "https:\/\/"/);
assert.match(stagingRunner, /W02_W01_VERIFIED/);
assert.match(stagingRunner, /status: "pending"/);
assert.match(stagingRunner, /base_price: 0/);
assert.match(stagingRunner, /finally \{ await teardown\(\); \}/);
assert.match(stagingRunner, /set_active_organization/);
assert.match(stagingRunner, /crm_can/);
assert.match(stagingRunner, /admin\.auth\.admin\.deleteUser/);
assert.match(stagingRunner, /await auditCheck\(\);/, "historical audit references must be checked before any destructive teardown");
assert.match(stagingRunner, /project_manager_history/, "history must be protected");
assert.match(stagingRunner, /crm_audit_log/, "CRM audit must be protected");
assert.match(stagingRunner, /destructive teardown forbidden/, "cleanup must fail closed when references exist");
console.log("PASS W02 offline contract: 3 tenants, 19 users, 20 memberships, 37 forbidden user/tenant pairs, 2 repeatable simulated setup/teardown runs.");
console.log("LIVE RLS: previously PASS on staging. Audit-preserving live teardown and repeatability remain NOT ACCEPTED.");
