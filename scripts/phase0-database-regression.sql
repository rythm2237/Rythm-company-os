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
  v_user_a uuid := (select user_a from phase0_context limit 1);
  v_pending_decision uuid := gen_random_uuid();
  v_rejected_decision uuid := gen_random_uuid();
  v_approved_decision uuid := gen_random_uuid();
  v_pending_approval uuid := gen_random_uuid();
  v_rejected_approval uuid := gen_random_uuid();
  v_approved_approval uuid := gen_random_uuid();
  v_action uuid;
begin
  insert into public.decisions(id,organization_id,decision_key,title,context,risk_level,status,requires_human_approval)
  values
    (v_pending_decision,v_org_a,'phase0-pending-'||v_pending_decision,'Phase 0 pending approval','Rollback-only security fixture','high','draft',true),
    (v_rejected_decision,v_org_a,'phase0-rejected-'||v_rejected_decision,'Phase 0 rejected approval','Rollback-only security fixture','high','draft',true),
    (v_approved_decision,v_org_a,'phase0-approved-'||v_approved_decision,'Phase 0 approved approval','Rollback-only security fixture','high','draft',true);

  insert into public.approval_requests(id,organization_id,subject_type,subject_id,title,summary,risk_level,status)
  values
    (v_pending_approval,v_org_a,'decision',v_pending_decision,'Phase 0 pending approval','Rollback-only security fixture','high','pending'),
    (v_rejected_approval,v_org_a,'decision',v_rejected_decision,'Phase 0 rejected approval','Rollback-only security fixture','high','pending'),
    (v_approved_approval,v_org_a,'decision',v_approved_decision,'Phase 0 approved approval','Rollback-only security fixture','high','pending');

  begin
    update public.decisions set status='approved',decided_by_user_id=v_user_a,decided_at=now(),rationale='Phase 0 pending approval test' where id=v_pending_decision;
    raise exception 'PHASE0_PENDING_APPROVAL_EXECUTED';
  exception when others then
    if sqlerrm='PHASE0_PENDING_APPROVAL_EXECUTED' then raise; end if;
  end;

  update public.approval_requests set status='rejected',approver_user_id=v_user_a,response_note='Phase 0 rejected fixture',resolved_at=now() where id=v_rejected_approval;
  begin
    update public.decisions set status='approved',decided_by_user_id=v_user_a,decided_at=now(),rationale='Phase 0 rejected approval test' where id=v_rejected_decision;
    raise exception 'PHASE0_REJECTED_APPROVAL_EXECUTED';
  exception when others then
    if sqlerrm='PHASE0_REJECTED_APPROVAL_EXECUTED' then raise; end if;
  end;

  update public.approval_requests set status='approved',approver_user_id=v_user_a,response_note='Phase 0 approved fixture',resolved_at=now() where id=v_approved_approval;
  update public.decisions set status='approved',decided_by_user_id=v_user_a,decided_at=now(),rationale='Phase 0 approved approval test' where id=v_approved_decision;
  select id into v_action from public.action_items where organization_id=v_org_a and decision_id=v_approved_decision;
  if v_action is null then raise exception 'PHASE0_APPROVED_HANDOFF_FAILED'; end if;
end $phase0$;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);

do $phase0$
declare v_count integer;
begin
  begin
    select count(*) into v_count from public.organizations;
    if v_count<>0 then raise exception 'PHASE0_ANON_ORGANIZATION_ACCESS_LEAK'; end if;
  exception when insufficient_privilege then
    null; -- A relation/policy dependency denial is an acceptable anonymous-access result.
  end;
  begin
    select count(*) into v_count from public.agents;
    if v_count<>0 then raise exception 'PHASE0_ANON_AGENT_ACCESS_LEAK'; end if;
  exception when insufficient_privilege then
    null;
  end;
  if has_function_privilege('anon','public.create_agent_v2(uuid,text,text,text,text,text,text,uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)','EXECUTE') then raise exception 'PHASE0_ANON_CREATE_AGENT_GRANT'; end if;
  if has_function_privilege('anon','public.search_company_knowledge_for_meeting_v1(uuid,text,integer)','EXECUTE') then raise exception 'PHASE0_ANON_MEETING_KNOWLEDGE_GRANT'; end if;
  if has_function_privilege('anon','public.search_company_knowledge_for_agent_v1(uuid,uuid,text,integer)','EXECUTE') then raise exception 'PHASE0_ANON_AGENT_KNOWLEDGE_GRANT'; end if;
  if has_function_privilege('anon','public.verify_agent_mastery_v1(uuid)','EXECUTE') then raise exception 'PHASE0_ANON_MASTERY_GRANT'; end if;
end $phase0$;

rollback;
