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

-- An authenticated org member could pass a privileged agent UUID and receive
-- confidential/restricted knowledge solely based on that agent's department/role.
-- Preserve member access to public/internal knowledge. Sensitive chunks require
-- the authenticated org OWNER or the trusted server service_role, in addition
-- to existing agent department/role restrictions.
create or replace function public.search_company_knowledge_for_agent_v1(
  target_org_id uuid, target_agent_id uuid, query_text text, max_results integer default 8
)
returns table (
  knowledge_id uuid, title text, category text, confidentiality text,
  chunk_index integer, content text, rank real
)
language plpgsql
security definer
set search_path = ''
as $w04_knowledge$
declare
  v_agent public.agents%rowtype;
  v_department text;
  v_service_role boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_can_read_sensitive boolean;
begin
  if auth.uid() is null and not v_service_role then
    raise exception 'Authentication required';
  end if;
  if not v_service_role and not public.is_org_member(target_org_id) then
    raise exception 'not_authorized';
  end if;
  v_can_read_sensitive := v_service_role or public.is_org_owner(target_org_id);

  select * into v_agent from public.agents
    where id=target_agent_id and organization_id=target_org_id;
  if v_agent.id is null or not v_agent.company_knowledge_connected then
    return;
  end if;
  select name into v_department from public.departments
    where id=v_agent.department_id and organization_id=target_org_id;

  return query
  select k.id,k.title,k.category,k.confidentiality,c.chunk_index,c.content,
    case
      when nullif(trim(coalesce(query_text,'')),'') is null then 0::real
      else ts_rank(c.search_vector,plainto_tsquery('simple',query_text))
    end as rank
  from public.company_knowledge_chunks c
    join public.company_knowledge k
      on k.id=c.knowledge_id and k.organization_id=c.organization_id
  where c.organization_id=target_org_id
    and k.status='active' and k.ingestion_status='ready'
    and (nullif(trim(coalesce(query_text,'')),'') is null
      or c.search_vector @@ plainto_tsquery('simple',query_text))
    and (
      k.confidentiality in ('public','internal')
      or (
        v_can_read_sensitive
        and k.confidentiality in ('confidential','restricted')
        and (
          (coalesce(array_length(k.allowed_departments,1),0)>0
            and exists(select 1 from unnest(k.allowed_departments) d
              where lower(d)=lower(coalesce(v_department,''))))
          or (coalesce(array_length(k.allowed_role_keywords,1),0)>0
            and exists(select 1 from unnest(k.allowed_role_keywords) r
              where lower(v_agent.role_title) like '%'||lower(r)||'%'
                 or lower(coalesce(v_agent.canonical_role,'')) like '%'||lower(r)||'%'))
        )
      )
    )
  order by rank desc,c.created_at desc
  limit greatest(1,least(coalesce(max_results,8),20));
end;
$w04_knowledge$;

