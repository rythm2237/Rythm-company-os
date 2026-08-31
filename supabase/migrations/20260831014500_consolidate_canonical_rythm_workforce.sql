-- RYTHM OS — Canonical workforce consolidation
-- Copies the governed Advertising Agency workforce from the Ready Company sample
-- into the canonical Company Studio organization without moving tenant-owned memory,
-- communications, billing, company-library documents, or prior benchmark history.
-- Existing canonical Agent codes (notably RYTHM-COMMS) are reconciled rather than duplicated.

begin;

create temporary table tmp_rythm_department_map (
  old_id uuid primary key,
  new_id uuid not null
) on commit drop;

create temporary table tmp_rythm_agent_map (
  old_id uuid primary key,
  new_id uuid not null,
  cloned boolean not null default false
) on commit drop;

do $$
declare
  v_source_org uuid;
  v_target_org uuid;
  v_new_id uuid;
  v_department_id uuid;
  r record;
begin
  select a.organization_id
    into v_source_org
  from public.agents a
  join public.organization_entitlements e on e.organization_id = a.organization_id
  join public.organizations o on o.id = a.organization_id
  where a.agent_code = 'GTM-STRAT-001'
    and e.product_code = 'ready_company'
    and o.status = 'approved'
  order by a.created_at desc
  limit 1;

  select o.id
    into v_target_org
  from public.organizations o
  join public.organization_entitlements e on e.organization_id = o.id
  where o.name = 'RYTHM'
    and o.status = 'approved'
    and e.product_code = 'company_studio'
    and e.status = 'active'
    and e.agent_builder_enabled = true
  order by o.created_at asc
  limit 1;

  if v_source_org is null then
    raise exception 'Advertising Ready Company source with GTM-STRAT-001 was not found';
  end if;
  if v_target_org is null then
    raise exception 'Canonical RYTHM Company Studio organization was not found';
  end if;
  if v_source_org = v_target_org then
    raise exception 'Source and target RYTHM organizations unexpectedly resolve to the same tenant';
  end if;

  -- Recreate the source department structure inside canonical RYTHM.
  for r in
    select d.*
    from public.departments d
    where d.organization_id = v_source_org
    order by d.created_at, d.id
  loop
    select d.id into v_new_id
    from public.departments d
    where d.organization_id = v_target_org
      and lower(d.name) = lower(r.name)
    order by d.created_at
    limit 1;

    if v_new_id is null then
      v_new_id := gen_random_uuid();
      insert into public.departments
      select (jsonb_populate_record(
        null::public.departments,
        to_jsonb(r)
          || jsonb_build_object(
            'id', v_new_id,
            'organization_id', v_target_org,
            'template_key', case
              when r.template_key is not null and exists (
                select 1 from public.departments x
                where x.organization_id = v_target_org and x.template_key = r.template_key
              ) then null
              else r.template_key
            end,
            'parent_department_id', null,
            'manager_agent_id', null,
            'created_at', now(),
            'updated_at', now()
          )
      )).*;
    end if;

    insert into tmp_rythm_department_map(old_id,new_id)
    values (r.id,v_new_id)
    on conflict (old_id) do update set new_id = excluded.new_id;
  end loop;

  -- Preserve nested department relationships after all department IDs are mapped.
  update public.departments target
  set parent_department_id = parent_map.new_id,
      updated_at = now()
  from public.departments source
  join tmp_rythm_department_map self_map on self_map.old_id = source.id
  join tmp_rythm_department_map parent_map on parent_map.old_id = source.parent_department_id
  where target.id = self_map.new_id
    and source.organization_id = v_source_org
    and target.organization_id = v_target_org;

  -- Map every source Agent. Existing codes are reconciled, missing codes are cloned.
  for r in
    select a.*
    from public.agents a
    where a.organization_id = v_source_org
      and a.agent_status <> 'archived'
    order by a.created_at, a.id
  loop
    select a.id into v_new_id
    from public.agents a
    where a.organization_id = v_target_org
      and a.agent_code = r.agent_code
    limit 1;

    if v_new_id is null then
      select m.new_id into v_department_id
      from tmp_rythm_department_map m
      where m.old_id = r.department_id;

      v_new_id := gen_random_uuid();
      insert into public.agents
      select (jsonb_populate_record(
        null::public.agents,
        to_jsonb(r)
          || jsonb_build_object(
            'id', v_new_id,
            'organization_id', v_target_org,
            'department_id', v_department_id,
            'reports_to_agent_id', null,
            'agent_status', case when r.enabled then 'enabled' else 'paused' end,
            'created_at', now(),
            'updated_at', now(),
            'purchased_offer_code', null
          )
      )).*;

      insert into tmp_rythm_agent_map(old_id,new_id,cloned)
      values (r.id,v_new_id,true);
    else
      insert into tmp_rythm_agent_map(old_id,new_id,cloned)
      values (r.id,v_new_id,false)
      on conflict (old_id) do update set new_id = excluded.new_id, cloned = false;
    end if;
  end loop;

  -- Restore reporting lines using mapped Agent identities.
  update public.agents target
  set reports_to_agent_id = manager_map.new_id,
      updated_at = now()
  from public.agents source
  join tmp_rythm_agent_map self_map on self_map.old_id = source.id
  join tmp_rythm_agent_map manager_map on manager_map.old_id = source.reports_to_agent_id
  where target.id = self_map.new_id
    and self_map.cloned = true
    and source.organization_id = v_source_org
    and target.organization_id = v_target_org;

  -- Carry only portable professional identity / knowledge bindings.
  -- Tenant memory, Company Library content, communications, billing, prior executions,
  -- and the invalidated benchmark run stay in the source tenant by design.
  insert into public.agent_asset_profiles
  select (jsonb_populate_record(
    null::public.agent_asset_profiles,
    to_jsonb(p)
      || jsonb_build_object(
        'agent_id', m.new_id,
        'organization_id', v_target_org,
        'certified_by', null,
        'created_at', now(),
        'updated_at', now(),
        'provenance', coalesce(p.provenance,'{}'::jsonb)
          || jsonb_build_object(
            'canonical_consolidation', true,
            'source_agent_id', p.agent_id,
            'source_organization_id', v_source_org,
            'consolidated_at', now()
          )
      )
  )).*
  from public.agent_asset_profiles p
  join tmp_rythm_agent_map m on m.old_id = p.agent_id
  where p.organization_id = v_source_org
    and m.cloned = true
  on conflict (agent_id) do nothing;

  insert into public.agent_role_foundation_bindings
    (organization_id,agent_id,role_foundation_id,foundation_version,status,bound_at)
  select v_target_org,m.new_id,b.role_foundation_id,b.foundation_version,b.status,now()
  from public.agent_role_foundation_bindings b
  join tmp_rythm_agent_map m on m.old_id = b.agent_id
  where b.organization_id = v_source_org
    and m.cloned = true
    and not exists (
      select 1 from public.agent_role_foundation_bindings x
      where x.agent_id = m.new_id and x.status = 'active'
    );

  insert into public.agent_specialization_bindings
    (organization_id,agent_id,specialization_id,status,bound_at)
  select v_target_org,m.new_id,b.specialization_id,b.status,now()
  from public.agent_specialization_bindings b
  join tmp_rythm_agent_map m on m.old_id = b.agent_id
  where b.organization_id = v_source_org
    and m.cloned = true
    and not exists (
      select 1 from public.agent_specialization_bindings x
      where x.agent_id = m.new_id
        and x.specialization_id = b.specialization_id
        and x.status = 'active'
    );

  insert into public.audit_events
    (organization_id,actor_type,event_type,object_type,risk_level,payload)
  values (
    v_target_org,
    'system',
    'workforce.canonical_consolidation_completed',
    'organization',
    'medium',
    jsonb_build_object(
      'source_organization_id',v_source_org,
      'source_product','ready_company',
      'target_product','company_studio',
      'cloned_agent_count',(select count(*) from tmp_rythm_agent_map where cloned),
      'reconciled_agent_count',(select count(*) from tmp_rythm_agent_map where not cloned),
      'department_count',(select count(*) from tmp_rythm_department_map),
      'tenant_data_copied',false,
      'portable_professional_bindings_copied',true,
      'benchmark_history_copied',false
    )
  );

  if not exists (
    select 1 from public.agents
    where organization_id = v_target_org and agent_code = 'GTM-STRAT-001'
  ) then
    raise exception 'Canonical workforce consolidation failed to provision GTM-STRAT-001';
  end if;
end $$;

commit;
