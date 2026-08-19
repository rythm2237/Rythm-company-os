begin;

alter table public.agents add column if not exists company_knowledge_connected boolean not null default true;
alter table public.agents add column if not exists company_knowledge_detached_at timestamptz;

create or replace function public.sanitize_agent_for_transfer(target_agent_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_org uuid; v_memories_removed integer:=0; v_attachments_removed integer:=0; v_artifacts_removed integer:=0; v_foundation_id uuid; v_specializations integer:=0;
begin
  select organization_id into v_org from public.agents where id=target_agent_id;
  if v_org is null or not public.is_org_owner(v_org) then raise exception 'not_authorized'; end if;

  delete from public.agent_memories where agent_id=target_agent_id and (learning_scope='company_specific_memory' or transferable=false or source_company_id is not null);
  get diagnostics v_memories_removed=row_count;
  delete from public.agent_attachments where agent_id=target_agent_id and (transferable=false or source_company_id is not null);
  get diagnostics v_attachments_removed=row_count;
  delete from public.agent_artifacts where agent_id=target_agent_id and (transferable=false or source_company_id is not null);
  get diagnostics v_artifacts_removed=row_count;

  update public.agent_memories set source_company_id=null,confidentiality_level='public',transferable=true
    where agent_id=target_agent_id and learning_scope='transferable_general_learning' and transferable=true;
  update public.agents set company_knowledge_connected=false,company_knowledge_detached_at=now(),updated_at=now() where id=target_agent_id and organization_id=v_org;

  select role_foundation_id into v_foundation_id from public.agent_role_foundation_bindings where agent_id=target_agent_id and status='active' limit 1;
  select count(*) into v_specializations from public.agent_specialization_bindings where agent_id=target_agent_id and status='active';
  insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(v_org,'user',auth.uid(),'agent_knowledge.transfer_sanitized','agent',target_agent_id::text,'high',jsonb_build_object('memories_removed',v_memories_removed,'attachments_removed',v_attachments_removed,'artifacts_removed',v_artifacts_removed,'foundation_retained',v_foundation_id is not null,'specializations_retained',v_specializations,'company_knowledge_connected',false));
  return jsonb_build_object('memories_removed',v_memories_removed,'attachments_removed',v_attachments_removed,'artifacts_removed',v_artifacts_removed,'role_foundation_id',v_foundation_id,'specializations_retained',v_specializations,'company_knowledge_detached',true);
end; $$;

create or replace function public.reconnect_agent_company_knowledge_v1(target_agent_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.agents where id=target_agent_id;
  if v_org is null or not public.is_org_owner(v_org) then raise exception 'not_authorized'; end if;
  update public.agents set company_knowledge_connected=true,company_knowledge_detached_at=null,updated_at=now() where id=target_agent_id and organization_id=v_org;
  insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(v_org,'user',auth.uid(),'agent_knowledge.company_knowledge_reconnected','agent',target_agent_id::text,'medium',jsonb_build_object('mode','live_role_filtered'));
end; $$;
revoke all on function public.reconnect_agent_company_knowledge_v1(uuid) from public,anon;
grant execute on function public.reconnect_agent_company_knowledge_v1(uuid) to authenticated;

commit;
