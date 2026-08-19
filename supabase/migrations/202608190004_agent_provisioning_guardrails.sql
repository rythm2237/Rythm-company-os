begin;

create or replace function public.set_agent_status_v1(target_agent_id uuid,target_status text)
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
  if lower(target_status)='enabled' and v_agent.provisioning_status<>'ready' then raise exception 'Professional knowledge provisioning must be Ready before this Agent can be enabled'; end if;
  if lower(target_status)='enabled' and v_agent.template_version like 'trusted-bootstrap%' and not exists(
    select 1 from public.agent_role_foundation_bindings b join public.role_foundations f on f.id=b.role_foundation_id
    where b.agent_id=v_agent.id and b.organization_id=v_agent.organization_id and b.status='active' and f.status in ('validated','active')
  ) then raise exception 'A validated Professional Role Foundation must be bound before this Agent can be enabled'; end if;
  update public.agents set agent_status=lower(target_status),enabled=(lower(target_status)='enabled'),external_actions_allowed=false,updated_at=now() where id=target_agent_id;
  insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(v_agent.organization_id,'user',v_user_id,'agent_studio.status_changed','agent',target_agent_id::text,'medium',jsonb_build_object('status',lower(target_status),'external_actions_allowed',false,'provisioning_status',v_agent.provisioning_status));
end; $$;

create or replace function public.clone_agent_v1(target_agent_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid:=auth.uid(); v_source public.agents%rowtype; v_entitlement public.organization_entitlements%rowtype;
  v_new_id uuid:=gen_random_uuid(); v_code text; v_seq integer:=1; v_has_foundation boolean:=false; v_clone_provisioning text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_source from public.agents where id=target_agent_id;
  if v_source.id is null then raise exception 'Agent not found'; end if;
  if not public.is_org_owner(v_source.organization_id) then raise exception 'Organization owner authority required'; end if;
  select * into v_entitlement from public.organization_entitlements where organization_id=v_source.organization_id;
  if v_entitlement.id is null or not v_entitlement.agent_clone_enabled then raise exception 'Agent cloning is not enabled'; end if;
  if v_source.agent_status='archived' then raise exception 'Archived Agents cannot be cloned'; end if;
  if (select count(*) from public.agents where organization_id=v_source.organization_id and agent_status<>'archived')>=v_entitlement.max_active_agents then raise exception 'Agent limit reached for this organization'; end if;
  select exists(select 1 from public.agent_role_foundation_bindings where organization_id=v_source.organization_id and agent_id=v_source.id and status='active') into v_has_foundation;
  v_clone_provisioning:=case when v_source.template_version like 'trusted-bootstrap%' and not v_has_foundation then 'failed' else v_source.provisioning_status end;
  perform pg_advisory_xact_lock(hashtext(v_source.organization_id::text));
  loop v_code:='AI-'||lpad(v_seq::text,3,'0'); exit when not exists(select 1 from public.agents where organization_id=v_source.organization_id and agent_code=v_code); v_seq:=v_seq+1; end loop;
  insert into public.agents(
    id,organization_id,agent_code,name,role_title,purpose,authority_level,risk_ceiling,enabled,specification_version,identity,permissions,department_id,reports_to_agent_id,is_ai,responsibilities,skills,work_style,language,system_instructions,kpis,success_criteria,human_approval_requirements,allowed_tools,memory_scope,external_actions_allowed,runtime_provider,runtime_model,runtime_policy_key,budget_policy_key,agent_status,template_version,
    raw_role_title,canonical_role,role_family,specializations,provisioning_status,provisioning_error,provisioned_at,last_knowledge_review_at,foundation_update_available
  ) values(
    v_new_id,v_source.organization_id,v_code,v_source.name||' Copy',v_source.role_title,v_source.purpose,v_source.authority_level,v_source.risk_ceiling,false,v_source.specification_version,
    coalesce(v_source.identity,'{}'::jsonb)||jsonb_build_object('cloned_from_agent_id',v_source.id,'is_ai',true),coalesce(v_source.permissions,'{}'::jsonb)||jsonb_build_object('external_actions_allowed',false,'human_ceo_governed',true),
    v_source.department_id,v_source.reports_to_agent_id,true,v_source.responsibilities,v_source.skills,v_source.work_style,v_source.language,v_source.system_instructions,v_source.kpis,v_source.success_criteria,v_source.human_approval_requirements,v_source.allowed_tools,v_source.memory_scope,false,v_source.runtime_provider,v_source.runtime_model,v_source.runtime_policy_key,v_source.budget_policy_key,'paused',case when v_source.template_version like 'trusted-bootstrap%' then 'trusted-bootstrap-v1-clone' else v_source.template_version end,
    v_source.raw_role_title,v_source.canonical_role,v_source.role_family,v_source.specializations,v_clone_provisioning,case when v_clone_provisioning='failed' then 'Source Agent has no active Professional Role Foundation. Retry provisioning before use.' else null end,case when v_clone_provisioning='ready' then now() else null end,v_source.last_knowledge_review_at,v_source.foundation_update_available
  );
  if v_has_foundation then
    insert into public.agent_role_foundation_bindings(organization_id,agent_id,role_foundation_id,foundation_version,status,bound_at)
    select organization_id,v_new_id,role_foundation_id,foundation_version,'active',now() from public.agent_role_foundation_bindings where organization_id=v_source.organization_id and agent_id=v_source.id and status='active' order by bound_at desc limit 1;
    insert into public.agent_specialization_bindings(organization_id,agent_id,specialization_id,status,bound_at)
    select organization_id,v_new_id,specialization_id,'active',now() from public.agent_specialization_bindings where organization_id=v_source.organization_id and agent_id=v_source.id and status='active';
  end if;
  insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(v_source.organization_id,'user',v_user_id,'agent_studio.agent_cloned','agent',v_new_id::text,'medium',jsonb_build_object('source_agent_id',v_source.id,'initial_status','paused','professional_foundation_copied',v_has_foundation,'provisioning_status',v_clone_provisioning));
  return v_new_id;
end; $$;

commit;
