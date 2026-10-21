/**
 * Zero additional infrastructure cost: executes the real Continuous Program migration
 * against an ephemeral, in-memory PostgreSQL (PGlite) instance.
 *
 * Fixture tables contain only existing schema columns required by the migration;
 * no connections to Production, no secrets, and no Supabase cloud branch.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";

async function main(){
const db=new PGlite();
const orgA="00000000-0000-4000-8000-000000000010";
const orgB="00000000-0000-4000-8000-000000000020";
const ownerA="00000000-0000-4000-8000-000000000011";
const ownerB="00000000-0000-4000-8000-000000000021";
const projectA="00000000-0000-4000-8000-000000000012";
const projectB="00000000-0000-4000-8000-000000000022";
const siteA="00000000-0000-4000-8000-000000000013";
const siteB="00000000-0000-4000-8000-000000000023";
const proposalA="00000000-0000-4000-8000-000000000014";
const query=async(sql:string)=> (await db.query<Record<string,unknown>>(sql)).rows;
const value=async(sql:string)=>Object.values((await query(sql))[0])[0];
const expectError=async(action:()=>Promise<unknown>,message:RegExp)=>{
  await assert.rejects(action,message);
};
try{
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.organizations (id uuid primary key);
    create table public.organization_members (
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null, role text not null
    );
    create table public.projects (
      id uuid primary key,organization_id uuid not null references public.organizations(id),
      lifecycle_state text not null default 'DISCOVERY',status text not null default 'active'
    );
    create table public.agency_seo_sites (
      id uuid primary key,organization_id uuid not null references public.organizations(id),
      active boolean not null default true,
      unique (organization_id,id)
    );
    create type public.rythm_risk_level as enum ('low','medium','high','critical');
    create table public.project_proposals (
      id uuid primary key, organization_id uuid not null references public.organizations(id),
      project_id uuid not null references public.projects(id),
      title text not null, executive_summary text not null, proposal_type text not null,
      risk_level text not null default 'medium', status text not null default 'draft',
      approval_request_id uuid, updated_at timestamptz not null default now()
    );
    create table public.approval_requests (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      project_id uuid, subject_type text not null, subject_id uuid not null,
      title text not null, summary text not null,
      risk_level public.rythm_risk_level not null,
      requested_by_user_id uuid, status text not null default 'pending',
      conditions jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now()
    );
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant select on public.organization_members to authenticated;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
  `);
  const foundation=readFileSync("supabase/migrations/20261018190000_continuous_program_foundation.sql","utf8");
  // Exercises real migration DDL, triggers, grants, and SQL/PLpgSQL compilation.
  await db.exec(foundation);
  // Repeatability matters for deploy retries. CREATE OR REPLACE and trigger updates must remain safe.
  await db.exec(foundation);
  assert.equal(await value("select count(*)::integer from public.continuous_programs"),0);
  await db.exec(`
    insert into organizations(id) values ('${orgA}'),('${orgB}');
    insert into organization_members(organization_id,user_id,role)
      values ('${orgA}','${ownerA}','owner'),('${orgB}','${ownerB}','owner');
    insert into projects(id,organization_id) values ('${projectA}','${orgA}'),('${projectB}','${orgB}');
    insert into agency_seo_sites(id,organization_id) values ('${siteA}','${orgA}'),('${siteB}','${orgB}');
    insert into project_proposals(id,organization_id,project_id,proposal_type,title,executive_summary,risk_level)
      values ('${proposalA}','${orgA}','${projectA}','continuous_program_persistent_seo_findings',
        'Review canonical evidence','Two independent SEO audits have recurring findings','medium');
  `);
  await db.exec("set role service_role");
  await expectError(()=>query(`select public.configure_continuous_program_v1('${projectA}','${orgA}','${siteB}','weekly',true)`),/same organization|active site|SEO source/i);
  const configured=await value(`select public.configure_continuous_program_v1('${projectA}','${orgA}','${siteA}','weekly',true)`);
  assert.ok(typeof configured==="string");
  assert.equal(await value(`select lifecycle_kind from projects where id='${projectA}'`),"continuous");
  assert.equal(await value("select count(*)::integer from continuous_programs where enabled"),1);
  await expectError(()=>db.exec(`update projects set lifecycle_state='COMPLETED',status='completed' where id='${projectA}'`),/cannot be completed/i);
  await expectError(()=>db.exec(`update continuous_programs set organization_id='${orgB}' where project_id='${projectA}'`),/same organization|foreign key|mismatch/i);
  await expectError(()=>db.exec(`update projects set lifecycle_kind='finite' where id='${projectA}'`),/retire the continuous program/i);

  const firstClaim=await query("select * from public.claim_due_continuous_program_reviews_v1(10)");
  assert.equal(firstClaim.length,1,"Exactly one due cycle must be created");
  const duplicate=await query("select * from public.claim_due_continuous_program_reviews_v1(10)");
  assert.equal(duplicate.length,0,"Repeat dispatch must not duplicate due cycle");
  assert.equal(await value("select count(*)::integer from continuous_program_review_cycles"),1);
  const work=await query("select * from public.claim_continuous_review_work_v1(5)");
  assert.equal(work.length,1,"Due work must be claimed");
  assert.equal((await query("select * from public.claim_continuous_review_work_v1(5)")).length,0,"Already-running work may not be immediately reclaimed");
  assert.equal(await value("select attempts from continuous_program_review_cycles"),1);

  const approval=await value(`select public.submit_continuous_proposal_for_approval_v1('${proposalA}','${orgA}','${projectA}','${ownerA}')`);
  assert.ok(typeof approval==="string");
  const duplicateApproval=await value(`select public.submit_continuous_proposal_for_approval_v1('${proposalA}','${orgA}','${projectA}','${ownerA}')`);
  assert.equal(duplicateApproval,approval,"Submission must be idempotent");
  assert.equal(await value("select count(*)::integer from approval_requests"),1);
  assert.equal(await value(`select status from project_proposals where id='${proposalA}'`),"ready_for_executive");
  await expectError(()=>query(`select public.submit_continuous_proposal_for_approval_v1('${proposalA}','${orgA}','${projectA}','${ownerB}')`),/Owner authorization required/);
  await expectError(()=>query(`select public.submit_continuous_proposal_for_approval_v1('${proposalA}','${orgB}','${projectA}','${ownerB}')`),/not found/i);

  // Real RLS and function-execute permissions, not string matching.
  await db.exec("reset role");
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${ownerA}'`);
  assert.equal(await value("select count(*)::integer from continuous_programs"),1,"Tenant A must see its program");
  await expectError(()=>query("select public.claim_due_continuous_program_reviews_v1(10)"),/permission denied/);
  await expectError(()=>query("select public.configure_continuous_program_v1(null,null,null)"),/permission denied/);
  await expectError(()=>db.exec("insert into continuous_programs(organization_id,project_id) values (gen_random_uuid(),gen_random_uuid())"),/permission denied/);
  await db.exec(`set request.jwt.claim.sub='${ownerB}'`);
  assert.equal(await value("select count(*)::integer from continuous_programs"),0,"Unrelated tenant cannot read program");
  assert.equal(await value("select count(*)::integer from continuous_program_review_cycles"),0,"Unrelated tenant cannot read review cycles");
  await db.exec("reset role; set role anon");
  await expectError(()=>query("select count(*) from continuous_programs"),/permission denied/);
  await db.exec("reset role");
  console.log("PASS real PGlite migration (twice), tenant RLS, privileged-only RPCs, org-site integrity, closed-state guard, idempotent claims, owner approval submission");
}finally{await db.close();}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
