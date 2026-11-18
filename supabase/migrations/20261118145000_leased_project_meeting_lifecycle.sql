-- Only a currently leased, policy-authorized internal worker may transition its own
-- autonomous project meeting. Owner control and closed-meeting immutability remain.
create or replace function public.enforce_meeting_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status in ('completed', 'cancelled') and new is distinct from old then
    raise exception 'Completed or cancelled meetings are immutable';
  end if;

  if new.status is distinct from old.status then
    if not public.is_org_owner(old.organization_id) and not (
      auth.role() = 'service_role'
      and old.involvement_mode = 'AUTONOMOUS'
      and new.involvement_mode = old.involvement_mode
      and new.organization_id = old.organization_id
      and new.project_id = old.project_id
      and ((old.status in ('draft','scheduled') and new.status = 'running')
        or (old.status = 'running' and new.status = 'completed'))
      and exists (
        select 1 from public.project_autonomous_meeting_jobs j
        join public.projects p on p.id=j.project_id and p.organization_id=j.organization_id
        where j.meeting_id=old.id and j.organization_id=old.organization_id
          and j.project_id=old.project_id and j.status='running'
          and j.lease_owner is not null and j.lease_expires_at>now()
          and public.project_internal_work_authorized_v1(p.id,p.organization_id)
          and p.autonomy_mode in ('limited_autonomy','full_autonomy_within_policy','approval_required')
      )
    ) then
      raise exception 'Only an organization owner may transition a meeting';
    end if;

    if not (
      (old.status = 'draft' and new.status in ('scheduled', 'running', 'cancelled'))
      or (old.status = 'scheduled' and new.status in ('running', 'cancelled'))
      or (old.status = 'running' and new.status in ('completed', 'cancelled'))
    ) then
      raise exception 'Invalid meeting lifecycle transition from % to %', old.status, new.status;
    end if;
  end if;

  if new.status = 'scheduled' and new.scheduled_for is null then
    raise exception 'Scheduled meetings require a scheduled timestamp';
  end if;

  if new.status = 'running' and new.started_at is null then
    raise exception 'Running meetings require a start timestamp';
  end if;

  if new.status = 'completed' then
    if new.started_at is null then
      raise exception 'Completed meetings require a start timestamp';
    end if;

    if new.ended_at is null then
      raise exception 'Completed meetings require an end timestamp';
    end if;

    if new.minutes is null or new.minutes = '{}'::jsonb then
      raise exception 'Completed meetings require minutes';
    end if;
  end if;

  if new.status = 'cancelled' and new.ended_at is null then
    new.ended_at := now();
  end if;

  return new;
end;
$$;

