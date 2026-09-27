-- Autonomous project recovery hardening.
-- Keeps project execution durable after retry exhaustion, makes roadmap phases follow
-- real execution state, separates worker heartbeat from meaningful project progress,
-- and closes approval audit records when project work actually consumes a decision.

alter table public.project_executions
  add column if not exists last_progress_at timestamptz;

update public.project_executions pe
set last_progress_at = coalesce(
  (
    select max(coalesce(tr.completed_at,tr.updated_at,tr.started_at,tr.created_at))
    from public.project_task_runs tr
    where tr.execution_id=pe.id
  ),
  pe.started_at,
  pe.created_at
)
where pe.last_progress_at is null;

create or replace function public.refresh_project_roadmap_phase_status_v1(p_phase_id uuid)
returns text
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_status text;
  v_current text;
  v_active integer:=0;
  v_completed integer:=0;
  v_started integer:=0;
  v_blocked integer:=0;
begin
  if p_phase_id is null then return null; end if;

  select status into v_current
  from public.project_roadmap_phases
  where id=p_phase_id;
  if not found then return null; end if;

  select
    count(*) filter(where status<>'cancelled'),
    count(*) filter(where status='completed'),
    count(*) filter(where status in('running','retrying','completed','failed','blocked','waiting_for_approval','waiting_for_connection','waiting_for_data')),
    count(*) filter(where status in('failed','blocked'))
  into v_active,v_completed,v_started,v_blocked
  from public.project_task_runs
  where roadmap_phase_id=p_phase_id;

  v_status := case
    when v_active>0 and v_completed=v_active then 'completed'
    when v_active=0 then case when v_current='completed' then 'completed' else 'not_started' end
    when v_blocked>0 and not exists(
      select 1 from public.project_task_runs
      where roadmap_phase_id=p_phase_id
        and status in('running','retrying','queued','waiting_for_approval','waiting_for_connection','waiting_for_data')
    ) then 'blocked'
    when v_current='monitoring' then 'monitoring'
    when v_started>0 then 'in_progress'
    else 'not_started'
  end;

  update public.project_roadmap_phases
  set status=v_status,updated_at=now()
  where id=p_phase_id and status is distinct from v_status;

  return v_status;
end;
$$;

revoke all on function public.refresh_project_roadmap_phase_status_v1(uuid) from public,anon,authenticated;
grant execute on function public.refresh_project_roadmap_phase_status_v1(uuid) to service_role;

create or replace function public.sync_project_progress_percent_v1()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_project_id uuid:=coalesce(new.project_id,old.project_id);
  v_execution_id uuid:=coalesce(new.execution_id,old.execution_id);
  v_phase_id uuid:=coalesce(new.roadmap_phase_id,old.roadmap_phase_id);
begin
  if v_phase_id is not null then
    perform public.refresh_project_roadmap_phase_status_v1(v_phase_id);
  end if;

  perform public.refresh_project_progress_percent_v1(v_project_id);

  if v_execution_id is not null and (
    tg_op in('INSERT','DELETE') or old.status is distinct from new.status
  ) then
    update public.project_executions
    set last_progress_at=now(),updated_at=now()
    where id=v_execution_id;
  end if;

  return coalesce(new,old);
end;
$$;

revoke all on function public.sync_project_progress_percent_v1() from public,anon,authenticated;
grant execute on function public.sync_project_progress_percent_v1() to service_role;

create or replace function public.resume_project_tasks_after_approval_v1()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_execution_id uuid;
  v_affected integer:=0;
begin
  if old.status is not distinct from new.status then return new; end if;

  select execution_id into v_execution_id
  from public.project_task_runs
  where waiting_on_approval_id=new.id
  order by created_at
  limit 1;

  if new.status='approved' then
    update public.project_task_runs
    set status='queued',waiting_on_approval_id=null,next_attempt_at=now(),error_class=null,error_message=null,updated_at=now()
    where waiting_on_approval_id=new.id and status='waiting_for_approval';
    get diagnostics v_affected=row_count;
  elsif new.status='rejected' then
    update public.project_task_runs
    set status='blocked',error_class='approval_rejected',error_message='Required approval was rejected. Manager recovery/re-planning is required.',updated_at=now()
    where waiting_on_approval_id=new.id and status='waiting_for_approval';
    get diagnostics v_affected=row_count;
  end if;

  if v_affected>0 and new.status in('approved','rejected') then
    update public.approval_requests
    set consumed_at=coalesce(consumed_at,coalesce(new.resolved_at,now())),
        consumed_by_execution_id=coalesce(consumed_by_execution_id,v_execution_id)
    where id=new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.resume_project_tasks_after_approval_v1() from public,anon,authenticated;
