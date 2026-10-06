-- Allow customer organization shells to be reserved with a pending commercial
-- entitlement without weakening the active-entitlement guard on governed
-- department mutations.
--
-- New organizations are created before their pending entitlement row exists.
-- The organization INSERT trigger previously tried to create the Integration
-- Department immediately, which hit departments_active_entitlement_guard and
-- aborted the whole provisioning transaction with:
--   Commercial entitlement is not active
--
-- Defer Integration Department creation until the commercial entitlement
-- becomes active. Existing active organizations are reconciled below.

begin;

create or replace function public.provision_default_integration_department_on_org_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.organization_entitlements e
    where e.organization_id = new.id
      and e.status = 'active'
  ) then
    perform public.ensure_default_integration_department_v1(new.id);
  end if;

  return new;
end;
$$;

create or replace function public.provision_default_integration_department_on_entitlement_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.ensure_default_integration_department_v1(new.organization_id);
  end if;

  return new;
end;
$$;

drop trigger if exists organization_entitlement_provision_integration_department_v1
  on public.organization_entitlements;

create trigger organization_entitlement_provision_integration_department_v1
after insert or update of status
on public.organization_entitlements
for each row
execute function public.provision_default_integration_department_on_entitlement_v1();

do $$
declare
  v_org_id uuid;
begin
  for v_org_id in
    select e.organization_id
    from public.organization_entitlements e
    where e.status = 'active'
  loop
    perform public.ensure_default_integration_department_v1(v_org_id);
  end loop;
end;
$$;

commit;
