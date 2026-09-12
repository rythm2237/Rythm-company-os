-- Terminal-state reconciliation for durable Project OS executions.
-- Cancelled work is terminal and must not keep an otherwise-finished execution alive.
-- Failed/blocked/waiting/retrying work remains non-terminal and continues to require handling.

create or replace function public.reconcile_project_execution_terminal_states_v1()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  reconciled integer := 0;
  execution_row record;
  total_count integer;
  terminal_count integer;
begin
  for execution_row in
    select e.id,e.organization_id,e.project_id
    from public.project_executions e
    where e.status in('queued','running')
    for update skip locked
  loop
    select count(*),count(*) filter(where status in('completed','cancelled'))
      into total_count,terminal_count
    from public.project_task_runs
    where execution_id=execution_row.id;

    if total_count>0 and total_count=terminal_count then
      update public.project_executions
      set status='completed',completed_at=coalesce(completed_at,now()),last_heartbeat_at=now(),updated_at=now()
      where id=execution_row.id and status in('queued','running');

      update public.projects
      set status='completed',stage='outcome_review',progress_percent=100,last_heartbeat_at=now(),updated_at=now()
      where id=execution_row.project_id and organization_id=execution_row.organization_id;

      if not exists(
        select 1 from public.project_activity_events
        where execution_id=execution_row.id and event_type='project.execution.completed'
      ) then
        insert into public.project_activity_events(
          organization_id,project_id,execution_id,event_type,headline,detail,importance,metadata
        ) values(
          execution_row.organization_id,execution_row.project_id,execution_row.id,
          'project.execution.completed','Project execution completed',
          'All project work reached a terminal state.','major',
          jsonb_build_object('terminal_states',jsonb_build_array('completed','cancelled'))
        );
      end if;
      reconciled := reconciled + 1;
    end if;
  end loop;
  return reconciled;
end $$;

revoke all on function public.reconcile_project_execution_terminal_states_v1() from public,anon,authenticated;
grant execute on function public.reconcile_project_execution_terminal_states_v1() to service_role;

comment on function public.reconcile_project_execution_terminal_states_v1() is 'Service-only reconciliation that completes Project OS executions when every task is completed or cancelled.';