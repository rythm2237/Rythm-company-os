import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const candidate = "00000000-0000-4000-8000-000000000007";
const approval = "00000000-0000-4000-8000-000000000008";
try {
  await db.exec(`
    create table public.tool_execution_requests (
      id uuid primary key, organization_id text, status text, tool text, integration_key text,
      capability_key text, integration_id text, external_side_effect bool, requested_by_user_id text,
      required_scopes text[], agent_id text, risk_level text, human_approval_required bool,
      approval_request_id uuid, approval_scope_digest text, payload_digest text, target_ref text,
      started_at timestamptz, updated_at timestamptz, approval_status text
    );
    create table public.approval_requests (
      id uuid primary key, organization_id text, status text, subject_type text, subject_id uuid,
      approver_user_id text, expires_at timestamptz, consumed_at timestamptz, consumed_by_execution_id uuid,
      execution_scope_digest text, execution_payload_digest text, execution_tool text,
      execution_operation text, execution_target text
    );
    create table public.execution_rollout_config (organization_id text, environment text, tool_id text,
      integration_key text, execution_mode text, kill_switch bool, updated_at timestamptz);
    create table public.integration_tool_registry (tool_id text, integration_key text, enabled bool, kill_switch bool);
    create table public.integration_capabilities (provider_key text, capability_key text, enabled bool, kill_switch bool);
    create table public.integration_providers (provider_key text, enabled bool, kill_switch bool, allowed_environments text[]);
    create table public.organization_entitlements (organization_id text, status text, starts_at timestamptz, ends_at timestamptz);
    create table public.organization_members (organization_id text, user_id text, membership_status text, role text);
    create table public.organization_integrations (id text, organization_id text, status text, enabled bool, granted_scopes text[]);
    create table public.agents (id text, organization_id text, enabled bool, agent_status text, risk_ceiling text, external_actions_allowed bool);
    create table public.agent_integration_grants (organization_id text, agent_id text, integration_id text,
      capability_key text, enabled bool, scope jsonb);
    insert into public.execution_rollout_config values ('A','production','tool','provider','enforced',false,now());
    insert into public.integration_tool_registry values ('tool','provider',true,false);
    insert into public.integration_capabilities values ('provider','write',true,false);
    insert into public.integration_providers values ('provider',true,false,'{production}');
    insert into public.organization_entitlements values ('A','active',null,null);
    insert into public.organization_members values ('A','owner','active','owner'), ('A','viewer','active','operator');
    insert into public.organization_integrations values ('integration','A','connected',true,'{write}');
    insert into public.agents values ('agent','A',true,'enabled','high',true);
    insert into public.agent_integration_grants values ('A','agent','integration','write',true,'{"scopes":["write"]}');
    insert into public.tool_execution_requests values
      ('${candidate}','A','approved','tool','provider','write','integration',true,'owner','{write}','agent',
       'high',true,'${approval}','scope','payload','target',null,null,'pending');
    insert into public.approval_requests values ('${approval}','A','approved','tool_execution','${candidate}',
      'owner',now()+interval '1 hour',null,null,'scope','payload','tool','write','target');
  `);
  const sql = readFileSync("supabase/migrations/20260827054000_phase2_service_role_claim_compatibility.sql", "utf8");
  const definition = sql.match(/create or replace function public\.claim_tool_execution_v2\([\s\S]*?end; \$\$;/);
  assert.ok(definition);
  await db.exec(definition[0]);
  const claim = () => db.query("select (public.claim_tool_execution_v2($1)).status", [candidate]);
  await assert.rejects(claim, /Service role required/);
  await db.exec("set request.jwt.claim.role='service_role'");
  const attacks = [
    ["organization_id='B'", "organization_id='A'", /APPROVAL_REQUIRED/],
    ["status='rejected'", "status='approved'", /APPROVAL_REQUIRED/],
    ["approver_user_id='viewer'", "approver_user_id='owner'", /PERMISSION_DENIED/],
    ["expires_at=now()-interval '1 hour'", "expires_at=now()+interval '1 hour'", /APPROVAL_EXPIRED/],
    ["consumed_at=now()", "consumed_at=null", /APPROVAL_ALREADY_CONSUMED/],
    ["execution_payload_digest='altered'", "execution_payload_digest='payload'", /APPROVAL_SCOPE_MISMATCH/],
    ["execution_target='other'", "execution_target='target'", /APPROVAL_SCOPE_MISMATCH/],
  ];
  for (const [attack, restore, expected] of attacks) {
    await db.exec("update public.approval_requests set " + attack);
    await assert.rejects(claim, expected);
    await db.exec("update public.approval_requests set " + restore);
    assert.equal((await db.query("select status from public.tool_execution_requests")).rows[0].status, "approved");
  }
  assert.equal((await claim()).rows[0].status, "executing");
  assert.equal((await db.query("select consumed_by_execution_id from public.approval_requests"))
    .rows[0].consumed_by_execution_id, candidate);
  await assert.rejects(claim, /not claimable/);
  console.log("PASS repository claim SQL in disposable PGlite: service boundary, seven approval negatives, valid single consumption");
} finally {
  await db.close();
}