grant execute on function public.resume_project_tasks_after_approval_v1() to service_role;

-- Backfill only approvals that can be tied to an actual execution. A resolved decision
-- without execution evidence must remain unconsumed for audit integrity.
with approval_consumption as (
  select
    ar.id,
    coalesce(
      (
        select tr.execution_id
        from public.project_task_runs tr
        where tr.organization_id=ar.organization_id
          and tr.project_id=ar.project_id
          and (tr.waiting_on_approval_id=ar.id or tr.action_item_id=ar.subject_id)
        order by tr.created_at
        limit 1
      ),
      (
        select pp.source_execution_id
        from public.project_proposals pp
        where ar.subject_type='project_proposal'
          and pp.id=ar.subject_id
        limit 1
      )
    ) as execution_id
  from public.approval_requests ar
  where ar.project_id is not null
    and ar.status in('approved','rejected')
    and ar.consumed_at is null
)
update public.approval_requests ar
set consumed_at=coalesce(ar.consumed_at,ar.resolved_at,now()),
    consumed_by_execution_id=coalesce(ar.consumed_by_execution_id,m.execution_id)
from approval_consumption m
where ar.id=m.id
  and m.execution_id is not null;

create or replace function public.refresh_project_execution_health_v1()
returns integer
language plpgsql
security definer
set search_path='public'
as $$
declare
  created_count integer:=0;
  n integer:=0;
