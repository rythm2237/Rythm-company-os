-- RYTHM Legal Review Gate
-- Adds A-106 Legal & Regulatory Counsel, B-001 legal triage metadata,
-- and persisted AI legal-review records for governed meetings.
-- This is advisory AI review only and does not represent licensed legal advice.

alter table public.meeting_agent_sessions
  add column if not exists legal_triage_status text not null default 'pending'
    check (legal_triage_status in ('pending','not_indicated','recommended')),
  add column if not exists legal_triage_reason text,
  add column if not exists legal_triaged_at timestamptz;

create table if not exists public.meeting_legal_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  session_id uuid not null references public.meeting_agent_sessions(id) on delete cascade,
  legal_agent_id uuid references public.agents(id) on delete set null,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed','cancelled')),
  outcome text check (outcome is null or outcome in ('CLEAR','CLEAR_WITH_CONDITIONS','RISK_IDENTIFIED','LICENSED_COUNSEL_REQUIRED')),
  executive_note text,
  risk_summary text,
  conditions jsonb not null default '[]'::jsonb,
  jurisdictions jsonb not null default '[]'::jsonb,
  licensed_counsel_required boolean not null default false,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  error_message text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_legal_reviews_session_idx
  on public.meeting_legal_reviews(session_id, created_at desc);
create index if not exists meeting_legal_reviews_meeting_idx
  on public.meeting_legal_reviews(meeting_id, created_at desc);

alter table public.meeting_legal_reviews enable row level security;

drop policy if exists meeting_legal_reviews_member_read on public.meeting_legal_reviews;
create policy meeting_legal_reviews_member_read on public.meeting_legal_reviews
for select using (public.is_org_member(organization_id));

drop policy if exists meeting_legal_reviews_owner_write on public.meeting_legal_reviews;
create policy meeting_legal_reviews_owner_write on public.meeting_legal_reviews
for all using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

-- Bootstrap A-106 by cloning the schema-compatible A-104 record and replacing
-- the legal-specific identity and mandate fields. This avoids assuming a fixed
-- agents table column list as the company schema evolves.
do $$
declare
  v_org_id uuid;
  v_source public.agents%rowtype;
  v_payload jsonb;
begin
  for v_org_id in select id from public.organizations loop
    if exists (
      select 1 from public.agents
      where organization_id = v_org_id and agent_code = 'A-106'
    ) then
      continue;
    end if;

    select * into v_source
    from public.agents
    where organization_id = v_org_id and agent_code = 'A-104'
    limit 1;

    if not found then
      continue;
    end if;

    v_payload := to_jsonb(v_source) || jsonb_build_object(
      'id', gen_random_uuid(),
      'agent_code', 'A-106',
      'name', 'Legal & Regulatory Counsel',
      'display_name', 'Legal & Regulatory Counsel',
      'role_title', 'Legal, Regulatory & Policy Review Agent',
      'purpose', 'Provide advisory legal and regulatory issue-spotting for RYTHM decisions across AI regulation, privacy, consumer protection, contracts, intellectual property, payments, online business, employment, data processing, and cross-border operations. Distinguish AI issue-spotting from licensed legal advice and escalate jurisdiction-specific or material uncertainty to qualified external counsel.',
      'work_style', 'Issue-spotting, jurisdiction-aware, conservative on uncertainty, concise, condition-oriented, and explicit about when licensed counsel is required.',
      'created_at', now(),
      'updated_at', now()
    );

    insert into public.agents
    select (jsonb_populate_record(null::public.agents, v_payload)).*;
  end loop;
end $$;

comment on table public.meeting_legal_reviews is
  'Advisory AI legal issue-spotting attached to governed meetings. Not licensed legal advice.';
