-- RYTHM post-meeting legal review escalation
-- A-106 is advisory and is not a substitute for jurisdiction-specific licensed legal counsel.
-- External actions and external research remain disabled.

alter table public.meeting_agent_sessions
  add column if not exists legal_review_recommended boolean not null default false,
  add column if not exists legal_review_reason text;

create table if not exists public.meeting_legal_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  session_id uuid not null references public.meeting_agent_sessions(id) on delete cascade,
  legal_agent_id uuid references public.agents(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed','cancelled')),
  outcome text check (outcome is null or outcome in ('clear','clear_with_conditions','risk_identified','licensed_counsel_required')),
  executive_note text,
  risks jsonb not null default '[]'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  licensed_counsel_reason text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  requested_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id)
);

create index if not exists meeting_legal_reviews_meeting_idx on public.meeting_legal_reviews(meeting_id, created_at desc);
create index if not exists meeting_legal_reviews_session_idx on public.meeting_legal_reviews(session_id);

alter table public.meeting_legal_reviews enable row level security;

drop policy if exists meeting_legal_reviews_member_read on public.meeting_legal_reviews;
create policy meeting_legal_reviews_member_read on public.meeting_legal_reviews
for select using (public.is_org_member(organization_id));

drop policy if exists meeting_legal_reviews_owner_write on public.meeting_legal_reviews;
create policy meeting_legal_reviews_owner_write on public.meeting_legal_reviews
for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

-- Register A-106 by cloning the existing organization-safe Agent record shape.
-- This avoids making assumptions about additional required columns in the agents table.
do $$
declare
  v_source public.agents%rowtype;
  v_payload jsonb;
begin
  if exists (select 1 from public.agents where agent_code = 'A-106') then
    return;
  end if;

  select * into v_source
  from public.agents
  where agent_code = 'A-104'
  order by created_at asc nulls last
  limit 1;

  if v_source.id is null then
    select * into v_source
    from public.agents
    where agent_code = 'B-001'
    order by created_at asc nulls last
    limit 1;
  end if;

  if v_source.id is null then
    raise exception 'Cannot bootstrap A-106 because no template RYTHM agent exists.';
  end if;

  v_payload := to_jsonb(v_source)
    || jsonb_build_object(
      'id', gen_random_uuid(),
      'agent_code', 'A-106',
      'name', 'Legal & Regulatory Counsel',
      'display_name', 'Legal & Regulatory Counsel',
      'role_title', 'Legal, Regulatory & Policy Review Agent',
      'purpose', 'Provide advisory legal and regulatory issue-spotting for RYTHM decisions, including AI regulation, privacy, data protection, consumer protection, SaaS and e-commerce, payments, intellectual property, advertising claims, employment, contracts, and cross-border operations. Escalate jurisdiction-specific or high-consequence matters to licensed human counsel.',
      'work_style', 'Concise, conservative, jurisdiction-aware, evidence-disciplined, and explicit about uncertainty. Never represent AI analysis as licensed legal advice.',
      'presence_status', 'available',
      'created_at', now(),
      'updated_at', now()
    );

  insert into public.agents
  select * from jsonb_populate_record(null::public.agents, v_payload);
end $$;
