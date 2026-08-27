-- RYTHM Phase 2: centralized Integration & Execution Gateway.
-- Additive hardening of the existing integration platform; no Phase 1 objects are replaced.

alter table public.integration_providers
  add column if not exists version text not null default '1.0.0',
  add column if not exists allowed_environments text[] not null default array['development','preview','production']::text[],
  add column if not exists kill_switch boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.integration_capabilities
  add column if not exists tool_id text,
  add column if not exists operation text,
  add column if not exists internal_external text not null default 'external' check (internal_external in ('internal','external')),
  add column if not exists read_write text not null default 'read' check (read_write in ('read','write')),
  add column if not exists external_side_effect boolean not null default false,
  add column if not exists financial_impact boolean not null default false,
  add column if not exists data_sensitivity text not null default 'internal' check (data_sensitivity in ('public','internal','confidential','restricted')),
  add column if not exists risk_ceiling text not null default 'low' check (risk_ceiling in ('low','medium','high','restricted')),
  add column if not exists reversibility text not null default 'not_applicable' check (reversibility in ('reversible','compensatable','irreversible','not_applicable')),
  add column if not exists required_agent_permissions text[] not null default '{}'::text[],
  add column if not exists required_user_permissions text[] not null default '{}'::text[],
  add column if not exists required_scopes text[] not null default '{}'::text[],
  add column if not exists idempotency_supported boolean not null default true,
  add column if not exists timeout_ms integer not null default 15000 check (timeout_ms between 500 and 60000),
  add column if not exists retry_policy jsonb not null default '{"maxAttempts":1,"baseDelayMs":100,"maxDelayMs":1000}'::jsonb,
  add column if not exists rate_limits jsonb not null default '{}'::jsonb,
  add column if not exists adapter_version text not null default 'legacy-v1',
  add column if not exists rollback_supported boolean not null default false,
  add column if not exists enabled boolean not null default true,
  add column if not exists kill_switch boolean not null default false;

create table if not exists public.integration_tool_registry (
  tool_id text primary key,
  integration_key text not null references public.integration_providers(provider_key) on delete restrict,
  name text not null,
  version text not null,
  category text not null,
  metadata jsonb not null default '{}'::jsonb,
  adapter_version text not null,
  enabled boolean not null default true,
  kill_switch boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_integrations
  add column if not exists enabled boolean not null default true,
  add column if not exists granted_scopes text[] not null default '{}'::text[],
  add column if not exists disconnected_at timestamptz,
  add column if not exists credential_last_rotated_at timestamptz;

alter table public.agents
  add column if not exists execution_capabilities jsonb not null default '[]'::jsonb;

alter table public.approval_requests
  add column if not exists requested_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists execution_scope_digest text,
  add column if not exists execution_payload_digest text,
  add column if not exists execution_payload_summary jsonb not null default '{}'::jsonb,
  add column if not exists execution_expected_impact text,
  add column if not exists execution_reversibility text check (execution_reversibility in ('reversible','compensatable','irreversible','not_applicable')),
  add column if not exists execution_target text,
  add column if not exists execution_tool text,
  add column if not exists execution_operation text,
  add column if not exists consumed_at timestamptz,
  add column if not exists consumed_by_execution_id uuid;

alter table public.tool_execution_requests drop constraint if exists tool_execution_requests_status_check;
update public.tool_execution_requests set status='waiting_approval' where status='awaiting_approval';
update public.tool_execution_requests set status='executing' where status='running';

alter table public.tool_execution_requests
  add column if not exists correlation_id uuid not null default gen_random_uuid(),
  add column if not exists originating_request_id text,
  add column if not exists project_id uuid,
  add column if not exists meeting_id uuid,
  add column if not exists session_id uuid,
  add column if not exists action_type text,
  add column if not exists integration_key text,
  add column if not exists tool text,
  add column if not exists payload_reference text,
  add column if not exists payload_digest text,
  add column if not exists requested_by text not null default 'agent' check (requested_by in ('user','agent','system')),
  add column if not exists intent text,
  add column if not exists reversibility text not null default 'not_applicable' check (reversibility in ('reversible','compensatable','irreversible','not_applicable')),
  add column if not exists external_side_effect boolean not null default false,
  add column if not exists financial_impact boolean not null default false,
  add column if not exists data_sensitivity text not null default 'internal' check (data_sensitivity in ('public','internal','confidential','restricted')),
  add column if not exists required_permissions text[] not null default '{}'::text[],
  add column if not exists required_scopes text[] not null default '{}'::text[],
  add column if not exists human_approval_required boolean not null default false,
  add column if not exists approval_policy text not null default 'not_required' check (approval_policy in ('not_required','human_ceo_required','human_only')),
  add column if not exists approval_scope_digest text,
  add column if not exists approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','rejected','expired')),
  add column if not exists authorization_result boolean not null default false,
  add column if not exists policy_reason_code text,
  add column if not exists policy_reason_codes text[] not null default '{}'::text[],
  add column if not exists timeout_ms integer not null default 15000 check (timeout_ms between 500 and 60000),
  add column if not exists retry_policy jsonb not null default '{"maxAttempts":1,"baseDelayMs":100,"maxDelayMs":1000}'::jsonb,
  add column if not exists cost_limit numeric(12,6),
  add column if not exists execution_mode text not null default 'disabled' check (execution_mode in ('disabled','simulate','approval_only','limited_enforced','enforced')),
  add column if not exists policy_version text not null default 'execution-policy-v2.0.0',
  add column if not exists adapter_version text not null default 'legacy-v1',
  add column if not exists retry_count integer not null default 0 check (retry_count between 0 and 5),
  add column if not exists external_reference_id text,
  add column if not exists result_metadata jsonb not null default '{}'::jsonb,
  add column if not exists verification_result jsonb not null default '{"status":"not_applicable"}'::jsonb,
  add column if not exists rollback_available boolean not null default false,
  add column if not exists rollback_reference jsonb,
  add column if not exists rollback_status text check (rollback_status in ('not_available','available','requested','succeeded','failed')),
  add column if not exists normalized_error_class text,
  add column if not exists sanitized_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.tool_execution_requests
  add constraint tool_execution_requests_status_check check (status in ('requested','authorized','waiting_approval','approved','executing','succeeded','failed','rolled_back','rejected','expired','cancelled','denied','simulated'));

create table if not exists public.tool_execution_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_request_id uuid not null references public.tool_execution_requests(id) on delete cascade,
  attempt_number integer not null check (attempt_number between 1 and 5),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('started','succeeded','failed')),
  normalized_error_class text,
  retryable boolean,
  uncertain_completion boolean,
  safe_detail jsonb not null default '{}'::jsonb,
  unique (execution_request_id, attempt_number)
);

