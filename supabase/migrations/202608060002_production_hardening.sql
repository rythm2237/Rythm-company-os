create table if not exists public.runtime_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  dry_run_execution_enabled boolean not null default false,
  monthly_budget_usd numeric(12,6) not null default 25 check (monthly_budget_usd >= 0),
  per_run_budget_usd numeric(12,6) not null default 0.25 check (per_run_budget_usd >= 0),
  max_queued_runs integer not null default 20 check (max_queued_runs between 1 and 500),
  max_requests_per_hour integer not null default 30 check (max_requests_per_hour between 1 and 1000),
  max_attempts smallint not null default 2 check (max_attempts between 1 and 5),
  timeout_seconds integer not null default 45 check (timeout_seconds between 5 and 180),
  updated_by_user_id uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.runtime_policies (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

alter table public.runtime_policies enable row level security;
drop policy if exists runtime_policies_member_read on public.runtime_policies;
create policy runtime_policies_member_read on public.runtime_policies
for select using (public.is_org_member(organization_id));
drop policy if exists runtime_policies_owner_write on public.runtime_policies;
create policy runtime_policies_owner_write on public.runtime_policies
for all using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

alter table public.agent_runs
  add column if not exists idempotency_key text,
  add column if not exists attempt_count smallint not null default 0,
  add column if not exists max_attempts smallint not null default 2,
  add column if not exists timeout_seconds integer not null default 45,
  add column if not exists queued_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists result_summary text;

update public.agent_runs
set idempotency_key = coalesce(idempotency_key, id::text),
    queued_at = case when status = 'queued' then coalesce(queued_at, created_at) else queued_at end
where idempotency_key is null or (status = 'queued' and queued_at is null);

alter table public.agent_runs alter column idempotency_key set not null;
alter table public.agent_runs
  drop constraint if exists agent_runs_attempt_count_check,
  add constraint agent_runs_attempt_count_check check (attempt_count between 0 and 5),
  drop constraint if exists agent_runs_max_attempts_check,
  add constraint agent_runs_max_attempts_check check (max_attempts between 1 and 5),
  drop constraint if exists agent_runs_timeout_seconds_check,
  add constraint agent_runs_timeout_seconds_check check (timeout_seconds between 5 and 180),
  drop constraint if exists agent_runs_cost_within_cap_check,
  add constraint agent_runs_cost_within_cap_check check (cost_usd >= 0 and cost_usd <= budget_cap_usd),
  drop constraint if exists agent_runs_tokens_nonnegative_check,
  add constraint agent_runs_tokens_nonnegative_check check (input_tokens >= 0 and output_tokens >= 0);

create unique index if not exists agent_runs_org_idempotency_uidx
on public.agent_runs (organization_id, idempotency_key);
create index if not exists agent_runs_queue_claim_idx
on public.agent_runs (organization_id, status, queued_at, created_at)
where status = 'queued';

create or replace function public.prevent_audit_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Audit events are append-only and cannot be modified or deleted';
end;
$$;

drop trigger if exists audit_events_append_only on public.audit_events;
create trigger audit_events_append_only
before update or delete on public.audit_events
for each row execute function public.prevent_audit_event_mutation();

create or replace function public.enforce_runtime_policy_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_org_owner(new.organization_id) then
    raise exception 'Only an organization owner may update runtime policy';
  end if;
  if new.updated_by_user_id is distinct from auth.uid() then
    raise exception 'Runtime policy updater must match the authenticated owner';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists runtime_policy_owner_guardrail on public.runtime_policies;
create trigger runtime_policy_owner_guardrail
before insert or update on public.runtime_policies
for each row execute function public.enforce_runtime_policy_update();

create or replace function public.enforce_agent_run_control_plane()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  policy_row public.runtime_policies%rowtype;
  agent_row public.agents%rowtype;
  monthly_spend numeric(12,6);
  recent_requests integer;
  queued_runs integer;
begin
  select * into policy_row from public.runtime_policies where organization_id = coalesce(new.organization_id, old.organization_id);
  if not found then
    raise exception 'Runtime policy is missing for this organization';
  end if;

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
    if nullif(btrim(new.idempotency_key), '') is null then
      raise exception 'Idempotency key is required';
    end if;

    select * into agent_row from public.agents where id = new.agent_id and organization_id = new.organization_id;
    if not found then raise exception 'Agent does not belong to the organization'; end if;
    if new.status = 'queued' and not agent_row.enabled then
      raise exception 'Paused agents cannot enter the queue';
    end if;
    if case new.risk_level when 'low' then 0 when 'medium' then 1 when 'high' then 2 else 3 end >
       case agent_row.risk_ceiling when 'low' then 0 when 'medium' then 1 when 'high' then 2 else 3 end then
      raise exception 'Requested risk exceeds the agent risk ceiling';
    end if;
    if new.risk_level in ('high','critical') and not new.requires_human_approval then
      raise exception 'High and critical run requests require human approval';
    end if;
    if new.budget_cap_usd > policy_row.per_run_budget_usd then
      raise exception 'Run budget exceeds the organization per-run budget';
    end if;

    select coalesce(sum(cost_usd),0) into monthly_spend
    from public.agent_runs
    where organization_id = new.organization_id
      and created_at >= date_trunc('month', now());
    if monthly_spend + new.budget_cap_usd > policy_row.monthly_budget_usd then
      raise exception 'Monthly runtime budget would be exceeded';
    end if;

    select count(*) into recent_requests
    from public.agent_runs
    where organization_id = new.organization_id
      and created_at >= now() - interval '1 hour';
    if recent_requests >= policy_row.max_requests_per_hour then
      raise exception 'Hourly run request limit reached';
    end if;

    select count(*) into queued_runs
    from public.agent_runs
    where organization_id = new.organization_id and status = 'queued';
    if new.status = 'queued' and queued_runs >= policy_row.max_queued_runs then
      raise exception 'Queued run limit reached';
    end if;

    new.max_attempts := policy_row.max_attempts;
    new.timeout_seconds := policy_row.timeout_seconds;
    if new.status = 'queued' then new.queued_at := coalesce(new.queued_at, now()); end if;
  end if;

  if tg_op = 'UPDATE' then
    if not public.is_org_owner(old.organization_id) then
      raise exception 'Only an organization owner may update an agent run';
    end if;
    if old.status in ('succeeded','failed','cancelled') and new is distinct from old then
      raise exception 'Terminal agent run records are immutable';
    end if;
    if new.organization_id is distinct from old.organization_id
       or new.agent_id is distinct from old.agent_id
       or new.execution_mode is distinct from old.execution_mode
       or new.risk_level is distinct from old.risk_level
       or new.budget_cap_usd is distinct from old.budget_cap_usd
       or new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'Run identity and governance fields are immutable';
    end if;

    select * into agent_row from public.agents where id = old.agent_id and organization_id = old.organization_id;

    if old.status = 'blocked' and new.status = 'queued' then
      if not agent_row.enabled then raise exception 'Paused agents cannot be released to queue'; end if;
      if old.requires_human_approval and (
        old.approval_request_id is null or not exists (
          select 1 from public.approval_requests approval
          where approval.id = old.approval_request_id
            and approval.organization_id = old.organization_id
            and approval.status = 'approved'
        )
      ) then
        raise exception 'Approved human authorization is required before unblocking this run';
      end if;
      new.queued_at := now();
    elsif old.status = 'queued' and new.status = 'running' then
      if not policy_row.dry_run_execution_enabled then raise exception 'Dry-run execution is disabled by organization policy'; end if;
      if old.execution_mode <> 'dry_run' or old.risk_level <> 'low' then raise exception 'Only low-risk dry-runs may execute'; end if;
      if not agent_row.enabled or agent_row.agent_code <> 'T-001' then raise exception 'Only the enabled Runtime Validation Agent may execute'; end if;
      if old.attempt_count >= old.max_attempts then raise exception 'Maximum run attempts reached'; end if;
      new.attempt_count := old.attempt_count + 1;
      new.started_at := coalesce(new.started_at, now());
      new.last_heartbeat_at := now();
    elsif old.status = 'running' and new.status in ('succeeded','failed') then
      new.finished_at := coalesce(new.finished_at, now());
      new.last_heartbeat_at := now();
      if new.status = 'succeeded' and nullif(btrim(coalesce(new.result_summary,'')), '') is null then
        raise exception 'Successful dry-runs require a result summary';
      end if;
    elsif old.status in ('queued','blocked','running') and new.status = 'cancelled' then
      if nullif(btrim(coalesce(new.cancellation_note, '')), '') is null then raise exception 'Cancellation note is required'; end if;
      new.finished_at := coalesce(new.finished_at, now());
    elsif new.status is distinct from old.status then
      raise exception 'This agent run transition is not allowed';
    end if;

    if new.cost_usd > old.budget_cap_usd then raise exception 'Recorded run cost exceeds budget cap'; end if;
  end if;

  return new;
end;
$$;

drop trigger if exists agent_run_control_plane_guardrails on public.agent_runs;
create trigger agent_run_control_plane_guardrails
before insert or update on public.agent_runs
for each row execute function public.enforce_agent_run_control_plane();