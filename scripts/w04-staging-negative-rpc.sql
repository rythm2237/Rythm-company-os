-- W04 staging-only, transactional negative RPC regression.
-- REQUIRES pre-applied W04 migration on dedicated allowlisted staging.
-- NOT for production. Synthetic UUID, no real users, and every write rolls back.
-- Execute with psql -v ON_ERROR_STOP=1 against the staging database owner.
begin;
set local statement_timeout = '5000ms';

-- Search-path cannot depend on the caller's chosen order.
set local search_path = pg_temp, public;
do $w04$ begin
  if public.project_approval_decision_group_v1('Request access permission', '') <> 'access_connections' then
    raise exception 'Approval decision group changed after search_path hardening';
  end if;
  if public.project_approval_is_delegatable_v1(
     'project_task','low','Review implementation task','Routine review',
     '["Authorization applies only to this scoped project task."]'::jsonb,
     null,null,null) is distinct from true then
    raise exception 'Safe scoped approval was rejected';
  end if;
  if public.project_approval_is_delegatable_v1(
     'project_task','high','Deploy production','Requires publication',
     '["Authorization applies only to this scoped project task."]'::jsonb,
     null,null,null) is distinct from false then
    raise exception 'Production approval was delegatable';
  end if;
end; $w04$;

-- The old formula reduced count 100 to 2 if caller passed p_limit=1.
-- Seed an isolated marker, then call under a synthetic authenticated identity.
insert into public.api_rate_limits(user_id,scope,window_started_at,request_count,updated_at)
values (
  '00000000-0000-4000-8000-000000000404'::uuid,
  'w04-ratelimit-monotonic-20261106',
  to_timestamp(floor(extract(epoch from clock_timestamp())/3600)*3600),
  100,
  clock_timestamp()
)
on conflict (user_id,scope,window_started_at)
do update set request_count = 100, updated_at = excluded.updated_at;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000404';
do $w04$ declare v_allowed boolean; begin
  select allowed into v_allowed
  from public.consume_api_rate_limit('w04-ratelimit-monotonic-20261106',1,3600);
  if v_allowed is distinct from false then
    raise exception 'Caller lowered the rate-limit rejection threshold';
  end if;
end; $w04$;
reset role;

do $w04$ declare v_count integer; begin
  select request_count into v_count from public.api_rate_limits
  where user_id='00000000-0000-4000-8000-000000000404'::uuid
    and scope='w04-ratelimit-monotonic-20261106'
    and window_started_at=to_timestamp(floor(extract(epoch from clock_timestamp())/3600)*3600);
  if v_count <> 101 then
    raise exception 'Monotonic counter failed, expected 101, actual %',v_count;
  end if;
end; $w04$;

rollback;
