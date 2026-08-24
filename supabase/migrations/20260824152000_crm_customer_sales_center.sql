-- Tenant CRM for each independent RYTHM company.
-- This domain is intentionally separate from RYTHM platform billing customers.

create table if not exists public.crm_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  lifecycle_stage text not null default 'lead' check (lifecycle_stage in ('lead','prospect','customer','former_customer','partner','vendor')),
  account_type text not null default 'company' check (account_type in ('company','individual')),
  website_url text,
  industry text,
  country_code text,
  billing_email text,
  phone text,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_agent_id uuid references public.agents(id) on delete set null,
  source text not null default 'manual',
  external_id text,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, name)
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete cascade,
  first_name text not null,
  last_name text,
  job_title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  lifecycle_stage text not null default 'lead' check (lifecycle_stage in ('lead','prospect','customer','inactive')),
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_agent_id uuid references public.agents(id) on delete set null,
  source text not null default 'manual',
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  sequence_no integer not null,
  probability numeric(5,2) not null default 0 check (probability between 0 and 100),
  is_closed boolean not null default false,
  is_won boolean not null default false,
  created_at timestamptz not null default now(),
  unique(organization_id, code),
  unique(organization_id, sequence_no)
);

create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete set null,
  primary_contact_id uuid references public.crm_contacts(id) on delete set null,
  name text not null,
  stage_code text not null default 'qualified',
  status text not null default 'open' check (status in ('open','won','lost','cancelled')),
  value numeric(14,2) not null default 0 check (value >= 0),
  currency text not null default 'EUR',
  probability numeric(5,2) not null default 25 check (probability between 0 and 100),
  expected_close_date date,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_agent_id uuid references public.agents(id) on delete set null,
  source text not null default 'manual',
  next_step text,
  lost_reason text,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete cascade,
  opportunity_id uuid references public.crm_opportunities(id) on delete cascade,
  activity_type text not null check (activity_type in ('note','email','call','meeting','task','proposal','stage_change')),
  subject text not null,
  body text,
  occurred_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_agent_id uuid references public.agents(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_accounts_org_stage on public.crm_accounts(organization_id,lifecycle_stage);
create index if not exists idx_crm_contacts_org_account on public.crm_contacts(organization_id,account_id);
create index if not exists idx_crm_opportunities_org_stage on public.crm_opportunities(organization_id,stage_code,status);
create index if not exists idx_crm_activities_org_time on public.crm_activities(organization_id,occurred_at desc);

alter table public.crm_accounts enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_opportunities enable row level security;
alter table public.crm_activities enable row level security;

create policy crm_accounts_member_access on public.crm_accounts for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=crm_accounts.organization_id and m.user_id=auth.uid() and m.membership_status='active'))
with check (exists (select 1 from public.organization_members m where m.organization_id=crm_accounts.organization_id and m.user_id=auth.uid() and m.membership_status='active'));
create policy crm_contacts_member_access on public.crm_contacts for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=crm_contacts.organization_id and m.user_id=auth.uid() and m.membership_status='active'))
with check (exists (select 1 from public.organization_members m where m.organization_id=crm_contacts.organization_id and m.user_id=auth.uid() and m.membership_status='active'));
create policy crm_stages_member_access on public.crm_pipeline_stages for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=crm_pipeline_stages.organization_id and m.user_id=auth.uid() and m.membership_status='active'))
with check (exists (select 1 from public.organization_members m where m.organization_id=crm_pipeline_stages.organization_id and m.user_id=auth.uid() and m.membership_status='active'));
create policy crm_opportunities_member_access on public.crm_opportunities for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=crm_opportunities.organization_id and m.user_id=auth.uid() and m.membership_status='active'))
with check (exists (select 1 from public.organization_members m where m.organization_id=crm_opportunities.organization_id and m.user_id=auth.uid() and m.membership_status='active'));
create policy crm_activities_member_access on public.crm_activities for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=crm_activities.organization_id and m.user_id=auth.uid() and m.membership_status='active'))
with check (exists (select 1 from public.organization_members m where m.organization_id=crm_activities.organization_id and m.user_id=auth.uid() and m.membership_status='active'));

-- Seed default sales stages for existing organizations; future orgs are also protected by UI bootstrap.
insert into public.crm_pipeline_stages(organization_id,code,name,sequence_no,probability,is_closed,is_won)
select o.id, s.code, s.name, s.sequence_no, s.probability, s.is_closed, s.is_won
from public.organizations o
cross join (values
 ('lead','Lead',10,10::numeric,false,false),
 ('qualified','Qualified',20,25::numeric,false,false),
 ('proposal','Proposal',30,50::numeric,false,false),
 ('negotiation','Negotiation',40,75::numeric,false,false),
 ('won','Won',50,100::numeric,true,true),
 ('lost','Lost',60,0::numeric,true,false)
) as s(code,name,sequence_no,probability,is_closed,is_won)
on conflict (organization_id,code) do nothing;
