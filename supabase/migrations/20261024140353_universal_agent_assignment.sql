-- Additive atomic assignment primitive. Existing project agents, capacity and event history remain authoritative.
begin;
create unique index if not exists project_one_active_ai_lead on public.project_agents(project_id) where assignment_role='AI Project Lead' and status in ('assigned','active');
create or replace function public.reserve_project_agent_assignment_v1(
 p_organization_id uuid,p_project_id uuid,p_agent_id uuid,p_actor_user_id uuid,
 p_allocation_percent integer,p_role text,p_decision jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_agent public.agents%rowtype; v_project public.projects%rowtype; v_used integer; v_running integer;
 v_queued integer; v_max_concurrent integer:=1; v_max_queued integer:=20; v_event uuid; v_existing uuid;
begin
 if p_allocation_percent not between 1 and 100 or p_role not in ('lead','specialist') then raise exception 'Invalid assignment scope'; end if;
 -- Project lock serializes lead replacement; agent lock serializes cross-project capacity reservations.
 select * into v_project from public.projects where id=p_project_id and organization_id=p_organization_id for update;
 if not found then raise exception 'Project not found'; end if;
 if v_project.status in ('completed','cancelled','archived') then return jsonb_build_object('ok',false,'reason','Closed projects cannot accept new assignments.'); end if;
 if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_actor_user_id and role='owner' and membership_status='active') then raise exception 'Active company owner required'; end if;
 select * into v_agent from public.agents where id=p_agent_id and organization_id=p_organization_id for update;
 if not found then raise exception 'Agent not found'; end if;
 if not v_agent.enabled or v_agent.agent_status<>'enabled' or coalesce(v_agent.provisioning_status,'ready')<>'ready' then
  return jsonb_build_object('ok',false,'reason','Agent is unavailable or not provisioned.'); end if;
 if v_agent.permissions->'project_execution'='false'::jsonb or v_agent.execution_capabilities->'project_coordination'='false'::jsonb then
  return jsonb_build_object('ok',false,'reason','Agent coordination is not authorized.'); end if;
 -- The service calculates capability fit from structured skills. Reject stale profile decisions and missing evidence.
 if coalesce((p_decision->'scores'->>'skill')::numeric,0)<=0 or jsonb_array_length(coalesce(p_decision->'requirements'->'skills','[]'))=0
    or p_decision->'evidence'->>'profileUpdatedAt' is null
    or (p_decision->'evidence'->>'profileUpdatedAt')::timestamptz is distinct from v_agent.updated_at then
  return jsonb_build_object('ok',false,'reason','Capability evidence is missing or changed; refresh assignment.'); end if;
 if v_agent.execution_capabilities->>'max_concurrent_tasks' ~ '^[1-9][0-9]*$' then v_max_concurrent:=least(32,(v_agent.execution_capabilities->>'max_concurrent_tasks')::numeric)::integer; end if;
 if v_agent.execution_capabilities->>'max_queued_tasks' ~ '^[1-9][0-9]*$' then v_max_queued:=least(1000,(v_agent.execution_capabilities->>'max_queued_tasks')::numeric)::integer; end if;
 select count(*) filter(where status='running'),count(*) filter(where status in ('queued','retrying')) into v_running,v_queued
 from public.project_task_runs where organization_id=p_organization_id and assigned_agent_id=p_agent_id and status in ('running','queued','retrying');
 select coalesce(sum(c.allocation_percent),0) into v_used from public.project_agent_capacity c
 join public.projects p on p.id=c.project_id and p.organization_id=c.organization_id
 where c.organization_id=p_organization_id and c.agent_id=p_agent_id and c.project_id<>p_project_id and p.status not in ('completed','cancelled','archived');
 if greatest(v_used,ceil(v_running::numeric/v_max_concurrent*100))+p_allocation_percent>100 or v_running>=v_max_concurrent or v_queued>=v_max_queued then
  return jsonb_build_object('ok',false,'reason','Agent capacity changed; refresh and choose an available specialist.'); end if;
 -- Retry is idempotent: the same agent/role with unchanged requirements produces no duplicate event.
 select e.id into v_existing from public.project_activity_events e
 join public.project_agents pa on pa.project_id=e.project_id and pa.agent_id=e.agent_id and pa.organization_id=e.organization_id
 join public.project_agent_capacity pc on pc.project_id=e.project_id and pc.agent_id=e.agent_id and pc.organization_id=e.organization_id
 where e.organization_id=p_organization_id and e.project_id=p_project_id and e.agent_id=p_agent_id and e.event_type='project.agent.assigned'
 and e.metadata->>'role'=p_role and e.metadata->'decision'->'requirements'=p_decision->'requirements'
 and pa.status in ('assigned','active') and (p_role<>'lead' or pa.assignment_role='AI Project Lead') and pc.allocation_percent=p_allocation_percent
 order by e.created_at desc,e.id desc limit 1;
 if v_existing is not null then return jsonb_build_object('ok',true,'event_id',v_existing,'reason','Existing assignment retained.'); end if;
 -- Never conflate the human accountable manager with an AI agent identity.
 if p_role='lead' then
  update public.project_agents set assignment_role='Project specialist' where organization_id=p_organization_id and project_id=p_project_id and assignment_role='AI Project Lead' and agent_id<>p_agent_id;
 end if;
 insert into public.project_agents(organization_id,project_id,agent_id,assignment_role,status,assigned_at,authority_scope)
 values(p_organization_id,p_project_id,p_agent_id,case when p_role='lead' then 'AI Project Lead' else 'Project specialist' end,'assigned',now(),jsonb_build_object('project_execution',true,'external_actions',false,'governed_execution_required',true,'assignment_algorithm','capability-capacity-v1'))
 on conflict(project_id,agent_id) do update set assignment_role=case when public.project_agents.assignment_role='AI Project Lead' and p_role='specialist' then 'AI Project Lead' else excluded.assignment_role end,status=case when public.project_agents.status='active' then 'active' else 'assigned' end,authority_scope=public.project_agents.authority_scope||excluded.authority_scope;
 insert into public.project_agent_capacity(organization_id,project_id,agent_id,allocation_percent,priority,updated_at)
 values(p_organization_id,p_project_id,p_agent_id,p_allocation_percent,v_project.priority,now())
 on conflict(project_id,agent_id) do update set allocation_percent=excluded.allocation_percent,updated_at=now();
 insert into public.project_activity_events(organization_id,project_id,agent_id,event_type,headline,detail,metadata)
 values(p_organization_id,p_project_id,p_agent_id,'project.agent.assigned',case when p_role='lead' then 'AI project lead assigned' else 'Project specialist assigned' end,p_decision->>'reason',jsonb_build_object('role',p_role,'actor_user_id',p_actor_user_id,'decision',p_decision)) returning id into v_event;
 return jsonb_build_object('ok',true,'event_id',v_event,'reason','Assignment reserved atomically.');
end; $$;
revoke all on function public.reserve_project_agent_assignment_v1(uuid,uuid,uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_project_agent_assignment_v1(uuid,uuid,uuid,uuid,integer,text,jsonb) to service_role;
commit;
