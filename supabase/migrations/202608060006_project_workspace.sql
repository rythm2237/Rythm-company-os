-- Real Project Workspace foundation for governed company projects.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_code text not null,
  name text not null,
  description text not null default '',
  project_type text not null default 'product',
  status text not null default 'planning' check (status in ('idea','planning','active','blocked','on_hold','completed','cancelled')),
  stage text not null default 'discovery',
  priority smallint not null default 3 check (priority between 1 and 5),
  owner_type text not null default 'human_ceo' check (owner_type in ('human_ceo','agent','team')),
  objective text not null default '',
  scope jsonb not null default '{}'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  budget_cap_usd numeric(12,2),
  target_date date,
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, project_code)
);

create table if not exists public.project_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  resource_type text not null check (resource_type in ('github','vercel','supabase','website','admin','document','dataset','other')),
  name text not null,
  url text,
  external_reference text,
  status text not null default 'connected' check (status in ('planned','connected','degraded','disconnected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, resource_type, name)
);

create table if not exists public.project_kpis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  definition text not null,
  unit text not null default 'count',
  target_value numeric,
  current_value numeric,
  status text not null default 'not_started' check (status in ('not_started','on_track','at_risk','off_track','achieved')),
  review_frequency text not null default 'monthly',
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  sequence_no smallint not null,
  status text not null default 'planned' check (status in ('planned','in_progress','blocked','completed','cancelled')),
  target_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, sequence_no)
);

