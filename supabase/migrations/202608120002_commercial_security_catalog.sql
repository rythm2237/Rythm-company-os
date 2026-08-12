-- RYTHM Company OS — Commercial security boundary and configurable offer catalog
--
-- 1. Pending, suspended, expired, cancelled and future-dated entitlements are not
--    commercial authorization.
-- 2. Commercial mutations are enforced below the UI and Server Action layers.
-- 3. Public offer names and prices are data, not hard-coded page content.

create table if not exists public.commercial_offers (
  offer_code text primary key,
  entitlement_product_code text
    check (entitlement_product_code is null or entitlement_product_code in (
      'ready_company', 'custom_company', 'company_studio'
    )),
  name text not null,
  category text not null
    check (category in ('subscription', 'enterprise', 'service')),
  status text not null default 'public'
    check (status in ('draft', 'public', 'retired')),
  audience text not null,
  summary text not null,
  price_label text not null,
  currency text,
  base_price numeric(12,2) check (base_price is null or base_price >= 0),
  setup_price numeric(12,2) check (setup_price is null or setup_price >= 0),
  billing_interval text
    check (billing_interval is null or billing_interval in ('month', 'year', 'one_time', 'manual')),
  contact_sales boolean not null default false,
  self_serve boolean not null default false,
  cta_label text not null,
  cta_href text not null,
  features jsonb not null default '[]'::jsonb
    check (jsonb_typeof(features) = 'array'),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.commercial_offers enable row level security;

drop policy if exists commercial_offers_public_read on public.commercial_offers;
create policy commercial_offers_public_read
on public.commercial_offers for select
to anon, authenticated
using (status = 'public');

-- Catalog mutation is intentionally reserved for trusted commercial/admin operations.
revoke insert, update, delete on public.commercial_offers from anon, authenticated;
grant select on public.commercial_offers to anon, authenticated;

insert into public.commercial_offers (
  offer_code, entitlement_product_code, name, category, status, audience,
  summary, price_label, currency, base_price, setup_price, billing_interval,
  contact_sales, self_serve, cta_label, cta_href, features, sort_order
) values
  (
    'ready_ai_company', 'ready_company', 'Ready AI Company', 'subscription', 'public',
    'Teams that want a governed AI company without designing the structure themselves.',
    'Launch a pre-built company with a defined AI workforce, operating model, and Human CEO controls.',
    '€249 / month + AI usage', 'EUR', 249, null, 'month', false, true,
    'Choose a Ready Company', '/signup?product=ready_company',
    '["Pre-built company structure","Specialized AI Agent workforce","Human CEO workspace","Meetings, decisions, approvals and actions","Audit and runtime budget controls"]'::jsonb,
    10
  ),
  (
    'custom_ai_company', 'company_studio', 'Custom AI Company', 'subscription', 'public',
    'Businesses that need ongoing control over departments, Agents, responsibilities, and governance.',
    'Design, build, modify, and govern your own AI company with the included Company Studio.',
    '€699 / month + AI usage', 'EUR', 699, null, 'month', false, true,
    'Build a Custom AI Company', '/signup?product=company_studio',
    '["Company Studio included","Company and Agent builders","Editable reporting structure","Reusable RYTHM templates","Governance configuration within plan limits"]'::jsonb,
    20
  ),
  (
    'enterprise_ai_workforce', null, 'Enterprise AI Workforce', 'enterprise', 'public',
    'Larger organizations that require controlled rollout, integration planning, and enterprise governance.',
    'Deploy a governed AI workforce across business functions with an implementation and controls designed for enterprise needs.',
    'Contact Sales', null, null, null, 'manual', true, false,
    'Discuss Enterprise Beta', '/contact?offer=enterprise_ai_workforce',
    '["Enterprise discovery and rollout plan","Advanced access and governance design","Integration architecture","Custom capacity and support model","Controlled beta onboarding"]'::jsonb,
    30
  ),
  (
    'assisted_build', null, 'RYTHM Assisted Build', 'service', 'public',
    'Customers who want RYTHM to design and configure their company before handover.',
    'Add expert-assisted company design, Agent definition, workflow configuration, and onboarding to an eligible subscription.',
    'From €2,500 implementation', 'EUR', null, 2500, 'one_time', true, false,
    'Request Assisted Build', '/contact?offer=assisted_build',
    '["Company design workshop","Department and Agent configuration","Governance and workflow setup","Structured handover","Material later changes quoted separately"]'::jsonb,
    40
  )
on conflict (offer_code) do update set
  entitlement_product_code = excluded.entitlement_product_code,
  name = excluded.name,
  category = excluded.category,
  status = excluded.status,
  audience = excluded.audience,
  summary = excluded.summary,
  price_label = excluded.price_label,
  currency = excluded.currency,
  base_price = excluded.base_price,
  setup_price = excluded.setup_price,
  billing_interval = excluded.billing_interval,
  contact_sales = excluded.contact_sales,
  self_serve = excluded.self_serve,
  cta_label = excluded.cta_label,
  cta_href = excluded.cta_href,
  features = excluded.features,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function public.has_active_organization_entitlement(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_entitlements e
    join public.organization_members om
      on om.organization_id = e.organization_id
     and om.user_id = auth.uid()
    where e.organization_id = target_org_id
      and e.status = 'active'
      and (e.starts_at is null or e.starts_at <= now())
      and (e.ends_at is null or e.ends_at > now())
  );
$$;

revoke all on function public.has_active_organization_entitlement(uuid) from public;
grant execute on function public.has_active_organization_entitlement(uuid) to authenticated;

create or replace function public.enforce_active_commercial_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  -- Migrations and trusted service-role operations do not carry an end-user auth.uid().
  -- Customer-originated writes always do and must resolve an active entitlement.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_organization_id := case
    when tg_op = 'DELETE' then old.organization_id
    else new.organization_id
  end;

  if not public.has_active_organization_entitlement(v_organization_id) then
    raise exception 'Commercial entitlement is not active'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.enforce_active_commercial_entitlement() from public;

drop trigger if exists agents_active_entitlement_guard on public.agents;
create trigger agents_active_entitlement_guard
before insert or update or delete on public.agents
for each row execute function public.enforce_active_commercial_entitlement();

drop trigger if exists departments_active_entitlement_guard on public.departments;
create trigger departments_active_entitlement_guard
before insert or update or delete on public.departments
for each row execute function public.enforce_active_commercial_entitlement();

drop trigger if exists company_builder_drafts_active_entitlement_guard on public.company_builder_drafts;
create trigger company_builder_drafts_active_entitlement_guard
before insert or update or delete on public.company_builder_drafts
for each row execute function public.enforce_active_commercial_entitlement();

drop policy if exists company_builder_drafts_owner_insert on public.company_builder_drafts;
create policy company_builder_drafts_owner_insert
on public.company_builder_drafts for insert to authenticated
with check (
  public.is_org_owner(organization_id)
  and public.has_active_organization_entitlement(organization_id)
);

drop policy if exists company_builder_drafts_owner_update on public.company_builder_drafts;
create policy company_builder_drafts_owner_update
on public.company_builder_drafts for update to authenticated
using (
  public.is_org_owner(organization_id)
  and public.has_active_organization_entitlement(organization_id)
)
with check (
  public.is_org_owner(organization_id)
  and public.has_active_organization_entitlement(organization_id)
);

comment on function public.has_active_organization_entitlement(uuid) is
  'Authoritative customer entitlement check: membership, active status and validity window.';
comment on table public.commercial_offers is
  'Configurable public commercial catalog. Entitlement product codes remain backward compatible.';
