create extension if not exists pgcrypto;

create type public.rythm_record_status as enum ('draft','review','approved','rejected','archived');
create type public.rythm_risk_level as enum ('low','medium','high','critical');
create type public.rythm_approval_status as enum ('pending','approved','rejected','expired','cancelled');
create type public.rythm_meeting_status as enum ('draft','scheduled','running','completed','cancelled');
create type public.rythm_action_status as enum ('open','in_progress','blocked','completed','cancelled');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  mission text,
  vision text,
  owner_user_id uuid references auth.users(id),
  status public.rythm_record_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','executive','operator','auditor','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_code text not null,
  name text not null,
  role_title text not null,
  purpose text not null,
  authority_level smallint not null default 1 check (authority_level between 0 and 4),
  risk_ceiling public.rythm_risk_level not null default 'low',
  enabled boolean not null default false,
  specification_version text not null default '1.0',
  identity jsonb not null default '{}'::jsonb,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,agent_code)
);

create table public.company_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  memory_type text not null,
  title text not null,
  content jsonb not null,
  source_type text not null,
  source_id uuid,
  confidence numeric(5,4) check (confidence between 0 and 1),
  status public.rythm_record_status not null default 'draft',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  supersedes_id uuid references public.company_memory(id),
  created_by_user_id uuid references auth.users(id),
  created_by_agent_id uuid references public.agents(id),
  created_at timestamptz not null default now()
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  decision_key text not null,
  title text not null,
  context text not null,
  options jsonb not null default '[]'::jsonb,
  recommendation jsonb,
  rationale text,
  risk_level public.rythm_risk_level not null default 'low',
  status public.rythm_record_status not null default 'draft',
  requires_human_approval boolean not null default true,
  decided_by_user_id uuid references auth.users(id),
  proposed_by_agent_id uuid references public.agents(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,decision_key)
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_type text not null,
  subject_id uuid not null,
  title text not null,
  summary text not null,
  risk_level public.rythm_risk_level not null,
  requested_by_agent_id uuid references public.agents(id),
  approver_user_id uuid references auth.users(id),
  status public.rythm_approval_status not null default 'pending',
  conditions jsonb not null default '[]'::jsonb,
  response_note text,
  expires_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  purpose text not null,
  status public.rythm_meeting_status not null default 'draft',
  scheduled_for timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  human_join_allowed boolean not null default true,
  agenda jsonb not null default '[]'::jsonb,
  minutes jsonb,
  chair_agent_id uuid references public.agents(id),
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.meeting_participants (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  attendance_status text not null default 'invited',
  contribution jsonb,
  check ((agent_id is not null) <> (user_id is not null)),
  primary key (meeting_id,agent_id,user_id)
);

create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete set null,
  decision_id uuid references public.decisions(id) on delete set null,
  title text not null,
  description text,
  status public.rythm_action_status not null default 'open',
  priority smallint not null default 3 check (priority between 1 and 5),
  assigned_agent_id uuid references public.agents(id),
  assigned_user_id uuid references auth.users(id),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id),
  trigger_type text not null,
  input_summary text not null,
  status text not null check (status in ('queued','running','succeeded','failed','cancelled','blocked')),
  model text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(12,6) not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_type text not null check (actor_type in ('user','agent','system')),
  actor_user_id uuid references auth.users(id),
  actor_agent_id uuid references public.agents(id),
  event_type text not null,
  object_type text not null,
  object_id text,
  risk_level public.rythm_risk_level not null default 'low',
  payload jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index company_memory_org_type_idx on public.company_memory(organization_id,memory_type,created_at desc);
create index approval_requests_pending_idx on public.approval_requests(organization_id,status,created_at desc);
create index meetings_schedule_idx on public.meetings(organization_id,scheduled_for);
create index audit_events_org_created_idx on public.audit_events(organization_id,created_at desc);
create index agent_runs_org_created_idx on public.agent_runs(organization_id,created_at desc);

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid()) $$;

create or replace function public.is_org_owner(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid() and m.role='owner') $$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.agents enable row level security;
alter table public.company_memory enable row level security;
alter table public.decisions enable row level security;
alter table public.approval_requests enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.action_items enable row level security;
alter table public.agent_runs enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_member_read on public.organizations for select using (public.is_org_member(id));
create policy organizations_owner_write on public.organizations for all using (public.is_org_owner(id)) with check (public.is_org_owner(id));
create policy members_member_read on public.organization_members for select using (public.is_org_member(organization_id));
create policy members_owner_write on public.organization_members for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy agents_member_read on public.agents for select using (public.is_org_member(organization_id));
create policy agents_owner_write on public.agents for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy memory_member_read on public.company_memory for select using (public.is_org_member(organization_id));
create policy memory_owner_write on public.company_memory for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy decisions_member_read on public.decisions for select using (public.is_org_member(organization_id));
create policy decisions_owner_write on public.decisions for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy approvals_member_read on public.approval_requests for select using (public.is_org_member(organization_id));
create policy approvals_owner_write on public.approval_requests for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy meetings_member_read on public.meetings for select using (public.is_org_member(organization_id));
create policy meetings_owner_write on public.meetings for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy participants_member_read on public.meeting_participants for select using (exists(select 1 from public.meetings m where m.id=meeting_id and public.is_org_member(m.organization_id)));
create policy participants_owner_write on public.meeting_participants for all using (exists(select 1 from public.meetings m where m.id=meeting_id and public.is_org_owner(m.organization_id))) with check (exists(select 1 from public.meetings m where m.id=meeting_id and public.is_org_owner(m.organization_id)));
create policy actions_member_read on public.action_items for select using (public.is_org_member(organization_id));
create policy actions_owner_write on public.action_items for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy runs_member_read on public.agent_runs for select using (public.is_org_member(organization_id));
create policy runs_owner_write on public.agent_runs for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy audit_member_read on public.audit_events for select using (public.is_org_member(organization_id));
create policy audit_owner_insert on public.audit_events for insert with check (public.is_org_owner(organization_id));
