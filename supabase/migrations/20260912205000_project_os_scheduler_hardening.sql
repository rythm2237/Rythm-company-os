-- Project OS scheduler hardening: fail closed on missing dependencies and prevent agent over-allocation.

create or replace function public.enforce_project_agent_capacity_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare used integer;
begin
  select coalesce(sum(pac.allocation_percent),0)::integer into used
  from public.project_agent_capacity pac
  join public.projects p on p.id=pac.project_id
  where pac.agent_id=new.agent_id
    and pac.project_id<>new.project_id
    and p.status in('idea','planning','active','blocked','on_hold');
  new.allocation_percent:=greatest(0,least(new.allocation_percent,100-used));
  return new;
end $$;
revoke all on function public.enforce_project_agent_capacity_v1() from public,anon,authenticated;
drop trigger if exists trg_enforce_project_agent_capacity on public.project_agent_capacity;
create trigger trg_enforce_project_agent_capacity before insert or update of allocation_percent,agent_id,project_id
on public.project_agent_capacity for each row execute function public.enforce_project_agent_capacity_v1();

create or replace function public.claim_project_task_runs_v1(worker_id text, claim_limit integer default 8, lease_seconds integer default 240)
returns setof public.project_task_runs
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(worker_id,'')='' then raise exception 'worker_id required'; end if;
  return query
  with candidates as (
    select tr.id
    from public.project_task_runs tr
    join public.project_executions pe on pe.id=tr.execution_id and pe.status in('queued','running')
    join public.projects p on p.id=tr.project_id and p.status='active'
    where tr.status in('queued','retrying')
      and (tr.next_attempt_at is null or tr.next_attempt_at<=now())
      and (tr.lease_expires_at is null or tr.lease_expires_at<now())
      -- Every declared dependency must exist in this execution and be complete.
      and not exists(
        select 1 from jsonb_array_elements_text(tr.dependencies) d(task_key)
        where not exists(
          select 1 from public.project_task_runs dep
          where dep.execution_id=tr.execution_id and dep.task_key=d.task_key and dep.status='completed'
        )
      )
      -- An assigned agent with no project capacity stays queued. Unassigned internal tasks may run.
      and (tr.assigned_agent_id is null or exists(
        select 1 from public.project_agent_capacity pac
        where pac.project_id=tr.project_id and pac.agent_id=tr.assigned_agent_id and pac.allocation_percent>0
      ))
    order by tr.priority asc, coalesce(pe.last_heartbeat_at,pe.created_at) asc, tr.created_at asc
    for update of tr skip locked
    limit greatest(1,least(claim_limit,32))
  )
  update public.project_task_runs tr
  set status='running',lease_owner=worker_id,lease_expires_at=now()+make_interval(secs=>greatest(30,lease_seconds)),attempt_count=attempt_count+1,started_at=coalesce(started_at,now()),updated_at=now()
  from candidates c where tr.id=c.id
  returning tr.*;
end $$;
revoke all on function public.claim_project_task_runs_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_project_task_runs_v1(text,integer,integer) to service_role;

-- Detect stalled executions and overdue approvals without making the health event stream noisy.
create or replace function public.refresh_project_execution_health_v1()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare created_count integer:=0; n integer;
begin
  insert into public.project_health_events(organization_id,project_id,execution_id,health_type,severity,status,summary,details)
  select pe.organization_id,pe.project_id,pe.id,'stalled_execution','critical','open','Project execution heartbeat is stale.',jsonb_build_object('last_heartbeat_at',pe.last_heartbeat_at)
  from public.project_executions pe
  where pe.status='running' and coalesce(pe.last_heartbeat_at,pe.updated_at)<now()-interval '20 minutes'
    and not exists(select 1 from public.project_health_events h where h.execution_id=pe.id and h.health_type='stalled_execution' and h.status='open');
  get diagnostics n=row_count;created_count:=created_count+n;

  insert into public.project_health_events(organization_id,project_id,execution_id,health_type,severity,status,summary,details)
  select tr.organization_id,tr.project_id,tr.execution_id,'overdue_approval','warning','open','A project task has been waiting for executive approval for more than 24 hours.',jsonb_build_object('task_run_id',tr.id,'approval_request_id',tr.waiting_on_approval_id)
  from public.project_task_runs tr
  where tr.status='waiting_for_approval' and tr.updated_at<now()-interval '24 hours'
    and not exists(select 1 from public.project_health_events h where h.execution_id=tr.execution_id and h.health_type='overdue_approval' and h.status='open' and h.details->>'task_run_id'=tr.id::text);
  get diagnostics n=row_count;created_count:=created_count+n;
  return created_count;
end $$;
revoke all on function public.refresh_project_execution_health_v1() from public,anon,authenticated;
grant execute on function public.refresh_project_execution_health_v1() to service_role;
