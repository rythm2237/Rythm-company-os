import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let restored;
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [subject, foreign, org, account, foreignAccount, workspace, foreignWorkspace, companyWorkspace,
  target, retained, unrelated, company, request, secondRequest, unverified, accessRequest, file, foreignFile] =
  Array.from({ length: 18 }, (_, index) => id(index + 1));

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
    create table auth.users (id uuid primary key, email text, created_at timestamptz, last_sign_in_at timestamptz);
    create table customer_profiles (
      user_id uuid primary key, full_name text, company_name text, country_code text,
      preferred_language text, created_at timestamptz, updated_at timestamptz
    );
    create table user_ai_preferences (user_id uuid primary key, preferred_language text, updated_at timestamptz);
    create table organizations (id uuid primary key);
    create table public.audit_events (
      id bigint generated always as identity primary key, actor_user_id uuid references auth.users(id),
      created_at timestamptz not null, payload jsonb not null default '{}'
    );
    create table public.finance_documents (id uuid primary key, user_id uuid references auth.users(id));
    create table public.organization_members (id uuid primary key, user_id uuid references auth.users(id));
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create function is_org_owner(uuid) returns boolean language sql as 'select false';
  `);
  await db.exec(await migration("20260814232000_privacy_requests.sql"));
  const foundation = await migration("20260920213000_rythm_ai_workspace_foundation.sql");
  await db.exec(foundation.split("-- Usage wallets")[0]);
  await db.exec(await migration("20261123151000_w17_personal_memory_erasure.sql"));
  await db.exec(await migration("20261124100000_w17_reviewed_export_restore.sql"));
  await db.exec(await migration("20261124110000_w17_default_personal_erasure.sql"));
  await db.exec(await migration("20261124130000_w17_account_erasure_preview.sql"));
  await db.query("insert into auth.users (id, email) values ($1, 'subject@example.test'), ($2, 'foreign@example.test')", [subject, foreign]);
  await db.query("insert into organizations values ($1)", [org]);
  await db.query(
    "insert into audit_events (actor_user_id, created_at, payload) values ($1,'2026-08-01T00:00:00Z','{\"text\":\"SUBJECT_AUDIT_CANARY\"}'), ($2,'2026-08-01T00:00:00Z','{\"text\":\"FOREIGN_AUDIT_CANARY\"}')",
    [subject, foreign],
  );
  await db.query("insert into finance_documents values ($1,$2), ($3,$4)", [id(32), subject, id(33), foreign]);
  await db.query("insert into organization_members values ($1,$2), ($3,$4)", [id(34), subject, id(35), foreign]);
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
  await db.query(
    `insert into privacy_requests (id, requested_by_user_id, request_type, scope, status, verified_at, operator_note)
     values ($1,$2,'access','account','in_progress',now(),'OPERATOR_CANARY')`,
    [accessRequest, subject],
  );
  await db.query(
    `insert into aiw_files (id, workspace_id, filename, mime_type, storage_path, byte_size, sha256, created_by)
     values ($1,$2,'own.txt','text/plain','STORAGE_CANARY',1,repeat('a',64),$3),
            ($4,$5,'foreign.txt','text/plain','FOREIGN_STORAGE_CANARY',1,repeat('b',64),$6)`,
    [file, workspace, subject, foreignFile, foreignWorkspace, foreign],
  );
  await db.query(
    `insert into aiw_file_chunks (file_id, workspace_id, chunk_index, content)
     values ($1,$2,0,'OWN_CHUNK'), ($3,$4,0,'FOREIGN_CHUNK')`,
    [file, workspace, foreignFile, foreignWorkspace],
  );
  const collect = (caseId, database = db) => database.query("select * from privacy_collect_personal_export($1)", [caseId]);
  const inventory = caseId => db.query("select * from privacy_inventory_account_dependencies($1)", [caseId]);
  const preview = caseId => db.query("select * from privacy_preview_account_erasure($1)", [caseId]);
  const eraseBatch = (caseId, size = 1) => db.query(
    "select * from privacy_erase_account_memories($1, $2)", [caseId, size],
  );
  const reconcile = (caseId, memoryId, database = db) => database.query(
    "select privacy_reconcile_restored_memory($1, $2) as disposition", [caseId, memoryId],
  );
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(dispose(request, target, "erase"), { code: "42501" });
    await assert.rejects(collect(accessRequest), { code: "42501" });
    await assert.rejects(inventory(request), { code: "42501" });
    await assert.rejects(preview(request), { code: "42501" });
    await assert.rejects(eraseBatch(request), { code: "42501" });
    await assert.rejects(reconcile(request, target), { code: "42501" });
    await assert.rejects(db.query("select * from privacy_memory_dispositions"), { code: "42501" });
    await db.exec("reset role");
  }
  await assert.rejects(collect(unverified), { code: "42501" });
  await assert.rejects(collect(request), { code: "42501" });
  await assert.rejects(inventory(accessRequest), { code: "42501" });
  await assert.rejects(inventory(unverified), { code: "42501" });
  await assert.rejects(preview(unverified), { code: "42501" });
  await assert.rejects(preview(accessRequest), { code: "42501" });
  const dependencies = (await inventory(request)).rows;
  assert.deepEqual(dependencies.find(row => row.relation_name === "aiw_files"), {
    schema_name: "public", relation_name: "aiw_files", field_name: "created_by", on_delete: "no_action", matching_rows: 1,
  });
  assert.equal(dependencies.find(row => row.relation_name === "aiw_accounts")?.on_delete, "cascade");
  assert.doesNotMatch(JSON.stringify(dependencies), /CANARY|example.test/);
  const draft = JSON.stringify((await collect(accessRequest)).rows);
  assert.match(draft, /subject@example.test/);
  assert.match(draft, /ERASE_CANARY/);
  assert.match(draft, /OWN_CHUNK/);
  assert.doesNotMatch(draft, /foreign|FOREIGN|COMPANY_CANARY|OPERATOR_CANARY|STORAGE_CANARY/);
  const preErasureBackup = await db.dumpDataDir();
  await assert.rejects(dispose(unverified, target, "erase"), { code: "42501" });
  await assert.rejects(dispose(request, unrelated, "erase"), { code: "42501" });
  await assert.rejects(dispose(request, company, "erase"), { code: "42501" });
  await assert.rejects(dispose(request, retained, "retain"), { code: "22023" });
  const review = new Date(Date.now() + 86400000).toISOString();
  assert.deepEqual((await dispose(request, retained, "retain", "legal_obligation", review)).rows, [{ disposition: "retained" }]);
  const candidates = (await preview(request)).rows;
  assert.equal(candidates.find(row => row.record_id === target)?.proposed_action, "erase_candidate");
  assert.equal(candidates.find(row => row.record_id === retained)?.proposed_action, "retain_hold");
  assert.equal(candidates.find(row => row.record_id === retained)?.proposed_expiry, null);
  assert.equal(candidates.find(row => row.record_id === file)?.proposed_action, "erase_candidate");
  assert.equal(candidates.find(row => row.resource === "audit_event" && row.record_id === "1")?.proposed_expiry.toISOString(), "2026-10-30T00:00:00.000Z");
  assert.equal(candidates.find(row => row.resource === "public.finance_documents.user_id")?.proposed_action, "review_financial_basis");
  assert.equal(candidates.find(row => row.resource === "public.organization_members.user_id")?.proposed_action, "review_customer_instruction");
  assert.ok(candidates.every(row => ![foreignFile, company, unrelated, "2", id(33), id(35)].includes(row.record_id)));
  assert.doesNotMatch(JSON.stringify(candidates), /CANARY|example.test/);
  assert.equal((await db.query("select count(*)::integer as n from aiw_memories")).rows[0].n, 4);
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
  restored = new PGlite({ loadDataDir: preErasureBackup });
  await assert.rejects(reconcile(request, target, restored), { code: "42501" });
  await restored.query("update privacy_requests set status='completed' where id=$1", [request]);
  for (const row of evidence) {
    await restored.query(
      `insert into privacy_memory_dispositions
         (request_id, memory_id, disposition, retention_basis, review_at, recorded_at, recorded_by)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [row.request_id, row.memory_id, row.disposition, row.retention_basis, row.review_at, row.recorded_at, row.recorded_by],
    );
  }
  await restored.query("update aiw_memories set workspace_id=$2, created_by=$3 where id=$1", [target, foreignWorkspace, foreign]);
  await assert.rejects(reconcile(request, target, restored), { code: "42501" });
  await restored.query("update aiw_memories set workspace_id=$2, created_by=$3 where id=$1", [target, workspace, subject]);
  await assert.rejects(reconcile(request, retained, restored), { code: "42501" });
  await assert.rejects(restored.query("delete from aiw_memories where id = $1", [retained]), { code: "55000" });
  assert.match(JSON.stringify((await collect(accessRequest, restored)).rows), /ERASE_CANARY/);
  assert.deepEqual((await reconcile(request, target, restored)).rows, [{ disposition: "erased" }]);
  assert.deepEqual((await reconcile(request, target, restored)).rows, [{ disposition: "already_absent" }]);
  assert.deepEqual((await restored.query("select content from aiw_memories order by id")).rows.map(row => row.content),
    ["RETAIN_CANARY", "FOREIGN_CANARY", "COMPANY_CANARY"]);
  assert.doesNotMatch(JSON.stringify((await collect(accessRequest, restored)).rows), /ERASE_CANARY/);
  await assert.rejects(eraseBatch(unverified), { code: "42501" });
  await assert.rejects(eraseBatch(accessRequest), { code: "42501" });
  await assert.rejects(eraseBatch(secondRequest, 0), { code: "22023" });
  await db.query(
    `insert into aiw_memories (id, workspace_id, scope, title, content, created_by)
     values ($1,$4,'personal','Batch A','BATCH_A',$5), ($2,$4,'personal','Batch B','BATCH_B',$5),
            ($3,$4,'personal','Older record','UNVERIFIED_AUTHOR',null)`,
    [id(20), id(21), id(22), workspace, subject],
  );
  assert.deepEqual((await eraseBatch(secondRequest)).rows, [{ erased_count: 1, remaining_count: 1, held_count: 1 }]);
  assert.deepEqual((await eraseBatch(secondRequest)).rows, [{ erased_count: 1, remaining_count: 0, held_count: 1 }]);
  assert.deepEqual((await eraseBatch(secondRequest)).rows, [{ erased_count: 0, remaining_count: 0, held_count: 1 }]);
  assert.deepEqual((await db.query("select content from aiw_memories order by id")).rows.map(row => row.content),
    ["RETAIN_CANARY", "FOREIGN_CANARY", "COMPANY_CANARY", "UNVERIFIED_AUTHOR"]);
  assert.equal((await db.query(
    "select count(*)::integer as n from privacy_memory_dispositions where request_id=$1 and disposition='erased'",
    [secondRequest],
  )).rows[0].n, 2);
  console.log("W17 default personal memory erasure passed: batch, retry, audit, hold and subject isolation");
  console.log("W17 reviewed export and offline restore reconciliation passed");
  console.log("W17 personal memory erasure: verified case, operator access, retention, tenant isolation, retry and minimal evidence passed");
} finally {
  await restored?.close();
  await db.close();
}
