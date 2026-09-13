-- RYTHM Company OS — default Integration Department baseline
--
-- Goal:
--   * every existing organization receives one Integration Department;
--   * every future organization receives the same baseline automatically;
--   * provisioning is idempotent;
--   * Phase 3 Company Auto-Bootstrap keeps its deliberate "empty structure" apply boundary.
--
-- The bootstrap compatibility hooks temporarily remove the baseline only while an otherwise-empty
-- company is being bootstrapped, then restore it after apply/cancel/failure/rollback.

begin;

create or replace function public.ensure_default_integration_department_v1(target_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department_id uuid;
begin
  if target_org_id is null then
    raise exception 'Organization id is required';
  end if;

  -- Reuse an existing canonical/matching department instead of creating a duplicate.
  select d.id
    into v_department_id
  from public.departments d
  where d.organization_id = target_org_id
    and (
      d.template_key = 'integration'
      or lower(trim(d.name)) = 'integration department'
    )
  order by (d.template_key = 'integration') desc, d.created_at asc, d.id asc
  limit 1;

  if v_department_id is not null then
    return v_department_id;
  end if;

  insert into public.departments (
    organization_id,
    template_key,
    name,
    description
  ) values (
    target_org_id,
    'integration',
    'Integration Department',
    'Owns governed business-system integrations, connector coordination, data exchange and cross-system execution boundaries.'
  )
  returning id into v_department_id;

  return v_department_id;
end;
$$;

revoke all on function public.ensure_default_integration_department_v1(uuid) from public, anon, authenticated;
grant execute on function public.ensure_default_integration_department_v1(uuid) to service_role;

create or replace function public.provision_default_integration_department_on_org_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_default_integration_department_v1(new.id);
  return new;
end;
$$;

revoke all on function public.provision_default_integration_department_on_org_v1() from public, anon, authenticated;

drop trigger if exists organizations_default_integration_department_v1 on public.organizations;
create trigger organizations_default_integration_department_v1
after insert on public.organizations
for each row
execute function public.provision_default_integration_department_on_org_v1();

-- Phase 3 Auto-Bootstrap V1 intentionally requires an empty organization before applying the
-- Human-CEO-confirmed proposal. If the only structure is our system baseline, suspend that baseline
-- when a bootstrap run starts. It is restored by the lifecycle trigger below.
create or replace function public.suspend_default_integration_department_for_bootstrap_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_integration_department_id uuid;
begin
  select d.id
    into v_integration_department_id
  from public.departments d
  where d.organization_id = new.organization_id
    and d.template_key = 'integration'
  order by d.created_at asc, d.id asc
  limit 1;

  if v_integration_department_id is null then
    return new;
  end if;

  -- Never delete the baseline from a company that already has a real structure or dependencies.
  if exists (
      select 1 from public.departments d
      where d.organization_id = new.organization_id
        and d.id <> v_integration_department_id
    )
    or exists (
      select 1 from public.agents a
      where a.organization_id = new.organization_id
    )
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = new.organization_id
        and m.department_id = v_integration_department_id
    )
    or exists (
      select 1 from public.departments child
      where child.parent_department_id = v_integration_department_id
    ) then
    return new;
  end if;

  delete from public.departments
  where id = v_integration_department_id
    and organization_id = new.organization_id;

  return new;
end;
$$;

revoke all on function public.suspend_default_integration_department_for_bootstrap_v1() from public, anon, authenticated;

drop trigger if exists company_bootstrap_suspend_default_integration_v1 on public.company_bootstrap_runs;
create trigger company_bootstrap_suspend_default_integration_v1
after insert on public.company_bootstrap_runs
for each row
execute function public.suspend_default_integration_department_for_bootstrap_v1();

create or replace function public.restore_default_integration_department_after_bootstrap_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('applied', 'failed', 'cancelled')
     or (old.status = 'applied' and new.status = 'confirmed') then
    perform public.ensure_default_integration_department_v1(new.organization_id);
  end if;
  return new;
end;
$$;

revoke all on function public.restore_default_integration_department_after_bootstrap_v1() from public, anon, authenticated;

drop trigger if exists company_bootstrap_restore_default_integration_v1 on public.company_bootstrap_runs;
create trigger company_bootstrap_restore_default_integration_v1
after update of status on public.company_bootstrap_runs
for each row
when (old.status is distinct from new.status)
execute function public.restore_default_integration_department_after_bootstrap_v1();

-- Backfill all existing companies. The helper is idempotent and reuses matching departments.
do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.ensure_default_integration_department_v1(v_org.id);
  end loop;
end;
$$;

commit;
