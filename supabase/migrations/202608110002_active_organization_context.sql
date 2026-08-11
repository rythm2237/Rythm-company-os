-- RYTHM Commercial Day 2 — authoritative active organization context
--
-- Legacy application surfaces historically assumed one organization_members row per
-- authenticated user. Commercial multi-company support makes that assumption unsafe.
-- This migration keeps those surfaces tenant-safe by making one active Organization
-- the authoritative application context while exposing an explicit secure RPC for
-- listing/switching organizations.

alter table public.customer_profiles
  add column if not exists active_organization_id uuid references public.organizations(id) on delete set null;

create index if not exists customer_profiles_active_org_idx
  on public.customer_profiles(active_organization_id);

-- Backfill every existing authenticated member with a stable active organization.
-- Owner memberships are preferred so the founder/CEO experience remains unchanged.
insert into public.customer_profiles (
  user_id,
  onboarding_status,
  active_organization_id,
  created_at,
  updated_at
)
select
  ranked.user_id,
  'complete',
  ranked.organization_id,
  now(),
  now()
from (
  select distinct on (om.user_id)
    om.user_id,
    om.organization_id
  from public.organization_members om
  order by om.user_id, (case when om.role = 'owner' then 0 else 1 end), om.organization_id
) ranked
on conflict (user_id) do update
set active_organization_id = coalesce(
      public.customer_profiles.active_organization_id,
      excluded.active_organization_id
    ),
    updated_at = now();

create or replace function public.validate_customer_active_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_organization_id is not null and not exists (
    select 1
    from public.organization_members om
    where om.user_id = new.user_id
      and om.organization_id = new.active_organization_id
  ) then
    raise exception 'Active organization must be one of the user memberships';
  end if;
  return new;
end;
$$;

drop trigger if exists customer_profiles_active_org_guard on public.customer_profiles;
create trigger customer_profiles_active_org_guard
before insert or update of active_organization_id on public.customer_profiles
for each row execute function public.validate_customer_active_organization();

create or replace function public.list_my_organizations()
returns table (
  organization_id uuid,
  organization_name text,
  organization_slug text,
  organization_status text,
  owner_user_id uuid,
  membership_role text,
  is_active boolean
)
language sql
security definer
set search_path = public
as $$
  select
    o.id,
    o.name,
    o.slug,
    o.status,
    o.owner_user_id,
    om.role::text,
    coalesce(cp.active_organization_id = o.id, false)
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  left join public.customer_profiles cp on cp.user_id = om.user_id
  where om.user_id = auth.uid()
  order by coalesce(cp.active_organization_id = o.id, false) desc,
           (case when om.role = 'owner' then 0 else 1 end),
           o.name;
$$;

revoke all on function public.list_my_organizations() from public;
grant execute on function public.list_my_organizations() to authenticated;

create or replace function public.set_active_organization(target_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.organization_members om
    where om.user_id = v_user_id
      and om.organization_id = target_org_id
  ) then
    raise exception 'Organization membership required';
  end if;

  insert into public.customer_profiles (
    user_id,
    onboarding_status,
    active_organization_id,
    created_at,
    updated_at
  ) values (
    v_user_id,
    'complete',
    target_org_id,
    now(),
    now()
  )
  on conflict (user_id) do update
  set active_organization_id = excluded.active_organization_id,
      updated_at = now();

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
    target_org_id,
    'user',
    v_user_id,
    'organization.context_selected',
    'organization',
    target_org_id::text,
    'low',
    jsonb_build_object('organization_id', target_org_id)
  );

  return target_org_id;
end;
$$;

revoke all on function public.set_active_organization(uuid) from public;
grant execute on function public.set_active_organization(uuid) to authenticated;

-- Restrictive SELECT policy: all existing permissive organization_members policies
-- remain in place, but authenticated application reads are additionally constrained
-- to the authoritative active organization. This preserves legacy `.maybeSingle()`
-- owner/member resolution while allowing true multi-company ownership.
-- Full membership discovery must use list_my_organizations().

drop policy if exists organization_members_active_context_restrictive on public.organization_members;
create policy organization_members_active_context_restrictive
on public.organization_members
as restrictive
for select
to authenticated
using (
  organization_id = (
    select cp.active_organization_id
    from public.customer_profiles cp
    where cp.user_id = auth.uid()
  )
);

-- The active organization is an execution context, not an authorization expansion.
-- A user can only select an organization they already belong to, and all existing
-- organization-scoped RLS policies remain authoritative for business data.
