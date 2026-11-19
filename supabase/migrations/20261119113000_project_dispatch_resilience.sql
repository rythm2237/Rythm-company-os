-- W13: global dispatcher single-flight lease and sanitized health state.
-- Staging-first migration. Do NOT apply directly to production without owner approval.
-- Task and meeting queues retain their existing tenant-scoped claim/idempotency contracts.

create table if not exists public.project_dispatch_runtime (
  id boolean primary key default true check (id),
  active_trace_id uuid,
  lease_expires_at timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text not null default 'idle'
    check (last_status in ('idle','running','healthy','degraded','failed')),
  last_failed_step text,
  last_error_code text,
  consecutive_failures integer not null default 0
    check (consecutive_failures >= 0)
);

alter table public.project_dispatch_runtime enable row level security;
revoke all on public.project_dispatch_runtime from public, anon, authenticated;
-- Keep this operational status server-only. No client grants or public policies.
grant select on public.project_dispatch_runtime to service_role;

create or replace function public.acquire_project_dispatch_lease_v1(
  p_trace_id uuid, p_lease_seconds integer default 360
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_trace_id is null or p_lease_seconds < 300 or p_lease_seconds > 600 then
    raise exception 'Invalid dispatcher lease request';
  end if;

  insert into public.project_dispatch_runtime as runtime (
    id, active_trace_id, lease_expires_at, last_started_at, last_status,
    last_failed_step, last_error_code
  ) values (
    true, p_trace_id, now() + make_interval(secs => p_lease_seconds),
    now(), 'running', null, null
  )
  on conflict (id) do update set
    active_trace_id = excluded.active_trace_id,
    lease_expires_at = excluded.lease_expires_at,
    last_started_at = excluded.last_started_at,
    last_status = 'running',
    last_failed_step = null,
    last_error_code = null
  where runtime.active_trace_id is null or runtime.lease_expires_at <= now();

  return found;
end;
$$;
revoke all on function public.acquire_project_dispatch_lease_v1(uuid,integer) from public, anon, authenticated;
grant execute on function public.acquire_project_dispatch_lease_v1(uuid,integer) to service_role;

create or replace function public.complete_project_dispatch_lease_v1(
  p_trace_id uuid,
  p_status text,
  p_failed_step text default null,
  p_error_code text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_trace_id is null or p_status not in ('healthy','degraded','failed') then
    raise exception 'Invalid dispatcher completion request';
  end if;

  update public.project_dispatch_runtime
  set active_trace_id = null,
      lease_expires_at = null,
      last_finished_at = now(),
      last_status = p_status,
      last_failed_step = case when p_status = 'healthy' then null else left(p_failed_step, 64) end,
      last_error_code = case when p_status = 'healthy' then null else left(p_error_code, 40) end,
      consecutive_failures = case when p_status = 'healthy' then 0 else consecutive_failures + 1 end
  where id = true and active_trace_id = p_trace_id;

  return found;
end;
$$;
revoke all on function public.complete_project_dispatch_lease_v1(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_project_dispatch_lease_v1(uuid,text,text,text) to service_role;