begin
  -- Resolve stale health records after execution resumes or finishes.
  update public.project_health_events h
  set status='resolved',resolved_at=now()
  from public.project_executions pe
  where h.execution_id=pe.id
    and h.health_type='stalled_execution'
    and h.status='open'
    and (
      pe.status<>'running'
      or coalesce(pe.last_progress_at,pe.started_at,pe.created_at)>=now()-interval '20 minutes'
    );

  update public.project_health_events h
  set status='resolved',resolved_at=now()
  where h.health_type='overdue_approval'
    and h.status='open'
    and not exists(
      select 1
      from public.project_task_runs tr
      join public.approval_requests ar on ar.id=tr.waiting_on_approval_id
      where tr.id=(h.details->>'task_run_id')::uuid
        and tr.status='waiting_for_approval'
        and ar.status='pending'
    );

  -- Meaningful progress heartbeat is separate from the scheduler/worker heartbeat.
  insert into public.project_health_events(organization_id,project_id,execution_id,health_type,severity,status,summary,details)
  select pe.organization_id,pe.project_id,pe.id,'stalled_execution','critical','open',
         'Project execution has made no meaningful task progress for more than 20 minutes.',
         jsonb_build_object('last_progress_at',pe.last_progress_at,'worker_heartbeat_at',pe.last_heartbeat_at)
  from public.project_executions pe
  where pe.status='running'
    and coalesce(pe.last_progress_at,pe.started_at,pe.created_at)<now()-interval '20 minutes'
    and exists(select 1 from public.project_task_runs tr where tr.execution_id=pe.id and tr.status not in('completed','cancelled'))
    and not exists(select 1 from public.project_health_events h where h.execution_id=pe.id and h.health_type='stalled_execution' and h.status='open');
  get diagnostics n=row_count; created_count:=created_count+n;

  -- Explicitly surface retry exhaustion; the autonomous supervisor will recover it when safe.
  insert into public.project_health_events(organization_id,project_id,execution_id,health_type,severity,status,summary,details)
  select tr.organization_id,tr.project_id,tr.execution_id,'retry_exhausted','warning','open',
         'A project task exhausted its worker retries and requires autonomous recovery.',
         jsonb_build_object('task_run_id',tr.id,'task_key',tr.task_key,'error_class',tr.error_class,'error_message',tr.error_message)
  from public.project_task_runs tr
  where tr.status='failed'
    and not exists(
      select 1 from public.project_health_events h
      where h.execution_id=tr.execution_id and h.health_type='retry_exhausted' and h.status='open'
        and h.details->>'task_run_id'=tr.id::text
    );
  get diagnostics n=row_count; created_count:=created_count+n;

  -- A running execution with unfinished work but no runnable branch is a deadlock, not healthy "running" work.
  insert into public.project_health_events(organization_id,project_id,execution_id,health_type,severity,status,summary,details)
  select pe.organization_id,pe.project_id,pe.id,'deadlocked_execution','critical','open',
         'Project execution has unfinished work but no runnable task branch.',
         jsonb_build_object('last_progress_at',pe.last_progress_at)
  from public.project_executions pe
  where pe.status='running'
    and exists(select 1 from public.project_task_runs x where x.execution_id=pe.id and x.status not in('completed','cancelled'))
    and not exists(select 1 from public.project_task_runs x where x.execution_id=pe.id and x.status in('running','waiting_for_approval','waiting_for_connection','waiting_for_data'))
    and not exists(
      select 1
      from public.project_task_runs tr
      where tr.execution_id=pe.id
        and tr.status in('queued','retrying')
        and (tr.next_attempt_at is null or tr.next_attempt_at<=now())
        and not exists(
          select 1 from jsonb_array_elements_text(coalesce(tr.dependencies,'[]'::jsonb)) d(task_key)
          where not exists(
            select 1 from public.project_task_runs dep
            where dep.execution_id=tr.execution_id and dep.task_key=d.task_key and dep.status='completed'
          )
        )
    )
    and not exists(select 1 from public.project_health_events h where h.execution_id=pe.id and h.health_type='deadlocked_execution' and h.status='open');
  get diagnostics n=row_count; created_count:=created_count+n;

  update public.project_health_events h
  set status='resolved',resolved_at=now()
  from public.project_executions pe
  where h.execution_id=pe.id
    and h.health_type='deadlocked_execution'
    and h.status='open'
    and (
      pe.status<>'running'
      or exists(select 1 from public.project_task_runs x where x.execution_id=pe.id and x.status='running')
      or exists(
        select 1
        from public.project_task_runs tr
        where tr.execution_id=pe.id
          and tr.status in('queued','retrying')
          and (tr.next_attempt_at is null or tr.next_attempt_at<=now())
          and not exists(
            select 1 from jsonb_array_elements_text(coalesce(tr.dependencies,'[]'::jsonb)) d(task_key)
            where not exists(
              select 1 from public.project_task_runs dep
              where dep.execution_id=tr.execution_id and dep.task_key=d.task_key and dep.status='completed'
            )
          )
      )
    );

  insert into public.project_health_events(organization_id,project_id,execution_id,health_type,severity,status,summary,details)
  select tr.organization_id,tr.project_id,tr.execution_id,'overdue_approval','warning','open',
         'A project task has been waiting for executive approval for more than 24 hours.',
         jsonb_build_object('task_run_id',tr.id,'approval_request_id',tr.waiting_on_approval_id)
  from public.project_task_runs tr
  join public.approval_requests ar on ar.id=tr.waiting_on_approval_id and ar.status='pending'
  where tr.status='waiting_for_approval' and tr.updated_at<now()-interval '24 hours'
    and not exists(select 1 from public.project_health_events h where h.execution_id=tr.execution_id and h.health_type='overdue_approval' and h.status='open' and h.details->>'task_run_id'=tr.id::text);
  get diagnostics n=row_count; created_count:=created_count+n;

  return created_count;
end;
$$;

revoke all on function public.refresh_project_execution_health_v1() from public,anon,authenticated;
grant execute on function public.refresh_project_execution_health_v1() to service_role;

-- Bring existing roadmap phase states in line with already-completed task evidence.
do $$
declare r record;
begin
  for r in select id from public.project_roadmap_phases loop
    perform public.refresh_project_roadmap_phase_status_v1(r.id);
  end loop;
end $$;

-- Refresh cached weighted progress after phase/status reconciliation.
do $$
declare r record;
begin
  for r in select id from public.projects loop
    perform public.refresh_project_progress_percent_v1(r.id);
  end loop;
end $$;
