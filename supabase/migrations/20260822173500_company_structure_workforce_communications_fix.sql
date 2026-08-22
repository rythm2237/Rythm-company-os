-- Production-aligned correction for the company/workforce/communications migration.
-- commercial_offers is keyed by offer_code, not UUID id.

alter table public.agents drop column if exists purchased_offer_id;
alter table public.agents
  add column if not exists purchased_offer_code text references public.commercial_offers(offer_code) on delete set null;

-- Participant rows require their own identity because nullable human/agent/email participants
-- cannot be represented safely by a composite primary key.
drop table if exists public.calendar_event_participants cascade;
create table public.calendar_event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  email text,
  response_status text not null default 'needs_action',
  check (user_id is not null or agent_id is not null or email is not null)
);
alter table public.calendar_event_participants enable row level security;
create policy calendar_participants_member_access on public.calendar_event_participants
for all to authenticated
using (exists (
  select 1 from public.calendar_events e
  join public.organization_members m on m.organization_id=e.organization_id
  where e.id=calendar_event_participants.event_id and m.user_id=auth.uid()
))
with check (exists (
  select 1 from public.calendar_events e
  join public.organization_members m on m.organization_id=e.organization_id
  where e.id=calendar_event_participants.event_id and m.user_id=auth.uid()
));
