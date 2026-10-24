-- Enforce real concurrency at the canonical lease boundary, including legacy project tasks.
begin;
create or replace function public.enforce_project_agent_capacity_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_used integer;
begin
 -- All capacity writers serialize on the same agent row as the assignment reservation RPC.
 perform 1 from public.agents a where a.id=new.agent_id and a.organization_id=new.organization_id for update;
 if not found or not exists(select 1 from public.projects p where p.id=new.project_id and p.organization_id=new.organization_id) then raise exception 'Capacity records must remain in the same organization'; end if;
 select coalesce(sum(c.allocation_percent),0)::integer into v_used
 from public.project_agent_capacity c join public.projects p on p.id=c.project_id and p.organization_id=c.organization_id
 where c.agent_id=new.agent_id and c.organization_id=new.organization_id and c.project_id<>new.project_id and p.status not in ('completed','cancelled','archived');
 if new.allocation_percent>greatest(0,100-v_used) then raise exception 'Agent capacity exceeded; no allocation was changed'; end if;
 return new;
end; $$;
revoke all on function public.enforce_project_agent_capacity_v1() from public,anon,authenticated;

create or replace function public.claim_project_task_runs_v1(worker_id text,claim_limit integer default 8,lease_seconds integer default 240)
returns setof public.project_task_runs language plpgsql security invoker set search_path='' as $$
declare v_candidate record; v_task public.project_task_runs%rowtype; v_agent public.agents%rowtype;
 v_running integer; v_max integer; v_claimed integer:=0; v_limit integer:=greatest(1,least(coalesce(claim_limit,8),32));
begin
 if btrim(coalesce(worker_id,''))='' then raise exception 'worker_id required'; end if;
 for v_candidate in
  select tr.id,tr.assigned_agent_id,tr.project_id,tr.organization_id
  from public.project_task_runs tr
  join public.project_executions pe on pe.id=tr.execution_id and pe.organization_id=tr.organization_id and pe.status in ('queued','running')
  join public.projects p on p.id=tr.project_id and p.organization_id=tr.organization_id and p.status='active'
  where tr.status in ('queued','retrying')
   and (tr.next_attempt_at is null or tr.next_attempt_at<=now())
   and (tr.lease_expires_at is null or tr.lease_expires_at<now())
   and not exists(select 1 from jsonb_array_elements_text(tr.dependencies) d(task_key)
    where not exists(select 1 from public.project_task_runs dep where dep.execution_id=tr.execution_id and dep.organization_id=tr.organization_id and dep.task_key=d.task_key and dep.status='completed'))
   and (tr.assigned_agent_id is null or exists(select 1 from public.project_agent_capacity c where c.organization_id=tr.organization_id and c.project_id=tr.project_id and c.agent_id=tr.assigned_agent_id and c.allocation_percent>0))
  order by tr.priority asc,coalesce(pe.last_heartbeat_at,pe.created_at) asc,tr.created_at asc,tr.id asc
  for update of tr skip locked limit greatest(32,v_limit*8)
 loop
  exit when v_claimed>=v_limit;
  if v_candidate.assigned_agent_id is not null then
   -- Lock the agent, not only this task. Two workers cannot lease independent tasks
   -- for the same last available slot. SKIP LOCKED keeps other agents progressing.
   select * into v_agent from public.agents a where a.id=v_candidate.assigned_agent_id and a.organization_id=v_candidate.organization_id for update skip locked;
   if not found then continue; end if;
   if not v_agent.enabled or v_agent.agent_status<>'enabled' or coalesce(v_agent.provisioning_status,'ready')<>'ready' then continue; end if;
   v_max:=1;
   if v_agent.execution_capabilities->>'max_concurrent_tasks' ~ '^[1-9][0-9]*$' then v_max:=least(32,(v_agent.execution_capabilities->>'max_concurrent_tasks')::numeric)::integer; end if;
   select count(*) into v_running from public.project_task_runs running
   where running.organization_id=v_candidate.organization_id and running.assigned_agent_id=v_candidate.assigned_agent_id and running.status='running';
   if v_running>=v_max then continue; end if;
  end if;
  update public.project_task_runs tr set status='running',lease_owner=worker_id,
   lease_expires_at=now()+make_interval(secs=>greatest(30,coalesce(lease_seconds,240))),attempt_count=attempt_count+1,
   started_at=coalesce(started_at,now()),updated_at=now()
  where tr.id=v_candidate.id returning tr.* into v_task;
  v_claimed:=v_claimed+1;
  return next v_task;
 end loop;
 return;
end; $$;
revoke all on function public.claim_project_task_runs_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_project_task_runs_v1(text,integer,integer) to service_role;
create index if not exists project_task_runs_agent_running_idx on public.project_task_runs(organization_id,assigned_agent_id,status) where status in ('running','queued','retrying');
commit;
