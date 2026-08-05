create or replace function public.enforce_meeting_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status in ('completed', 'cancelled') and new is distinct from old then
    raise exception 'Completed or cancelled meetings are immutable';
  end if;

  if new.status is distinct from old.status then
    if not public.is_org_owner(old.organization_id) then
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

drop trigger if exists meeting_lifecycle_guardrails on public.meetings;
create trigger meeting_lifecycle_guardrails
before update on public.meetings
for each row execute function public.enforce_meeting_lifecycle();

create index if not exists meetings_org_status_schedule_idx
on public.meetings (organization_id, status, scheduled_for);

create index if not exists action_items_meeting_status_idx
on public.action_items (meeting_id, status, priority)
where meeting_id is not null;
