-- RYTHM Company OS: company identity, workforce economics, calendar and notifications

alter table public.organizations
  add column if not exists legal_name text,
  add column if not exists legal_entity_type text,
  add column if not exists registration_number text,
  add column if not exists tax_id text,
  add column if not exists vat_id text,
  add column if not exists country_code text,
  add column if not exists registered_address jsonb not null default '{}'::jsonb,
  add column if not exists operating_address jsonb not null default '{}'::jsonb,
  add column if not exists website_url text,
  add column if not exists primary_email text,
  add column if not exists primary_phone text,
  add column if not exists default_currency text not null default 'EUR',
  add column if not exists timezone text not null default 'UTC';

alter table public.departments
  add column if not exists parent_department_id uuid references public.departments(id) on delete set null,
  add column if not exists manager_agent_id uuid references public.agents(id) on delete set null;

alter table public.organization_members
  add column if not exists display_name text,
  add column if not exists job_title text,
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists reports_to_user_id uuid references auth.users(id) on delete set null,
  add column if not exists membership_status text not null default 'active',
  add column if not exists invited_at timestamptz,
  add column if not exists joined_at timestamptz,
  add column if not exists deactivated_at timestamptz;

alter table public.agents
  add column if not exists monthly_company_cost numeric(12,2) not null default 0 check (monthly_company_cost >= 0),
  add column if not exists cost_currency text not null default 'EUR',
  add column if not exists cost_model text not null default 'included' check (cost_model in ('included','subscription','custom')),
  add column if not exists purchased_offer_id uuid references public.commercial_offers(id) on delete set null;

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'UTC',
  location text,
  meeting_url text,
  provider text not null default 'rythm',
  external_event_id text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_agent_id uuid references public.agents(id) on delete set null,
  status text not null default 'confirmed' check (status in ('tentative','confirmed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.calendar_event_participants (
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  email text,
  response_status text not null default 'needs_action',
  primary key (event_id, user_id, agent_id),
  check (user_id is not null or agent_id is not null or email is not null)
);

create table if not exists public.notification_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  approvals_enabled boolean not null default true,
  communications_enabled boolean not null default true,
  meetings_enabled boolean not null default true,
  projects_enabled boolean not null default true,
  digest_frequency text not null default 'realtime' check (digest_frequency in ('realtime','daily','weekly','off')),
  quiet_hours jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  title text not null,
  body text,
  action_url text,
  source_type text,
  source_id uuid,
  read_at timestamptz,
  delivered_email_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_calendar_events_org_start on public.calendar_events(organization_id,starts_at);
create index if not exists idx_notifications_user_unread on public.notifications(user_id,created_at desc) where read_at is null;
create index if not exists idx_org_members_department on public.organization_members(organization_id,department_id);

alter table public.calendar_events enable row level security;
alter table public.calendar_event_participants enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;

create policy calendar_events_member_select on public.calendar_events for select to authenticated using (exists (select 1 from public.organization_members m where m.organization_id=calendar_events.organization_id and m.user_id=auth.uid()));
create policy calendar_events_member_write on public.calendar_events for all to authenticated using (exists (select 1 from public.organization_members m where m.organization_id=calendar_events.organization_id and m.user_id=auth.uid())) with check (exists (select 1 from public.organization_members m where m.organization_id=calendar_events.organization_id and m.user_id=auth.uid()));
create policy calendar_participants_member_access on public.calendar_event_participants for all to authenticated using (exists (select 1 from public.calendar_events e join public.organization_members m on m.organization_id=e.organization_id where e.id=calendar_event_participants.event_id and m.user_id=auth.uid())) with check (exists (select 1 from public.calendar_events e join public.organization_members m on m.organization_id=e.organization_id where e.id=calendar_event_participants.event_id and m.user_id=auth.uid()));
create policy notification_preferences_self on public.notification_preferences for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid() and exists (select 1 from public.organization_members m where m.organization_id=notification_preferences.organization_id and m.user_id=auth.uid()));
create policy notifications_self_select on public.notifications for select to authenticated using (user_id=auth.uid() and exists (select 1 from public.organization_members m where m.organization_id=notifications.organization_id and m.user_id=auth.uid()));
create policy notifications_self_update on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
