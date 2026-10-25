import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// W02 contract: identities and UUIDs are synthetic, stable across runs, and NEVER valid customers.
export const W02_STAGING_REF = "viqjdgohtxqkrdgwtull";
export const W02_PRODUCTION_REF = "dezbacyuvsdrlpmmpjht";
export const W02_ROLES = ["owner", "admin", "project_manager", "member", "finance_restricted", "finance_authorized"];
export const W02_TABLES = ["organizations", "organization_members", "projects", "organization_entitlements", "crm_access_grants"];

export function fixtureUuid(label) {
  const hex = createHash("sha256").update("rythm:w02:v1:" + label).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const v = hex.join("");
  return [v.slice(0, 8), v.slice(8, 12), v.slice(12, 16), v.slice(16, 20), v.slice(20)].join("-");
}

export function buildW02Blueprint() {
  const companies = ["A", "B", "C"].map((key) => ({
    key,
    id: fixtureUuid("org:" + key),
    name: "W02 SYNTHETIC " + key + (key === "C" ? " Software" : " Advertising"),
    slug: "w02-synthetic-" + key.toLowerCase() + "-staging-v1",
    templateKey: key === "C" ? "ready_software_company_v1" : "ready_ai_advertising_agency_v1",
    productCode: key === "C" ? "company_studio" : "ready_company",
    projectId: fixtureUuid("project:" + key),
  }));
  const users = [];
  for (const company of companies) {
    for (const label of W02_ROLES) {
      const key = company.key + "_" + label;
      users.push({ key, email: "w02-" + company.key.toLowerCase() + "-" + label.replaceAll("_", "-") + "@example.test" });
    }
  }
  users.push({ key: "shared", email: "w02-shared@example.test" });
  const memberships = companies.flatMap((company) => W02_ROLES.map((label) => ({
    companyKey: company.key,
    userKey: company.key + "_" + label,
    persona: label,
    dbRole: label === "owner" ? "owner" : label === "admin" ? "executive" : "operator",
  })));
  for (const companyKey of ["A", "B"]) {
    memberships.push({ companyKey, userKey: "shared", persona: "shared", dbRole: "operator" });
  }
  const grants = companies.map((company) => ({
    companyKey: company.key, userKey: company.key + "_finance_authorized", capability: "finance.read",
    id: fixtureUuid("finance-grant:" + company.key),
  }));
  const negativeCases = users.flatMap((user) =>
    companies.filter((c) => !memberships.some((m) => m.companyKey === c.key && m.userKey === user.key))
      .map((c) => ({ userKey: user.key, forbiddenCompanyKey: c.key, forbiddenOrganizationId: c.id, forbiddenProjectId: c.projectId }))
  );
  return { version: "w02-v1", stagingRef: W02_STAGING_REF, companies, users, memberships, grants, negativeCases };
}

export function assertW02Blueprint(f) {
  assert.equal(f.companies.length, 3);
  assert.equal(f.users.length, 19);
  assert.equal(f.memberships.length, 20);
  assert.equal(f.grants.length, 3);
  assert.equal(new Set(f.companies.map((c) => c.id)).size, 3);
  assert.equal(new Set(f.users.map((u) => u.email)).size, 19);
  assert.ok(f.companies.every((c) => c.slug.startsWith("w02-synthetic-")));
  assert.ok(f.users.every((u) => u.email.endsWith("@example.test")));
  for (const company of f.companies) {
    assert.equal(f.memberships.filter((m) => m.companyKey === company.key).length, company.key === "C" ? 6 : 7);
    assert.equal(f.memberships.filter((m) => m.companyKey === company.key && m.dbRole === "owner").length, 1);
    const financial = f.memberships.find((m) => m.userKey === company.key + "_finance_authorized");
    assert.equal(financial.dbRole, "operator");
    assert.equal(f.grants.filter((g) => g.companyKey === company.key && g.userKey === financial.userKey).length, 1);
    assert.ok(!f.grants.some((g) => g.userKey === company.key + "_finance_restricted"));
    assert.ok(!f.grants.some((g) => g.userKey === company.key + "_project_manager"));
    assert.ok(f.negativeCases.every((n) => n.forbiddenCompanyKey !== company.key || !f.memberships.some((m) => m.companyKey === company.key && m.userKey === n.userKey)));
  }
  assert.deepEqual(f.memberships.filter((m) => m.userKey === "shared").map((m) => m.companyKey).sort(), ["A", "B"]);
  assert.ok(f.negativeCases.length > 0);
  return true;
}

export function canReadW02(f, userKey, companyKey, capability = "operational") {
  const member = f.memberships.some((m) => m.userKey === userKey && m.companyKey === companyKey);
  if (!member) return false;
  if (capability === "finance.read") return f.grants.some((g) => g.userKey === userKey && g.companyKey === companyKey && g.capability === capability);
  return capability === "operational";
}
