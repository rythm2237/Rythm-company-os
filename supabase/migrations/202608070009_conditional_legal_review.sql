-- Conditional Legal Review for governed meetings
-- A-106 is not a standing participant in ordinary meetings.
-- B-001 performs a post-synthesis legal-relevance triage; Human CEO may then route the completed meeting to A-106.

alter table public.meeting_agent_sessions
  add column if not exists legal_triage_status text not null default 'not_assessed',
  add column if not exists legal_triage_reason text,
  add column if not exists legal_triaged_at timestamptz,
  add column if not exists legal_review_status text not null default 'not_requested',
  add column if not exists legal_review_report text,
  add column if not exists legal_reviewed_at timestamptz,
  add column if not exists legal_review_agent_id uuid references public.agents(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'meeting_agent_sessions_legal_triage_status_check'
      and conrelid = 'public.meeting_agent_sessions'::regclass
  ) then
    alter table public.meeting_agent_sessions
      add constraint meeting_agent_sessions_legal_triage_status_check
      check (legal_triage_status in ('not_assessed','not_needed','recommended','required'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'meeting_agent_sessions_legal_review_status_check'
      and conrelid = 'public.meeting_agent_sessions'::regclass
  ) then
    alter table public.meeting_agent_sessions
      add constraint meeting_agent_sessions_legal_review_status_check
      check (legal_review_status in ('not_requested','pending','clear','clear_with_conditions','licensed_counsel_required','failed'));
  end if;
end $$;

-- Register A-106 for each organization that already has the RYTHM executive agent set.
insert into public.agents (
  organization_id,
  agent_code,
  name,
  display_name,
  role_title,
  purpose,
  work_style,
  presence_status
)
select
  b.organization_id,
  'A-106',
  'Legal & Regulatory Counsel',
  'Legal & Regulatory Counsel',
  'Legal, Regulatory & Policy Review Agent',
  'Provide advisory legal and regulatory risk review for RYTHM decisions across AI regulation, privacy and data protection, consumer and SaaS obligations, intellectual property, commercial terms, cross-border operations, payments, advertising claims, employment, and other jurisdiction-sensitive matters. Identify when licensed jurisdiction-specific counsel is required. Do not represent the review as formal legal advice.',
  'Jurisdiction-aware, concise, risk-tiered, evidence-disciplined, and conservative about uncertainty. Distinguish legal risk from business preference and escalate matters requiring licensed counsel.',
  'available'
from public.agents b
where b.agent_code = 'B-001'
  and not exists (
    select 1 from public.agents existing
    where existing.organization_id = b.organization_id
      and existing.agent_code = 'A-106'
  );

create index if not exists meeting_agent_sessions_legal_review_idx
  on public.meeting_agent_sessions(organization_id, legal_triage_status, legal_review_status, created_at desc);
