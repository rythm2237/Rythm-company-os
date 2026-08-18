-- RYTHM Company OS — Agent Builder V2
-- Adds provider/model/system-instruction aware creation without weakening V1 governance.

create or replace function public.create_agent_v2(
  target_org_id uuid,
  target_name text,
  target_role_title text,
  target_purpose text,
  target_system_instructions text,
  target_runtime_provider text,
  target_runtime_model text,
  target_department_id uuid default null,
  target_reports_to_agent_id uuid default null,
  target_authority_level smallint default 1,
  target_risk_ceiling text default 'medium',
  target_language text default 'English',
  target_work_style text default null,
  target_responsibilities jsonb default '[]'::jsonb,
  target_skills jsonb default '[]'::jsonb,
  target_kpis jsonb default '[]'::jsonb,
  target_human_approval_requirements jsonb default '["Consequential external actions","Material financial commitments"]'::jsonb,
  target_allowed_tools jsonb default '["company_memory","projects","meetings","decisions","actions"]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entitlement public.organization_entitlements%rowtype;
  v_agent_id uuid := gen_random_uuid();
  v_agent_code text;
  v_seq integer := 1;
  v_risk public.rythm_risk_level;
  v_provider text := lower(trim(coalesce(target_runtime_provider,'')));
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_org_owner(target_org_id) then raise exception 'Organization owner authority required'; end if;

  select * into v_entitlement from public.organization_entitlements where organization_id = target_org_id;
  if v_entitlement.id is null or not v_entitlement.agent_builder_enabled or not v_entitlement.agent_create_enabled then
    raise exception 'Agent creation is not enabled for this organization';
  end if;

  if (select count(*) from public.agents where organization_id = target_org_id and agent_status <> 'archived') >= v_entitlement.max_active_agents then
    raise exception 'Agent limit reached for this organization';
  end if;

  if length(trim(coalesce(target_name,''))) < 2 or length(trim(coalesce(target_name,''))) > 120 then raise exception 'Agent name must contain 2 to 120 characters'; end if;
  if length(trim(coalesce(target_role_title,''))) < 2 or length(trim(coalesce(target_role_title,''))) > 160 then raise exception 'Role title must contain 2 to 160 characters'; end if;
  if length(trim(coalesce(target_purpose,''))) < 10 then raise exception 'Agent purpose is too short'; end if;
  if length(trim(coalesce(target_system_instructions,''))) < 100 then raise exception 'Generated Agent instructions are incomplete'; end if;
  if v_provider not in ('openai','anthropic','google') then raise exception 'Invalid runtime provider'; end if;
  if length(trim(coalesce(target_runtime_model,''))) < 2 then raise exception 'Runtime model is required'; end if;
  if target_authority_level < 0 or target_authority_level > 4 then raise exception 'Invalid authority level'; end if;

  if target_department_id is not null and not exists (
    select 1 from public.departments where id = target_department_id and organization_id = target_org_id and status = 'active'
  ) then raise exception 'Invalid department'; end if;

  if target_reports_to_agent_id is not null and not exists (
    select 1 from public.agents where id = target_reports_to_agent_id and organization_id = target_org_id and agent_status <> 'archived'
  ) then raise exception 'Invalid reporting line'; end if;

  v_risk := case lower(target_risk_ceiling)
    when 'low' then 'low'::public.rythm_risk_level
    when 'high' then 'high'::public.rythm_risk_level
    when 'critical' then 'critical'::public.rythm_risk_level
    else 'medium'::public.rythm_risk_level end;

  perform pg_advisory_xact_lock(hashtext(target_org_id::text));
  loop
    v_agent_code := 'AI-' || lpad(v_seq::text, 3, '0');
    exit when not exists (select 1 from public.agents where organization_id = target_org_id and agent_code = v_agent_code);
    v_seq := v_seq + 1;
  end loop;

  insert into public.agents (
    id, organization_id, agent_code, name, role_title, purpose,
    authority_level, risk_ceiling, enabled, specification_version,
    identity, permissions, department_id, reports_to_agent_id, is_ai,
    responsibilities, skills, work_style, language, system_instructions, kpis,
    human_approval_requirements, allowed_tools, memory_scope,
    external_actions_allowed, runtime_provider, runtime_model, runtime_policy_key,
    budget_policy_key, agent_status, template_version
  ) values (
    v_agent_id, target_org_id, v_agent_code, trim(target_name), trim(target_role_title), trim(target_purpose),
    target_authority_level, v_risk, false, '2.0',
    jsonb_build_object('is_ai', true, 'created_via', 'agent_builder_v2', 'runtime_provider', v_provider),
    jsonb_build_object('external_actions_allowed', false, 'human_ceo_governed', true),
    target_department_id, target_reports_to_agent_id, true,
    coalesce(target_responsibilities,'[]'::jsonb), coalesce(target_skills,'[]'::jsonb), nullif(trim(target_work_style),''),
    coalesce(nullif(trim(target_language),''),'English'), trim(target_system_instructions), coalesce(target_kpis,'[]'::jsonb),
    coalesce(target_human_approval_requirements,'[]'::jsonb), coalesce(target_allowed_tools,'[]'::jsonb),
    'organization', false, v_provider, trim(target_runtime_model), 'multi_provider_v1',
    'organization_metered_v1', 'paused', 'builder-v2'
  );

  insert into public.audit_events (organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values (target_org_id,'user',v_user_id,'agent_builder_v2.agent_generated','agent',v_agent_id::text,'medium',
    jsonb_build_object('agent_code',v_agent_code,'initial_status','paused','provider',v_provider,'model',trim(target_runtime_model),'external_actions_allowed',false));

  return v_agent_id;
end;
$$;

revoke all on function public.create_agent_v2(uuid,text,text,text,text,text,text,uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public;
grant execute on function public.create_agent_v2(uuid,text,text,text,text,text,text,uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
