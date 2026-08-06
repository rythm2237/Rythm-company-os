alter table public.agents
  add column if not exists display_name text,
  add column if not exists department text,
  add column if not exists avatar_url text,
  add column if not exists presence_status text not null default 'available',
  add column if not exists work_style text,
  add column if not exists supported_languages text[] not null default array['en','fa']::text[];

alter table public.agents
  drop constraint if exists agents_presence_status_check,
  add constraint agents_presence_status_check
  check (presence_status in ('available','in_session','reviewing','awaiting_approval','offline'));

update public.agents set
  display_name = coalesce(display_name, name),
  department = case agent_code
    when 'A-101' then 'Strategy Office'
    when 'A-102' then 'Operations'
    when 'A-103' then 'Finance'
    when 'A-104' then 'Risk & Compliance'
    when 'A-105' then 'Research'
    when 'T-001' then 'Runtime Assurance'
    else 'Executive Office'
  end,
  work_style = case agent_code
    when 'A-101' then 'Structured, evidence-led, option-oriented and explicit about uncertainty.'
    when 'A-102' then 'Process-focused, practical and accountable for operational clarity.'
    when 'A-103' then 'Conservative, numerate and control-oriented.'
    when 'A-104' then 'Skeptical, policy-aware and escalation-first.'
    when 'A-105' then 'Source-grounded, neutral and uncertainty-aware.'
    when 'T-001' then 'Deterministic, bounded and validation-focused.'
    else 'Executive coordination and escalation.'
  end,
  avatar_url = case agent_code
    when 'A-101' then 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=640&q=85'
    when 'A-102' then 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=640&q=85'
    when 'A-103' then 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=640&q=85'
    when 'A-104' then 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=640&q=85'
    when 'A-105' then 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=640&q=85'
    when 'T-001' then 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=640&q=85'
    else avatar_url
  end
where display_name is null or department is null or work_style is null or avatar_url is null;

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  participant_type text not null default 'agent' check (participant_type in ('agent','human_ceo')),
  seat_number smallint not null check (seat_number between 1 and 20),
  attendance_status text not null default 'invited' check (attendance_status in ('invited','present','speaking','excused')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (meeting_id, seat_number),
  unique (meeting_id, agent_id)
);

alter table public.meeting_participants enable row level security;
drop policy if exists meeting_participants_member_read on public.meeting_participants;
create policy meeting_participants_member_read on public.meeting_participants
for select using (public.is_org_member(organization_id));
drop policy if exists meeting_participants_owner_write on public.meeting_participants;
create policy meeting_participants_owner_write on public.meeting_participants
for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

create index if not exists meeting_participants_meeting_idx
on public.meeting_participants (meeting_id, seat_number);
