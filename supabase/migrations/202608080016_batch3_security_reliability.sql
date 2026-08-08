-- Batch 3 — Governance + Security + Reliability
-- Additive/idempotent hardening. No external actions are enabled.

create table if not exists public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_key text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  source text not null,
  error_code text,
  safe_message text not null,
  context jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id),
  unique (organization_id, incident_key)
);

create index if not exists operational_incidents_org_status_idx
  on public.operational_incidents(organization_id,status,last_seen_at desc);
create index if not exists operational_incidents_correlation_idx
  on public.operational_incidents(organization_id,correlation_id);

alter table public.operational_incidents enable row level security;
alter table public.operational_incidents force row level security;

drop policy if exists operational_incidents_member_read on public.operational_incidents;
create policy operational_incidents_member_read on public.operational_incidents
for select using (public.is_org_member(organization_id));

drop policy if exists operational_incidents_owner_write on public.operational_incidents;
create policy operational_incidents_owner_write on public.operational_incidents
for all using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

revoke all on table public.operational_incidents from anon;

create or replace function public.record_operational_incident(
  target_organization_id uuid,
  target_incident_key text,
  target_severity text,
  target_source text,
  target_safe_message text,
  target_error_code text default null,
  target_context jsonb default '{}'::jsonb,
  target_correlation_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  incident_id uuid;
  resolved_correlation uuid := coalesce(target_correlation_id,gen_random_uuid());
begin
  if actor_id is null or not public.is_org_owner(target_organization_id) then
    raise exception 'Only an organization owner may record an operational incident';
  end if;
  if target_severity not in ('low','medium','high','critical') then
    raise exception 'Invalid incident severity';
  end if;
  if btrim(coalesce(target_incident_key,''))='' or btrim(coalesce(target_source,''))='' or btrim(coalesce(target_safe_message,''))='' then
    raise exception 'Incident key, source and safe message are required';
  end if;

  insert into public.operational_incidents(
    organization_id,incident_key,severity,source,error_code,safe_message,context,
    correlation_id,status,occurrence_count,first_seen_at,last_seen_at,created_by_user_id
  ) values (
    target_organization_id,btrim(target_incident_key),target_severity,btrim(target_source),
    nullif(btrim(coalesce(target_error_code,'')),''),btrim(target_safe_message),
    coalesce(target_context,'{}'::jsonb),resolved_correlation,'open',1,now(),now(),actor_id
  )
  on conflict (organization_id,incident_key) do update
  set severity=excluded.severity,
      source=excluded.source,
      error_code=excluded.error_code,
      safe_message=excluded.safe_message,
      context=excluded.context,
      correlation_id=excluded.correlation_id,
      status='open',
      occurrence_count=public.operational_incidents.occurrence_count+1,
      last_seen_at=now()
  returning id into incident_id;

  insert into public.audit_events(
    organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload,correlation_id
  ) values (
    target_organization_id,'user',actor_id,'operations.incident_recorded','operational_incident',incident_id::text,
    case target_severity when 'critical' then 'critical'::public.rythm_risk_level when 'high' then 'high'::public.rythm_risk_level when 'medium' then 'medium'::public.rythm_risk_level else 'low'::public.rythm_risk_level end,
    jsonb_build_object('incident_key',target_incident_key,'severity',target_severity,'source',target_source),
    resolved_correlation
  );

  return incident_id;
end $$;

revoke all on function public.record_operational_incident(uuid,text,text,text,text,text,jsonb,uuid) from public;
grant execute on function public.record_operational_incident(uuid,text,text,text,text,text,jsonb,uuid) to authenticated;

-- Explicitly remove anonymous access from every organization-scoped public table.
do $$
declare r record;
begin
  for r in
    select distinct c.table_name
    from information_schema.columns c
    where c.table_schema='public' and c.column_name='organization_id'
  loop
    execute format('revoke all on table public.%I from anon', r.table_name);
  end loop;
end $$;

-- Force RLS only where RLS is already enabled and at least one policy exists.
do $$
declare r record;
begin
  for r in
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity=true
      and exists(select 1 from pg_policy p where p.polrelid=c.oid)
  loop
    execute format('alter table public.%I force row level security', r.relname);
  end loop;
end $$;

-- Audit/workflow history is append-only for application roles.
create or replace function public.reject_governed_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'postgres' then
    raise exception 'Governed history is append-only';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

revoke all on function public.reject_governed_history_mutation() from public;

-- audit_events is known from the core schema.
drop trigger if exists audit_events_append_only on public.audit_events;
create trigger audit_events_append_only
before update or delete on public.audit_events
for each row execute function public.reject_governed_history_mutation();

-- Apply the same invariant to the canonical company-event table if present.
do $$
begin
  if to_regclass('public.company_events') is not null then
    execute 'drop trigger if exists company_events_append_only on public.company_events';
    execute 'create trigger company_events_append_only before update or delete on public.company_events for each row execute function public.reject_governed_history_mutation()';
  elsif to_regclass('public.workflow_events') is not null then
    execute 'drop trigger if exists workflow_events_append_only on public.workflow_events';
    execute 'create trigger workflow_events_append_only before update or delete on public.workflow_events for each row execute function public.reject_governed_history_mutation()';
  end if;
end $$;

revoke update, delete on table public.audit_events from authenticated;

create or replace function public.get_security_posture(target_organization_id uuid)
returns table(control text,status text,detail text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  missing_rls integer;
  anon_grants integer;
  owner_count integer;
  audit_trigger_ok boolean;
begin
  if auth.uid() is null or not public.is_org_owner(target_organization_id) then
    raise exception 'Owner authorization required';
  end if;

  select count(*) into owner_count from public.organization_members
  where organization_id=target_organization_id and role='owner';
  return query select 'owner_authority',case when owner_count>0 then 'PASS' else 'FAIL' end,
    owner_count::text || ' owner membership(s) registered';

  select count(*) into missing_rls
  from information_schema.columns col
  join pg_class cls on cls.relname=col.table_name
  join pg_namespace ns on ns.oid=cls.relnamespace and ns.nspname=col.table_schema
  where col.table_schema='public' and col.column_name='organization_id'
    and cls.relkind='r' and cls.relrowsecurity=false;
  return query select 'organization_rls',case when missing_rls=0 then 'PASS' else 'FAIL' end,
    missing_rls::text || ' organization-scoped table(s) without RLS';

  select count(*) into anon_grants
  from information_schema.role_table_grants g
  join information_schema.columns c on c.table_schema=g.table_schema and c.table_name=g.table_name and c.column_name='organization_id'
  where g.table_schema='public' and g.grantee='anon';
  return query select 'anonymous_table_access',case when anon_grants=0 then 'PASS' else 'FAIL' end,
    anon_grants::text || ' anonymous grant(s) on organization-scoped tables';

  select exists(
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='audit_events' and t.tgname='audit_events_append_only' and not t.tgisinternal
  ) into audit_trigger_ok;
  return query select 'audit_append_only',case when audit_trigger_ok then 'PASS' else 'FAIL' end,
    case when audit_trigger_ok then 'Append-only trigger installed' else 'Append-only trigger missing' end;

  return query select 'external_actions','PASS','Runtime policy remains separately environment-gated; this migration does not enable external actions';
end $$;

revoke all on function public.get_security_posture(uuid) from public;
grant execute on function public.get_security_posture(uuid) to authenticated;

comment on table public.operational_incidents is 'Deduplicated, organization-scoped operational failures for Batch 3 observability.';
comment on function public.get_security_posture(uuid) is 'Owner-only security posture checks. Diagnostic only; grants no business authority.';