create table if not exists public.project_agents (
  project_id uuid not null references public.projects(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assignment_role text not null,
  status text not null default 'planned' check (status in ('planned','assigned','active','paused','released')),
  authority_scope jsonb not null default '{}'::jsonb,
  assigned_at timestamptz,
  primary key (project_id, agent_id)
);

alter table public.projects enable row level security;
alter table public.project_resources enable row level security;
alter table public.project_kpis enable row level security;
alter table public.project_milestones enable row level security;
alter table public.project_agents enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['projects','project_resources','project_kpis','project_milestones','project_agents'] loop
    execute format('drop policy if exists %I_member_read on public.%I', table_name, table_name);
    execute format('create policy %I_member_read on public.%I for select using (public.is_org_member(organization_id))', table_name, table_name);
    execute format('drop policy if exists %I_owner_write on public.%I', table_name, table_name);
    execute format('create policy %I_owner_write on public.%I for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id))', table_name, table_name);
  end loop;
end $$;

create index if not exists projects_org_status_idx on public.projects (organization_id, status, priority);
create index if not exists project_resources_project_idx on public.project_resources (project_id, resource_type);
create index if not exists project_kpis_project_idx on public.project_kpis (project_id, status);
create index if not exists project_milestones_project_idx on public.project_milestones (project_id, sequence_no);

-- Seed the first real company project for every organization.
insert into public.projects (
  organization_id, project_code, name, description, project_type, status, stage, priority,
  objective, scope, success_criteria, constraints, progress_percent
)
select
  organization.id,
  'AI-PR-001',
  'AI Position Roadmap',
  'Career intelligence platform that provides structured AI-career profiles, roadmaps, learning paths and governed AI assistance.',
  'saas_product',
  'planning',
  'company_onboarding',
  1,
  'Operate AI Position Roadmap as RYTHM Company OS first governed project and prepare a controlled path to public commercial release.',
  jsonb_build_object(
    'included', jsonb_build_array('product strategy','career content governance','roadmap quality','admin operations','SEO/GEO readiness','monetization readiness'),
    'excluded_initially', jsonb_build_array('uncontrolled autonomous publishing','external actions without CEO approval')
  ),
  jsonb_build_array(
    'Project resources connected and visible',
    'Minimum project agent team assigned',
    'First governed strategy cycle completed',
    'CEO-approved execution plan created'
  ),
  jsonb_build_array('Human CEO retains consequential authority','Web research requires approval','Production deployments are batch-based'),
  15
from public.organizations organization
on conflict (organization_id, project_code) do update set
  name = excluded.name,
  description = excluded.description,
  objective = excluded.objective,
  scope = excluded.scope,
  success_criteria = excluded.success_criteria,
  constraints = excluded.constraints,
  updated_at = now();

insert into public.project_resources (organization_id, project_id, resource_type, name, url, external_reference, status, metadata)
select project.organization_id, project.id, resource.resource_type, resource.name, resource.url, resource.external_reference, resource.status, resource.metadata
from public.projects project
cross join (values
  ('github','Source repository','https://github.com/rythm2237/AI-positions-roadmap','rythm2237/AI-positions-roadmap','connected','{"default_branch":"main","visibility":"public"}'::jsonb),
  ('website','Production application','https://ai-positions-roadmap.vercel.app',null,'planned','{}'::jsonb),
  ('admin','Admin Studio','https://ai-positions-roadmap-nfzlqoqaf-ytalashti-7156s-projects.vercel.app/admin',null,'connected','{}'::jsonb),
  ('vercel','Vercel deployment',null,'AI-positions-roadmap','connected','{"deployment_policy":"batch-based"}'::jsonb),
  ('supabase','Application database',null,'AI Position Roadmap Supabase','connected','{}'::jsonb)
) as resource(resource_type,name,url,external_reference,status,metadata)
where project.project_code = 'AI-PR-001'
on conflict (project_id, resource_type, name) do update set
  url = excluded.url,
  external_reference = excluded.external_reference,
  status = excluded.status,
  metadata = excluded.metadata;

insert into public.project_kpis (organization_id, project_id, name, definition, unit, target_value, current_value, status, review_frequency)
select project.organization_id, project.id, kpi.name, kpi.definition, kpi.unit, kpi.target_value, kpi.current_value, kpi.status, kpi.review_frequency
from public.projects project
cross join (values
  ('Project onboarding completion','Percent of Company OS onboarding gates completed','percent',100::numeric,15::numeric,'on_track','weekly'),
  ('Governed strategy cycles','Completed CEO-governed strategy cycles','count',1::numeric,0::numeric,'not_started','weekly'),
  ('Critical release blockers','Open critical blockers before release','count',0::numeric,null::numeric,'not_started','weekly'),
  ('Career content quality','Career records passing content quality review','percent',95::numeric,null::numeric,'not_started','monthly')
) as kpi(name,definition,unit,target_value,current_value,status,review_frequency)
where project.project_code = 'AI-PR-001'
on conflict (project_id, name) do nothing;

insert into public.project_milestones (organization_id, project_id, title, description, sequence_no, status)
select project.organization_id, project.id, milestone.title, milestone.description, milestone.sequence_no, milestone.status
from public.projects project
cross join (values
  ('Workspace established','Create the governed project record, resources, KPI register and milestones.',1::smallint,'in_progress'),
  ('Internal sources connected','Confirm repository, deployment, database and operating documents.',2::smallint,'planned'),
  ('Minimum agent team assigned','Assign Orchestrator, Strategy, Operations, Research and Risk agents.',3::smallint,'planned'),
  ('First strategy cycle','Run internal-first analysis and create a CEO decision draft.',4::smallint,'planned'),
  ('Execution plan approved','Approve prioritized actions, owners, budget and release gates.',5::smallint,'planned')
) as milestone(title,description,sequence_no,status)
where project.project_code = 'AI-PR-001'
on conflict (project_id, sequence_no) do nothing;

insert into public.project_agents (project_id, agent_id, organization_id, assignment_role, status, authority_scope)
select project.id, agent.id, project.organization_id,
  case agent.agent_code
    when 'B-001' then 'Executive project orchestrator'
    when 'A-101' then 'Strategy lead'
    when 'A-102' then 'Operations planning'
    when 'A-104' then 'Risk and compliance review'
    when 'A-105' then 'Internal research and evidence'
  end,
  case when agent.agent_code = 'A-101' then 'assigned' else 'planned' end,
  jsonb_build_object('advisory_only', true, 'external_actions', false, 'web_requires_approval', true)
from public.projects project
join public.agents agent on agent.organization_id = project.organization_id
where project.project_code = 'AI-PR-001'
  and agent.agent_code in ('B-001','A-101','A-102','A-104','A-105')
on conflict (project_id, agent_id) do update set
  assignment_role = excluded.assignment_role,
  authority_scope = excluded.authority_scope;
