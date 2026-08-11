-- RYTHM Company OS — Commercial Day 2: Customer / Multi-Tenant Foundation
-- Target: B2B Paid Public Beta 2026-08-18
--
-- This migration is additive. It does not weaken existing organization RLS or
-- Human CEO governance. It adds customer profile, commercial entitlement,
-- support-access architecture, and an authenticated organization provisioning RPC.

create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company_name text,
  country_code text,
  preferred_language text not null default 'English',
  onboarding_status text not null default 'profile_pending'
    check (onboarding_status in ('profile_pending','company_pending','complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;

drop policy if exists customer_profiles_select_own on public.customer_profiles;
create policy customer_profiles_select_own
on public.customer_profiles for select
to authenticated
using (user_id = auth.uid());

drop policy if exists customer_profiles_insert_own on public.customer_profiles;
create policy customer_profiles_insert_own
on public.customer_profiles for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists customer_profiles_update_own on public.customer_profiles;
create policy customer_profiles_update_own
on public.customer_profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.organization_entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_code text not null
    check (product_code in ('ready_company','custom_company','company_studio')),
  plan_code text not null default 'public_beta',
  status text not null default 'pending'
    check (status in ('pending','active','past_due','suspended','cancelled','expired')),
  starts_at timestamptz,
  renews_at timestamptz,
  ends_at timestamptz,
  currency text not null default 'EUR',
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  billing_interval text not null default 'month'
    check (billing_interval in ('month','year','one_time','manual')),
  ai_usage_policy text not null default 'metered',
  ai_budget_limit numeric(12,2) not null default 25 check (ai_budget_limit >= 0),
  company_template_access boolean not null default false,
  company_builder_enabled boolean not null default false,
  agent_builder_enabled boolean not null default false,
  agent_create_enabled boolean not null default false,
  agent_clone_enabled boolean not null default false,
  agent_archive_enabled boolean not null default false,
  agent_structure_edit_enabled boolean not null default false,
  workflow_edit_enabled boolean not null default false,
  max_active_agents integer not null default 10 check (max_active_agents >= 0),
  max_departments integer not null default 10 check (max_departments >= 0),
  max_projects integer not null default 25 check (max_projects >= 0),
  support_tier text not null default 'beta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create index if not exists organization_entitlements_product_idx
  on public.organization_entitlements(product_code, status);

alter table public.organization_entitlements enable row level security;

drop policy if exists organization_entitlements_member_read on public.organization_entitlements;
create policy organization_entitlements_member_read
on public.organization_entitlements for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = organization_entitlements.organization_id
      and om.user_id = auth.uid()
  )
);

-- Commercial entitlement mutation is intentionally not granted to normal customers.
-- During Public Beta it is changed through trusted commercial/admin operations.

create table if not exists public.organization_support_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  support_user_id uuid not null references auth.users(id) on delete cascade,
  access_role text not null default 'support_read'
    check (access_role in ('support_read','support_operator','support_admin')),
  reason text not null,
  granted_by_user_id uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists organization_support_access_org_idx
  on public.organization_support_access(organization_id, revoked_at, expires_at);

alter table public.organization_support_access enable row level security;

drop policy if exists organization_support_access_owner_read on public.organization_support_access;
create policy organization_support_access_owner_read
on public.organization_support_access for select
to authenticated
using (public.is_org_owner(organization_id));

-- No customer INSERT/UPDATE/DELETE policy is created. Support elevation must use a
-- separately governed trusted/admin path and never become an implicit tenant bypass.

