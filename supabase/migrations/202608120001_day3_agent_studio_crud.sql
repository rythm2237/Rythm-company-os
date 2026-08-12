-- RYTHM Company OS — Day 3: Agent Studio governed CRUD
-- Customer-facing Agent mutations are entitlement-checked server-side.
-- External actions remain disabled in V1.

create or replace function public.create_agent_v1(
  target_org_id uuid,
  target_name text,
  target_role_title text,
  target_purpose text,
  target_department_id uuid default null,
  target_reports_to_agent_id uuid default null,
  target_authority_level smallint default 1,
  target_risk_ceiling text default 'medium',
  target_language text default 'English',
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

  if length(trim(coalesce(target_name,''))) < 2 or length(trim(coalesce(target_name,''))) > 120 then
    raise exception 'Agent name must contain 2 to 120 characters';
  end if;
  if length(trim(coalesce(target_role_title,''))) < 2 or length(trim(coalesce(target_role_title,''))) > 160 then
    raise exception 'Role title must contain 2 to 160 characters';
  end if;
  if length(trim(coalesce(target_purpose,''))) < 10 then raise exception 'Agent purpose is too short'; end if;
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
    responsibilities, skills, language, system_instructions, kpis,
    human_approval_requirements, allowed_tools, memory_scope,
    external_actions_allowed, runtime_provider, runtime_policy_key,
    budget_policy_key, agent_status, template_version
  ) values (
    v_agent_id, target_org_id, v_agent_code, trim(target_name), trim(target_role_title), trim(target_purpose),
    target_authority_level, v_risk, false, '1.0',
    jsonb_build_object('is_ai', true, 'created_via', 'agent_studio'),
    jsonb_build_object('external_actions_allowed', false, 'human_ceo_governed', true),
    target_department_id, target_reports_to_agent_id, true,
    coalesce(target_responsibilities,'[]'::jsonb), coalesce(target_skills,'[]'::jsonb),
    coalesce(nullif(trim(target_language),''),'English'),
    'You are an AI Agent in a RYTHM governed company. Identify yourself as AI, operate only within authorized company context, keep external actions disabled, and escalate consequential decisions to the Human CEO.',
    coalesce(target_kpis,'[]'::jsonb), coalesce(target_human_approval_requirements,'[]'::jsonb),
    coalesce(target_allowed_tools,'[]'::jsonb), 'organization', false, 'OpenAI',
    'central_openai_v1', 'organization_metered_v1', 'paused', 'studio-v1'
  );

  insert into public.audit_events (organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values (target_org_id,'user',v_user_id,'agent_studio.agent_created','agent',v_agent_id::text,'medium',
    jsonb_build_object('agent_code',v_agent_code,'initial_status','paused','external_actions_allowed',false));

  return v_agent_id;
end;
$$;

create or replace function public.update_agent_v1(
  target_agent_id uuid,
  target_name text,
  target_role_title text,
  target_purpose text,
  target_department_id uuid default null,
  target_reports_to_agent_id uuid default null,
  target_authority_level smallint default 1,
  target_risk_ceiling text default 'medium',
  target_language text default 'English',
  target_responsibilities jsonb default '[]'::jsonb,
  target_skills jsonb default '[]'::jsonb,
  target_kpis jsonb default '[]'::jsonb,
  target_human_approval_requirements jsonb default '[]'::jsonb,
  target_allowed_tools jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_agent public.agents%rowtype;
  v_entitlement public.organization_entitlements%rowtype;
  v_risk public.rythm_risk_level;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_agent from public.agents where id = target_agent_id;
  if v_agent.id is null then raise exception 'Agent not found'; end if;
  if not public.is_org_owner(v_agent.organization_id) then raise exception 'Organization owner authority required'; end if;
  select * into v_entitlement from public.organization_entitlements where organization_id = v_agent.organization_id;
  if v_entitlement.id is null or not v_entitlement.agent_builder_enabled then raise exception 'Agent Builder is not enabled for this organization'; end if;
  if v_agent.agent_status = 'archived' then raise exception 'Archived Agents cannot be edited'; end if;
  if target_reports_to_agent_id = target_agent_id then raise exception 'Agent cannot report to itself'; end if;
  if target_department_id is not null and not exists (select 1 from public.departments where id=target_department_id and organization_id=v_agent.organization_id and status='active') then raise exception 'Invalid department'; end if;
  if target_reports_to_agent_id is not null and not exists (select 1 from public.agents where id=target_reports_to_agent_id and organization_id=v_agent.organization_id and agent_status <> 'archived') then raise exception 'Invalid reporting line'; end if;
  if target_authority_level < 0 or target_authority_level > 4 then raise exception 'Invalid authority level'; end if;
  v_risk := case lower(target_risk_ceiling) when 'low' then 'low'::public.rythm_risk_level when 'high' then 'high'::public.rythm_risk_level when 'critical' then 'critical'::public.rythm_risk_level else 'medium'::public.rythm_risk_level end;

  update public.agents set
    name=trim(target_name), role_title=trim(target_role_title), purpose=trim(target_purpose),
    department_id=target_department_id, reports_to_agent_id=target_reports_to_agent_id,
    authority_level=target_authority_level, risk_ceiling=v_risk,
    language=coalesce(nullif(trim(target_language),''),'English'),
    responsibilities=coalesce(target_responsibilities,'[]'::jsonb), skills=coalesce(target_skills,'[]'::jsonb),
    kpis=coalesce(target_kpis,'[]'::jsonb), human_approval_requirements=coalesce(target_human_approval_requirements,'[]'::jsonb),
    allowed_tools=coalesce(target_allowed_tools,'[]'::jsonb), external_actions_allowed=false,
    permissions = coalesce(permissions,'{}'::jsonb) || jsonb_build_object('external_actions_allowed',false,'human_ceo_governed',true),
    updated_at=now()
  where id=target_agent_id;

  insert into public.audit_events (organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values (v_agent.organization_id,'user',v_user_id,'agent_studio.agent_updated','agent',target_agent_id::text,'medium',jsonb_build_object('external_actions_allowed',false));
end;
$$;

create or replace function public.set_agent_status_v1(target_agent_id uuid, target_status text)
returns void language plpgsql security definer set search_path=public as $$
declare v_user_id uuid:=auth.uid(); v_agent public.agents%rowtype; v_entitlement public.organization_entitlements%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_agent from public.agents where id=target_agent_id;
  if v_agent.id is null then raise exception 'Agent not found'; end if;
  if not public.is_org_owner(v_agent.organization_id) then raise exception 'Organization owner authority required'; end if;
  select * into v_entitlement from public.organization_entitlements where organization_id=v_agent.organization_id;
  if v_entitlement.id is null or not v_entitlement.agent_builder_enabled then raise exception 'Agent Builder is not enabled for this organization'; end if;
  if lower(target_status) not in ('enabled','paused','archived') then raise exception 'Invalid Agent status'; end if;
  if lower(target_status)='archived' and not v_entitlement.agent_archive_enabled then raise exception 'Agent archive is not enabled'; end if;
  if lower(target_status)='enabled' and v_agent.agent_status='archived' then raise exception 'Archived Agents cannot be enabled'; end if;
  update public.agents set agent_status=lower(target_status), enabled=(lower(target_status)='enabled'), external_actions_allowed=false, updated_at=now() where id=target_agent_id;
  insert into public.audit_events (organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values (v_agent.organization_id,'user',v_user_id,'agent_studio.status_changed','agent',target_agent_id::text,'medium',jsonb_build_object('status',lower(target_status),'external_actions_allowed',false));
end; $$;

create or replace function public.clone_agent_v1(target_agent_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid:=auth.uid(); v_source public.agents%rowtype; v_entitlement public.organization_entitlements%rowtype;
  v_new_id uuid:=gen_random_uuid(); v_code text; v_seq integer:=1;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_source from public.agents where id=target_agent_id;
  if v_source.id is null then raise exception 'Agent not found'; end if;
  if not public.is_org_owner(v_source.organization_id) then raise exception 'Organization owner authority required'; end if;
  select * into v_entitlement from public.organization_entitlements where organization_id=v_source.organization_id;
  if v_entitlement.id is null or not v_entitlement.agent_clone_enabled then raise exception 'Agent cloning is not enabled'; end if;
  if v_source.agent_status='archived' then raise exception 'Archived Agents cannot be cloned'; end if;
  if (select count(*) from public.agents where organization_id=v_source.organization_id and agent_status <> 'archived') >= v_entitlement.max_active_agents then raise exception 'Agent limit reached for this organization'; end if;
  perform pg_advisory_xact_lock(hashtext(v_source.organization_id::text));
  loop v_code:='AI-'||lpad(v_seq::text,3,'0'); exit when not exists(select 1 from public.agents where organization_id=v_source.organization_id and agent_code=v_code); v_seq:=v_seq+1; end loop;
  insert into public.agents (
    id,organization_id,agent_code,name,role_title,purpose,authority_level,risk_ceiling,enabled,specification_version,
    identity,permissions,department_id,reports_to_agent_id,is_ai,responsibilities,skills,work_style,language,system_instructions,
    kpis,success_criteria,human_approval_requirements,allowed_tools,memory_scope,external_actions_allowed,runtime_provider,runtime_model,
    runtime_policy_key,budget_policy_key,agent_status,template_version
  ) values (
    v_new_id,v_source.organization_id,v_code,v_source.name||' Copy',v_source.role_title,v_source.purpose,v_source.authority_level,v_source.risk_ceiling,false,v_source.specification_version,
    coalesce(v_source.identity,'{}'::jsonb)||jsonb_build_object('cloned_from_agent_id',v_source.id,'is_ai',true),
    coalesce(v_source.permissions,'{}'::jsonb)||jsonb_build_object('external_actions_allowed',false,'human_ceo_governed',true),
    v_source.department_id,v_source.reports_to_agent_id,true,v_source.responsibilities,v_source.skills,v_source.work_style,v_source.language,v_source.system_instructions,
    v_source.kpis,v_source.success_criteria,v_source.human_approval_requirements,v_source.allowed_tools,v_source.memory_scope,false,v_source.runtime_provider,v_source.runtime_model,
    v_source.runtime_policy_key,v_source.budget_policy_key,'paused','clone-v1'
  );
  insert into public.audit_events (organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values (v_source.organization_id,'user',v_user_id,'agent_studio.agent_cloned','agent',v_new_id::text,'medium',jsonb_build_object('source_agent_id',v_source.id,'initial_status','paused'));
  return v_new_id;
end; $$;

revoke all on function public.create_agent_v1(uuid,text,text,text,uuid,uuid,smallint,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public;
revoke all on function public.update_agent_v1(uuid,text,text,text,uuid,uuid,smallint,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public;
revoke all on function public.set_agent_status_v1(uuid,text) from public;
revoke all on function public.clone_agent_v1(uuid) from public;
grant execute on function public.create_agent_v1(uuid,text,text,text,uuid,uuid,smallint,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.update_agent_v1(uuid,text,text,text,uuid,uuid,smallint,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.set_agent_status_v1(uuid,text) to authenticated;
grant execute on function public.clone_agent_v1(uuid) to authenticated;
