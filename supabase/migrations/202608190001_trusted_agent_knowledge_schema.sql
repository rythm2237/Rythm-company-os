begin;

-- RYTHM Company OS — Trusted Agent Knowledge Bootstrap
-- Global professional knowledge is platform-managed and tenant-readable only.
-- Company knowledge remains separate in public.company_knowledge.

create table if not exists public.knowledge_source_registry (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  publisher text not null,
  base_domain text not null,
  canonical_url text not null unique,
  source_type text not null check (source_type in ('official_documentation','official_training','standards_body','government','professional_association','university','primary_reference')),
  authority_level text not null check (authority_level in ('primary','high','medium')),
  allowed_role_families text[] not null default '{}',
  allowed_topics text[] not null default '{}',
  jurisdiction text,
  freshness_class text not null default 'slow_changing' check (freshness_class in ('stable','slow_changing','moderate','fast_changing','current_verification_required')),
  enabled boolean not null default true,
  notes text,
  last_verified_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_knowledge_blueprints (
  id uuid primary key default gen_random_uuid(),
  role_family text not null,
  canonical_role text,
  version text not null,
  required_domains jsonb not null default '[]'::jsonb,
  required_competencies jsonb not null default '[]'::jsonb,
  required_methods jsonb not null default '[]'::jsonb,
  required_qa_rules jsonb not null default '[]'::jsonb,
  recommended_sources jsonb not null default '[]'::jsonb,
  risk_classification text not null default 'standard',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists role_knowledge_blueprints_identity_idx
  on public.role_knowledge_blueprints(role_family, coalesce(canonical_role,''), version);

create table if not exists public.role_foundations (
  id uuid primary key default gen_random_uuid(),
  role_family text not null,
  canonical_role text,
  version text not null,
  title text not null,
  summary text not null,
  knowledge_content jsonb not null default '[]'::jsonb,
  competency_tags text[] not null default '{}',
  methodology_tags text[] not null default '{}',
  qa_rules jsonb not null default '[]'::jsonb,
  risk_classification text not null default 'standard',
  source_ids uuid[] not null default '{}',
  freshness_class text not null default 'slow_changing' check (freshness_class in ('stable','slow_changing','moderate','fast_changing','current_verification_required')),
  acquired_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  next_review_at timestamptz,
  expires_at timestamptz,
  status text not null default 'draft' check (status in ('draft','validated','active','deprecated')),
  supersedes_id uuid references public.role_foundations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists role_foundations_identity_idx
  on public.role_foundations(role_family, coalesce(canonical_role,''), version);
create index if not exists role_foundations_resolution_idx
  on public.role_foundations(role_family,status,last_verified_at desc);

create table if not exists public.role_specializations (
  id uuid primary key default gen_random_uuid(),
  role_family text not null,
  specialization_key text not null,
  title text not null,
  version text not null,
  knowledge_content jsonb not null default '[]'::jsonb,
  source_ids uuid[] not null default '{}',
  qa_rules jsonb not null default '[]'::jsonb,
  freshness_class text not null default 'slow_changing' check (freshness_class in ('stable','slow_changing','moderate','fast_changing','current_verification_required')),
  last_verified_at timestamptz not null default now(),
  next_review_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists role_specializations_identity_idx
  on public.role_specializations(role_family,specialization_key,version);

create table if not exists public.agent_role_foundation_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  role_foundation_id uuid not null references public.role_foundations(id),
  foundation_version text not null,
  status text not null default 'active' check (status in ('active','superseded','detached')),
  bound_at timestamptz not null default now()
);
create unique index if not exists agent_active_foundation_binding_idx
  on public.agent_role_foundation_bindings(agent_id) where status='active';
create index if not exists agent_foundation_binding_org_idx
  on public.agent_role_foundation_bindings(organization_id,agent_id);

create table if not exists public.agent_specialization_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  specialization_id uuid not null references public.role_specializations(id),
  status text not null default 'active' check (status in ('active','detached')),
  bound_at timestamptz not null default now()
);
create unique index if not exists agent_specialization_binding_unique_idx
  on public.agent_specialization_bindings(agent_id,specialization_id) where status='active';
create index if not exists agent_specialization_binding_org_idx
  on public.agent_specialization_bindings(organization_id,agent_id);

create table if not exists public.agent_knowledge_provisioning_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  event_type text not null,
  role_family text,
  canonical_role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_knowledge_events_org_created_idx
  on public.agent_knowledge_provisioning_events(organization_id,created_at desc);

alter table public.agents add column if not exists raw_role_title text;
alter table public.agents add column if not exists canonical_role text;
alter table public.agents add column if not exists role_family text;
alter table public.agents add column if not exists specializations text[] not null default '{}';
alter table public.agents add column if not exists provisioning_status text not null default 'ready';
alter table public.agents add column if not exists provisioning_error text;
alter table public.agents add column if not exists provisioning_started_at timestamptz;
alter table public.agents add column if not exists provisioned_at timestamptz;
alter table public.agents add column if not exists last_knowledge_review_at timestamptz;
alter table public.agents add column if not exists foundation_update_available boolean not null default false;

do $$ begin
  alter table public.agents add constraint agents_provisioning_status_check
    check (provisioning_status in ('draft','provisioning','ready','failed'));
exception when duplicate_object then null; end $$;

alter table public.agent_memories add column if not exists learning_scope text not null default 'company_specific_memory';
do $$ begin
  alter table public.agent_memories add constraint agent_memories_learning_scope_check
    check (learning_scope in ('transferable_general_learning','company_specific_memory'));
exception when duplicate_object then null; end $$;

alter table public.agent_artifacts add column if not exists qa_status text;
alter table public.agent_artifacts add column if not exists qa_issues jsonb not null default '[]'::jsonb;
alter table public.agent_artifacts add column if not exists qa_version text;
alter table public.agent_artifacts add column if not exists qa_corrected boolean not null default false;
do $$ begin
  alter table public.agent_artifacts add constraint agent_artifacts_qa_status_check
    check (qa_status is null or qa_status in ('not_applicable','passed','corrected','warning','failed'));
exception when duplicate_object then null; end $$;

alter table public.knowledge_source_registry enable row level security;
alter table public.role_knowledge_blueprints enable row level security;
alter table public.role_foundations enable row level security;
alter table public.role_specializations enable row level security;
alter table public.agent_role_foundation_bindings enable row level security;
alter table public.agent_specialization_bindings enable row level security;
alter table public.agent_knowledge_provisioning_events enable row level security;

drop policy if exists knowledge_source_registry_authenticated_read on public.knowledge_source_registry;
create policy knowledge_source_registry_authenticated_read on public.knowledge_source_registry
  for select to authenticated using (enabled=true);
drop policy if exists role_blueprints_authenticated_read on public.role_knowledge_blueprints;
create policy role_blueprints_authenticated_read on public.role_knowledge_blueprints
  for select to authenticated using (active=true);
drop policy if exists role_foundations_authenticated_read on public.role_foundations;
create policy role_foundations_authenticated_read on public.role_foundations
  for select to authenticated using (status in ('validated','active','deprecated'));
drop policy if exists role_specializations_authenticated_read on public.role_specializations;
create policy role_specializations_authenticated_read on public.role_specializations
  for select to authenticated using (active=true);

drop policy if exists agent_foundation_bindings_member_read on public.agent_role_foundation_bindings;
create policy agent_foundation_bindings_member_read on public.agent_role_foundation_bindings
  for select using (public.is_org_member(organization_id));
drop policy if exists agent_foundation_bindings_owner_write on public.agent_role_foundation_bindings;
create policy agent_foundation_bindings_owner_write on public.agent_role_foundation_bindings
  for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

drop policy if exists agent_specialization_bindings_member_read on public.agent_specialization_bindings;
create policy agent_specialization_bindings_member_read on public.agent_specialization_bindings
  for select using (public.is_org_member(organization_id));
drop policy if exists agent_specialization_bindings_owner_write on public.agent_specialization_bindings;
create policy agent_specialization_bindings_owner_write on public.agent_specialization_bindings
  for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

drop policy if exists agent_knowledge_events_owner_read on public.agent_knowledge_provisioning_events;
create policy agent_knowledge_events_owner_read on public.agent_knowledge_provisioning_events
  for select using (public.is_org_owner(organization_id));
drop policy if exists agent_knowledge_events_owner_insert on public.agent_knowledge_provisioning_events;
create policy agent_knowledge_events_owner_insert on public.agent_knowledge_provisioning_events
  for insert with check (public.is_org_owner(organization_id));

revoke insert,update,delete,truncate on public.knowledge_source_registry from anon,authenticated;
revoke insert,update,delete,truncate on public.role_knowledge_blueprints from anon,authenticated;
revoke insert,update,delete,truncate on public.role_foundations from anon,authenticated;
revoke insert,update,delete,truncate on public.role_specializations from anon,authenticated;
grant select on public.knowledge_source_registry,public.role_knowledge_blueprints,public.role_foundations,public.role_specializations to authenticated;

commit;
