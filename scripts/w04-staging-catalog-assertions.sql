-- W04 POST-migration assertions. Execute only on isolated staging as an
-- authorized database owner; not on production. Read-only catalog checks.
do $w04$
declare
  v_path text[];
  v_signature text;
begin
  foreach v_signature in array array[
    'public.project_approval_decision_group_v1(text,text)',
    'public.project_approval_is_delegatable_v1(text,text,text,text,jsonb,text,text,text)'
  ] loop
    select p.proconfig into v_path
    from pg_proc p where p.oid = v_signature::regprocedure;
    if v_path is null or not ('search_path=pg_catalog, pg_temp' = any(v_path)) then
      raise exception 'W04 fixed search_path missing: %', v_signature;
    end if;
  end loop;

  if has_function_privilege('anon',
      'public.provision_default_integration_department_on_entitlement_v1()',
      'EXECUTE')
    or has_function_privilege('authenticated',
      'public.provision_default_integration_department_on_entitlement_v1()',
      'EXECUTE') then
    raise exception 'Internal entitlement trigger remains callable by app identities';
  end if;
  if not has_function_privilege('service_role',
      'public.provision_default_integration_department_on_entitlement_v1()',
      'EXECUTE') then
    raise exception 'Service role lost the entitlement trigger grant';
  end if;

  -- Public booking/contact exceptions must survive the hardening.
  foreach v_signature in array array[
    'public.nail_2nya_available_dates(uuid,date,integer)',
    'public.nail_2nya_available_slots(date,uuid)',
    'public.nail_2nya_cancel_booking(uuid,text)',
    'public.nail_2nya_create_booking(uuid,timestamp with time zone,text,text,text,text,text)',
    'public.nail_2nya_create_contact_message(text,text,text,text)',
    'public.nail_2nya_get_booking(uuid,text)',
    'public.nail_2nya_subscribe_customer_push(uuid,text,text,text,text)'
  ] loop
    if not has_function_privilege('anon',v_signature,'EXECUTE') then
      raise exception 'Public booking exception lost EXECUTE: %', v_signature;
    end if;
  end loop;
end;
$w04$;
