-- Preserve owner-only human mutation while allowing trusted internal service execution.
create or replace function public.enforce_action_item_lifecycle()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.status in ('completed', 'cancelled') and row(new.*) is distinct from row(old.*) then
    raise exception 'Completed or cancelled action items are immutable';
  end if;

  if row(new.*) is distinct from row(old.*)
     and not public.is_org_owner(old.organization_id)
     and coalesce(auth.role(),'') <> 'service_role'
     and current_user not in ('postgres','supabase_admin') then
    raise exception 'Only an organization owner or governed internal service may update an action item';
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

  if new.status <> 'completed' then new.completed_at := null; end if;
  return new;
end;
$$;