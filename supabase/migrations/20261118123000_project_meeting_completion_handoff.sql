-- A requested meeting may create a governed follow-up task. Keep its originating
-- execution active until the meeting resolves, so that handoff has a durable parent.
create or replace function public.reconcile_project_execution_terminal_states_v1() returns integer language plpgsql security definer set search_path='' as $$
declare reconciled integer:=0;execution_row record;total_count integer;terminal_count integer;
begin
 for execution_row in select e.id,e.organization_id,e.project_id from public.project_executions e where e.status in('queued','running') for update skip locked loop
  select count(*),count(*) filter(where status in('completed','cancelled')) into total_count,terminal_count from public.project_task_runs where execution_id=execution_row.id;
  if total_count>0 and total_count=terminal_count and not exists (
   select 1 from public.project_autonomous_meeting_jobs j
   join public.project_activity_events ev on ev.organization_id=j.organization_id
     and ev.project_id=j.project_id and ev.event_type='meeting.requested'
     and ev.metadata->>'meeting_id'=j.meeting_id::text
   where j.organization_id=execution_row.organization_id and j.project_id=execution_row.project_id
     and ev.execution_id=execution_row.id and j.status not in ('completed','cancelled')
  ) then
   update public.project_executions set status='completed',completed_at=coalesce(completed_at,now()),last_heartbeat_at=now(),updated_at=now() where id=execution_row.id and status in('queued','running');
   if not exists(select 1 from public.project_activity_events where execution_id=execution_row.id and event_type='project.execution.work_completed') then insert into public.project_activity_events(organization_id,project_id,execution_id,event_type,headline,detail,importance,metadata) values(execution_row.organization_id,execution_row.project_id,execution_row.id,'project.execution.work_completed','Project work execution completed','All assigned work in this execution reached a terminal work state. Project completion remains subject to deliverable, implementation, verification, outcome, acceptance and closeout gates.','major',jsonb_build_object('terminal_work_states',jsonb_build_array('completed','cancelled')));end if;
   perform public.evaluate_project_completion_v1(execution_row.project_id,'execution_work_completed','project_execution',execution_row.id);reconciled:=reconciled+1;
  end if;
 end loop;return reconciled;
end$$;
revoke all on function public.reconcile_project_execution_terminal_states_v1() from public,anon,authenticated;
grant execute on function public.reconcile_project_execution_terminal_states_v1() to service_role;