-- Expired/suspended memberships must not retain even entitlement visibility:
-- the previous helper joined organization_members on user_id without status.
-- Align it with the canonical active-member predicate in is_org_member.
create or replace function public.has_active_organization_entitlement(target_org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $w04_entitlement$
  select exists (
    select 1
    from public.organization_entitlements e
    join public.organization_members om
      on om.organization_id=e.organization_id
     and om.user_id=auth.uid()
     and om.membership_status='active'
    where e.organization_id=target_org_id
      and e.status='active'
      and (e.starts_at is null or e.starts_at<=now())
      and (e.ends_at is null or e.ends_at>now())
  );
$w04_entitlement$;

-- Public push registration must honor the booking management-token expiry,
-- just as nail_2nya_get_booking and nail_2nya_cancel_booking already do.
-- Preserve public (anon) booking grants and original API parameter/return shape.
create or replace function public.nail_2nya_subscribe_customer_push(
  p_appointment_id uuid, p_token text, p_endpoint text, p_p256dh text, p_auth text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $w04_push$
declare v_valid boolean;
begin
  select exists(
    select 1 from public.nail_2nya_booking_tokens t
    where t.appointment_id=p_appointment_id
      and t.token_hash=extensions.digest(coalesce(p_token,'')::bytea,'sha256')
      and (t.expires_at is null or t.expires_at>now())
  ) into v_valid;
  if not v_valid then return false; end if;
  if nullif(trim(p_endpoint),'') is null
    or nullif(trim(p_p256dh),'') is null
    or nullif(trim(p_auth),'') is null then return false;
  end if;
  insert into public.nail_2nya_customer_push_subscriptions(
    appointment_id,endpoint,p256dh,auth,active,updated_at
  )
  values(p_appointment_id,trim(p_endpoint),trim(p_p256dh),trim(p_auth),true,now())
  on conflict(endpoint) do update
    set appointment_id=excluded.appointment_id,
        p256dh=excluded.p256dh,auth=excluded.auth,
        active=true,updated_at=now();
  return true;
end;
$w04_push$;

commit;
 then
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

-- An authenticated org member could pass a privileged agent UUID and receive
-- confidential/restricted knowledge solely based on that agent's department/role.
-- Preserve member access to public/internal knowledge. Sensitive chunks require
-- the authenticated org OWNER or the trusted server service_role, in addition
-- to existing agent department/role restrictions.
create or replace function public.search_company_knowledge_for_agent_v1(
  target_org_id uuid, target_agent_id uuid, query_text text, max_results integer default 8
)
returns table (
  knowledge_id uuid, title text, category text, confidentiality text,
  chunk_index integer, content text, rank real
)
language plpgsql
security definer
set search_path = ''
as $w04_knowledge$
declare
  v_agent public.agents%rowtype;
  v_department text;
  v_service_role boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_can_read_sensitive boolean;
begin
  if auth.uid() is null and not v_service_role then
    raise exception 'Authentication required';
  end if;
  if not v_service_role and not public.is_org_member(target_org_id) then
    raise exception 'not_authorized';
  end if;
  v_can_read_sensitive := v_service_role or public.is_org_owner(target_org_id);

  select * into v_agent from public.agents
    where id=target_agent_id and organization_id=target_org_id;
  if v_agent.id is null or not v_agent.company_knowledge_connected then
    return;
  end if;
  select name into v_department from public.departments
    where id=v_agent.department_id and organization_id=target_org_id;

  return query
  select k.id,k.title,k.category,k.confidentiality,c.chunk_index,c.content,
    case
      when nullif(trim(coalesce(query_text,'')),'') is null then 0::real
      else ts_rank(c.search_vector,plainto_tsquery('simple',query_text))
    end as rank
  from public.company_knowledge_chunks c
    join public.company_knowledge k
      on k.id=c.knowledge_id and k.organization_id=c.organization_id
  where c.organization_id=target_org_id
    and k.status='active' and k.ingestion_status='ready'
    and (nullif(trim(coalesce(query_text,'')),'') is null
      or c.search_vector @@ plainto_tsquery('simple',query_text))
    and (
      k.confidentiality in ('public','internal')
      or (
        v_can_read_sensitive
        and k.confidentiality in ('confidential','restricted')
        and (
          (coalesce(array_length(k.allowed_departments,1),0)>0
            and exists(select 1 from unnest(k.allowed_departments) d
              where lower(d)=lower(coalesce(v_department,''))))
          or (coalesce(array_length(k.allowed_role_keywords,1),0)>0
            and exists(select 1 from unnest(k.allowed_role_keywords) r
              where lower(v_agent.role_title) like '%'||lower(r)||'%'
                 or lower(coalesce(v_agent.canonical_role,'')) like '%'||lower(r)||'%'))
        )
      )
    )
  order by rank desc,c.created_at desc
  limit greatest(1,least(coalesce(max_results,8),20));
end;
$w04_knowledge$;

-- Expired/suspended memberships must not retain even entitlement visibility:
-- the previous helper joined organization_members on user_id without status.
-- Align it with the canonical active-member predicate in is_org_member.
create or replace function public.has_active_organization_entitlement(target_org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $w04_entitlement$
  select exists (
    select 1
    from public.organization_entitlements e
    join public.organization_members om
      on om.organization_id=e.organization_id
     and om.user_id=auth.uid()
     and om.membership_status='active'
    where e.organization_id=target_org_id
      and e.status='active'
      and (e.starts_at is null or e.starts_at<=now())
      and (e.ends_at is null or e.ends_at>now())
  );
$w04_entitlement$;

-- Public push registration must honor the booking management-token expiry,
-- just as nail_2nya_get_booking and nail_2nya_cancel_booking already do.
-- Preserve public (anon) booking grants and original API parameter/return shape.
create or replace function public.nail_2nya_subscribe_customer_push(
  p_appointment_id uuid, p_token text, p_endpoint text, p_p256dh text, p_auth text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $w04_push$
declare v_valid boolean;
begin
  select exists(
    select 1 from public.nail_2nya_booking_tokens t
    where t.appointment_id=p_appointment_id
      and t.token_hash=extensions.digest(coalesce(p_token,'')::bytea,'sha256')
      and (t.expires_at is null or t.expires_at>now())
  ) into v_valid;
  if not v_valid then return false; end if;
  if nullif(trim(p_endpoint),'') is null
    or nullif(trim(p_p256dh),'') is null
    or nullif(trim(p_auth),'') is null then return false;
  end if;
  insert into public.nail_2nya_customer_push_subscriptions(
    appointment_id,endpoint,p256dh,auth,active,updated_at
  )
  values(p_appointment_id,trim(p_endpoint),trim(p_p256dh),trim(p_auth),true,now())
  on conflict(endpoint) do update
    set appointment_id=excluded.appointment_id,
        p256dh=excluded.p256dh,auth=excluded.auth,
        active=true,updated_at=now();
  return true;
end;
$w04_push$;

commit;
