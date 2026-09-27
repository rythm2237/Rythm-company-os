-- A future-dated retry is active autonomous recovery, not an execution deadlock.
-- Keep stalled-progress visibility, but do not misclassify scheduled supervisor backoff
-- as a project with no continuation path.

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

  -- Normalize legacy heartbeat-based wording when the execution is still meaningfully stalled.
  update public.project_health_events h
  set summary='Project execution has made no meaningful task progress for more than 20 minutes.',
      details=coalesce(h.details,'{}'::jsonb)||jsonb_build_object(
        'last_progress_at',pe.last_progress_at,
        'worker_heartbeat_at',pe.last_heartbeat_at
      )
  from public.project_executions pe
  where h.execution_id=pe.id
    and h.health_type='stalled_execution'
    and h.status='open'
    and pe.status='running'
    and coalesce(pe.last_progress_at,pe.started_at,pe.created_at)<now()-interval '20 minutes';

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

  -- Deadlock means there is no active/waiting work, no future retry, and no runnable due task.
  insert into public.project_health_events(organization_id,project_id,execution_id,health_type,severity,status,summary,details)
  select pe.organization_id,pe.project_id,pe.id,'deadlocked_execution','critical','open',
         'Project execution has unfinished work but no runnable or scheduled recovery branch.',
         jsonb_build_object('last_progress_at',pe.last_progress_at)
  from public.project_executions pe
  where pe.status='running'
    and exists(select 1 from public.project_task_runs x where x.execution_id=pe.id and x.status not in('completed','cancelled'))
    and not exists(select 1 from public.project_task_runs x where x.execution_id=pe.id and x.status in('running','waiting_for_approval','waiting_for_connection','waiting_for_data'))
    and not exists(
      select 1 from public.project_task_runs x
      where x.execution_id=pe.id
        and x.status='retrying'
        and x.next_attempt_at>now()
    )
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
      or exists(select 1 from public.project_task_runs x where x.execution_id=pe.id and x.status in('running','waiting_for_approval','waiting_for_connection','waiting_for_data'))
      or exists(
        select 1 from public.project_task_runs x
        where x.execution_id=pe.id
          and x.status='retrying'
          and x.next_attempt_at>now()
      )
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
