begin;

create or replace function public.create_agent_provisioning_v3(
  target_org_id uuid,
  target_name text,
  target_role_title text,
  target_purpose text,
  target_runtime_provider text,
  target_runtime_model text,
  target_raw_role_title text,
  target_canonical_role text,
  target_role_family text,
  target_specializations text[] default '{}',
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
set search_path=public
as $$
declare
  v_user_id uuid:=auth.uid();
  v_entitlement public.organization_entitlements%rowtype;
  v_agent_id uuid:=gen_random_uuid();
  v_agent_code text;
  v_seq integer:=1;
  v_risk public.rythm_risk_level;
  v_provider text:=lower(trim(coalesce(target_runtime_provider,'')));
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_org_owner(target_org_id) then raise exception 'Organization owner authority required'; end if;
  select * into v_entitlement from public.organization_entitlements where organization_id=target_org_id;
  if v_entitlement.id is null or not v_entitlement.agent_builder_enabled or not v_entitlement.agent_create_enabled then raise exception 'Agent creation is not enabled for this organization'; end if;
  if (select count(*) from public.agents where organization_id=target_org_id and agent_status<>'archived') >= v_entitlement.max_active_agents then raise exception 'Agent limit reached for this organization'; end if;
  if length(trim(coalesce(target_name,'')))<2 or length(trim(coalesce(target_name,'')))>120 then raise exception 'Agent name must contain 2 to 120 characters'; end if;
  if length(trim(coalesce(target_role_title,'')))<2 or length(trim(coalesce(target_role_title,'')))>160 then raise exception 'Role title must contain 2 to 160 characters'; end if;
  if length(trim(coalesce(target_purpose,'')))<10 then raise exception 'Agent purpose is too short'; end if;
  if v_provider not in ('openai','anthropic','google','gemini') then raise exception 'Invalid runtime provider'; end if;
  if length(trim(coalesce(target_runtime_model,'')))<2 then raise exception 'Runtime model is required'; end if;
  if length(trim(coalesce(target_role_family,'')))<2 then raise exception 'Normalized role family is required'; end if;
  if target_authority_level<0 or target_authority_level>4 then raise exception 'Invalid authority level'; end if;
  if target_department_id is not null and not exists(select 1 from public.departments where id=target_department_id and organization_id=target_org_id and status='active') then raise exception 'Invalid department'; end if;
  if target_reports_to_agent_id is not null and not exists(select 1 from public.agents where id=target_reports_to_agent_id and organization_id=target_org_id and agent_status<>'archived') then raise exception 'Invalid reporting line'; end if;
  v_risk:=case lower(target_risk_ceiling) when 'low' then 'low'::public.rythm_risk_level when 'high' then 'high'::public.rythm_risk_level when 'critical' then 'critical'::public.rythm_risk_level else 'medium'::public.rythm_risk_level end;

  perform pg_advisory_xact_lock(hashtext(target_org_id::text));
  loop
    v_agent_code:='AI-'||lpad(v_seq::text,3,'0');
    exit when not exists(select 1 from public.agents where organization_id=target_org_id and agent_code=v_agent_code);
    v_seq:=v_seq+1;
  end loop;

  insert into public.agents(
    id,organization_id,agent_code,name,role_title,purpose,authority_level,risk_ceiling,enabled,specification_version,
    identity,permissions,department_id,reports_to_agent_id,is_ai,responsibilities,skills,work_style,language,system_instructions,kpis,
    human_approval_requirements,allowed_tools,memory_scope,external_actions_allowed,runtime_provider,runtime_model,runtime_policy_key,budget_policy_key,
    agent_status,template_version,raw_role_title,canonical_role,role_family,specializations,provisioning_status,provisioning_started_at,foundation_update_available
  ) values (
    v_agent_id,target_org_id,v_agent_code,trim(target_name),trim(target_role_title),trim(target_purpose),target_authority_level,v_risk,false,'3.0',
    jsonb_build_object('is_ai',true,'created_via','trusted_agent_knowledge_bootstrap_v1','runtime_provider',v_provider),
    jsonb_build_object('external_actions_allowed',false,'human_ceo_governed',true),target_department_id,target_reports_to_agent_id,true,
    coalesce(target_responsibilities,'[]'::jsonb),coalesce(target_skills,'[]'::jsonb),nullif(trim(target_work_style),''),coalesce(nullif(trim(target_language),''),'English'),null,coalesce(target_kpis,'[]'::jsonb),
    coalesce(target_human_approval_requirements,'[]'::jsonb),coalesce(target_allowed_tools,'[]'::jsonb),'organization',false,v_provider,trim(target_runtime_model),'multi_provider_v1','organization_metered_v1',
    'paused','trusted-bootstrap-v1',coalesce(nullif(trim(target_raw_role_title),''),trim(target_role_title)),nullif(trim(target_canonical_role),''),trim(target_role_family),coalesce(target_specializations,'{}'),'provisioning',now(),false
  );

  insert into public.agent_knowledge_provisioning_events(organization_id,agent_id,event_type,role_family,canonical_role,metadata)
  values(target_org_id,v_agent_id,'role_normalized',trim(target_role_family),nullif(trim(target_canonical_role),''),jsonb_build_object('specializations',coalesce(target_specializations,'{}')));
  insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(target_org_id,'user',v_user_id,'agent_knowledge.provisioning_started','agent',v_agent_id::text,'medium',jsonb_build_object('provider',v_provider,'model',trim(target_runtime_model),'external_actions_allowed',false));
  return v_agent_id;
end;
$$;

revoke all on function public.create_agent_provisioning_v3(uuid,text,text,text,text,text,text,text,text,text[],uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.create_agent_provisioning_v3(uuid,text,text,text,text,text,text,text,text,text[],uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.complete_agent_knowledge_provisioning_v1(target_agent_id uuid,target_system_instructions text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
  v_foundation public.role_foundations%rowtype;
  v_binding public.agent_role_foundation_bindings%rowtype;
  v_specialization_count integer;
begin
  select organization_id into v_org from public.agents where id=target_agent_id;
  if v_org is null or not public.is_org_owner(v_org) then raise exception 'not_authorized'; end if;
  if length(trim(coalesce(target_system_instructions,'')))<100 then raise exception 'Generated Agent instructions are incomplete'; end if;
  select * into v_binding from public.agent_role_foundation_bindings where agent_id=target_agent_id and organization_id=v_org and status='active' order by bound_at desc limit 1;
  if v_binding.id is null then raise exception 'Professional foundation binding is required'; end if;
  select * into v_foundation from public.role_foundations where id=v_binding.role_foundation_id;
  if v_foundation.id is null or v_foundation.status not in ('validated','active') then raise exception 'Professional foundation is not validated'; end if;
  select count(*) into v_specialization_count from public.agent_specialization_bindings where agent_id=target_agent_id and organization_id=v_org and status='active';

  update public.agents set
    system_instructions=trim(target_system_instructions),provisioning_status='ready',provisioning_error=null,provisioned_at=now(),last_knowledge_review_at=v_foundation.last_verified_at,
    identity=coalesce(identity,'{}'::jsonb)||jsonb_build_object('professional_foundation_id',v_foundation.id,'professional_foundation_version',v_foundation.version,'professional_knowledge_verified',true),updated_at=now()
  where id=target_agent_id and organization_id=v_org;
  insert into public.agent_knowledge_provisioning_events(organization_id,agent_id,event_type,role_family,canonical_role,metadata)
  select v_org,id,'provisioning_completed',role_family,canonical_role,jsonb_build_object('foundation_id',v_foundation.id,'foundation_version',v_foundation.version,'specialization_count',v_specialization_count) from public.agents where id=target_agent_id;
  insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(v_org,'user',auth.uid(),'agent_knowledge.provisioning_completed','agent',target_agent_id::text,'low',jsonb_build_object('foundation_id',v_foundation.id,'foundation_version',v_foundation.version,'specialization_count',v_specialization_count));
  return jsonb_build_object('status','ready','foundation_id',v_foundation.id,'foundation_version',v_foundation.version,'specialization_count',v_specialization_count);
end;
$$;
revoke all on function public.complete_agent_knowledge_provisioning_v1(uuid,text) from public,anon;
grant execute on function public.complete_agent_knowledge_provisioning_v1(uuid,text) to authenticated;

create or replace function public.fail_agent_knowledge_provisioning_v1(target_agent_id uuid,target_error text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.agents where id=target_agent_id;
  if v_org is null or not public.is_org_owner(v_org) then raise exception 'not_authorized'; end if;
  update public.agents set provisioning_status='failed',provisioning_error=left(coalesce(nullif(trim(target_error),''),'Professional foundation could not be completed.'),500),updated_at=now() where id=target_agent_id and organization_id=v_org;
  insert into public.agent_knowledge_provisioning_events(organization_id,agent_id,event_type,metadata) values(v_org,target_agent_id,'acquisition_failed',jsonb_build_object('error_class','provisioning_failure'));
end;
$$;
revoke all on function public.fail_agent_knowledge_provisioning_v1(uuid,text) from public,anon;
grant execute on function public.fail_agent_knowledge_provisioning_v1(uuid,text) to authenticated;

create or replace function public.sanitize_agent_for_transfer(target_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid; v_memories_removed integer:=0; v_attachments_removed integer:=0; v_artifacts_removed integer:=0; v_foundation_id uuid; v_specializations integer:=0;
begin
  select organization_id into v_org from public.agents where id=target_agent_id;
  if v_org is null or not public.is_org_owner(v_org) then raise exception 'not_authorized'; end if;

  delete from public.agent_memories
   where agent_id=target_agent_id and (learning_scope='company_specific_memory' or transferable=false or source_company_id is not null);
  get diagnostics v_memories_removed=row_count;
  delete from public.agent_attachments
   where agent_id=target_agent_id and (transferable=false or source_company_id is not null);
  get diagnostics v_attachments_removed=row_count;
  delete from public.agent_artifacts
   where agent_id=target_agent_id and (transferable=false or source_company_id is not null);
  get diagnostics v_artifacts_removed=row_count;

  update public.agent_memories set source_company_id=null,confidentiality_level='public',transferable=true
   where agent_id=target_agent_id and learning_scope='transferable_general_learning' and transferable=true;
  select role_foundation_id into v_foundation_id from public.agent_role_foundation_bindings where agent_id=target_agent_id and status='active' limit 1;
  select count(*) into v_specializations from public.agent_specialization_bindings where agent_id=target_agent_id and status='active';

  insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(v_org,'user',auth.uid(),'agent_knowledge.transfer_sanitized','agent',target_agent_id::text,'high',jsonb_build_object('memories_removed',v_memories_removed,'attachments_removed',v_attachments_removed,'artifacts_removed',v_artifacts_removed,'foundation_retained',v_foundation_id is not null,'specializations_retained',v_specializations));
  return jsonb_build_object('memories_removed',v_memories_removed,'attachments_removed',v_attachments_removed,'artifacts_removed',v_artifacts_removed,'role_foundation_id',v_foundation_id,'specializations_retained',v_specializations,'company_knowledge_detached',true);
end;
$$;
revoke all on function public.sanitize_agent_for_transfer(uuid) from public,anon;
grant execute on function public.sanitize_agent_for_transfer(uuid) to authenticated;

create or replace function public.refresh_agent_foundation_update_status(target_agent_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_org uuid; v_current public.role_foundations%rowtype; v_update boolean:=false;
begin
  select organization_id into v_org from public.agents where id=target_agent_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not_authorized'; end if;
  select rf.* into v_current from public.agent_role_foundation_bindings b join public.role_foundations rf on rf.id=b.role_foundation_id where b.agent_id=target_agent_id and b.status='active' limit 1;
  if v_current.id is null then v_update:=true;
  else
    v_update := (v_current.expires_at is not null and v_current.expires_at<=now())
      or (v_current.next_review_at is not null and v_current.next_review_at<=now())
      or exists(select 1 from public.role_foundations newer where newer.role_family=v_current.role_family and coalesce(newer.canonical_role,'')=coalesce(v_current.canonical_role,'') and newer.status='active' and newer.id<>v_current.id and newer.last_verified_at>v_current.last_verified_at);
  end if;
  update public.agents set foundation_update_available=v_update where id=target_agent_id;
  return v_update;
end;
$$;
revoke all on function public.refresh_agent_foundation_update_status(uuid) from public,anon;
grant execute on function public.refresh_agent_foundation_update_status(uuid) to authenticated;

commit;
