import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const FILE_ID = "55555555-5555-4555-8555-555555555555";
const migration = readFileSync(new URL("../supabase/migrations/20261107060000_w05_file_confidentiality.sql",import.meta.url), "utf8");
const db = new PGlite();

try {
  // Completely isolated PostgreSQL-compatible fixture. No Supabase credentials,
  // production records, third-party objects, or external provider calls.
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;
    create schema storage;
    create schema crm_private;
    create function storage.allow_any_operation(names text[])
    returns boolean language sql stable
    as $$ select coalesce(current_setting('app.storage_op', true), '') = any(names) $$;

    create table storage.objects (
      bucket_id text not null, name text not null, primary key(bucket_id,name)
    );
    alter table storage.objects enable row level security;
    create policy synthetic_member_read on storage.objects
      for select to authenticated
      using (
        bucket_id='nail-2nya-media'
        or (bucket_id='company-knowledge'
          and split_part(name,'/',1)=current_setting('app.org',true))
      );
    create policy synthetic_agent_member_read on storage.objects
      for select to authenticated
      using (bucket_id in ('agent-artifacts','agent-attachments')
        and split_part(name,'/',1)=current_setting('app.org',true));
    grant usage on schema storage to authenticated;
    grant select on storage.objects to authenticated;

    create table public.project_documents (
      id uuid primary key, organization_id uuid not null,
      project_id uuid, contract_id uuid, storage_path text not null
    );
  `);

  await db.exec(migration);
  await db.exec(`
    insert into storage.objects(bucket_id,name) values
      ('company-knowledge','${ORG_A}/synthetic-a.pdf'),
      ('company-knowledge','${ORG_B}/synthetic-b.pdf'),
      ('agent-artifacts','${ORG_A}/artifact-a.txt'),
      ('agent-artifacts','${ORG_B}/artifact-b.txt'),
      ('agent-attachments','${ORG_A}/attachment-a.txt'),
      ('agent-attachments','${ORG_B}/attachment-b.txt'),
      ('ai-workspace-private','${ORG_A}/personal-only.txt'),
      ('nail-2nya-media','public-thumbnail.webp'),
      ('project-files','${ORG_A}/${PROJECT_A}/${FILE_ID}-fixture.pdf');
  `);

  const count = async(bucket) => {
    const {rows} = await db.query("select count(*)::int as n from storage.objects where bucket_id=$1", [bucket]);
    return rows[0].n;
  };

  await db.exec(`set role authenticated; set app.org='${ORG_A}'; set app.storage_op='object.get_authenticated';`);
  assert.equal(await count("company-knowledge"), 1, "authorized tenant sees own object only");
  assert.equal(await count("project-files"), 0, "no permissive fixture policy for project-files");
  assert.equal(await count("agent-artifacts"), 1, "authorized tenant reads own agent artifacts");
  assert.equal(await count("agent-attachments"), 1, "authorized tenant reads own attachments");
  assert.equal(await count("ai-workspace-private"), 0, "private personal workspace has no direct user policy");

  await db.exec(`set app.org='${ORG_B}';`);
  assert.equal(await count("company-knowledge"), 1, "tenant B sees only its own object");
  const {rows:foreignRows} = await db.query("select name from storage.objects where bucket_id='company-knowledge'");
  assert.equal(foreignRows[0].name, `${ORG_B}/synthetic-b.pdf`);
  const {rows:agentRows} = await db.query("select name from storage.objects where bucket_id='agent-artifacts'");
  assert.equal(agentRows.length, 1);
  assert.equal(agentRows[0].name, `${ORG_B}/artifact-b.txt`, "agent cross-tenant row denied");

  await db.exec(`set app.org='${ORG_A}'; set app.storage_op='object.sign';`);
  assert.equal(await count("company-knowledge"), 0, "deny signing a new private URL");
  await db.exec(`set app.storage_op='object.sign_many';`);
  assert.equal(await count("company-knowledge"), 0, "deny batch signing");
  assert.equal(await count("agent-artifacts"), 0, "deny signing agent artifacts");
  assert.equal(await count("agent-attachments"), 0, "deny signing attachments");
  assert.equal(await count("nail-2nya-media"), 1, "unrelated public media policy unaffected");

  await db.exec(`set app.storage_op='object.get_authenticated'; set app.org='revoked';`);
  assert.equal(await count("company-knowledge"), 0, "revocation denies future authenticated reads");
  assert.equal(await count("agent-artifacts"), 0, "revocation denies future agent artifacts");
  assert.equal(await count("agent-attachments"), 0, "revocation denies future agent attachments");

  await db.exec("reset role");
  await db.exec(`
    insert into public.project_documents(id,organization_id,project_id,storage_path)
    values ('${FILE_ID}','${ORG_A}','${PROJECT_A}',
            '${ORG_A}/${PROJECT_A}/${FILE_ID}-synthetic.pdf');
  `);
  await assert.rejects(
    db.exec(`update public.project_documents set storage_path='${ORG_B}/${PROJECT_A}/other.pdf' where id='${FILE_ID}'`),
    "must reject redirected service-role download key"
  );
  await assert.rejects(
    db.exec(`insert into public.project_documents(id,organization_id,project_id,storage_path)
      values ('66666666-6666-4666-8666-666666666666','${ORG_A}','${PROJECT_A}',
              '${ORG_B}/${PROJECT_A}/forged.pdf')`),
    "must reject a forged cross-tenant key on insert"
  );
  await assert.rejects(
    db.exec(`insert into public.project_documents(id,organization_id,project_id,storage_path)
      values ('77777777-7777-4777-8777-777777777777','${ORG_A}','${PROJECT_A}',
              '${ORG_A}/00000000-0000-4000-8000-000000000000/file.pdf')`),
    "must reject wrong-project storage key"
  );
  console.log("PASS: W05 isolated PGlite storage RLS operation, revocation, tenant and immutable-path regressions");
} finally {
  await db.close();
}
