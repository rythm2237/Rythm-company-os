alter table public.agent_runs
  add column if not exists requested_by_user_id uuid references auth.users(id),
  add column if not exists risk_level public.rythm_risk_level not null default 'low',
  add column if not exists execution_mode text not null default 'dry_run' check (execution_mode in ('dry_run','controlled_live')),
  add column if not exists budget_cap_usd numeric(12,6) not null default 0 check (budget_cap_usd >= 0),
  add column if not exists requires_human_approval boolean not null default false,
  add column if not exists approval_request_id uuid references public.approval_requests(id) on delete set null,
  add column if not exists cancellation_note text;

create or replace function public.enforce_agent_run_control_plane()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_org_owner(new.organization_id) then
      raise exception 'Only an organization owner may request an agent run';
    end if;

    if new.requested_by_user_id is distinct from auth.uid() then
      raise exception 'Run requester must match the authenticated organization owner';
    end if;

    if new.execution_mode <> 'dry_run' then
      raise exception 'Controlled live execution is not enabled';
    end if;

    if new.status not in ('queued','blocked') then
      raise exception 'New run requests must begin queued or blocked';
    end if;

    if new.risk_level in ('high','critical') and not new.requires_human_approval then
      raise exception 'High and critical run requests require human approval';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if not public.is_org_owner(old.organization_id) then
      raise exception 'Only an organization owner may update an agent run';
    end if;

    if old.status in ('succeeded','failed','cancelled') and new is distinct from old then
      raise exception 'Terminal agent run records are immutable';
    end if;

    if new.status in ('running','succeeded','failed') then
      raise exception 'Agent execution is disabled; runtime may not enter an execution state';
    end if;

    if new.status = 'cancelled' then
      if nullif(btrim(coalesce(new.cancellation_note, '')), '') is null then
        raise exception 'Cancellation note is required';
      end if;
      if new.finished_at is null then
        new.finished_at := now();
      end if;
    end if;

    if old.status = 'blocked' and new.status = 'queued' and old.requires_human_approval then
      if old.approval_request_id is null or not exists (
        select 1 from public.approval_requests approval
        where approval.id = old.approval_request_id
          and approval.organization_id = old.organization_id
          and approval.status = 'approved'
      ) then
        raise exception 'Approved human authorization is required before unblocking this run';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists agent_run_control_plane_guardrails on public.agent_runs;
create trigger agent_run_control_plane_guardrails
before insert or update on public.agent_runs
for each row execute function public.enforce_agent_run_control_plane();

create index if not exists agent_runs_control_queue_idx
on public.agent_runs (organization_id, status, risk_level, created_at desc);

create index if not exists agent_runs_approval_idx
on public.agent_runs (approval_request_id)
where approval_request_id is not null;