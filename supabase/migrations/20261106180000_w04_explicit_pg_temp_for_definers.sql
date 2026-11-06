-- W04 defense in depth: pin pg_temp after trusted schemas for EXACTLY the
-- 52 reviewed SECURITY DEFINER functions (one may now be trigger-only).
-- Authenticated and anon have database TEMP privileges. Without explicit
-- pg_temp placement it can be implicitly searched before normal schemas for
-- unqualified relations/types, even in SECURITY DEFINER routines.
-- Preserve every existing trusted search_path schema/order, only append
-- pg_temp LAST. For intentionally empty search_path, use pg_catalog, pg_temp.
-- No signatures, bodies, grants, owners, data, or RLS policies are changed.
-- Idempotent, staging verified before any production authorization.
begin;
do $w04_pgtemp$
declare
  funcs regprocedure[] := array[
  'public.agent_operational_readiness_v1(uuid)'::regprocedure,
  'public.apply_company_template_integration_profile_v1(uuid,uuid,text)'::regprocedure,
  'public.approve_agent_position_contract_v1(uuid)'::regprocedure,
  'public.build_company_from_draft(uuid)'::regprocedure,
  'public.clone_agent_v1(uuid)'::regprocedure,
  'public.complete_agent_knowledge_provisioning_v1(uuid,text)'::regprocedure,
  'public.confirm_company_bootstrap_v1(uuid,text)'::regprocedure,
  'public.consume_api_rate_limit(text,integer,integer)'::regprocedure,
  'public.create_agent_provisioning_v3(uuid,text,text,text,text,text,text,text,text,text[],uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
  'public.create_agent_v1(uuid,text,text,text,uuid,uuid,smallint,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
  'public.create_agent_v2(uuid,text,text,text,text,text,text,uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
  'public.create_agent_work_assignment_v1(uuid,text,text,text,jsonb,text,boolean)'::regprocedure,
  'public.create_company_bootstrap_run_v1(uuid,uuid)'::regprocedure,
  'public.fail_agent_knowledge_provisioning_v1(uuid,text)'::regprocedure,
  'public.get_security_posture(uuid)'::regprocedure,
  'public.has_active_organization_entitlement(uuid)'::regprocedure,
  'public.is_org_member(uuid)'::regprocedure,
  'public.is_org_owner(uuid)'::regprocedure,
  'public.is_platform_admin()'::regprocedure,
  'public.list_my_organizations()'::regprocedure,
  'public.nail_2nya_admin_create_appointment(uuid,timestamp with time zone,text,text,text,text,text,text)'::regprocedure,
  'public.nail_2nya_available_dates(uuid,date,integer)'::regprocedure,
  'public.nail_2nya_available_slots(date,uuid)'::regprocedure,
  'public.nail_2nya_cancel_booking(uuid,text)'::regprocedure,
  'public.nail_2nya_claim_admin(text)'::regprocedure,
  'public.nail_2nya_create_booking(uuid,timestamp with time zone,text,text,text,text,text)'::regprocedure,
  'public.nail_2nya_create_contact_message(text,text,text,text)'::regprocedure,
  'public.nail_2nya_get_booking(uuid,text)'::regprocedure,
  'public.nail_2nya_is_admin()'::regprocedure,
  'public.nail_2nya_subscribe_customer_push(uuid,text,text,text,text)'::regprocedure,
  'public.organization_agent_operational_readiness_v1(uuid)'::regprocedure,
  'public.platform_confirm_company_payment_v1(uuid,text,numeric,text,timestamp with time zone,timestamp with time zone)'::regprocedure,
  'public.platform_customer_detail_v1(uuid)'::regprocedure,
  'public.platform_customer_list_v1(text,text,text,integer)'::regprocedure,
  'public.promote_agent_autonomy_v1(uuid,integer,text)'::regprocedure,
  'public.provision_agent_template_v1(uuid,text,text)'::regprocedure,
  'public.provision_commercial_company_v1(text,text,text)'::regprocedure,
  'public.provision_company_template(uuid,text,text)'::regprocedure,
  'public.provision_company_template_v2(uuid,text,text)'::regprocedure,
  'public.provision_default_integration_department_on_entitlement_v1()'::regprocedure,
  'public.reconnect_agent_company_knowledge_v1(uuid)'::regprocedure,
  'public.refresh_agent_foundation_update_status(uuid)'::regprocedure,
  'public.sanitize_agent_company_data_for_transfer(uuid)'::regprocedure,
  'public.sanitize_agent_for_transfer(uuid)'::regprocedure,
  'public.search_company_knowledge_for_agent_v1(uuid,uuid,text,integer)'::regprocedure,
  'public.search_company_knowledge_for_meeting_v1(uuid,text,integer)'::regprocedure,
  'public.set_active_organization(uuid)'::regprocedure,
  'public.set_agent_status_v1(uuid,text)'::regprocedure,
  'public.start_software_project_blueprint_v1(uuid,text)'::regprocedure,
  'public.update_agent_v1(uuid,text,text,text,uuid,uuid,smallint,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
  'public.validate_agent_work_outcome_v1(uuid,boolean,integer,text)'::regprocedure,
  'public.verify_agent_mastery_v1(uuid)'::regprocedure
  ];
  target regprocedure;
  old_path text;
  new_path text;
  found_definer boolean;
  patched integer := 0;
begin
  if cardinality(funcs)<>52 then
    raise exception 'W04 expected exactly 52 reviewed security-definer signatures';
  end if;
  foreach target in array funcs loop
    select p.prosecdef,substring(c from length('search_path=')+1)
      into found_definer,old_path
    from pg_catalog.pg_proc p
    left join lateral unnest(p.proconfig) c on c like 'search_path=%'
    where p.oid=target::oid;
    if found_definer is distinct from true or old_path is null then
      raise exception 'W04 function missing SECURITY DEFINER or pinned search_path: %',target;
    end if;
    if old_path ~ '(^|,)[[:space:]]*pg_temp([[:space:]]*,|[[:space:]]*$)' then
      continue;
    end if;
    if old_path in ('""','') then
      new_path:='pg_catalog, pg_temp';
    else
      new_path:=old_path||', pg_temp';
    end if;
    execute pg_catalog.format('ALTER FUNCTION %s SET search_path = %s',target,new_path);
    patched:=patched+1;
  end loop;
  -- Notices are diagnostic only. Do not modify the catalog outside the 52.
  raise notice 'W04 explicit pg_temp last: % functions updated',patched;
end;
$w04_pgtemp$;
commit;
