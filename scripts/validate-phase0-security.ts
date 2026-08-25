import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error Node's strip-types runner requires explicit TypeScript extensions.
import { canonicalActionsForPermission, evaluateCanonicalPermission } from "../lib/security/permissions.ts";
// @ts-expect-error Node's strip-types runner requires explicit TypeScript extensions.
import { validateReadOnlySql, wrapReadOnlySql } from "../lib/security/read-only-sql.ts";
// @ts-expect-error Node's strip-types runner requires explicit TypeScript extensions.
import { fetchPublicResource, isPublicNetworkAddress, validatePublicHttpUrl } from "../lib/security/public-url.ts";
// @ts-expect-error Node's strip-types runner requires explicit TypeScript extensions.
import { redactSecretText, redactSensitiveValue } from "../lib/security/redaction.ts";

let passed = 0;
async function test(name: string, action: () => void | Promise<void>) {
  await action();
  passed += 1;
  console.log(`✓ ${name}`);
}

function deniedSql(sql: string) {
  assert.throws(() => validateReadOnlySql(sql), /sql\.read|Unterminated/);
}

await test("canonical permission allows an explicit read permission", () => {
  assert.equal(evaluateCanonicalPermission(["read"], "read").allowed, true);
  assert.deepEqual(canonicalActionsForPermission("supabase.schema.read"), ["read"]);
});

await test("missing, unknown and ambiguous permissions default to deny", () => {
  assert.equal(evaluateCanonicalPermission(undefined, "read").allowed, false);
  assert.equal(evaluateCanonicalPermission([], "read").allowed, false);
  assert.equal(evaluateCanonicalPermission(["made_up_permission"], "read").allowed, false);
  assert.equal(evaluateCanonicalPermission(["read"], "made_up_permission").allowed, false);
});

await test("legacy permissions map without silently accepting unknown values", () => {
  assert.deepEqual(canonicalActionsForPermission("write"), ["create", "update"]);
  assert.deepEqual(canonicalActionsForPermission("external_action"), ["external_communication", "privileged"]);
  assert.deepEqual(canonicalActionsForPermission("unknown.legacy.value"), []);
});

await test("simple SELECT and read-only CTE remain supported", () => {
  assert.equal(validateReadOnlySql("select id, name from public.organizations limit 5;"), "select id, name from public.organizations limit 5");
  assert.match(validateReadOnlySql("with visible as (select id from public.projects) select count(*) from visible"), /^with/i);
  assert.match(wrapReadOnlySql("select count(*) from public.projects"), /^begin transaction read only;/i);
});

await test("DML, DDL, writable CTEs and transaction control are denied", () => {
  for (const sql of [
    "insert into x values (1)", "update x set y=1", "delete from x", "drop table x",
    "create table x(id int)", "truncate x", "with changed as (delete from x returning *) select * from changed",
    "begin; select 1", "set role postgres", "call dangerous()", "do $$ begin perform 1; end $$",
  ]) deniedSql(sql);
});

await test("multi-statement, comment and prefix bypasses are denied", () => {
  deniedSql("select 1; update x set y=2");
  deniedSql("/* harmless */ update x set y=2");
  deniedSql("with safe as (select 1) /* gap */ delete from x");
  deniedSql("explain analyze delete from x");
  deniedSql("select 1; -- trailing\n delete from x");
});

await test("non-allowlisted or schema-qualified function calls are denied", () => {
  deniedSql("select public.side_effect()");
  deniedSql('select "side_effect"()');
  deniedSql("select pg_sleep(10)");
  assert.equal(validateReadOnlySql("select count(*), max(created_at) from public.projects"), "select count(*), max(created_at) from public.projects");
});

await test("private, loopback, link-local, metadata and reserved addresses are blocked", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPublicNetworkAddress(address), false, address);
  }
  assert.equal(isPublicNetworkAddress("8.8.8.8"), true);
  assert.equal(isPublicNetworkAddress("2606:4700:4700::1111"), true);
});

await test("URL validation rejects credentials, local names, private DNS and alternate IP notation", async () => {
  const privateLookup = async () => [{ address: "10.1.2.3", family: 4 }];
  await assert.rejects(validatePublicHttpUrl("http://example.com", { lookup: privateLookup }), /private|unsafe/);
  await assert.rejects(validatePublicHttpUrl("http://localhost"), /Local|internal/);
  await assert.rejects(validatePublicHttpUrl("http://user:pass@example.com"), /credentials/);
  await assert.rejects(validatePublicHttpUrl("http://2130706433"), /Local|private|unsafe/);
  await assert.rejects(validatePublicHttpUrl("http://169.254.169.254/latest/meta-data"), /private|unsafe/);
});

await test("public URL behavior remains available", async () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const validated = await validatePublicHttpUrl("https://example.com/path", { lookup: publicLookup });
  assert.equal(validated.hostname, "example.com");
});

await test("redirects are revalidated and cannot enter a private network", async () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const redirectingFetch = async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
  await assert.rejects(fetchPublicResource("https://example.com", { lookup: publicLookup, fetchImpl: redirectingFetch as typeof fetch }), /private|unsafe/);
});

await test("response-size limits are enforced", async () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const largeFetch = async () => new Response("x".repeat(32), { status: 200, headers: { "content-length": "32" } });
  await assert.rejects(fetchPublicResource("https://example.com", { lookup: publicLookup, fetchImpl: largeFetch as typeof fetch, maxBytes: 16 }), /exceeds/);
});

await test("central redaction removes common credentials from text and objects", () => {
  const text = redactSecretText("Authorization: Bearer abc.def.ghi password=hunter2 sk_live_1234567890abcdef");
  assert.equal(text.includes("hunter2"), false);
  assert.equal(text.includes("sk_live_1234567890abcdef"), false);
  assert.equal(text.includes("abc.def.ghi"), false);
  const value = redactSensitiveValue({ access_token: "token-value", nested: { message: "api_key=super-secret" } });
  assert.equal(JSON.stringify(value).includes("token-value"), false);
  assert.equal(JSON.stringify(value).includes("super-secret"), false);
});

await test("database migration preserves least privilege and removes the SECURITY DEFINER caller bypass", () => {
  const migration = readFileSync("supabase/migrations/20260825071207_phase0_security_grant_hardening.sql", "utf8").toLowerCase();
  assert.match(migration, /security_invoker\s*=\s*true/);
  assert.doesNotMatch(migration, /current_user\s+not\s+in/);
  assert.match(migration, /revoke all on function public\.create_agent_v2[\s\S]*from public, anon/);
  assert.match(migration, /revoke all on function public\.ensure_agent_asset_profile\(\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /auth\.uid\(\) is null and not v_service_role/);
});

await test("critical Boardroom routes use the canonical active-organization context", () => {
  for (const route of ["deliberate", "summarize", "legal-triage", "legal-review", "ceo-contribute", "close"]) {
    const source = readFileSync(`app/api/meetings/${route}/route.ts`, "utf8");
    assert.match(source, /resolveOwnerApiOrganizationContext/);
    assert.doesNotMatch(source, /from\(["']organization_members["']\)/);
  }
});

await test("Demo remains synthetic and external execution remains disabled", () => {
  const demo = readFileSync("app/(public)/demo/page.tsx", "utf8");
  assert.match(demo, /synthetic/i);
  assert.match(demo, /read-only|read only/i);
  assert.match(demo, /external/i);
});

console.log(`Phase 0 security validation passed: ${passed} checks.`);