create or replace function public.provision_customer_organization(
  target_company_name text,
  target_product_code text default 'company_studio',
  target_plan_code text default 'public_beta'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := gen_random_uuid();
  v_company_name text := trim(coalesce(target_company_name,''));
  v_product_code text := trim(coalesce(target_product_code,''));
  v_plan_code text := trim(coalesce(target_plan_code,'public_beta'));
  v_slug_base text;
  v_slug text;
  v_suffix integer := 0;
  v_base_price numeric(12,2);
  v_company_template_access boolean := false;
  v_company_builder_enabled boolean := false;
  v_agent_builder_enabled boolean := false;
  v_agent_create_enabled boolean := false;
  v_agent_clone_enabled boolean := false;
  v_agent_archive_enabled boolean := false;
  v_agent_structure_edit_enabled boolean := false;
  v_workflow_edit_enabled boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if length(v_company_name) < 2 or length(v_company_name) > 120 then
    raise exception 'Company name must contain 2 to 120 characters';
  end if;

  if v_product_code not in ('ready_company','custom_company','company_studio') then
    raise exception 'Unsupported commercial product';
  end if;

  if length(v_plan_code) < 2 or length(v_plan_code) > 50 then
    raise exception 'Invalid plan code';
  end if;

  v_slug_base := lower(regexp_replace(v_company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);
  if v_slug_base = '' then
    v_slug_base := 'company';
  end if;
  v_slug_base := left(v_slug_base, 48);
  v_slug := v_slug_base;

  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := left(v_slug_base, 42) || '-' || v_suffix::text;
  end loop;

  case v_product_code
    when 'ready_company' then
      v_base_price := 249;
      v_company_template_access := true;
    when 'custom_company' then
      v_base_price := 399;
      v_company_template_access := true;
    when 'company_studio' then
      v_base_price := 699;
      v_company_template_access := true;
      v_company_builder_enabled := true;
      v_agent_builder_enabled := true;
      v_agent_create_enabled := true;
      v_agent_clone_enabled := true;
      v_agent_archive_enabled := true;
      v_agent_structure_edit_enabled := true;
      v_workflow_edit_enabled := true;
  end case;

  insert into public.customer_profiles (
    user_id,
    company_name,
    onboarding_status,
    updated_at
  ) values (
    v_user_id,
    v_company_name,
    'complete',
    now()
  )
  on conflict (user_id) do update
  set company_name = excluded.company_name,
      onboarding_status = 'complete',
      updated_at = now();

  insert into public.organizations (
    id,
    name,
    slug,
    status,
    owner_user_id
  ) values (
    v_org_id,
    v_company_name,
    v_slug,
    'active',
    v_user_id
  );

  insert into public.organization_members (
    organization_id,
    user_id,
    role
  ) values (
    v_org_id,
    v_user_id,
    'owner'
  );

  insert into public.organization_entitlements (
    organization_id,
    product_code,
    plan_code,
    status,
    starts_at,
    currency,
    base_price,
    billing_interval,
    ai_usage_policy,
    ai_budget_limit,
    company_template_access,
    company_builder_enabled,
    agent_builder_enabled,
    agent_create_enabled,
    agent_clone_enabled,
    agent_archive_enabled,
    agent_structure_edit_enabled,
    workflow_edit_enabled,
    max_active_agents,
    max_departments,
    max_projects,
    support_tier
  ) values (
    v_org_id,
    v_product_code,
    v_plan_code,
    'pending',
    now(),
    'EUR',
    v_base_price,
    'month',
    'metered',
    25,
    v_company_template_access,
    v_company_builder_enabled,
    v_agent_builder_enabled,
    v_agent_create_enabled,
    v_agent_clone_enabled,
    v_agent_archive_enabled,
    v_agent_structure_edit_enabled,
    v_workflow_edit_enabled,
    case when v_product_code = 'company_studio' then 50 else 10 end,
    case when v_product_code = 'company_studio' then 25 else 10 end,
    case when v_product_code = 'company_studio' then 100 else 25 end,
    'beta'
  );

  insert into public.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    event_type,
    object_type,
    object_id,
    risk_level,
    payload
  ) values (
    v_org_id,
    'user',
    v_user_id,
    'organization.customer_provisioned',
    'organization',
    v_org_id::text,
    'low',
    jsonb_build_object(
      'product_code', v_product_code,
      'plan_code', v_plan_code,
      'entitlement_status', 'pending',
      'human_authority', 'Human CEO / Owner',
      'external_actions', false
    )
  );

  return v_org_id;
end;
$$;

revoke all on function public.provision_customer_organization(text,text,text) from public;
grant execute on function public.provision_customer_organization(text,text,text) to authenticated;

create or replace function public.resolve_organization_entitlement(target_org_id uuid)
returns table (
  organization_id uuid,
  product_code text,
  plan_code text,
  status text,
  ai_budget_limit numeric,
  company_template_access boolean,
  company_builder_enabled boolean,
  agent_builder_enabled boolean,
  agent_create_enabled boolean,
  agent_clone_enabled boolean,
  agent_archive_enabled boolean,
  agent_structure_edit_enabled boolean,
  workflow_edit_enabled boolean,
  max_active_agents integer,
  max_departments integer,
  max_projects integer,
  support_tier text
)
language sql
security invoker
set search_path = public
as $$
  select
    e.organization_id,
    e.product_code,
    e.plan_code,
    e.status,
    e.ai_budget_limit,
    e.company_template_access,
    e.company_builder_enabled,
    e.agent_builder_enabled,
    e.agent_create_enabled,
    e.agent_clone_enabled,
    e.agent_archive_enabled,
    e.agent_structure_edit_enabled,
    e.workflow_edit_enabled,
    e.max_active_agents,
    e.max_departments,
    e.max_projects,
    e.support_tier
  from public.organization_entitlements e
  where e.organization_id = target_org_id
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = target_org_id
        and om.user_id = auth.uid()
    );
$$;

grant execute on function public.resolve_organization_entitlement(uuid) to authenticated;

-- Existing organizations pre-date the commercial layer. Give each one a non-billable
-- legacy beta entitlement so entitlement resolution is total after this migration.
insert into public.organization_entitlements (
  organization_id,
  product_code,
  plan_code,
  status,
  starts_at,
  currency,
  base_price,
  billing_interval,
  ai_usage_policy,
  ai_budget_limit,
  company_template_access,
  company_builder_enabled,
  agent_builder_enabled,
  agent_create_enabled,
  agent_clone_enabled,
  agent_archive_enabled,
  agent_structure_edit_enabled,
  workflow_edit_enabled,
  max_active_agents,
  max_departments,
  max_projects,
  support_tier
)
select
  o.id,
  'company_studio',
  'legacy_founder_beta',
  'active',
  now(),
  'EUR',
  0,
  'manual',
  'metered',
  25,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  100,
  50,
  250,
  'founder'
from public.organizations o
where not exists (
  select 1 from public.organization_entitlements e
  where e.organization_id = o.id
);