create table if not exists public.execution_rollout_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tool_id text not null default '',
  integration_key text not null default '',
  environment text not null check (environment in ('development','preview','production')),
  execution_mode text not null check (execution_mode in ('disabled','simulate','approval_only','limited_enforced','enforced')),
  kill_switch boolean not null default false,
  policy_version text not null default 'execution-policy-v2.0.0',
  reason text,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tool_id<>'' or integration_key<>'')
);

create table if not exists public.execution_validation_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_request_id uuid references public.tool_execution_requests(id) on delete set null,
  marker text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists execution_validation_request_unique
on public.execution_validation_records(execution_request_id)
where execution_request_id is not null;

create unique index if not exists execution_rollout_scope_unique
on public.execution_rollout_config(organization_id,tool_id,integration_key,environment);
create index if not exists tool_execution_correlation_idx on public.tool_execution_requests(organization_id,correlation_id);
create index if not exists tool_execution_origin_idx on public.tool_execution_requests(organization_id,originating_request_id) where originating_request_id is not null;
create index if not exists tool_execution_approval_idx on public.tool_execution_requests(approval_request_id) where approval_request_id is not null;
create index if not exists tool_execution_attempts_execution_idx on public.tool_execution_attempts(execution_request_id,attempt_number);
create index if not exists execution_rollout_lookup_idx on public.execution_rollout_config(organization_id,environment,tool_id,integration_key);
create index if not exists approval_execution_scope_idx on public.approval_requests(organization_id,execution_scope_digest) where subject_type='tool_execution';
create unique index if not exists approval_execution_pending_unique on public.approval_requests(organization_id,subject_id) where subject_type='tool_execution' and status='pending';

alter table public.integration_providers enable row level security;
alter table public.integration_capabilities enable row level security;
alter table public.integration_tool_registry enable row level security;
alter table public.tool_execution_attempts enable row level security;
alter table public.execution_rollout_config enable row level security;
alter table public.execution_validation_records enable row level security;

drop policy if exists integration_providers_authenticated_read on public.integration_providers;
create policy integration_providers_authenticated_read on public.integration_providers for select to authenticated using (enabled=true);
drop policy if exists integration_capabilities_authenticated_read on public.integration_capabilities;
create policy integration_capabilities_authenticated_read on public.integration_capabilities for select to authenticated using (enabled=true);
drop policy if exists integration_tool_registry_authenticated_read on public.integration_tool_registry;
create policy integration_tool_registry_authenticated_read on public.integration_tool_registry for select to authenticated using (enabled=true);
drop policy if exists tool_execution_attempts_member_read on public.tool_execution_attempts;
create policy tool_execution_attempts_member_read on public.tool_execution_attempts for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=tool_execution_attempts.organization_id and m.user_id=auth.uid() and m.membership_status='active'));
drop policy if exists execution_rollout_member_read on public.execution_rollout_config;
create policy execution_rollout_member_read on public.execution_rollout_config for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=execution_rollout_config.organization_id and m.user_id=auth.uid() and m.membership_status='active'));
drop policy if exists execution_rollout_owner_write on public.execution_rollout_config;
create policy execution_rollout_owner_write on public.execution_rollout_config for all to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=execution_rollout_config.organization_id and m.user_id=auth.uid() and m.membership_status='active' and m.role='owner')) with check (exists(select 1 from public.organization_members m where m.organization_id=execution_rollout_config.organization_id and m.user_id=auth.uid() and m.membership_status='active' and m.role='owner'));
drop policy if exists execution_validation_owner_read on public.execution_validation_records;
create policy execution_validation_owner_read on public.execution_validation_records for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=execution_validation_records.organization_id and m.user_id=auth.uid() and m.membership_status='active' and m.role='owner'));

