-- Run against the target Supabase database after the Phase 0 migration.
-- All fixture changes are contained in this transaction and rolled back.
begin;

create temporary table phase0_context as
select
  first_value(om.user_id) over (order by exists(select 1 from public.agents a where a.organization_id=om.organization_id) desc, om.created_at) as user_a,
  first_value(om.organization_id) over (order by exists(select 1 from public.agents a where a.organization_id=om.organization_id) desc, om.created_at) as org_a,
  om.organization_id as candidate_org_b
from public.organization_members om;

delete from phase0_context where candidate_org_b=(select org_a from phase0_context limit 1);
grant select on phase0_context to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select user_a::text from phase0_context limit 1),true);
select set_config('request.jwt.claim.role','authenticated',true);

do $phase0$
declare
  v_org_a uuid := (select org_a from phase0_context limit 1);
  v_org_b uuid := (select candidate_org_b from phase0_context limit 1);
  v_count integer;
  v_rows integer;
begin
  select count(*) into v_count from public.organizations where id=v_org_a;
  if v_count<>1 then raise exception 'PHASE0_RLS_SAME_TENANT_READ_FAILED'; end if;

  select count(*) into v_count from public.organizations where id=v_org_b;
  if v_count<>0 then raise exception 'PHASE0_RLS_CROSS_TENANT_READ_LEAK'; end if;

  update public.organizations set name=name where id=v_org_b;
  get diagnostics v_rows=row_count;
  if v_rows<>0 then raise exception 'PHASE0_RLS_CROSS_TENANT_MUTATION_LEAK'; end if;

  begin
    perform public.set_active_organization(v_org_b);
    raise exception 'PHASE0_ACTIVE_ORG_SWITCH_LEAK';
  exception when others then
    if sqlerrm='PHASE0_ACTIVE_ORG_SWITCH_LEAK' then raise; end if;
  end;
end $phase0$;

do $phase0$
declare
  v_org_a uuid := (select org_a from phase0_context limit 1);
  v_decision uuid;
  v_approval uuid;
  v_action uuid;
begin
  select d.id into v_decision
  from public.decisions d
  where d.organization_id=v_org_a
    and d.status='approved'
    and (d.requires_human_approval or d.risk_level in ('high','critical'))
    and not exists(select 1 from public.action_items ai where ai.organization_id=d.organization_id and ai.decision_id=d.id)
  order by d.created_at
  limit 1;
  if v_decision is null then raise exception 'PHASE0_APPROVAL_TEST_FIXTURE_MISSING'; end if;

  select a.id into v_approval
  from public.approval_requests a
  where a.organization_id=v_org_a and a.subject_type='decision' and a.subject_id=v_decision
  order by a.created_at desc limit 1;
  if v_approval is null then raise exception 'PHASE0_APPROVAL_TEST_FIXTURE_MISSING'; end if;

  update public.approval_requests set status='pending',resolved_at=null where id=v_approval and organization_id=v_org_a;
  begin
    perform public.create_governed_action_from_decision(v_decision);
    raise exception 'PHASE0_PENDING_APPROVAL_EXECUTED';
  exception when others then
    if sqlerrm='PHASE0_PENDING_APPROVAL_EXECUTED' then raise; end if;
  end;

  update public.approval_requests set status='rejected',resolved_at=now() where id=v_approval and organization_id=v_org_a;
  begin
    perform public.create_governed_action_from_decision(v_decision);
    raise exception 'PHASE0_REJECTED_APPROVAL_EXECUTED';
  exception when others then
    if sqlerrm='PHASE0_REJECTED_APPROVAL_EXECUTED' then raise; end if;
  end;

  update public.approval_requests set status='approved',resolved_at=now() where id=v_approval and organization_id=v_org_a;
  v_action := public.create_governed_action_from_decision(v_decision);
  if v_action is null then raise exception 'PHASE0_APPROVED_HANDOFF_FAILED'; end if;
end $phase0$;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);

do $phase0$
declare v_count integer;
begin
  select count(*) into v_count from public.organizations;
  if v_count<>0 then raise exception 'PHASE0_ANON_ORGANIZATION_ACCESS_LEAK'; end if;
  select count(*) into v_count from public.agents;
  if v_count<>0 then raise exception 'PHASE0_ANON_AGENT_ACCESS_LEAK'; end if;
  if has_function_privilege('anon','public.create_agent_v2(uuid,text,text,text,text,text,text,uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)','EXECUTE') then raise exception 'PHASE0_ANON_CREATE_AGENT_GRANT'; end if;
  if has_function_privilege('anon','public.search_company_knowledge_for_meeting_v1(uuid,text,integer)','EXECUTE') then raise exception 'PHASE0_ANON_MEETING_KNOWLEDGE_GRANT'; end if;
  if has_function_privilege('anon','public.search_company_knowledge_for_agent_v1(uuid,uuid,text,integer)','EXECUTE') then raise exception 'PHASE0_ANON_AGENT_KNOWLEDGE_GRANT'; end if;
  if has_function_privilege('anon','public.verify_agent_mastery_v1(uuid)','EXECUTE') then raise exception 'PHASE0_ANON_MASTERY_GRANT'; end if;
end $phase0$;

rollback;
