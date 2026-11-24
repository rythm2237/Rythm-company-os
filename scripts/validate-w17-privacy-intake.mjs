import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const org = "20000000-0000-4000-8000-000000000001";
const otherOrg = "20000000-0000-4000-8000-000000000002";
const sql = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth to authenticated;
    create table organizations (id uuid primary key);
    create table organization_members (
      organization_id uuid, user_id uuid, role text, membership_status text
    );
    grant select on organization_members to authenticated;
  `);
  await db.query("insert into organizations values ($1), ($2)", [org, otherOrg]);
  await db.query(
    "insert into organization_members values ($1, $2, 'owner', 'active'), ($3, $2, 'owner', 'inactive')",
    [org, owner, otherOrg],
  );
  const lifecycle = await sql("20260926074014_customer_admin_agent_lifecycle.sql");
  const ownerPolicy = lifecycle.match(/create or replace function public\.is_org_owner[\s\S]*?\$\$;/i);
  assert.ok(ownerPolicy, "missing deployed active-owner helper");
  await db.exec(ownerPolicy[0]);
  await db.exec(await sql("20260814232000_privacy_requests.sql"));
  await db.exec(await sql("20261123150000_w17_privacy_request_intake.sql"));
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${owner}'`);
  const { rows } = await db.query(
    `insert into privacy_requests (requested_by_user_id, organization_id, request_type, scope)
     values ($1, $2, 'deletion', 'organization')
     returning status, verified_at, completed_at, due_at > received_at as has_deadline`,
    [owner, org],
  );
  assert.deepEqual(rows, [{ status: "received", verified_at: null, completed_at: null, has_deadline: true }]);
  for (const requestType of ["access", "export"]) {
    await db.query("insert into privacy_requests (requested_by_user_id, request_type) values ($1, $2)", [owner, requestType]);
  }
  await assert.rejects(db.query("select operator_note from privacy_requests"), { code: "42501" });
  await assert.rejects(db.query("update privacy_requests set status = 'completed'"), { code: "42501" });
  await assert.rejects(db.query(
    "insert into privacy_requests (requested_by_user_id, request_type, status) values ($1, 'deletion', 'completed')",
    [owner],
  ), { code: "42501" });
  await assert.rejects(db.query(
    "insert into privacy_requests (requested_by_user_id, organization_id, request_type, scope) values ($1, $2, 'export', 'organization')",
    [owner, otherOrg],
  ), { code: "42501" });
  await assert.rejects(db.query(
    "insert into privacy_requests (requested_by_user_id, request_type) values ($1, 'access')",
    [other],
  ), { code: "42501" });
  await db.exec(`set request.jwt.claim.sub = '${other}'`);
  assert.deepEqual((await db.query("select id from privacy_requests")).rows, []);
  await assert.rejects(db.query(
    "insert into privacy_requests (requested_by_user_id, organization_id, request_type, scope) values ($1, $2, 'export', 'organization')",
    [other, org],
  ), { code: "42501" });
  console.log("W17 privacy intake: access/export/erasure receipt, deadline, tenant isolation and operator field protection passed");
} finally {
  await db.close();
}
