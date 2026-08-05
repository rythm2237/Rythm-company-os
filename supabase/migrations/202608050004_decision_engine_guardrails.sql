create or replace function public.enforce_decision_resolution()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status in ('approved', 'rejected', 'archived') and row(new.*) is distinct from row(old.*) then
    raise exception 'Resolved decision records are immutable';
  end if;

  if old.status in ('draft', 'review') and new.status in ('approved', 'rejected') then
    if not public.is_org_owner(old.organization_id) then
      raise exception 'Only an organization owner may resolve a decision';
    end if;

    if new.decided_by_user_id is distinct from auth.uid() then
      raise exception 'Decision authority must match the authenticated organization owner';
    end if;

    if nullif(btrim(coalesce(new.rationale, '')), '') is null then
      raise exception 'CEO decision rationale is required';
    end if;

    if new.decided_at is null then
      raise exception 'Decision timestamp is required';
    end if;

    if new.status = 'approved' and old.requires_human_approval then
      if not exists (
        select 1
        from public.approval_requests approval
        where approval.organization_id = old.organization_id
          and approval.subject_type = 'decision'
          and approval.subject_id = old.id
          and approval.status = 'approved'
      ) then
        raise exception 'An approved human approval request is required before finalizing this decision';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists decision_resolution_guardrails on public.decisions;
create trigger decision_resolution_guardrails
before update on public.decisions
for each row execute function public.enforce_decision_resolution();

create index if not exists decisions_review_queue_idx
on public.decisions (organization_id, status, risk_level, created_at desc);

create unique index if not exists approval_requests_active_decision_unique
on public.approval_requests (organization_id, subject_id)
where subject_type = 'decision' and status = 'pending';
