-- Durable Project OS meeting jobs. Existing Boardroom/meeting tables remain canonical.
alter table public.meetings add column if not exists involvement_mode text not null default 'CEO_OPTIONAL';
alter table public.meeting_agent_participants add column if not exists authorization_source text not null default 'manual_ceo';

do $$ begin
  if not exists(select 1 from pg_constraint where conname='meetings_involvement_mode_check') then
    alter table public.meetings add constraint meetings_involvement_mode_check check(involvement_mode in('AUTONOMOUS','CEO_OPTIONAL','CEO_REQUIRED')) not valid;
    alter table public.meetings validate constraint meetings_involvement_mode_check;
  end if;
end $$;

create table if not exists public.project_autonomous_meeting_jobs(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  requested_by_agent_id uuid references public.agents(id) on delete set null,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(meeting_id)
);
alter table public.project_autonomous_meeting_jobs enable row level security;
drop policy if exists project_autonomous_meeting_jobs_member_read on public.project_autonomous_meeting_jobs;
create policy project_autonomous_meeting_jobs_member_read on public.project_autonomous_meeting_jobs for select to authenticated using(public.is_org_member(organization_id));
drop policy if exists project_autonomous_meeting_jobs_owner_write on public.project_autonomous_meeting_jobs;
create policy project_autonomous_meeting_jobs_owner_write on public.project_autonomous_meeting_jobs for all to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));
create index if not exists project_autonomous_meeting_jobs_dispatch_idx on public.project_autonomous_meeting_jobs(status,next_attempt_at,created_at);

-- Existing project worker emits a governed activity event when an agent requests a working session.
-- Convert that event into a durable meeting job without changing the existing meeting creation code.
create or replace function public.enqueue_project_autonomous_meeting_v1()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_meeting uuid;
begin
  if new.event_type<>'meeting.requested' then return new; end if;
  begin target_meeting:=(new.metadata->>'meeting_id')::uuid; exception when others then return new; end;
  if target_meeting is null then return new; end if;
  update public.meetings set involvement_mode='AUTONOMOUS' where id=target_meeting and organization_id=new.organization_id and project_id=new.project_id;
  insert into public.project_autonomous_meeting_jobs(organization_id,project_id,meeting_id,requested_by_agent_id)
  values(new.organization_id,new.project_id,target_meeting,new.agent_id)
  on conflict(meeting_id) do nothing;
  return new;
end $$;
revoke all on function public.enqueue_project_autonomous_meeting_v1() from public,anon,authenticated;
drop trigger if exists trg_enqueue_project_autonomous_meeting on public.project_activity_events;
create trigger trg_enqueue_project_autonomous_meeting after insert on public.project_activity_events for each row execute function public.enqueue_project_autonomous_meeting_v1();

create or replace function public.recover_stale_project_autonomous_meeting_jobs_v1()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare recovered integer;
begin
  update public.project_autonomous_meeting_jobs
  set status=case when attempt_count>=max_attempts then 'failed' else 'retrying' end,
      error_message=case when attempt_count>=max_attempts then 'Autonomous meeting retry limit reached after worker lease expiry.' else 'Autonomous meeting worker lease expired.' end,
      lease_owner=null,
      lease_expires_at=null,
      next_attempt_at=case when attempt_count>=max_attempts then null else now()+make_interval(secs=>least(1800,60*(2^least(attempt_count,5)))) end,
      updated_at=now()
  where status='running' and lease_expires_at<now();
  get diagnostics recovered=row_count;
  return recovered;
end $$;
revoke all on function public.recover_stale_project_autonomous_meeting_jobs_v1() from public,anon,authenticated;
grant execute on function public.recover_stale_project_autonomous_meeting_jobs_v1() to service_role;

create or replace function public.claim_project_autonomous_meeting_jobs_v1(worker_id text, claim_limit integer default 2, lease_seconds integer default 240)
returns setof public.project_autonomous_meeting_jobs language plpgsql security definer set search_path=public as $$
begin
  if coalesce(worker_id,'')='' then raise exception 'worker_id required'; end if;
  return query
  with candidates as(
    select j.id from public.project_autonomous_meeting_jobs j
    join public.projects p on p.id=j.project_id and p.status='active'
    join public.meetings m on m.id=j.meeting_id and m.involvement_mode='AUTONOMOUS'
    where j.status in('queued','retrying') and (j.next_attempt_at is null or j.next_attempt_at<=now()) and (j.lease_expires_at is null or j.lease_expires_at<now())
    order by p.priority asc,j.created_at asc for update of j skip locked limit greatest(1,least(claim_limit,5))
  )
  update public.project_autonomous_meeting_jobs j set status='running',attempt_count=attempt_count+1,lease_owner=worker_id,lease_expires_at=now()+make_interval(secs=>greatest(60,lease_seconds)),updated_at=now()
  from candidates c where j.id=c.id returning j.*;
end $$;
revoke all on function public.claim_project_autonomous_meeting_jobs_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_project_autonomous_meeting_jobs_v1(text,integer,integer) to service_role;