drop policy if exists organization_integrations_member_read on public.organization_integrations;
create policy organization_integrations_member_read on public.organization_integrations for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=organization_integrations.organization_id and m.user_id=auth.uid() and m.membership_status='active'));
drop policy if exists organization_integrations_owner_write on public.organization_integrations;
create policy organization_integrations_owner_write on public.organization_integrations for all to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=organization_integrations.organization_id and m.user_id=auth.uid() and m.membership_status='active' and m.role='owner')) with check (exists(select 1 from public.organization_members m where m.organization_id=organization_integrations.organization_id and m.user_id=auth.uid() and m.membership_status='active' and m.role='owner'));
drop policy if exists agent_integration_grants_member_read on public.agent_integration_grants;
create policy agent_integration_grants_member_read on public.agent_integration_grants for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=agent_integration_grants.organization_id and m.user_id=auth.uid() and m.membership_status='active'));
drop policy if exists agent_integration_grants_owner_write on public.agent_integration_grants;
create policy agent_integration_grants_owner_write on public.agent_integration_grants for all to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=agent_integration_grants.organization_id and m.user_id=auth.uid() and m.membership_status='active' and m.role='owner')) with check (exists(select 1 from public.organization_members m where m.organization_id=agent_integration_grants.organization_id and m.user_id=auth.uid() and m.membership_status='active' and m.role='owner'));
drop policy if exists tool_execution_requests_member_read on public.tool_execution_requests;
create policy tool_execution_requests_member_read on public.tool_execution_requests for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=tool_execution_requests.organization_id and m.user_id=auth.uid() and m.membership_status='active'));
drop policy if exists tool_execution_events_member_read on public.tool_execution_events;
create policy tool_execution_events_member_read on public.tool_execution_events for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=tool_execution_events.organization_id and m.user_id=auth.uid() and m.membership_status='active'));

revoke all on table public.integration_providers from public, anon, authenticated;
revoke all on table public.integration_capabilities from public, anon, authenticated;
revoke all on table public.integration_tool_registry from public, anon, authenticated;
revoke all on table public.tool_execution_attempts from public, anon, authenticated;
revoke all on table public.execution_rollout_config from public, anon, authenticated;
revoke all on table public.execution_validation_records from public, anon, authenticated;
revoke insert, update, delete, truncate on table public.tool_execution_requests from anon, authenticated;
revoke insert, update, delete, truncate on table public.tool_execution_events from anon, authenticated;
grant select on table public.integration_providers to authenticated;
grant select on table public.integration_capabilities to authenticated;
grant select on table public.integration_tool_registry to authenticated;
grant select on table public.tool_execution_attempts to authenticated;
grant select,insert,update,delete on table public.execution_rollout_config to authenticated;
grant select on table public.execution_validation_records to authenticated;
grant select on table public.tool_execution_requests to authenticated;
grant select on table public.tool_execution_events to authenticated;
grant all on table public.integration_tool_registry,public.tool_execution_attempts,public.execution_rollout_config to service_role;
grant all on table public.execution_validation_records to service_role;

create or replace function public.prevent_execution_secret_material()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.input::text ~* '"(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|credential|private[_-]?key|service[_-]?role|secret)"\s*:' then
    raise exception 'Execution payload contains prohibited credential material';
  end if;
  return new;
end; $$;
revoke all on function public.prevent_execution_secret_material() from public,anon,authenticated;
drop trigger if exists tool_execution_secret_guard on public.tool_execution_requests;
create trigger tool_execution_secret_guard before insert or update of input on public.tool_execution_requests for each row execute function public.prevent_execution_secret_material();

create or replace function public.prevent_execution_event_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Execution lifecycle events are append-only'; end; $$;
revoke all on function public.prevent_execution_event_mutation() from public,anon,authenticated;
drop trigger if exists tool_execution_events_append_only on public.tool_execution_events;
create trigger tool_execution_events_append_only before update or delete on public.tool_execution_events for each row execute function public.prevent_execution_event_mutation();
drop trigger if exists tool_execution_attempts_append_only on public.tool_execution_attempts;
create trigger tool_execution_attempts_append_only before update or delete on public.tool_execution_attempts for each row execute function public.prevent_execution_event_mutation();

create or replace function public.record_tool_execution_lifecycle_v2(
  target_execution_id uuid,
  target_event_type text,
  target_status text,
  target_detail jsonb default '{}'::jsonb,
  target_actor text default 'system'
)
returns bigint
language plpgsql security definer set search_path='' as $$
declare
  request_role text := coalesce(current_setting('request.jwt.claim.role',true),'');
  candidate public.tool_execution_requests%rowtype;
  audit_id bigint;
  event_actor text;
