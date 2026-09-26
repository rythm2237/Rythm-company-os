create table if not exists public.agency_seo_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  crm_account_id uuid not null references public.crm_accounts(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  site_url text not null check (site_url ~ '^https?://'),
  active boolean not null default true,
  reporting_timezone text not null default 'UTC',
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, site_url)
);

create table if not exists public.agency_seo_provider_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.agency_seo_sites(id) on delete cascade,
  provider_key text not null check (provider_key in ('google_search_console','bing_webmaster')),
  integration_resource_id uuid not null references public.integration_resources(id) on delete cascade,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, provider_key)
);

create table if not exists public.agency_seo_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.agency_seo_sites(id) on delete cascade,
  checked_at timestamptz not null,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  score integer not null check (score between 0 and 100),
  counts jsonb not null default '{}'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  provider_evidence jsonb not null default '{}'::jsonb,
  intelligence_summary text,
  findings jsonb not null default '[]'::jsonb,
  guardrails jsonb not null default '[]'::jsonb,
  ai_reasoning text,
  ai_correlation_id uuid,
  ai_routing_mode text,
  ai_model text,
  ai_reasoning_error text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists agency_seo_sites_org_account_idx on public.agency_seo_sites (organization_id, crm_account_id, active);
create index if not exists agency_seo_bindings_org_site_idx on public.agency_seo_provider_bindings (organization_id, site_id);
create index if not exists agency_seo_snapshots_org_site_checked_idx on public.agency_seo_snapshots (organization_id, site_id, checked_at desc);

alter table public.agency_seo_sites enable row level security;
alter table public.agency_seo_provider_bindings enable row level security;
alter table public.agency_seo_snapshots enable row level security;

drop policy if exists agency_seo_sites_member_read on public.agency_seo_sites;
create policy agency_seo_sites_member_read on public.agency_seo_sites for select to authenticated using (is_org_member(organization_id));
drop policy if exists agency_seo_sites_member_insert on public.agency_seo_sites;
create policy agency_seo_sites_member_insert on public.agency_seo_sites for insert to authenticated with check (is_org_member(organization_id));
drop policy if exists agency_seo_sites_member_update on public.agency_seo_sites;
create policy agency_seo_sites_member_update on public.agency_seo_sites for update to authenticated using (is_org_member(organization_id)) with check (is_org_member(organization_id));
drop policy if exists agency_seo_sites_member_delete on public.agency_seo_sites;
create policy agency_seo_sites_member_delete on public.agency_seo_sites for delete to authenticated using (is_org_member(organization_id));

drop policy if exists agency_seo_bindings_member_read on public.agency_seo_provider_bindings;
create policy agency_seo_bindings_member_read on public.agency_seo_provider_bindings for select to authenticated using (is_org_member(organization_id));
drop policy if exists agency_seo_bindings_member_insert on public.agency_seo_provider_bindings;
create policy agency_seo_bindings_member_insert on public.agency_seo_provider_bindings for insert to authenticated with check (is_org_member(organization_id));
drop policy if exists agency_seo_bindings_member_update on public.agency_seo_provider_bindings;
create policy agency_seo_bindings_member_update on public.agency_seo_provider_bindings for update to authenticated using (is_org_member(organization_id)) with check (is_org_member(organization_id));
drop policy if exists agency_seo_bindings_member_delete on public.agency_seo_provider_bindings;
create policy agency_seo_bindings_member_delete on public.agency_seo_provider_bindings for delete to authenticated using (is_org_member(organization_id));

drop policy if exists agency_seo_snapshots_member_read on public.agency_seo_snapshots;
create policy agency_seo_snapshots_member_read on public.agency_seo_snapshots for select to authenticated using (is_org_member(organization_id));
drop policy if exists agency_seo_snapshots_member_insert on public.agency_seo_snapshots;
create policy agency_seo_snapshots_member_insert on public.agency_seo_snapshots for insert to authenticated with check (is_org_member(organization_id));

revoke all on public.agency_seo_sites from anon;
revoke all on public.agency_seo_provider_bindings from anon;
revoke all on public.agency_seo_snapshots from anon;
grant select, insert, update, delete on public.agency_seo_sites to authenticated;
grant select, insert, update, delete on public.agency_seo_provider_bindings to authenticated;
grant select, insert on public.agency_seo_snapshots to authenticated;
grant all on public.agency_seo_sites to service_role;
grant all on public.agency_seo_provider_bindings to service_role;
grant all on public.agency_seo_snapshots to service_role;
