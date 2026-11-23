import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [subject, foreign, org, account, foreignAccount, workspace, foreignWorkspace, companyWorkspace,
  target, retained, unrelated, company, request, secondRequest, unverified] =
  Array.from({ length: 15 }, (_, index) => id(index + 1));

const migration = filename => readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8");
const dispose = (caseId, memoryId, decision, basis = null, review = null) => db.query(
  "select privacy_dispose_personal_memory($1, $2, $3, $4, $5) as disposition",
  [caseId, memoryId, decision, basis, review],
);

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table organizations (id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create function is_org_owner(uuid) returns boolean language sql as 'select false';
  `);
  await db.exec(await migration("20260814232000_privacy_requests.sql"));
  const foundation = await migration("20260920213000_rythm_ai_workspace_foundation.sql");
  await db.exec(foundation.split("-- Usage wallets")[0]);
  await db.exec(await migration("20261123151000_w17_personal_memory_erasure.sql"));
  await db.query("insert into auth.users values ($1), ($2)", [subject, foreign]);
  await db.query("insert into organizations values ($1)", [org]);
  await db.query(
    "insert into aiw_accounts (id, user_id, kind) values ($1,$2,'personal'), ($3,$4,'personal')",
    [account, subject, foreignAccount, foreign],
  );
  await db.query(
    `insert into aiw_workspaces (id, account_id, organization_id, kind, name)
     values ($1,$2,null,'personal','A'), ($3,$4,null,'personal','B'), ($5,null,$6,'company','C')`,
    [workspace, account, foreignWorkspace, foreignAccount, companyWorkspace, org],
  );
  await db.query(
    `insert into aiw_memories (id, workspace_id, scope, title, content, created_by)
     values ($1,$2,'personal','A','ERASE_CANARY',$3), ($4,$2,'personal','A','RETAIN_CANARY',$3),
            ($5,$6,'personal','B','FOREIGN_CANARY',$7), ($8,$9,'company','C','COMPANY_CANARY',$3)`,
    [target, workspace, subject, retained, unrelated, foreignWorkspace, foreign, company, companyWorkspace],
  );
  await db.query(
    `insert into privacy_requests (id, requested_by_user_id, request_type, scope, status, verified_at)
     values ($1,$2,'deletion','account','in_progress',now()),
            ($3,$2,'deletion','account','in_progress',now()),
            ($4,$2,'deletion','account','received',null)`,
    [request, subject, secondRequest, unverified],
  );
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(dispose(request, target, "erase"), { code: "42501" });
    await assert.rejects(db.query("select * from privacy_memory_dispositions"), { code: "42501" });
    await db.exec("reset role");
  }
  await assert.rejects(dispose(unverified, target, "erase"), { code: "42501" });
  await assert.rejects(dispose(request, unrelated, "erase"), { code: "42501" });
  await assert.rejects(dispose(request, company, "erase"), { code: "42501" });
  await assert.rejects(dispose(request, retained, "retain"), { code: "22023" });
  const review = new Date(Date.now() + 86400000).toISOString();
  assert.deepEqual((await dispose(request, retained, "retain", "legal_obligation", review)).rows, [{ disposition: "retained" }]);
  await assert.rejects(dispose(secondRequest, retained, "erase"), { code: "55000" });
  await assert.rejects(db.query("delete from aiw_memories where id = $1", [retained]), { code: "55000" });
  await assert.rejects(db.query("update aiw_memories set content = 'changed' where id = $1", [retained]), { code: "55000" });
  await assert.rejects(db.query("delete from aiw_accounts where id = $1", [account]), { code: "55000" });
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.deepEqual((await dispose(request, target, "erase")).rows, [{ disposition: "erased" }]);
  }
  assert.deepEqual((await db.query("select content from aiw_memories order by id")).rows.map(row => row.content),
    ["RETAIN_CANARY", "FOREIGN_CANARY", "COMPANY_CANARY"]);
  const evidence = (await db.query("select * from privacy_memory_dispositions order by disposition")).rows;
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].disposition, "erased");
  assert.equal(evidence[1].retention_basis, "legal_obligation");
  assert.doesNotMatch(JSON.stringify(evidence), /CANARY/);
  console.log("W17 personal memory erasure: verified case, operator access, retention, tenant isolation, retry and minimal evidence passed");
} finally {
  await db.close();
}
