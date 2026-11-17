-- Assisted activation provisions the canonical Integration Department in the
-- same transaction. The authorized billing operator is not a tenant member.
begin;

create or replace function public.enforce_active_commercial_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_organization_id := case
    when tg_op = 'DELETE' then old.organization_id
    else new.organization_id
  end;

  if public.has_active_organization_entitlement(v_organization_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Only a nested insertion of the canonical Integration Department can
  -- continue under the platform billing actor. Direct writes and other
  -- department, agent, and builder mutations still require membership.
  if tg_table_schema = 'public' and tg_table_name = 'departments'
     and tg_op = 'INSERT' and pg_catalog.pg_trigger_depth() > 1
     and pg_catalog.to_jsonb(new)->>'template_key' = 'integration'
     and pg_catalog.to_jsonb(new)->>'name' = 'Integration Department'
     and public.is_platform_admin()
     and exists (
       select 1 from public.organization_entitlements e
       where e.organization_id = v_organization_id and e.status = 'active'
         and (e.starts_at is null or e.starts_at <= pg_catalog.now())
         and (e.ends_at is null or e.ends_at > pg_catalog.now())
     ) then
    return new;
  end if;

  raise exception 'Commercial entitlement is not active' using errcode = '42501';
end;
$$;

commit;
