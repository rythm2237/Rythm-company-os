-- Resolve the linked task and action in the same transaction as the approval.
-- The API must update the approval only; this trigger owns the state transition.
create or replace function public.resume_project_tasks_after_approval_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_execution_id uuid;
  v_affected integer := 0;
  v_task record;
begin
  if old.status is not distinct from new.status or new.subject_type <> 'project_task' then
    return new;
  end if;

  select tr.execution_id into v_execution_id
  from public.project_task_runs tr
  where tr.waiting_on_approval_id = new.id and tr.status = 'waiting_for_approval'
  order by tr.created_at
  limit 1;

  if new.status = 'approved' then
    for v_task in
      update public.project_task_runs tr
      set status = 'queued', waiting_on_approval_id = null,
          next_attempt_at = now(), error_class = null, error_message = null, updated_at = now()
      where tr.waiting_on_approval_id = new.id and tr.status = 'waiting_for_approval'
      returning tr.action_item_id
    loop
      v_affected := v_affected + 1;
      if v_task.action_item_id is not null then
        update public.action_items ai set status = 'open'
        where ai.id = v_task.action_item_id and ai.organization_id = new.organization_id;
      end if;
    end loop;
  elsif new.status = 'rejected' then
    for v_task in
      update public.project_task_runs tr
      set status = 'blocked', error_class = 'approval_rejected',
          error_message = coalesce(nullif(new.response_note, ''), 'Required approval was rejected. Manager recovery/re-planning is required.'),
          next_attempt_at = null, updated_at = now()
      where tr.waiting_on_approval_id = new.id and tr.status = 'waiting_for_approval'
      returning tr.action_item_id
    loop
      v_affected := v_affected + 1;
      if v_task.action_item_id is not null then
        update public.action_items ai set status = 'blocked'
        where ai.id = v_task.action_item_id and ai.organization_id = new.organization_id;
      end if;
    end loop;
  end if;

  if v_affected > 0 and new.status in ('approved', 'rejected') then
    update public.approval_requests
    set consumed_at = coalesce(consumed_at, new.resolved_at, now()),
        consumed_by_execution_id = coalesce(consumed_by_execution_id, v_execution_id)
    where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.resume_project_tasks_after_approval_v1() from public, anon, authenticated;
grant execute on function public.resume_project_tasks_after_approval_v1() to service_role;
