-- Existing enabled specialists can be assigned by the active project tenant Owner.
-- The transaction preserves RLS and creates assignment, capacity and history together.
create or replace function public.assign_project_specialist_v1(
  p_project_id uuid, p_agent_id uuid, p_allocation_percent integer default 25
) returns uuid language plpgsql security invoker
set search_path=pg_catalog,pg_temp
as $$
declare v_org uuid; v_priority smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_allocation_percent is null or p_allocation_percent not between 1 and 100 then
    raise exception 'Allocation must be between 1 and 100' using errcode='22023';
  end if;
  select organization_id,priority into v_org,v_priority from public.projects where id=p_project_id;
  if v_org is null or not exists(select 1 from public.organization_members m
    where m.organization_id=v_org and m.user_id=auth.uid() and m.role='owner' and m.membership_status='active') then
    raise exception 'Project Owner authorization required' using errcode='42501';
  end if;
  if not public.has_active_organization_entitlement(v_org) then
    raise exception 'Active commercial entitlement required' using errcode='42501';
  end if;
  if not exists(select 1 from public.agents a where a.id=p_agent_id and a.organization_id=v_org
    and a.enabled and a.agent_status='enabled' and a.agent_code not in ('T-001','RYTHM-COMMS')) then
    raise exception 'Enabled project specialist required' using errcode='42501';
  end if;
  insert into public.project_agents(project_id,agent_id,organization_id,assignment_role,status,authority_scope,assigned_at)
  values(p_project_id,p_agent_id,v_org,'Manager-assigned specialist','assigned',
    jsonb_build_object('project_execution',true,'external_actions',false,'governed_execution_required',true,'source','human_owner_assignment'),now())
  on conflict(project_id,agent_id) do update set assignment_role=excluded.assignment_role,
    status=case when public.project_agents.status='active' then 'active' else 'assigned' end,
    authority_scope=excluded.authority_scope,assigned_at=excluded.assigned_at;
  insert into public.project_agent_capacity(organization_id,project_id,agent_id,allocation_percent,priority,updated_at)
  values(v_org,p_project_id,p_agent_id,p_allocation_percent,coalesce(v_priority,3),now())
  on conflict(project_id,agent_id) do update set allocation_percent=excluded.allocation_percent,
    priority=excluded.priority,updated_at=excluded.updated_at;
  insert into public.project_activity_events(organization_id,project_id,agent_id,event_type,headline,detail,metadata)
  values(v_org,p_project_id,p_agent_id,'project.specialist.assigned','Project specialist assigned',
    'The Human Owner assigned an enabled company specialist to this project.',
    jsonb_build_object('actor_user_id',auth.uid(),'allocation_percent',p_allocation_percent));
  return p_agent_id;
end;
$$;
grant select,insert,update on public.project_agents,public.project_agent_capacity to authenticated;
grant insert on public.project_activity_events to authenticated;
revoke all on function public.assign_project_specialist_v1(uuid,uuid,integer) from public,anon;
grant execute on function public.assign_project_specialist_v1(uuid,uuid,integer) to authenticated;
