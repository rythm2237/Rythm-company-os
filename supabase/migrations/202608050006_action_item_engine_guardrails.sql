create or replace function public.enforce_action_item_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status in ('completed', 'cancelled') and row(new.*) is distinct from row(old.*) then
    raise exception 'Completed or cancelled action items are immutable';
  end if;

  if row(new.*) is distinct from row(old.*) and not public.is_org_owner(old.organization_id) then
    raise exception 'Only an organization owner may update an action item';
  end if;

  if new.priority < 1 or new.priority > 5 then
    raise exception 'Action priority must be between 1 and 5';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'open' and new.status in ('in_progress', 'blocked', 'completed', 'cancelled'))
      or (old.status = 'in_progress' and new.status in ('open', 'blocked', 'completed', 'cancelled'))
      or (old.status = 'blocked' and new.status in ('open', 'in_progress', 'completed', 'cancelled'))
    ) then
      raise exception 'Invalid action item lifecycle transition from % to %', old.status, new.status;
    end if;
  end if;

  if new.status = 'completed' and new.completed_at is null then
    raise exception 'Completed action items require a completion timestamp';
  end if;

  if new.status <> 'completed' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists action_item_lifecycle_guardrails on public.action_items;
create trigger action_item_lifecycle_guardrails
before update on public.action_items
for each row execute function public.enforce_action_item_lifecycle();

create index if not exists action_items_execution_queue_idx
on public.action_items (organization_id, status, priority, due_at);

create index if not exists action_items_assignee_status_idx
on public.action_items (organization_id, assigned_user_id, status, due_at);
