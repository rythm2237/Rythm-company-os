-- Central, user-scoped rate limiting for authenticated high-cost APIs.
-- No customer data is modified. Direct table access is intentionally denied.

create table if not exists public.api_rate_limits (
  user_id uuid not null,
  scope text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, scope, window_started_at)
);

create index if not exists api_rate_limits_window_idx
  on public.api_rate_limits (window_started_at);

alter table public.api_rate_limits enable row level security;

revoke all on table public.api_rate_limits from public;
revoke all on table public.api_rate_limits from anon;
revoke all on table public.api_rate_limits from authenticated;

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
as $$
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

  if p_scope is null or p_scope !~ '^[a-z0-9:_-]{1,80}$' then
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
    user_id,
    scope,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    v_user_id,
    p_scope,
    v_window_start,
    1,
    v_now
  )
  on conflict (user_id, scope, window_started_at)
  do update set
    request_count = least(public.api_rate_limits.request_count + 1, p_limit + 1),
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
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_api_rate_limit(text, integer, integer) from anon;
revoke all on function public.consume_api_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated;

comment on function public.consume_api_rate_limit(text, integer, integer) is
  'Atomically consumes a user-scoped API rate-limit slot. Callable only by authenticated users; direct rate-limit table access is denied.';
