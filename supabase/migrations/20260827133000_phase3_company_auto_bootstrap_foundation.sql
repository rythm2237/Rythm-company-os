-- RYTHM OS — Phase 3: Company Auto-Bootstrap foundation
-- Pilot sources: Gmail + Google Calendar.
-- Source collection remains read-only and must pass through the Phase 2 Execution Gateway.
-- Applying a bootstrap proposal is intentionally separated from discovery/review and requires
-- exact Human CEO confirmation plus governed execution.

create table if not exists public.company_bootstrap_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  source_integration_id uuid references public.organization_integrations(id) on delete set null,
  source_kinds text[] not null default array['gmail','google_calendar']::text[],
  status text not null default 'collecting'
    check (status in ('collecting','proposed','confirmed','applying','applied','failed','cancelled')),
  source_snapshot jsonb not null default '{}'::jsonb,
  source_evidence jsonb not null default '{}'::jsonb,
  proposal jsonb not null default '{}'::jsonb,
  proposal_digest text,
  proposal_version text not null default 'phase3-pilot-v1',
  builder_draft_id uuid references public.company_builder_drafts(id) on delete set null,
  confirmed_by_user_id uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  applied_at timestamptz,
  failure_code text,
  safe_failure_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_bootstrap_runs_org_created_idx
  on public.company_bootstrap_runs(organization_id, created_at desc);
create index if not exists company_bootstrap_runs_status_idx
  on public.company_bootstrap_runs(organization_id, status, updated_at desc);

alter table public.company_bootstrap_runs enable row level security;

drop policy if exists company_bootstrap_runs_owner_read on public.company_bootstrap_runs;
create policy company_bootstrap_runs_owner_read
on public.company_bootstrap_runs for select to authenticated
using (public.is_org_owner(organization_id));

drop policy if exists company_bootstrap_runs_owner_insert on public.company_bootstrap_runs;
create policy company_bootstrap_runs_owner_insert
on public.company_bootstrap_runs for insert to authenticated
with check (
  public.is_org_owner(organization_id)
  and created_by_user_id = auth.uid()
);

drop policy if exists company_bootstrap_runs_owner_update on public.company_bootstrap_runs;
create policy company_bootstrap_runs_owner_update
on public.company_bootstrap_runs for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

-- Discovery creates a run only. It does not mutate company structure.
create or replace function public.create_company_bootstrap_run_v1(
  target_org_id uuid,
  target_integration_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run_id uuid;
  v_provider text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_org_owner(target_org_id) then
    raise exception 'Organization owner authority required';
  end if;

  select provider_key into v_provider
  from public.organization_integrations
  where id = target_integration_id
    and organization_id = target_org_id
    and enabled = true
    and status = 'connected';

  if v_provider is distinct from 'google_workspace' then
    raise exception 'Phase 3 pilot requires a connected Google Workspace integration';
  end if;

  insert into public.company_bootstrap_runs (
    organization_id,
    created_by_user_id,
    source_integration_id
  ) values (
    target_org_id,
    v_user_id,
    target_integration_id
  ) returning id into v_run_id;

  insert into public.audit_events (
    organization_id, actor_type, actor_user_id, event_type,
    object_type, object_id, risk_level, payload
  ) values (
    target_org_id, 'user', v_user_id, 'company_bootstrap.started',
    'company_bootstrap_run', v_run_id::text, 'low',
    jsonb_build_object(
      'pilot', 'gmail_google_calendar',
      'read_only_discovery', true,
      'external_side_effect', false
    )
  );

  return v_run_id;
end;
$$;

-- Only the trusted service boundary may persist provider-derived discovery material.
create or replace function public.record_company_bootstrap_discovery_service_v1(
  target_run_id uuid,
  target_source_snapshot jsonb,
  target_source_evidence jsonb,
  target_proposal jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_role text := coalesce(v_claims->>'role', current_setting('request.jwt.claim.role', true));
  v_org_id uuid;
  v_digest text;
begin
  if v_role is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  select organization_id into v_org_id
  from public.company_bootstrap_runs
  where id = target_run_id
    and status = 'collecting'
  for update;

  if v_org_id is null then
    raise exception 'Bootstrap run is not available for discovery completion';
  end if;

  if jsonb_typeof(coalesce(target_proposal, '{}'::jsonb)) <> 'object' then
    raise exception 'Bootstrap proposal must be a JSON object';
  end if;

  v_digest := encode(digest(convert_to(coalesce(target_proposal, '{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');

  update public.company_bootstrap_runs
  set source_snapshot = coalesce(target_source_snapshot, '{}'::jsonb),
      source_evidence = coalesce(target_source_evidence, '{}'::jsonb),
      proposal = coalesce(target_proposal, '{}'::jsonb),
      proposal_digest = v_digest,
      status = 'proposed',
      updated_at = now()
  where id = target_run_id;

  insert into public.audit_events (
    organization_id, actor_type, event_type,
    object_type, object_id, risk_level, payload
  ) values (
    v_org_id, 'system', 'company_bootstrap.proposed',
    'company_bootstrap_run', target_run_id::text, 'medium',
    jsonb_build_object(
      'proposal_digest', v_digest,
      'source_kinds', jsonb_build_array('gmail','google_calendar'),
      'provider_writes', false
    )
  );

  return v_digest;
end;
$$;

-- Human CEO confirms the exact proposal digest. Confirmation itself does not apply changes.
create or replace function public.confirm_company_bootstrap_v1(
  target_run_id uuid,
  target_proposal_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.company_bootstrap_runs%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_run
  from public.company_bootstrap_runs
  where id = target_run_id
  for update;

  if v_run.id is null then
    raise exception 'Bootstrap run not found';
  end if;
  if not public.is_org_owner(v_run.organization_id) then
    raise exception 'Organization owner authority required';
  end if;
  if v_run.status <> 'proposed' then
    raise exception 'Bootstrap run is not awaiting confirmation';
  end if;
  if v_run.proposal_digest is null
     or target_proposal_digest is distinct from v_run.proposal_digest then
    raise exception 'Proposal changed; review the latest proposal before confirming';
  end if;

  update public.company_bootstrap_runs
  set status = 'confirmed',
      confirmed_by_user_id = v_user_id,
      confirmed_at = now(),
      updated_at = now()
  where id = target_run_id;

  insert into public.audit_events (
    organization_id, actor_type, actor_user_id, event_type,
    object_type, object_id, risk_level, payload
  ) values (
    v_run.organization_id, 'user', v_user_id, 'company_bootstrap.confirmed',
    'company_bootstrap_run', target_run_id::text, 'high',
    jsonb_build_object(
      'proposal_digest', v_run.proposal_digest,
      'execution_required', true,
      'human_ceo_confirmed', true
    )
  );

  return jsonb_build_object(
    'run_id', target_run_id,
    'status', 'confirmed',
    'proposal_digest', v_run.proposal_digest
  );
end;
$$;

revoke all on function public.create_company_bootstrap_run_v1(uuid, uuid) from public;
revoke all on function public.record_company_bootstrap_discovery_service_v1(uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.confirm_company_bootstrap_v1(uuid, text) from public;

grant execute on function public.create_company_bootstrap_run_v1(uuid, uuid) to authenticated;
grant execute on function public.confirm_company_bootstrap_v1(uuid, text) to authenticated;
grant execute on function public.record_company_bootstrap_discovery_service_v1(uuid, jsonb, jsonb, jsonb) to service_role;

-- Avoid exposing the service-only function through default PUBLIC execution privileges.
revoke execute on function public.record_company_bootstrap_discovery_service_v1(uuid, jsonb, jsonb, jsonb) from anon, authenticated;
