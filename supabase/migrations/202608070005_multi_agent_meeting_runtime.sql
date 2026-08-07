-- Multi-Agent Meeting Runtime
-- Adds persistent, human-governed agent deliberation sessions to the existing Meeting Engine.
-- Internal analysis only: no tools, browsing, messages, transactions, or external actions are authorized.

create table if not exists public.meeting_agent_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  status text not null default 'ready' check (status in ('ready','running','completed','failed','cancelled')),
  decision_question text not null,
  language text not null default 'English',
  model text,
  max_rounds smallint not null default 2 check (max_rounds between 1 and 3),
  budget_cap_usd numeric(10,4) not null default 1.5000 check (budget_cap_usd >= 0),
  external_research_allowed boolean not null default false,
  synthesis text,
  recommendation text,
  decision_options jsonb not null default '[]'::jsonb,
  total_input_tokens integer not null default 0,
  total_output_tokens integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  error_message text,
  started_by_user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_agent_participants (
  session_id uuid not null references public.meeting_agent_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  seat_order smallint not null,
  session_role text not null default 'advisor' check (session_role in ('chair','facilitator','advisor','challenger','synthesizer')),
  explicitly_authorized_by_ceo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (session_id, agent_id),
  unique (session_id, seat_order)
);

create table if not exists public.meeting_agent_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  session_id uuid not null references public.meeting_agent_sessions(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  turn_index integer not null,
  round_no smallint not null default 1,
  speaker_type text not null default 'agent' check (speaker_type in ('agent','system','human_ceo')),
  message_type text not null check (message_type in ('position','challenge','synthesis','ceo_decision','system')),
  content text not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now(),
  unique (session_id, turn_index)
);

create index if not exists meeting_agent_sessions_meeting_idx on public.meeting_agent_sessions(meeting_id, created_at desc);
create index if not exists meeting_agent_sessions_project_idx on public.meeting_agent_sessions(project_id, status);
create index if not exists meeting_agent_messages_session_idx on public.meeting_agent_messages(session_id, turn_index);
create index if not exists meeting_agent_participants_session_idx on public.meeting_agent_participants(session_id, seat_order);

alter table public.meeting_agent_sessions enable row level security;
alter table public.meeting_agent_participants enable row level security;
alter table public.meeting_agent_messages enable row level security;

drop policy if exists meeting_agent_sessions_member_read on public.meeting_agent_sessions;
create policy meeting_agent_sessions_member_read on public.meeting_agent_sessions
for select using (public.is_org_member(organization_id));

drop policy if exists meeting_agent_sessions_owner_write on public.meeting_agent_sessions;
create policy meeting_agent_sessions_owner_write on public.meeting_agent_sessions
for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

drop policy if exists meeting_agent_participants_member_read on public.meeting_agent_participants;
create policy meeting_agent_participants_member_read on public.meeting_agent_participants
for select using (public.is_org_member(organization_id));

drop policy if exists meeting_agent_participants_owner_write on public.meeting_agent_participants;
create policy meeting_agent_participants_owner_write on public.meeting_agent_participants
for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

drop policy if exists meeting_agent_messages_member_read on public.meeting_agent_messages;
create policy meeting_agent_messages_member_read on public.meeting_agent_messages
for select using (public.is_org_member(organization_id));

drop policy if exists meeting_agent_messages_owner_write on public.meeting_agent_messages;
create policy meeting_agent_messages_owner_write on public.meeting_agent_messages
for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

-- Prepare the first governed multi-agent product-strategy meeting for AI-PR-001.
do $$
declare
  v_org_id uuid;
  v_project_id uuid;
  v_meeting_id uuid;
  v_session_id uuid;
begin
  select organization_id, id into v_org_id, v_project_id
  from public.projects
  where project_code = 'AI-PR-001'
  limit 1;

  if v_org_id is null then
    return;
  end if;

  select id into v_meeting_id
  from public.meetings
  where organization_id = v_org_id
    and title = 'AI-PR-001 — Future Strategy and 90-Day Feature Scope'
  order by created_at desc
  limit 1;

  if v_meeting_id is null then
    insert into public.meetings (
      organization_id, project_id, title, purpose, status, agenda, human_join_allowed
    ) values (
      v_org_id,
      v_project_id,
      'AI-PR-001 — Future Strategy and 90-Day Feature Scope',
      'Governed multi-agent deliberation to decide the product-development scope for the next 90 days while preserving Human CEO authority.',
      'draft',
      jsonb_build_array(
        'Review the approved primary persona and primary Job-to-be-Done',
        'Compare Hard Freeze, Controlled Feature Expansion, and Open Development',
        'Identify product, operational, research, and governance risks',
        'Recommend scope gates and CEO-controlled exceptions',
        'Prepare a decision package for the Human CEO'
      ),
      true
    ) returning id into v_meeting_id;
  end if;

  select id into v_session_id
  from public.meeting_agent_sessions
  where meeting_id = v_meeting_id
  order by created_at desc
  limit 1;

  if v_session_id is null then
    insert into public.meeting_agent_sessions (
      organization_id, meeting_id, project_id, status, decision_question, language,
      max_rounds, budget_cap_usd, external_research_allowed
    ) values (
      v_org_id,
      v_meeting_id,
      v_project_id,
      'ready',
      'Which product-development scope strategy should AI Position Roadmap adopt for the next 90 days: Hard Freeze, Controlled Feature Expansion, or Open Development, and what governance gates should apply?',
      'English',
      2,
      1.5000,
      false
    ) returning id into v_session_id;

    insert into public.meeting_agent_participants (
      session_id, organization_id, agent_id, seat_order, session_role, explicitly_authorized_by_ceo
    )
    select
      v_session_id,
      v_org_id,
      agent.id,
      case agent.agent_code
        when 'A-101' then 1
        when 'A-102' then 2
        when 'A-104' then 3
        when 'A-105' then 4
        when 'B-001' then 5
        else 9
      end::smallint,
      case when agent.agent_code = 'B-001' then 'synthesizer' else 'advisor' end,
      true
    from public.agents agent
    where agent.organization_id = v_org_id
      and agent.agent_code in ('A-101','A-102','A-104','A-105','B-001')
    on conflict (session_id, agent_id) do nothing;
  end if;
end $$;
