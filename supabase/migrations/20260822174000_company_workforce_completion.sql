-- Complete Company Profile / Workforce / Calendar / Notification operational model

-- Human invitations independent from membership activation.
create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  department_id uuid references public.departments(id) on delete set null,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invited_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'invited' check (status in ('invited','accepted','expired','revoked')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create unique index if not exists uq_org_invitation_open_email on public.organization_invitations(organization_id, lower(email)) where status='invited';

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  description text,
  manager_user_id uuid references auth.users(id) on delete set null,
  manager_agent_id uuid references public.agents(id) on delete set null,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_team_name_per_org on public.teams(organization_id, lower(name));

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  team_role text not null default 'member',
  created_at timestamptz not null default now(),
  check ((user_id is not null)::int + (agent_id is not null)::int = 1)
);
create unique index if not exists uq_team_human_member on public.team_members(team_id,user_id) where user_id is not null;
create unique index if not exists uq_team_agent_member on public.team_members(team_id,agent_id) where agent_id is not null;

-- Expand Agent Cost beyond payroll: zero/fixed/usage/hybrid/custom.
alter table public.agents drop constraint if exists agents_cost_model_check;
alter table public.agents alter column cost_model set default 'included';
alter table public.agents add constraint agents_cost_model_check check (cost_model in ('included','fixed','usage','hybrid','custom'));
alter table public.agents
  add column if not exists usage_cost_rate numeric(12,4) not null default 0 check (usage_cost_rate >= 0),
  add column if not exists usage_cost_unit text,
  add column if not exists sale_price_monthly numeric(12,2) check (sale_price_monthly is null or sale_price_monthly >= 0);

create table if not exists public.agent_cost_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  cost_model text not null,
  monthly_company_cost numeric(12,2) not null default 0,
  usage_cost_rate numeric(12,4) not null default 0,
  usage_cost_unit text,
  sale_price_monthly numeric(12,2),
  currency text not null default 'EUR',
  changed_by_user_id uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

-- Provider-neutral calendar connection metadata. OAuth secrets/tokens must remain server-side and referenced only.
create table if not exists public.calendar_provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  provider_account_email text,
  external_account_id text,
  secret_ref text,
  status text not null default 'disconnected' check (status in ('disconnected','connected','error','revoked')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,user_id,provider)
);

alter table public.notifications
  add column if not exists dedupe_key text,
  add column if not exists delivery_status text not null default 'pending' check (delivery_status in ('pending','delivered','failed','suppressed')),
  add column if not exists delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  add column if not exists last_delivery_error text,
  add column if not exists archived_at timestamptz;
create unique index if not exists uq_notification_dedupe on public.notifications(organization_id,user_id,dedupe_key) where dedupe_key is not null;

-- RLS
alter table public.organization_invitations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.agent_cost_history enable row level security;
alter table public.calendar_provider_connections enable row level security;

create policy org_invitation_owner_access on public.organization_invitations for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=organization_invitations.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')))
with check (exists (select 1 from public.organization_members m where m.organization_id=organization_invitations.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));

create policy teams_member_select on public.teams for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=teams.organization_id and m.user_id=auth.uid()));
create policy teams_owner_write on public.teams for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=teams.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')))
with check (exists (select 1 from public.organization_members m where m.organization_id=teams.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));

create policy team_members_member_select on public.team_members for select to authenticated
using (exists (select 1 from public.teams t join public.organization_members m on m.organization_id=t.organization_id where t.id=team_members.team_id and m.user_id=auth.uid()));
create policy team_members_owner_write on public.team_members for all to authenticated
using (exists (select 1 from public.teams t join public.organization_members m on m.organization_id=t.organization_id where t.id=team_members.team_id and m.user_id=auth.uid() and m.role in ('owner','admin')))
with check (exists (select 1 from public.teams t join public.organization_members m on m.organization_id=t.organization_id where t.id=team_members.team_id and m.user_id=auth.uid() and m.role in ('owner','admin')));

create policy agent_cost_history_member_select on public.agent_cost_history for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=agent_cost_history.organization_id and m.user_id=auth.uid()));
create policy agent_cost_history_owner_insert on public.agent_cost_history for insert to authenticated
with check (exists (select 1 from public.organization_members m where m.organization_id=agent_cost_history.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));

create policy calendar_connections_self on public.calendar_provider_connections for all to authenticated
using (user_id=auth.uid() and exists (select 1 from public.organization_members m where m.organization_id=calendar_provider_connections.organization_id and m.user_id=auth.uid()))
with check (user_id=auth.uid() and exists (select 1 from public.organization_members m where m.organization_id=calendar_provider_connections.organization_id and m.user_id=auth.uid()));
