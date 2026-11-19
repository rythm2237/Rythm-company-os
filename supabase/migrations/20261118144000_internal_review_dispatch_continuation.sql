-- A completion blocker reported by an agent must not deadlock already authorized
-- internal work that can resolve it. Explicit pause, governance HOLD and non-agent
-- blockers still stop dispatch. This grants no external execution authority.
create or replace function public.project_internal_work_authorized_v1(p_project_id uuid,p_organization_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists (
  select 1 from public.projects p where p.id=p_project_id and p.organization_id=p_organization_id
   and (p.status='active' or (
    p.status='blocked' and p.lifecycle_state='BLOCKED' and p.blocker_type is null
    and exists (select 1 from public.project_completion_criteria c where c.project_id=p.id and c.organization_id=p.organization_id and c.required and c.state='blocked' and c.metadata->>'blocker_type'='agent_reported')
    and not exists (select 1 from public.project_completion_criteria c where c.project_id=p.id and c.organization_id=p.organization_id and c.required and c.state in ('blocked','failed') and coalesce(c.metadata->>'blocker_type','')<>'agent_reported')
   ))
 );
$$;
revoke all on function public.project_internal_work_authorized_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_internal_work_authorized_v1(uuid,uuid) to service_role;

create or replace function public.claim_project_task_runs_v1(worker_id text, claim_limit integer default 8, lease_seconds integer default 240)
returns setof public.project_task_runs
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(worker_id,'')='' then raise exception 'worker_id required'; end if;
  return query
  with candidates as (
    select tr.id
    from public.project_task_runs tr
    join public.project_executions pe on pe.id=tr.execution_id and pe.organization_id=tr.organization_id and pe.project_id=tr.project_id and pe.status in('queued','running')
    join public.projects p on p.id=tr.project_id and p.organization_id=tr.organization_id and public.project_internal_work_authorized_v1(p.id,p.organization_id)
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

create or replace function public.claim_project_autonomous_meeting_jobs_v1(worker_id text, claim_limit integer default 2, lease_seconds integer default 240)
returns setof public.project_autonomous_meeting_jobs language plpgsql security definer set search_path='' as $$
begin
  if coalesce(worker_id,'')='' then raise exception 'worker_id required'; end if;
  return query
  with candidates as(
    select j.id from public.project_autonomous_meeting_jobs j
    join public.projects p on p.id=j.project_id and p.organization_id=j.organization_id and public.project_internal_work_authorized_v1(p.id,p.organization_id)
    join public.meetings m on m.id=j.meeting_id and m.organization_id=j.organization_id and m.project_id=j.project_id and m.involvement_mode='AUTONOMOUS'
    where j.status in('queued','retrying') and (j.next_attempt_at is null or j.next_attempt_at<=now()) and (j.lease_expires_at is null or j.lease_expires_at<now())
    order by p.priority asc,j.created_at asc for update of j skip locked limit greatest(1,least(claim_limit,5))
  )
  update public.project_autonomous_meeting_jobs j set status='running',attempt_count=attempt_count+1,lease_owner=worker_id,lease_expires_at=now()+make_interval(secs=>greatest(60,lease_seconds)),updated_at=now()
  from candidates c where j.id=c.id returning j.*;
end $$;
revoke all on function public.claim_project_autonomous_meeting_jobs_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_project_autonomous_meeting_jobs_v1(text,integer,integer) to service_role;
