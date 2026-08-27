-- Supabase's modern Data API exposes JWT claims as request.jwt.claims JSON.
-- Keep the legacy scalar claim fallback for older PostgREST runtimes.

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
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',
    ''
  );
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
declare request_role text := coalesce(
  nullif(current_setting('request.jwt.claim.role',true),''),
  nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',
  ''
);
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

create or replace function public.claim_tool_execution_v2(target_execution_id uuid)
returns public.tool_execution_requests
language plpgsql security definer set search_path='' as $$
declare
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',
    ''
  );
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
declare request_role text := coalesce(
  nullif(current_setting('request.jwt.claim.role',true),''),
  nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',
  ''
); candidate public.tool_execution_requests%rowtype;
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
declare request_role text := coalesce(
  nullif(current_setting('request.jwt.claim.role',true),''),
  nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',
  ''
); secret_id uuid; secret_value text;
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
