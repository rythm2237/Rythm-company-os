import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertW02Blueprint, buildW02Blueprint, W02_PRODUCTION_REF, W02_STAGING_REF } from "./w02-blueprint.mjs";

const blueprint = buildW02Blueprint();
assertW02Blueprint(blueprint);
const command = process.argv[2];
if (!["setup", "verify", "teardown", "roundtrip"].includes(command)) {
  console.error("Usage: node scripts/fixtures/w02-staging.mjs setup|verify|teardown|roundtrip");
  process.exit(2);
}

// No network call, production fallback, customer data or writes without ALL gates.
const ref = process.env.W02_STAGING_REF;
const url = process.env.W02_STAGING_SUPABASE_URL;
const serviceKey = process.env.W02_STAGING_SERVICE_ROLE_KEY;
const anonKey = process.env.W02_STAGING_ANON_KEY;
const password = process.env.W02_TEST_PASSWORD;
assert.equal(ref, W02_STAGING_REF, "W02 only permits the pre-existing dedicated staging Supabase project");
assert.notEqual(ref, W02_PRODUCTION_REF);
assert.equal(url, "https://" + W02_STAGING_REF + ".supabase.co", "Staging URL must match the allowlisted project");
assert.notEqual(process.env.VERCEL_ENV, "production");
assert.equal(process.env.W02_W01_VERIFIED, "true", "W01 owner/QA dependency must be verified before real staging runs");
assert.ok(serviceKey && anonKey && password && password.length >= 16, "Staging-only keys and 16+ char test password required");
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const state = { version: blueprint.version, projectRef: ref, organizations: blueprint.companies.map(({ key, id, projectId }) => ({ key, id, projectId })), negativeCases: blueprint.negativeCases,\n  permissionMatrix: blueprint.users.flatMap((user) => blueprint.companies.map((company) => ({ userKey: user.key, companyKey: company.key, member: blueprint.memberships.some((m) => m.userKey === user.key && m.companyKey === company.key), financeRead: blueprint.grants.some((g) => g.userKey === user.key && g.companyKey === company.key) }))), users: {} };
const statePath = resolve(process.cwd(), ".w02-fixtures", ref + ".json");
function persist() {
  mkdirSync(resolve(process.cwd(), ".w02-fixtures"), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
}
function unwrap(response, label) {
  if (response.error) throw Error(label + ": " + response.error.message);
  return response.data;
}
async function findUser(email) {
  for (let page = 1; page < 50; page++) {
    const data = unwrap(await admin.auth.admin.listUsers({ page, perPage: 100 }), "list synthetic users");
    const match = data.users.find((u) => u.email === email);
    if (match) return match;
    if (data.users.length < 100) break;
  }
  return null;
}
async function userMap() {
  const mapped = {};
  for (const u of blueprint.users) {
    const candidate = await findUser(u.email);
    if (!candidate) throw Error("Missing fixture identity " + u.key + ". Run setup first.");
    assert.equal(candidate.user_metadata?.w02_fixture, "w02-v1", "Refuse to adopt a non-W02 user");
    mapped[u.key] = candidate.id;
  }
  return mapped;
}
async function ensureUsers() {
  for (const u of blueprint.users) {
    let found = await findUser(u.email);
    if (!found) {
      const data = unwrap(await admin.auth.admin.createUser({
        email: u.email, password, email_confirm: true, user_metadata: { w02_fixture: "w02-v1" }
      }), "create " + u.key);
      found = data.user;
    }
    assert.equal(found?.email, u.email);
    assert.equal(found.user_metadata?.w02_fixture, "w02-v1");
    state.users[u.key] = found.id;
    persist();
  }
}
async function setup() {
  await ensureUsers();
  for (const c of blueprint.companies) {
    const found = unwrap(await admin.from("organizations").select("id,slug,name,owner_user_id").eq("id", c.id).maybeSingle(), "organization lookup");
    if (found) {
      assert.equal(found.slug, c.slug);
      assert.equal(found.name, c.name);
      assert.equal(found.owner_user_id, state.users[c.key + "_owner"]);
    } else {
      unwrap(await admin.from("organizations").insert({
        id: c.id, name: c.name, slug: c.slug, owner_user_id: state.users[c.key + "_owner"], status: "active"
      }), "insert " + c.key);
    }
    persist();
  }
  for (const m of blueprint.memberships) {
    const org = blueprint.companies.find((c) => c.key === m.companyKey);
    unwrap(await admin.from("organization_members").upsert({
      organization_id: org.id, user_id: state.users[m.userKey], role: m.dbRole, membership_status: "active"
    }, { onConflict: "organization_id,user_id" }), "membership " + m.userKey + ":" + m.companyKey);
  }
  for (const c of blueprint.companies) {
    const found = unwrap(await admin.from("organization_entitlements").select("id,product_code,status,selected_template_key").eq("organization_id", c.id).maybeSingle(), "entitlement lookup");
    if (found) {
      assert.equal(found.status, "pending");
      assert.equal(found.product_code, c.productCode);
      assert.equal(found.selected_template_key, c.templateKey);
    } else {
      unwrap(await admin.from("organization_entitlements").insert({
        organization_id: c.id, product_code: c.productCode, selected_template_key: c.templateKey,
        status: "pending", plan_code: "w02_synthetic", base_price: 0, ai_budget_limit: 0,
        company_template_access: false, company_builder_enabled: false, agent_builder_enabled: false
      }), "entitlement " + c.key);
    }
    const existing = unwrap(await admin.from("projects").select("id,organization_id,primary_manager_user_id").eq("id", c.projectId).maybeSingle(), "project lookup");
    if (existing) {
      assert.equal(existing.organization_id, c.id);
      assert.equal(existing.primary_manager_user_id, state.users[c.key + "_project_manager"]);
    } else {
      unwrap(await admin.from("projects").insert({
        id: c.projectId, organization_id: c.id, project_code: "W02-" + c.key,
        name: "W02 synthetic internal project " + c.key, status: "planning",
        engagement_type: "internal", primary_manager_user_id: state.users[c.key + "_project_manager"],
        created_by_user_id: state.users[c.key + "_owner"]
      }), "project " + c.key);
    }
  }
  for (const g of blueprint.grants) {
    const c = blueprint.companies.find((v) => v.key === g.companyKey);
    unwrap(await admin.from("crm_access_grants").upsert({
      id: g.id, organization_id: c.id, principal_type: "user", principal_id: state.users[g.userKey],
      capability: g.capability, resource_type: "company", resource_id: c.id, granted_by: state.users[c.key + "_owner"],
      revoked_at: null
    }, { onConflict: "organization_id,principal_type,principal_id,capability,resource_type,resource_id" }), "finance grant " + g.companyKey);
  }
  persist();
}
async function login(userKey) {
  const u = blueprint.users.find((item) => item.key === userKey);
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: u.email, password });
  if (error || !data.session || data.user.id !== state.users[userKey]) throw Error("Fixture login failed " + userKey + ": " + (error?.message ?? "identity mismatch"));
  return client;
}
async function verify() {
  state.users = await userMap();
  persist();
  for (const c of blueprint.companies) {
    const org = unwrap(await admin.from("organizations").select("id,slug,owner_user_id").eq("id", c.id).single(), "org assert");
    assert.equal(org.slug, c.slug);
    assert.equal(org.owner_user_id, state.users[c.key + "_owner"]);
    const { data: entitlement } = await admin.from("organization_entitlements").select("status,base_price,ai_budget_limit,product_code,selected_template_key").eq("organization_id", c.id).single();
    assert.equal(entitlement?.status, "pending");
    assert.equal(Number(entitlement?.base_price), 0);
    assert.equal(Number(entitlement?.ai_budget_limit), 0);
    assert.equal(entitlement?.selected_template_key, c.templateKey);
    const project = unwrap(await admin.from("projects").select("primary_manager_user_id").eq("id", c.projectId).single(), "manager assert");
    assert.equal(project.primary_manager_user_id, state.users[c.key + "_project_manager"]);
  }
  for (const m of blueprint.memberships) {
    const c = blueprint.companies.find((v) => v.key === m.companyKey);
    const membership = unwrap(await admin.from("organization_members").select("role,membership_status").eq("organization_id", c.id).eq("user_id", state.users[m.userKey]).single(), "role assert");
    assert.equal(membership.role, m.dbRole);
    assert.equal(membership.membership_status, "active");
  }
  for (const user of blueprint.users) {
    const client = await login(user.key);
    for (const c of blueprint.companies) {
      const allowed = blueprint.memberships.some((m) => m.companyKey === c.key && m.userKey === user.key);
      for (const [table, field, id] of [["organizations", "id", c.id], ["projects", "id", c.projectId], ["organization_entitlements", "organization_id", c.id]]) {
        const rows = unwrap(await client.from(table).select("*", { head: true, count: "exact" }).eq(field, id), "RLS " + table);
        assert.equal(rows, null);
        const count = await client.from(table).select("id", { count: "exact", head: true }).eq(field, id);
        if (count.error) throw Error("RLS count failed " + table + ": " + count.error.message);
        assert.equal(Number(count.count ?? 0), allowed ? 1 : 0, user.key + " -> " + c.key + " " + table);
      }
      const cap = await client.rpc("crm_can", {
        p_organization_id: c.id, p_capability: "finance.read", p_resource_type: "company", p_resource_id: c.id
      });
      if (cap.error) throw Error("finance authorization RPC: " + cap.error.message);
      assert.equal(cap.data === true, user.key === c.key + "_finance_authorized");
      if (!allowed) {
        const forged = await client.rpc("set_active_organization", { target_org_id: c.id });
        assert.ok(forged.error, "Foreign active-organization switch must fail");
      }
    }
    await client.auth.signOut();
  }
  const shared = await login("shared");
  for (const c of blueprint.companies.slice(0, 2)) {
    const switched = unwrap(await shared.rpc("set_active_organization", { target_org_id: c.id }), "shared switching");
    assert.equal(String(switched), c.id);
  }
  await shared.auth.signOut();
  persist();
  console.log("W02 staging verification passed: 3 organizations, 19 users, 20 memberships, role/finance/RLS/forged-switch checks.");
}
async function teardown() {
  // Do not delete by email prefix alone. Verify exact fixture labels and UUIDs first.
  const users = {};
  for (const u of blueprint.users) {
    const found = await findUser(u.email);
    if (found) {
      assert.equal(found.user_metadata?.w02_fixture, "w02-v1");
      users[u.key] = found.id;
      const membership = unwrap(await admin.from("organization_members").select("organization_id").eq("user_id", found.id), "membership ownership check");
      assert.ok(membership.every((m) => blueprint.companies.some((c) => c.id === m.organization_id)), "Fixture user has non-W02 membership; refusing delete");
    }
  }
  for (const c of blueprint.companies) {
    const org = unwrap(await admin.from("organizations").select("name,slug").eq("id", c.id).maybeSingle(), "cleanup org guard");
    if (org) { assert.equal(org.name, c.name); assert.equal(org.slug, c.slug); }
  }
  for (const c of blueprint.companies) {
    // Projects must be removed before memberships (manager-departure guard).
    unwrap(await admin.from("projects").delete().eq("id", c.projectId).eq("organization_id", c.id), "cleanup project");
    unwrap(await admin.from("crm_access_grants").delete().eq("organization_id", c.id).in("id", blueprint.grants.map((g) => g.id)), "cleanup grants");
    unwrap(await admin.from("organization_entitlements").delete().eq("organization_id", c.id).eq("plan_code", "w02_synthetic"), "cleanup entitlement");
    unwrap(await admin.from("organization_members").delete().eq("organization_id", c.id), "cleanup memberships");
    unwrap(await admin.from("organizations").delete().eq("id", c.id).eq("slug", c.slug), "cleanup organization");
  }
  for (const uid of Object.values(users)) unwrap(await admin.auth.admin.deleteUser(uid), "cleanup auth fixture");
  for (const c of blueprint.companies) {
    const remaining = unwrap(await admin.from("organizations").select("id").eq("id", c.id), "cleanup verification");
    assert.equal(remaining.length, 0);
  }
  state.users = {};
  persist();
  console.log("W02 teardown verified: all synthetic companies and users removed from staging.");
}
let operationFailed = false;
try {
  if (command === "setup") await setup();
  else if (command === "verify") await verify();
  else if (command === "teardown") await teardown();
  else {
    try { await setup(); await verify(); }
    finally { await teardown(); }
  }
} catch (error) {
  operationFailed = true;
  console.error("W02 " + command + " failed: " + error.message);
}
if (operationFailed) process.exitCode = 1;
