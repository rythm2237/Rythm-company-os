-- MVP release E2E remediation: bind legal triage to the exact Human CEO / Chair closure snapshot.
--
-- Timestamp ordering alone is not sufficient provenance. A previously stored triage
-- could have a post-closure timestamp while still containing stale/open-meeting
-- reasoning. This migration adds an explicit closure basis to every valid triage.
--
-- Historical resolved decisions are not modified.

alter table public.meeting_agent_sessions
  add column if not exists legal_triage_basis_closed_at timestamptz;

update public.meeting_agent_sessions s
set
  legal_triage_status = 'pending',
  legal_triage_reason = null,
  legal_triaged_at = null,
  legal_triage_basis_closed_at = null,
  updated_at = now()
from public.meetings m
where m.id = s.meeting_id
  and m.organization_id = s.organization_id
  and m.status::text = 'completed'
  and s.legal_triage_status::text in ('recommended','not_indicated')
  and (
    s.legal_triage_basis_closed_at is null
    or m.ended_at is null
    or s.legal_triage_basis_closed_at is distinct from m.ended_at
  );

create or replace function public.enforce_post_closure_legal_triage()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_meeting_status text;
  v_meeting_ended_at timestamptz;
begin
  if new.legal_triage_status::text in ('recommended','not_indicated') then
    select m.status::text, m.ended_at
      into v_meeting_status, v_meeting_ended_at
    from public.meetings m
    where m.id = new.meeting_id
      and m.organization_id = new.organization_id;

    if not found then
      raise exception 'Linked meeting not found for legal triage';
    end if;

    if v_meeting_status <> 'completed' or v_meeting_ended_at is null then
      raise exception 'Legal relevance triage requires explicit Human CEO / Chair closure';
    end if;

    if new.legal_triaged_at is null or new.legal_triaged_at < v_meeting_ended_at then
      raise exception 'Legal relevance triage must be completed after chair closure';
    end if;

    if new.legal_triage_basis_closed_at is null
       or new.legal_triage_basis_closed_at is distinct from v_meeting_ended_at then
      raise exception 'Legal relevance triage must be bound to the exact chair closure snapshot';
    end if;
  else
    new.legal_triage_basis_closed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists meeting_session_post_closure_legal_triage_guard
  on public.meeting_agent_sessions;
create trigger meeting_session_post_closure_legal_triage_guard
before insert or update of legal_triage_status, legal_triaged_at, legal_triage_basis_closed_at, meeting_id, organization_id
on public.meeting_agent_sessions
for each row execute function public.enforce_post_closure_legal_triage();

create or replace function public.enforce_fresh_legal_triage_before_meeting_decision()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_triage_status text;
  v_triaged_at timestamptz;
  v_triage_basis_closed_at timestamptz;
  v_meeting_status text;
  v_meeting_ended_at timestamptz;
begin
  if new.source_meeting_session_id is null then
    return new;
  end if;

  select
    s.legal_triage_status::text,
    s.legal_triaged_at,
    s.legal_triage_basis_closed_at,
    m.status::text,
    m.ended_at
  into
    v_triage_status,
    v_triaged_at,
    v_triage_basis_closed_at,
    v_meeting_status,
    v_meeting_ended_at
  from public.meeting_agent_sessions s
  join public.meetings m
    on m.id = s.meeting_id
   and m.organization_id = s.organization_id
  where s.id = new.source_meeting_session_id
    and s.organization_id = new.organization_id;

  if not found then
    raise exception 'Meeting session provenance is invalid for this decision';
  end if;

  if v_meeting_status <> 'completed' or v_meeting_ended_at is null then
    raise exception 'Meeting must be explicitly closed before a decision can be recorded';
  end if;

  if v_triage_status not in ('recommended','not_indicated')
     or v_triaged_at is null
     or v_triaged_at < v_meeting_ended_at
     or v_triage_basis_closed_at is null
     or v_triage_basis_closed_at is distinct from v_meeting_ended_at then
    raise exception 'Fresh closure-bound legal relevance triage is required before recording this decision';
  end if;

  return new;
end;
$$;

drop trigger if exists decision_fresh_legal_triage_guard on public.decisions;
create trigger decision_fresh_legal_triage_guard
before insert or update of source_meeting_session_id, organization_id
on public.decisions
for each row execute function public.enforce_fresh_legal_triage_before_meeting_decision();
