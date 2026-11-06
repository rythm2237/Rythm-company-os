-- W04 | Targeted privileged RPC hardening.
-- Baseline: main 995888ae6f7077f70527bbc95f74efd584115955; live pg_proc 2026-11-06.
-- Idempotent DDL; deliberately preserves the seven public 2nya booking/contact RPC grants.
-- Do not run against production without separate owner approval.
begin;

-- Both are pure SQL IMMUTABLE SECURITY INVOKER helpers. Resolve built-ins only in
-- pg_catalog, with pg_temp last; do not depend on caller-controlled search_path.
alter function public.project_approval_decision_group_v1(text, text)
  set search_path = pg_catalog, pg_temp;

alter function public.project_approval_is_delegatable_v1(
  text, text, text, text, jsonb, text, text, text
) set search_path = pg_catalog, pg_temp;

-- This function returns trigger and is invoked by database triggers, not by
-- PostgREST clients. It had PUBLIC/anon/authenticated EXECUTE in the live catalog.
-- Revoking direct invocation does not remove trigger definitions.
revoke execute on function public.provision_default_integration_department_on_entitlement_v1()
  from public, anon, authenticated;
grant execute on function public.provision_default_integration_department_on_entitlement_v1()
  to service_role;

-- Definer RPC rate-limit counter must never decrease when callers choose a lower
-- p_limit. Previous ON CONFLICT LEAST(current + 1, p_limit + 1) can reset
-- a count of 100 to 2 with p_limit=1, bypassing the server's fixed limit.
-- Preserve caller-UID scope, argument validation, return type, grants and owner.
create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $w04_rate_limit$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
  v_retry integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_scope is null or p_scope !~ '^[a-z0-9:_-]{1,80} then
    raise exception 'invalid rate limit scope' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid rate limit maximum' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 10 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit window' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limits (
    user_id, scope, window_started_at, request_count, updated_at
  )
  values (v_user_id, p_scope, v_window_start, 1, v_now)
  on conflict (user_id, scope, window_started_at)
  do update set
    -- Monotonic and independent of user-supplied p_limit; saturate int4.
    request_count = case
      when public.api_rate_limits.request_count >= 2147483647 then 2147483647
      else public.api_rate_limits.request_count + 1
    end,
    updated_at = excluded.updated_at
  returning request_count into v_count;

  v_retry := greatest(
    1,
    ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer
  );

  return query select
    (v_count <= p_limit),
    greatest(p_limit - v_count, 0),
    v_retry;
end;
$w04_rate_limit$;

commit;
