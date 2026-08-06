-- Preflight for the visual identity migration.
-- meeting_participants is a new, non-production table, so rebuild it with the governed schema.

drop table if exists public.meeting_participants cascade;

create table public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  participant_type text not null default 'agent'
    check (participant_type in ('agent','human_ceo')),
  seat_number smallint not null check (seat_number between 1 and 20),
  attendance_status text not null default 'invited'
    check (attendance_status in ('invited','present','speaking','excused')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (meeting_id, seat_number),
  unique (meeting_id, agent_id)
);

alter table public.meeting_participants enable row level security;

create policy meeting_participants_member_read
on public.meeting_participants
for select
using (public.is_org_member(organization_id));

create policy meeting_participants_owner_write
on public.meeting_participants
for all
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

create index meeting_participants_meeting_idx
on public.meeting_participants (meeting_id, seat_number);
