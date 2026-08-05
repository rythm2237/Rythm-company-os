create or replace function public.enforce_approval_resolution()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'Resolved approval requests are immutable';
  end if;

  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    if not public.is_org_owner(old.organization_id) then
      raise exception 'Only an organization owner may resolve an approval request';
    end if;

    if new.approver_user_id is distinct from auth.uid() then
      raise exception 'Approver must be the authenticated organization owner';
    end if;

    if nullif(btrim(coalesce(new.response_note, '')), '') is null then
      raise exception 'CEO response note is required';
    end if;

    if new.resolved_at is null then
      raise exception 'Resolution timestamp is required';
    end if;

    if old.expires_at is not null and old.expires_at <= now() then
      raise exception 'Expired approval requests cannot be approved or rejected';
    end if;
  end if;

  if old.status = 'pending' and new.status = 'expired' and new.resolved_at is null then
    new.resolved_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists approval_resolution_guardrails on public.approval_requests;
create trigger approval_resolution_guardrails
before update on public.approval_requests
for each row execute function public.enforce_approval_resolution();

create index if not exists approval_requests_expiration_idx
on public.approval_requests (organization_id, expires_at)
where status = 'pending' and expires_at is not null;
