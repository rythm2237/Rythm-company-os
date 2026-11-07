-- W04 cross-tenant negative tests using disposable W02 fixtures.
-- STAGING ONLY. Before running: deploy W04 migration and execute
-- W02 fixture setup from test/w02-isolated-multitenant-fixtures.
-- Afterward execute the W02 teardown. Never run on production.
-- Uses a transaction; the sole added draft is rolled back.
begin;
set local statement_timeout = '5000ms';

do $w04$
declare
  v_b_org uuid;
  v_b_owner uuid;
begin
  select id into v_b_org from public.organizations
    where slug='w02-synthetic-b-staging-v1';
  select id into v_b_owner from auth.users
    where email='w02-b-owner@example.test';
  if v_b_org is null or v_b_owner is null
    or not exists(select 1 from public.organizations
      where slug='w02-synthetic-a-staging-v1')
    or not exists(select 1 from auth.users
      where email='w02-a-owner@example.test')
  then
    raise exception 'W02 disposable staging fixtures missing; stop without attempting real data';
  end if;

  -- W03 intentionally quarantined synthetic memberships; enable only the
  -- required fixtures within this transaction. Final ROLLBACK restores them.
  update public.organization_members set membership_status='active'
  where organization_id=(select id from public.organizations
    where slug='w02-synthetic-a-staging-v1')
    and user_id=(select id from auth.users where email='w02-a-owner@example.test');
  if not found then raise exception 'Missing synthetic A owner membership'; end if;
  update public.organization_members set membership_status='active'
  where organization_id=v_b_org
    and user_id=(select id from auth.users where email='w02-b-member@example.test');
  if not found then raise exception 'Missing synthetic B member membership'; end if;

  insert into public.company_builder_drafts(
    id,organization_id,created_by_user_id,company_name,
    company_type,business_model,company_size_intent
  )
  values(
    '00000000-0000-4000-8000-000000000405'::uuid,
    v_b_org,v_b_owner,'W04 SYNTHETIC','test','test','small'
  );
end;
$w04$;

-- Bind the synthetic A owner's identity; prevent using a privileged
-- caller for the actual negative RPC.
select set_config('request.jwt.claim.sub',
  (select id::text from auth.users where email='w02-a-owner@example.test'),true);
set local role authenticated;

do $w04$
declare
  v_b_org uuid;
  v_a_org uuid;
  v_failure text;
begin
  select id into v_b_org from public.organizations
    where slug='w02-synthetic-b-staging-v1';
  select id into v_a_org from public.organizations
    where slug='w02-synthetic-a-staging-v1';
  if auth.uid() is null then
    raise exception 'Authenticated synthetic caller not in effect';
  end if;
  if not public.is_org_owner(v_a_org) then
    raise exception 'Synthetic A owner setup invalid';
  end if;
  if public.is_org_owner(v_b_org) or public.is_org_member(v_b_org) then
    raise exception 'Cross-tenant owner/member helper erroneously passed';
  end if;

  begin
    perform public.build_company_from_draft(
      '00000000-0000-4000-8000-000000000405'::uuid);
    raise exception 'Foreign builder draft was executed by A owner';
  exception when others then
    get stacked diagnostics v_failure = message_text;
    if v_failure <> 'Organization owner authority required' then
      raise exception 'Unexpected cross-tenant builder RPC result: %',v_failure;
    end if;
  end;

  -- This must reject a B org before resolving agent identifier.
  begin
    perform * from public.search_company_knowledge_for_agent_v1(
      v_b_org,'00000000-0000-4000-8000-000000000406'::uuid,'',2);
    raise exception 'Foreign knowledge search was executed by A owner';
  exception when others then
    get stacked diagnostics v_failure = message_text;
    if v_failure <> 'not_authorized' then
      raise exception 'Unexpected cross-tenant knowledge RPC result: %',v_failure;
    end if;
  end;
end;
$w04$;

reset role;
-- Clear A's synthetic JWT claim before postgres-only fixture setup;
-- RESET ROLE alone does not reset request.jwt.claim.sub.
select set_config('request.jwt.claim.sub','',true);

-- Synthetic, transaction-scoped revoked-membership entitlement regression.
-- The W02 organization entitlement is pending; simulate ACTIVE only in this
-- rollback-only transaction to distinguish false from the actual status check.
do $w04$
declare v_b_org uuid; v_b_member uuid;
begin
  select id into v_b_org from public.organizations
    where slug='w02-synthetic-b-staging-v1';
  select id into v_b_member from auth.users
    where email='w02-b-member@example.test';
  if v_b_org is null or v_b_member is null then
    raise exception 'Missing synthetic B member fixture';
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id=v_b_org and user_id=v_b_member
      and membership_status='active'
  ) then
    raise exception 'B member must be active in W02 fixture before test';
  end if;
  update public.organization_entitlements
    set status='active'
    where organization_id=v_b_org and status='pending';
  if not found then
    raise exception 'B entitlement fixture must be pending before test';
  end if;
  update public.organization_members
    set membership_status='inactive'
    where organization_id=v_b_org and user_id=v_b_member;
end;
$w04$;

select set_config('request.jwt.claim.sub',
  (select id::text from auth.users where email='w02-b-member@example.test'),true);
set local role authenticated;
do $w04$
declare v_b_org uuid;
begin
  select id into v_b_org from public.organizations
    where slug='w02-synthetic-b-staging-v1';
  if public.is_org_member(v_b_org) then
    raise exception 'Inactive synthetic member passed member check';
  end if;
  if public.has_active_organization_entitlement(v_b_org) then
    raise exception 'Inactive synthetic member leaked active entitlement';
  end if;
end;
$w04$;
reset role;
rollback;