begin
  if request_role <> 'service_role' then raise exception 'Service role required'; end if;
  if target_actor not in ('requester','system') then raise exception 'Invalid lifecycle actor'; end if;
  select * into candidate from public.tool_execution_requests where id=target_execution_id;
  if candidate.id is null then raise exception 'Execution request not found'; end if;
  insert into public.tool_execution_events(organization_id,execution_request_id,event_type,status,safe_detail)
  values(candidate.organization_id,candidate.id,target_event_type,target_status,coalesce(target_detail,'{}'::jsonb));
  event_actor := case when target_actor='requester' and candidate.agent_id is not null then 'agent' when target_actor='requester' and candidate.requested_by_user_id is not null then 'user' else 'system' end;
  insert into public.audit_events(organization_id,actor_type,actor_user_id,actor_agent_id,event_type,object_type,object_id,risk_level,correlation_id,payload)
  values(
    candidate.organization_id,
    event_actor,
    case when event_actor='user' then candidate.requested_by_user_id else null end,
    case when event_actor='agent' then candidate.agent_id else null end,
    'execution.'||target_event_type,
    'tool_execution_request',
    candidate.id::text,
    case when candidate.risk_level='restricted' then 'critical'::public.rythm_risk_level else candidate.risk_level::public.rythm_risk_level end,
    candidate.correlation_id,
    coalesce(target_detail,'{}'::jsonb)
  ) returning id into audit_id;
  return audit_id;
