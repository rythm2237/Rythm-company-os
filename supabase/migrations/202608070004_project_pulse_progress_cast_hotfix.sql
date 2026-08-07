-- Hotfix: ensure Project Pulse approval transition resolves the stored
-- record_project_progress_event(uuid, text, text, smallint, smallint, ...)
-- signature deterministically. The prior function passed an integer expression
-- for previous_progress, causing PostgreSQL function resolution to fail.

create or replace function public.apply_execution_plan_approval()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_progress smallint;
  previous_progress_value smallint;
  approved_progress_value smallint;
begin
  if new.subject_type = 'project_execution_plan'
     and new.project_id is not null
     and old.status = 'pending'
     and new.status in ('approved','rejected') then

    select progress_percent::smallint
      into old_progress
    from public.projects
    where id = new.project_id;

    previous_progress_value := coalesce(old_progress, 65::smallint);
    approved_progress_value := greatest(previous_progress_value, 75::smallint)::smallint;

    if new.status = 'approved' then
      update public.project_milestones
      set status = 'completed', completed_at = coalesce(completed_at, now())
      where project_id = new.project_id and sequence_no = 5;

      update public.projects
      set progress_percent = greatest(progress_percent, 75),
          stage = 'execution_ready',
          updated_at = now()
      where id = new.project_id;

      update public.project_kpis
      set current_value = greatest(coalesce(current_value, 0), 75), status = 'on_track'
      where project_id = new.project_id and name = 'Project onboarding completion';

      perform public.record_project_progress_event(
        new.project_id,
        'approval.approved',
        'Execution Planning Reached',
        previous_progress_value,
        approved_progress_value,
        'executive_decision',
        'execution_planning',
        'current',
        'Begin Phase 1 — Focus and Truth under the approved 90-day plan.',
        'approval_request',
        new.id,
        jsonb_build_object('approval_status','approved','external_actions',false)
      );
    else
      update public.project_milestones
      set status = 'blocked', completed_at = null
      where project_id = new.project_id and sequence_no = 5 and status <> 'completed';

      update public.projects
      set status = 'blocked', stage = 'execution_planning', updated_at = now()
      where id = new.project_id;

      perform public.record_project_progress_event(
        new.project_id,
        'project.blocked',
        'Execution Planning blocked',
        previous_progress_value,
        previous_progress_value,
        'executive_decision',
        'execution_planning',
        'blocked',
        'Revise the execution plan and resolve the CEO approval gate.',
        'approval_request',
        new.id,
        jsonb_build_object('approval_status','rejected','external_actions',false)
      );
    end if;
  end if;
  return new;
end;
$$;