end; $$;
revoke all on function public.record_tool_execution_lifecycle_v2(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_tool_execution_lifecycle_v2(uuid,text,text,jsonb,text) to service_role;

create or replace function public.enforce_execution_approval_scope()
returns trigger language plpgsql security invoker set search_path='' as $$
declare request_role text := coalesce(current_setting('request.jwt.claim.role',true),'');
begin
  if old.subject_type='tool_execution' then
    if new.execution_scope_digest is distinct from old.execution_scope_digest
      or new.execution_payload_digest is distinct from old.execution_payload_digest
      or new.execution_target is distinct from old.execution_target
      or new.execution_tool is distinct from old.execution_tool
      or new.execution_operation is distinct from old.execution_operation then
      raise exception 'Execution approval scope is immutable';
    end if;
    if new.consumed_at is distinct from old.consumed_at and request_role <> 'service_role' then
      raise exception 'Only the Execution Gateway may consume an approval';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.enforce_execution_approval_scope() from public,anon,authenticated;
drop trigger if exists execution_approval_scope_guard on public.approval_requests;
create trigger execution_approval_scope_guard before update on public.approval_requests for each row execute function public.enforce_execution_approval_scope();

create or replace function public.claim_tool_execution_v2(target_execution_id uuid)
returns public.tool_execution_requests
language plpgsql security definer set search_path='' as $$
declare
  request_role text := coalesce(current_setting('request.jwt.claim.role',true),'');
  candidate public.tool_execution_requests%rowtype;
  approval public.approval_requests%rowtype;
  rollout_mode text;
  rollout_kill boolean;
  connection_scopes text[];
  grant_scopes text[];
  current_environment text;
begin
  if request_role <> 'service_role' then raise exception 'Service role required'; end if;
  select * into candidate from public.tool_execution_requests where id=target_execution_id for update;
  if candidate.id is null then raise exception 'Execution request not found'; end if;
  if candidate.status not in ('authorized','approved') then raise exception 'Execution is not claimable: %',candidate.status; end if;
  current_environment := case when current_setting('app.environment',true) in ('development','preview','production') then current_setting('app.environment',true) else 'production' end;
  select c.execution_mode,c.kill_switch into rollout_mode,rollout_kill
  from public.execution_rollout_config c
  where c.organization_id=candidate.organization_id
    and c.environment=current_environment
    and (c.tool_id=candidate.tool or c.integration_key=candidate.integration_key)
  order by (c.tool_id=candidate.tool) desc,c.updated_at desc
  limit 1;
  rollout_mode := coalesce(rollout_mode,'simulate');
  if coalesce(rollout_kill,false) then raise exception 'KILL_SWITCH_ACTIVE'; end if;
  if rollout_mode in ('disabled','simulate','approval_only') or (rollout_mode='limited_enforced' and candidate.external_side_effect) then raise exception 'EXTERNAL_ACTION_DISABLED'; end if;
  if not exists(select 1 from public.integration_tool_registry r where r.tool_id=candidate.tool and r.integration_key=candidate.integration_key and r.enabled=true) then raise exception 'TOOL_UNAVAILABLE'; end if;
  if exists(select 1 from public.integration_tool_registry r where r.tool_id=candidate.tool and r.kill_switch=true) then raise exception 'KILL_SWITCH_ACTIVE'; end if;
  if not exists(select 1 from public.integration_capabilities c where c.provider_key=candidate.integration_key and c.capability_key=candidate.capability_key and c.enabled=true) then raise exception 'OPERATION_UNSUPPORTED'; end if;
  if exists(select 1 from public.integration_capabilities c where c.provider_key=candidate.integration_key and c.capability_key=candidate.capability_key and c.kill_switch=true) then raise exception 'KILL_SWITCH_ACTIVE'; end if;
  if not exists(select 1 from public.integration_providers p where p.provider_key=candidate.integration_key and p.enabled=true and p.kill_switch=false and current_environment=any(p.allowed_environments)) then raise exception 'INTEGRATION_DISABLED'; end if;
  if not exists(select 1 from public.organization_entitlements e where e.organization_id=candidate.organization_id and e.status='active' and (e.starts_at is null or e.starts_at<=now()) and (e.ends_at is null or e.ends_at>now())) then raise exception 'ENTITLEMENT_DENIED'; end if;
  if not exists(select 1 from public.organization_members m where m.organization_id=candidate.organization_id and m.user_id=candidate.requested_by_user_id and m.membership_status='active' and m.role='owner') then raise exception 'PERMISSION_DENIED'; end if;
  select i.granted_scopes into connection_scopes from public.organization_integrations i where i.id=candidate.integration_id and i.organization_id=candidate.organization_id and i.status='connected' and i.enabled=true;
  if connection_scopes is null then raise exception 'INTEGRATION_DISABLED'; end if;
  if candidate.required_scopes<>array[]::text[] and not (candidate.required_scopes<@connection_scopes) then raise exception 'SCOPE_MISSING'; end if;
  if candidate.agent_id is not null then
    if not exists(select 1 from public.agents a where a.id=candidate.agent_id and a.organization_id=candidate.organization_id and a.enabled=true and a.agent_status='enabled') then raise exception 'AGENT_DISABLED'; end if;
    if exists(select 1 from public.agents a where a.id=candidate.agent_id and (case candidate.risk_level when 'low' then 0 when 'medium' then 1 when 'high' then 2 else 3 end)>(case a.risk_ceiling::text when 'low' then 0 when 'medium' then 1 when 'high' then 2 else 3 end)) then raise exception 'RISK_CEILING_EXCEEDED'; end if;
    if candidate.external_side_effect and not exists(select 1 from public.agents a where a.id=candidate.agent_id and a.organization_id=candidate.organization_id and a.external_actions_allowed=true) then raise exception 'EXTERNAL_ACTION_DISABLED'; end if;
    select case when jsonb_typeof(g.scope->'scopes')='array' then array(select jsonb_array_elements_text(g.scope->'scopes')) else array[]::text[] end into grant_scopes
    from public.agent_integration_grants g
    where g.organization_id=candidate.organization_id and g.agent_id=candidate.agent_id and g.integration_id=candidate.integration_id and g.capability_key=candidate.capability_key and g.enabled=true;
    if grant_scopes is null then raise exception 'PERMISSION_DENIED'; end if;
    if candidate.required_scopes<>array[]::text[] and not (candidate.required_scopes<@grant_scopes) then raise exception 'SCOPE_MISSING'; end if;
  end if;
  if candidate.human_approval_required then
    select * into approval from public.approval_requests where id=candidate.approval_request_id and organization_id=candidate.organization_id for update;
    if approval.id is null or approval.status<>'approved' then raise exception 'APPROVAL_REQUIRED'; end if;
    if approval.subject_type<>'tool_execution' or approval.subject_id<>candidate.id then raise exception 'APPROVAL_SCOPE_MISMATCH'; end if;
    if not exists(select 1 from public.organization_members m where m.organization_id=candidate.organization_id and m.user_id=approval.approver_user_id and m.membership_status='active' and m.role='owner') then raise exception 'PERMISSION_DENIED'; end if;
    if approval.expires_at is not null and approval.expires_at<=now() then raise exception 'APPROVAL_EXPIRED'; end if;
    if approval.consumed_at is not null then raise exception 'APPROVAL_ALREADY_CONSUMED'; end if;
    if approval.execution_scope_digest is distinct from candidate.approval_scope_digest or approval.execution_payload_digest is distinct from candidate.payload_digest or approval.execution_tool is distinct from candidate.tool or approval.execution_operation is distinct from candidate.capability_key or approval.execution_target is distinct from candidate.target_ref then raise exception 'APPROVAL_SCOPE_MISMATCH'; end if;
    update public.approval_requests set consumed_at=now(),consumed_by_execution_id=candidate.id where id=approval.id;
  end if;
  update public.tool_execution_requests set status='executing',started_at=coalesce(started_at,now()),updated_at=now(),approval_status=case when candidate.human_approval_required then 'approved' else 'not_required' end where id=candidate.id returning * into candidate;
  return candidate;
end; $$;
revoke all on function public.claim_tool_execution_v2(uuid) from public,anon,authenticated;
grant execute on function public.claim_tool_execution_v2(uuid) to service_role;

create or replace function public.claim_tool_execution_rollback_v2(target_execution_id uuid)
returns public.tool_execution_requests
language plpgsql security definer set search_path='' as $$
declare request_role text := coalesce(current_setting('request.jwt.claim.role',true),''); candidate public.tool_execution_requests%rowtype;
begin
  if request_role <> 'service_role' then raise exception 'Service role required'; end if;
  select * into candidate from public.tool_execution_requests where id=target_execution_id for update;
  if candidate.status<>'succeeded' or not candidate.rollback_available or candidate.rollback_reference is null then raise exception 'Rollback is not available'; end if;
  if candidate.rollback_status in ('requested','succeeded') then raise exception 'Rollback already requested or completed'; end if;
  update public.tool_execution_requests set rollback_status='requested',updated_at=now() where id=candidate.id returning * into candidate;
  return candidate;
end; $$;
revoke all on function public.claim_tool_execution_rollback_v2(uuid) from public,anon,authenticated;
grant execute on function public.claim_tool_execution_rollback_v2(uuid) to service_role;

create or replace function public.get_organization_integration_secret_service_v1(target_integration_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare request_role text := coalesce(current_setting('request.jwt.claim.role',true),''); secret_id uuid; secret_value text;
begin
  if request_role <> 'service_role' then raise exception 'Service role required'; end if;
  select vault_secret_id into secret_id from public.organization_integrations where id=target_integration_id and status='connected' and enabled=true;
  if secret_id is null then raise exception 'Connected integration credential not found'; end if;
  select decrypted_secret into secret_value from vault.decrypted_secrets where id=secret_id;
  if secret_value is null then raise exception 'Integration credential could not be decrypted'; end if;
  return secret_value;
end; $$;
revoke all on function public.get_organization_integration_secret_service_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_organization_integration_secret_service_v1(uuid) to service_role;

create or replace function public.set_organization_integration_secret_v1(target_integration_id uuid, secret_value text)
returns uuid
language plpgsql security definer set search_path='' as $$
declare
  target_org uuid;
  existing_secret uuid;
  result_id uuid;
begin
  select organization_id,vault_secret_id into target_org,existing_secret
  from public.organization_integrations
  where id=target_integration_id;
  if target_org is null then raise exception 'Integration not found'; end if;
  if not exists(
    select 1 from public.organization_members m
    where m.organization_id=target_org
      and m.user_id=auth.uid()
      and m.membership_status='active'
      and m.role='owner'
  ) then raise exception 'Active owner authorization required'; end if;
  if length(coalesce(secret_value,''))<8 then raise exception 'Secret is invalid'; end if;
  if existing_secret is null then
    select vault.create_secret(secret_value,'rythm-integration-'||target_integration_id::text,'RYTHM organization integration credential',null) into result_id;
    update public.organization_integrations
    set vault_secret_id=result_id,status='connected',connected_by_user_id=auth.uid(),connected_at=coalesce(connected_at,now()),last_verified_at=now(),credential_last_rotated_at=now(),updated_at=now()
    where id=target_integration_id and organization_id=target_org;
  else
    perform vault.update_secret(existing_secret,secret_value,null,null,null);
    result_id:=existing_secret;
    update public.organization_integrations
    set status='connected',last_verified_at=now(),credential_last_rotated_at=now(),updated_at=now()
    where id=target_integration_id and organization_id=target_org;
  end if;
  return result_id;
end; $$;
revoke all on function public.set_organization_integration_secret_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.set_organization_integration_secret_v1(uuid,text) to authenticated;

insert into public.integration_providers(provider_key,display_name,category,supports_oauth,supports_token,enabled,version) values
('internal','RYTHM Internal Control','internal_control',false,false,true,'2.0.0'),
('resend','Resend','communication',false,true,true,'2.0.0')
on conflict(provider_key) do update set display_name=excluded.display_name,category=excluded.category,enabled=excluded.enabled,version=excluded.version,updated_at=now();

insert into public.integration_tool_registry(tool_id,integration_key,name,version,category,adapter_version,metadata) values
('internal.validation','internal','RYTHM Execution Validation','2.0.0','internal_control','internal-validation-v2','{"operations":["validation.record.create"]}'::jsonb),
('github.repository','github','GitHub Repository','2.0.0','source_control','github-adapter-v2','{"operations":["repo.read","branch.create","code.write","pull_request.create","pull_request.merge"]}'::jsonb),
('vercel.deployment','vercel','Vercel Deployment','2.0.0','deployment','vercel-adapter-v2','{"operations":["deployment.read","preview.deploy","production.deploy"]}'::jsonb),
('supabase.database','supabase','Supabase Database','2.0.0','database','supabase-adapter-v2','{"operations":["schema.read","sql.read","migration.apply"]}'::jsonb),
('cloudflare.dns','cloudflare','Cloudflare DNS','2.0.0','dns_edge','cloudflare-adapter-v2','{"operations":["dns.read","dns.write"]}'::jsonb),
('stripe.billing','stripe','Stripe Billing','2.0.0','payments','stripe-adapter-v2','{"operations":["billing.read","refund.create"]}'::jsonb),
('google_workspace.calendar','google_workspace','Google Calendar','2.0.0','productivity','google_workspace-adapter-v2','{"operations":["calendar.read","calendar.write"]}'::jsonb),
('google_workspace.email','google_workspace','Gmail','2.0.0','communication','google_workspace-adapter-v2','{"operations":["email.send"]}'::jsonb),
('microsoft_365.calendar','microsoft_365','Microsoft Calendar','2.0.0','productivity','microsoft_365-adapter-v2','{"operations":["calendar.read","calendar.write"]}'::jsonb),
('microsoft_365.email','microsoft_365','Microsoft Mail','2.0.0','communication','microsoft_365-adapter-v2','{"operations":["email.send"]}'::jsonb),
('resend.email','resend','Resend Email','2.0.0','communication','resend-adapter-v2','{"operations":["email.send"]}'::jsonb)
on conflict(tool_id) do update set integration_key=excluded.integration_key,name=excluded.name,version=excluded.version,category=excluded.category,adapter_version=excluded.adapter_version,metadata=excluded.metadata,updated_at=now();

insert into public.integration_capabilities(
  provider_key,capability_key,risk_level,default_approval_mode,description,tool_id,operation,
  internal_external,read_write,external_side_effect,financial_impact,data_sensitivity,risk_ceiling,reversibility,
  required_agent_permissions,required_user_permissions,required_scopes,idempotency_supported,timeout_ms,retry_policy,rate_limits,adapter_version,rollback_supported,enabled
) values
('internal','validation.record.create','medium','approval_required','Create a reversible tenant-scoped Release Gate validation marker','internal.validation','validation.record.create','internal','write',false,false,'internal','medium','reversible',array['create_validation_record'],array['privileged'],'{}'::text[],true,10000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','internal-validation-v2',true,true),
('github','repo.read','low','autonomous','Read repository content and metadata','github.repository','repo.read','external','read',false,false,'internal','low','not_applicable',array['read_repository'],array['read'],array['repo:read'],true,15000,'{"maxAttempts":3,"baseDelayMs":150,"maxDelayMs":1500}','{"userPerHour":120,"organizationPerHour":1000,"agentPerHour":240,"integrationPerHour":1000,"operationPerHour":500}','github-adapter-v2',false,true),
('github','branch.create','medium','approval_required','Create an isolated repository branch','github.repository','branch.create','external','write',true,false,'confidential','medium','reversible',array['propose_code_change'],array['create'],array['repo:write'],false,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','github-adapter-v2',true,true),
('github','code.write','high','approval_required','Write exact approved repository content','github.repository','code.write','external','write',true,false,'confidential','high','compensatable',array['execute_code_change'],array['update'],array['repo:write'],false,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','github-adapter-v2',false,true),
('github','pull_request.create','medium','approval_required','Create an exact approved pull request','github.repository','pull_request.create','external','write',true,false,'confidential','medium','reversible',array['propose_code_change'],array['create'],array['pull_requests:write'],false,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','github-adapter-v2',true,true),
('github','pull_request.merge','high','approval_required','Merge an exact approved pull request','github.repository','pull_request.merge','external','write',true,false,'confidential','high','irreversible',array['execute_code_change'],array['publish'],array['pull_requests:write'],false,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','github-adapter-v2',false,true),
('vercel','deployment.read','low','autonomous','Read deployment state and metadata','vercel.deployment','deployment.read','external','read',false,false,'internal','low','not_applicable',array['read_deployments'],array['read'],array['deployment:read'],true,15000,'{"maxAttempts":3,"baseDelayMs":150,"maxDelayMs":1500}','{"userPerHour":120,"organizationPerHour":1000,"agentPerHour":240,"integrationPerHour":1000,"operationPerHour":500}','vercel-adapter-v2',false,true),
('vercel','preview.deploy','medium','approval_required','Create an exact approved preview deployment','vercel.deployment','preview.deploy','external','write',true,false,'confidential','medium','compensatable',array['create_preview_deployment'],array['publish'],array['deployment:write'],false,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','vercel-adapter-v2',false,true),
('vercel','production.deploy','high','approval_required','Deploy an exact approved Production revision','vercel.deployment','production.deploy','external','write',true,false,'confidential','high','compensatable',array['deploy_production'],array['publish'],array['deployment:write'],false,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','vercel-adapter-v2',false,true),
('supabase','schema.read','low','autonomous','Read database schema metadata','supabase.database','schema.read','external','read',false,false,'internal','low','not_applicable',array['read_database_schema'],array['read'],array['database:read'],true,15000,'{"maxAttempts":3,"baseDelayMs":150,"maxDelayMs":1500}','{"userPerHour":120,"organizationPerHour":1000,"agentPerHour":240,"integrationPerHour":1000,"operationPerHour":500}','supabase-adapter-v2',false,true),
('supabase','sql.read','low','autonomous','Execute a validated read-only database query','supabase.database','sql.read','external','read',false,false,'internal','low','not_applicable',array['read_company_data'],array['read'],array['database:read'],true,15000,'{"maxAttempts":3,"baseDelayMs":150,"maxDelayMs":1500}','{"userPerHour":120,"organizationPerHour":1000,"agentPerHour":240,"integrationPerHour":1000,"operationPerHour":500}','supabase-adapter-v2',false,true),
('supabase','migration.apply','high','approval_required','Apply an exact approved database migration','supabase.database','migration.apply','external','write',true,false,'confidential','high','compensatable',array['modify_database_schema'],array['privileged'],array['database:write'],false,30000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','supabase-adapter-v2',false,true),
('cloudflare','dns.read','low','autonomous','Read DNS records','cloudflare.dns','dns.read','external','read',false,false,'internal','low','not_applicable',array['read_dns'],array['read'],array['dns:read'],true,15000,'{"maxAttempts":3,"baseDelayMs":150,"maxDelayMs":1500}','{"userPerHour":120,"organizationPerHour":1000,"agentPerHour":240,"integrationPerHour":1000,"operationPerHour":500}','cloudflare-adapter-v2',false,true),
('cloudflare','dns.write','high','approval_required','Change an exact approved DNS record','cloudflare.dns','dns.write','external','write',true,false,'confidential','high','compensatable',array['modify_dns'],array['privileged'],array['dns:write'],false,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','cloudflare-adapter-v2',false,true),
('stripe','billing.read','low','autonomous','Read billing state','stripe.billing','billing.read','external','read',false,false,'internal','low','not_applicable',array['read_billing'],array['read'],array['billing:read'],true,15000,'{"maxAttempts":3,"baseDelayMs":150,"maxDelayMs":1500}','{"userPerHour":120,"organizationPerHour":1000,"agentPerHour":240,"integrationPerHour":1000,"operationPerHour":500}','stripe-adapter-v2',false,true),
('stripe','refund.create','high','approval_required','Create an exact Human CEO approved refund','stripe.billing','refund.create','external','write',true,true,'confidential','high','irreversible',array['create_refund'],array['financial'],array['refunds:write'],true,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','stripe-adapter-v2',false,true),
('google_workspace','calendar.read','low','autonomous','Read authorized calendar events','google_workspace.calendar','calendar.read','external','read',false,false,'internal','low','not_applicable',array['read_calendar'],array['read'],array['calendar.readonly'],true,15000,'{"maxAttempts":3,"baseDelayMs":150,"maxDelayMs":1500}','{"userPerHour":120,"organizationPerHour":1000,"agentPerHour":240,"integrationPerHour":1000,"operationPerHour":500}','google_workspace-adapter-v2',false,true),
('google_workspace','calendar.write','medium','approval_required','Create an exact approved calendar event','google_workspace.calendar','calendar.write','external','write',true,false,'confidential','medium','reversible',array['create_calendar_event'],array['create'],array['calendar.events'],false,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','google_workspace-adapter-v2',true,true),
('google_workspace','email.send','high','approval_required','Send an exact Human CEO approved email','google_workspace.email','email.send','external','write',true,false,'confidential','high','irreversible',array['send_email'],array['external_communication'],array['gmail.send'],false,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','google_workspace-adapter-v2',false,true),
('microsoft_365','calendar.read','low','autonomous','Read authorized calendar events','microsoft_365.calendar','calendar.read','external','read',false,false,'internal','low','not_applicable',array['read_calendar'],array['read'],array['Calendars.Read'],true,15000,'{"maxAttempts":3,"baseDelayMs":150,"maxDelayMs":1500}','{"userPerHour":120,"organizationPerHour":1000,"agentPerHour":240,"integrationPerHour":1000,"operationPerHour":500}','microsoft_365-adapter-v2',false,true),
('microsoft_365','calendar.write','medium','approval_required','Create an exact approved calendar event','microsoft_365.calendar','calendar.write','external','write',true,false,'confidential','medium','reversible',array['create_calendar_event'],array['create'],array['Calendars.ReadWrite'],false,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','microsoft_365-adapter-v2',true,true),
('microsoft_365','email.send','high','approval_required','Send an exact Human CEO approved email','microsoft_365.email','email.send','external','write',true,false,'confidential','high','irreversible',array['send_email'],array['external_communication'],array['Mail.Send'],false,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','microsoft_365-adapter-v2',false,true),
('resend','email.send','high','approval_required','Send an exact Human CEO approved external email','resend.email','email.send','external','write',true,false,'confidential','high','irreversible',array['send_email'],array['external_communication'],array['email.send'],true,20000,'{"maxAttempts":2,"baseDelayMs":250,"maxDelayMs":2000}','{"userPerHour":20,"organizationPerHour":100,"agentPerHour":20,"integrationPerHour":100,"operationPerHour":50}','resend-adapter-v2',false,true)
on conflict(provider_key,capability_key) do update set
  risk_level=excluded.risk_level,default_approval_mode=excluded.default_approval_mode,description=excluded.description,
  tool_id=excluded.tool_id,operation=excluded.operation,internal_external=excluded.internal_external,read_write=excluded.read_write,
  external_side_effect=excluded.external_side_effect,financial_impact=excluded.financial_impact,data_sensitivity=excluded.data_sensitivity,
  risk_ceiling=excluded.risk_ceiling,reversibility=excluded.reversibility,required_agent_permissions=excluded.required_agent_permissions,
  required_user_permissions=excluded.required_user_permissions,required_scopes=excluded.required_scopes,idempotency_supported=excluded.idempotency_supported,
  timeout_ms=excluded.timeout_ms,retry_policy=excluded.retry_policy,rate_limits=excluded.rate_limits,adapter_version=excluded.adapter_version,
  rollback_supported=excluded.rollback_supported,enabled=true;

update public.integration_capabilities set enabled=false where tool_id is null or operation is null;

update public.agent_integration_grants g
set scope=jsonb_set(coalesce(g.scope,'{}'::jsonb),'{scopes}',to_jsonb(c.required_scopes),true)
from public.organization_integrations i
join public.integration_capabilities c on c.provider_key=i.provider_key and c.enabled=true
where g.integration_id=i.id and g.capability_key=c.capability_key and g.enabled=true;
