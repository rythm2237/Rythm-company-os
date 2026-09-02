begin;

-- RYTHM OS — operational Agent readiness model
-- A professional title or benchmark is not proof that an Agent can own a position.
-- Operational readiness is earned from governed, verified work evidence.

create table if not exists public.agent_position_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  contract_version integer not null default 1 check (contract_version > 0),
  position_title text not null,
  mission text not null,
  responsibilities jsonb not null default '[]'::jsonb check (jsonb_typeof(responsibilities)='array'),
  task_boundaries jsonb not null default '[]'::jsonb check (jsonb_typeof(task_boundaries)='array'),
  success_metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(success_metrics)='array'),
  escalation_triggers jsonb not null default '[]'::jsonb check (jsonb_typeof(escalation_triggers)='array'),
  required_capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(required_capabilities)='array'),
  minimum_verified_assignments integer not null default 5 check (minimum_verified_assignments between 1 and 100),
  minimum_success_rate numeric(5,4) not null default 0.8000 check (minimum_success_rate between 0 and 1),
  status text not null default 'draft' check (status in ('draft','approved','superseded','revoked')),
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agent_id,contract_version)
);

create unique index if not exists agent_position_contract_active_unique
on public.agent_position_contracts(agent_id)
where status='approved';
create index if not exists agent_position_contract_org_idx
on public.agent_position_contracts(organization_id,status,updated_at desc);

create table if not exists public.agent_autonomy_profiles (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  current_level smallint not null default 1 check (current_level between 0 and 4),
  maximum_level smallint not null default 4 check (maximum_level between 0 and 4),
  status text not null default 'supervised' check (status in ('locked','supervised','conditional','approved','suspended')),
  allowed_risk_levels text[] not null default array['low']::text[],
  allowed_task_types text[] not null default '{}'::text[],
  requires_approval_for_external_actions boolean not null default true,
  last_reviewed_at timestamptz,
  last_reviewed_by_user_id uuid references auth.users(id) on delete set null,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_level <= maximum_level)
);
create index if not exists agent_autonomy_profiles_org_idx
on public.agent_autonomy_profiles(organization_id,current_level,status);

create table if not exists public.agent_work_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  position_contract_id uuid not null references public.agent_position_contracts(id) on delete restrict,
  title text not null,
  task_brief text not null,
  task_type text not null default 'general',
  acceptance_criteria jsonb not null default '[]'::jsonb check (jsonb_typeof(acceptance_criteria)='array'),
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','restricted')),
  external_side_effect_expected boolean not null default false,
  required_autonomy_level smallint not null default 1 check (required_autonomy_level between 0 and 4),
  approval_mode text not null default 'human_review' check (approval_mode in ('human_review','human_approval','autonomous')),
  status text not null default 'assigned' check (status in ('assigned','planning','in_progress','waiting_approval','blocked','completed','failed','cancelled')),
  outcome_status text not null default 'pending' check (outcome_status in ('pending','successful','mixed','failed','invalidated')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending_review','verified','rejected')),
  quality_score smallint check (quality_score between 0 and 100),
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  tool_execution_request_id uuid references public.tool_execution_requests(id) on delete set null,
  ai_request_audit_event_id bigint references public.audit_events(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(agent_run_id,tool_execution_request_id,ai_request_audit_event_id) <= 1)
);
create index if not exists agent_work_assignments_agent_idx
on public.agent_work_assignments(agent_id,created_at desc);
create index if not exists agent_work_assignments_org_status_idx
on public.agent_work_assignments(organization_id,status,created_at desc);

create table if not exists public.agent_work_assignment_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assignment_id uuid not null references public.agent_work_assignments(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('user','agent','system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_agent_id uuid references public.agents(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((actor_type='user' and actor_user_id is not null and actor_agent_id is null)
    or (actor_type='agent' and actor_agent_id is not null and actor_user_id is null)
    or (actor_type='system' and actor_user_id is null and actor_agent_id is null))
);
create index if not exists agent_work_assignment_events_assignment_idx
on public.agent_work_assignment_events(assignment_id,created_at desc);

alter table public.agent_position_contracts enable row level security;
alter table public.agent_autonomy_profiles enable row level security;
alter table public.agent_work_assignments enable row level security;
alter table public.agent_work_assignment_events enable row level security;

create policy agent_position_contracts_member_read on public.agent_position_contracts
for select to authenticated using (public.is_org_member(organization_id));
create policy agent_autonomy_profiles_member_read on public.agent_autonomy_profiles
for select to authenticated using (public.is_org_member(organization_id));
create policy agent_work_assignments_member_read on public.agent_work_assignments
for select to authenticated using (public.is_org_member(organization_id));
create policy agent_work_assignment_events_member_read on public.agent_work_assignment_events
for select to authenticated using (public.is_org_member(organization_id));

revoke all on public.agent_position_contracts, public.agent_autonomy_profiles,
  public.agent_work_assignments, public.agent_work_assignment_events from public,anon,authenticated;
grant select on public.agent_position_contracts, public.agent_autonomy_profiles,
  public.agent_work_assignments, public.agent_work_assignment_events to authenticated;
grant all on public.agent_position_contracts, public.agent_autonomy_profiles,
  public.agent_work_assignments, public.agent_work_assignment_events to service_role;

create or replace function public.prevent_agent_work_evidence_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'Agent work evidence is append-only';
end; $$;
revoke all on function public.prevent_agent_work_evidence_mutation() from public,anon,authenticated;
drop trigger if exists agent_work_assignment_events_append_only on public.agent_work_assignment_events;
create trigger agent_work_assignment_events_append_only before update or delete on public.agent_work_assignment_events
for each row execute function public.prevent_agent_work_evidence_mutation();

-- Seed truthful draft contracts from the existing Agent specification. Human approval is still required.
insert into public.agent_position_contracts(
  organization_id,agent_id,position_title,mission,responsibilities,task_boundaries,
  success_metrics,escalation_triggers,required_capabilities,status
)
select
  a.organization_id,
  a.id,
  a.role_title,
  a.purpose,
  case when jsonb_typeof(to_jsonb(a)->'responsibilities')='array' and jsonb_array_length(to_jsonb(a)->'responsibilities')>0 then to_jsonb(a)->'responsibilities'
    else jsonb_build_array('Deliver the approved role mission within defined authority and evidence requirements.') end,
  jsonb_build_array(
    'Do not make unverified factual claims.',
    'Do not exceed granted tools, scopes, risk ceiling or approved autonomy.',
    'Do not treat professional knowledge or synthetic benchmarks as real-world work experience.',
    'Escalate decisions requiring human authority.'
  ),
  case when jsonb_typeof(to_jsonb(a)->'success_criteria')='array' and jsonb_array_length(to_jsonb(a)->'success_criteria')>0 then to_jsonb(a)->'success_criteria'
    else jsonb_build_array('Meet assignment acceptance criteria with traceable evidence.','Escalate uncertainty and remain within governance boundaries.') end,
  jsonb_build_array(
    'Missing evidence or required context',
    'Requested action exceeds permission, risk or autonomy boundary',
    'Irreversible, financial, legal, safety or external communication impact',
    'Execution result cannot be independently verified'
  ),
  case when jsonb_typeof(to_jsonb(a)->'execution_capabilities')='array' then to_jsonb(a)->'execution_capabilities' else '[]'::jsonb end,
  'draft'
from public.agents a
where a.agent_status <> 'archived'
on conflict(agent_id,contract_version) do nothing;

insert into public.agent_autonomy_profiles(
  agent_id,organization_id,current_level,maximum_level,status,allowed_risk_levels,
  requires_approval_for_external_actions,review_reason
)
select
  a.id,a.organization_id,
  case when a.agent_code='T-001' then 0 else 1 end,
  case when a.agent_code='T-001' then 1 else 4 end,
  case when a.agent_code='T-001' then 'locked' else 'supervised' end,
  array['low']::text[],true,
  'Initial fail-closed profile. Higher autonomy requires verified operational evidence.'
from public.agents a
where a.agent_status <> 'archived'
on conflict(agent_id) do nothing;

create or replace function public.ensure_agent_operating_model_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.agent_position_contracts(
    organization_id,agent_id,position_title,mission,responsibilities,task_boundaries,
    success_metrics,escalation_triggers,required_capabilities,status
  ) values (
    new.organization_id,new.id,new.role_title,new.purpose,
    case when jsonb_typeof(to_jsonb(new)->'responsibilities')='array' and jsonb_array_length(to_jsonb(new)->'responsibilities')>0 then to_jsonb(new)->'responsibilities'
      else jsonb_build_array('Deliver the approved role mission within defined authority and evidence requirements.') end,
    '["Do not exceed granted authority.","Escalate material uncertainty.","Synthetic evaluation is not operational experience."]'::jsonb,
    case when jsonb_typeof(to_jsonb(new)->'success_criteria')='array' and jsonb_array_length(to_jsonb(new)->'success_criteria')>0 then to_jsonb(new)->'success_criteria'
      else jsonb_build_array('Meet assignment acceptance criteria with traceable evidence.','Escalate uncertainty and remain within governance boundaries.') end,
    '["Missing evidence","Risk or authority boundary exceeded","Outcome cannot be verified"]'::jsonb,
    case when jsonb_typeof(to_jsonb(new)->'execution_capabilities')='array' then to_jsonb(new)->'execution_capabilities' else '[]'::jsonb end,
    'draft'
  ) on conflict(agent_id,contract_version) do nothing;
  insert into public.agent_autonomy_profiles(agent_id,organization_id,current_level,maximum_level,status,allowed_risk_levels,review_reason)
  values(new.id,new.organization_id,1,4,'supervised',array['low']::text[],'Initial fail-closed profile.')
  on conflict(agent_id) do nothing;
  return new;
end; $$;
revoke all on function public.ensure_agent_operating_model_v1() from public,anon,authenticated;
drop trigger if exists ensure_agent_operating_model_after_insert on public.agents;
create trigger ensure_agent_operating_model_after_insert after insert on public.agents
for each row execute function public.ensure_agent_operating_model_v1();

create or replace function public.approve_agent_position_contract_v1(target_agent_id uuid)
returns public.agent_position_contracts
language plpgsql security definer set search_path='' as $$
declare candidate public.agent_position_contracts%rowtype; target_org uuid;
begin
  select organization_id into target_org from public.agents where id=target_agent_id and agent_status<>'archived';
  if target_org is null then raise exception 'Agent not found'; end if;
  if not public.is_org_owner(target_org) then raise exception 'Owner authorization required'; end if;
  select * into candidate from public.agent_position_contracts
  where agent_id=target_agent_id and status='draft' order by contract_version desc limit 1 for update;
  if candidate.id is null then raise exception 'No draft position contract is available'; end if;
  if jsonb_array_length(candidate.responsibilities)=0 or jsonb_array_length(candidate.success_metrics)=0 then
    raise exception 'Position contract requires responsibilities and success metrics before approval';
  end if;
  update public.agent_position_contracts set status='approved',approved_by_user_id=auth.uid(),approved_at=now(),updated_at=now()
  where id=candidate.id returning * into candidate;
  insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(target_org,'user',auth.uid(),'agent.position_contract_approved','agent',target_agent_id::text,'medium',
    jsonb_build_object('contract_id',candidate.id,'contract_version',candidate.contract_version,'position_title',candidate.position_title));
  return candidate;
end; $$;
revoke all on function public.approve_agent_position_contract_v1(uuid) from public,anon;
grant execute on function public.approve_agent_position_contract_v1(uuid) to authenticated;

create or replace function public.create_agent_work_assignment_v1(
  target_agent_id uuid,
  target_title text,
  target_task_brief text,
  target_task_type text default 'general',
  target_acceptance_criteria jsonb default '[]'::jsonb,
  target_risk_level text default 'low',
  target_external_side_effect boolean default false
)
returns public.agent_work_assignments
language plpgsql security definer set search_path='' as $$
declare target_org uuid; contract public.agent_position_contracts%rowtype; autonomy public.agent_autonomy_profiles%rowtype; assignment public.agent_work_assignments%rowtype; required_level smallint; approval text;
begin
  select organization_id into target_org from public.agents where id=target_agent_id and enabled=true and agent_status='enabled';
  if target_org is null then raise exception 'Enabled Agent not found'; end if;
  if not public.is_org_owner(target_org) then raise exception 'Owner authorization required'; end if;
  if length(btrim(coalesce(target_title,'')))<3 or length(btrim(coalesce(target_task_brief,'')))<10 then raise exception 'Task title or brief is incomplete'; end if;
  if jsonb_typeof(coalesce(target_acceptance_criteria,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(target_acceptance_criteria,'[]'::jsonb))=0 then raise exception 'At least one acceptance criterion is required'; end if;
  if target_risk_level not in ('low','medium','high','restricted') then raise exception 'Invalid risk level'; end if;
  select * into contract from public.agent_position_contracts where agent_id=target_agent_id and status='approved' limit 1;
  if contract.id is null then raise exception 'Approved position contract required'; end if;
  select * into autonomy from public.agent_autonomy_profiles where agent_id=target_agent_id and status not in ('locked','suspended');
  if autonomy.agent_id is null then raise exception 'Agent autonomy is locked'; end if;
  required_level := case when target_external_side_effect then 2 when target_risk_level in ('medium','high','restricted') then 2 else 1 end;
  if autonomy.current_level<required_level then raise exception 'Task exceeds current Agent autonomy'; end if;
  approval := case when autonomy.current_level>=3 and target_risk_level='low' and not target_external_side_effect then 'autonomous'
    when target_external_side_effect or target_risk_level in ('high','restricted') then 'human_approval' else 'human_review' end;
  insert into public.agent_work_assignments(
    organization_id,agent_id,position_contract_id,title,task_brief,task_type,acceptance_criteria,
    risk_level,external_side_effect_expected,required_autonomy_level,approval_mode,assigned_by_user_id
  ) values (
    target_org,target_agent_id,contract.id,btrim(target_title),btrim(target_task_brief),coalesce(nullif(btrim(target_task_type),''),'general'),
    target_acceptance_criteria,target_risk_level,target_external_side_effect,required_level,approval,auth.uid()
  ) returning * into assignment;
  insert into public.agent_work_assignment_events(organization_id,assignment_id,agent_id,event_type,actor_type,actor_user_id,detail)
  values(target_org,assignment.id,target_agent_id,'assignment.created','user',auth.uid(),jsonb_build_object('approval_mode',approval,'required_autonomy_level',required_level));
  insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(target_org,'user',auth.uid(),'agent.work_assigned','agent_work_assignment',assignment.id::text,
    (case when target_risk_level='restricted' then 'critical' else target_risk_level end)::public.rythm_risk_level,
    jsonb_build_object('agent_id',target_agent_id,'position_contract_id',contract.id,'approval_mode',approval));
  return assignment;
end; $$;
revoke all on function public.create_agent_work_assignment_v1(uuid,text,text,text,jsonb,text,boolean) from public,anon;
grant execute on function public.create_agent_work_assignment_v1(uuid,text,text,text,jsonb,text,boolean) to authenticated;

-- Runtime-only: a work result must link to a terminal execution record. It is not yet validated experience.
create or replace function public.record_agent_work_outcome_v1(
  target_assignment_id uuid,
  target_outcome_status text,
  target_quality_score integer default null,
  target_agent_run_id uuid default null,
  target_tool_execution_request_id uuid default null,
  target_ai_request_audit_event_id bigint default null,
  target_evidence jsonb default '{}'::jsonb
)
returns public.agent_work_assignments
language plpgsql security definer set search_path='' as $$
declare request_role text:=coalesce(current_setting('request.jwt.claim.role',true),''); candidate public.agent_work_assignments%rowtype; evidence_ok boolean:=false;
begin
  if request_role<>'service_role' then raise exception 'Service role required'; end if;
  if target_outcome_status not in ('successful','mixed','failed') or (target_quality_score is not null and target_quality_score not between 0 and 100) then raise exception 'Invalid work outcome'; end if;
  if num_nonnulls(target_agent_run_id,target_tool_execution_request_id,target_ai_request_audit_event_id)<>1 then raise exception 'Exactly one execution evidence reference is required'; end if;
  select * into candidate from public.agent_work_assignments where id=target_assignment_id for update;
  if candidate.id is null or candidate.status in ('completed','failed','cancelled') then raise exception 'Assignment is not recordable'; end if;
  if target_agent_run_id is not null then
    select exists(select 1 from public.agent_runs r where r.id=target_agent_run_id and r.agent_id=candidate.agent_id and r.organization_id=candidate.organization_id and r.status in ('succeeded','failed')) into evidence_ok;
  elsif target_tool_execution_request_id is not null then
    select exists(select 1 from public.tool_execution_requests t where t.id=target_tool_execution_request_id and t.agent_id=candidate.agent_id and t.organization_id=candidate.organization_id and t.status in ('succeeded','failed') and (t.status='failed' or t.verification_result->>'status'='verified')) into evidence_ok;
  else
    select exists(select 1 from public.audit_events e where e.id=target_ai_request_audit_event_id and e.organization_id=candidate.organization_id and e.object_type='agent' and e.object_id=candidate.agent_id::text and e.event_type in ('agent.task_completed','agent.task_failed') and nullif(e.payload->>'correlation_id','') is not null) into evidence_ok;
  end if;
  if not evidence_ok then raise exception 'Terminal, Agent-owned execution evidence is required'; end if;
  update public.agent_work_assignments set
    status=case when target_outcome_status='failed' then 'failed' else 'completed' end,
    outcome_status=target_outcome_status,verification_status='pending_review',quality_score=target_quality_score,
    agent_run_id=target_agent_run_id,tool_execution_request_id=target_tool_execution_request_id,ai_request_audit_event_id=target_ai_request_audit_event_id,
    evidence=coalesce(target_evidence,'{}'::jsonb),completed_at=now(),updated_at=now()
  where id=candidate.id returning * into candidate;
  insert into public.agent_work_assignment_events(organization_id,assignment_id,agent_id,event_type,actor_type,detail)
  values(candidate.organization_id,candidate.id,candidate.agent_id,'assignment.outcome_recorded','system',jsonb_build_object('outcome_status',target_outcome_status,'quality_score',target_quality_score));
  return candidate;
end; $$;
revoke all on function public.record_agent_work_outcome_v1(uuid,text,integer,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.record_agent_work_outcome_v1(uuid,text,integer,uuid,uuid,bigint,jsonb) to service_role;

create or replace function public.validate_agent_work_outcome_v1(target_assignment_id uuid, target_accepted boolean, target_quality_score integer, target_review_note text)
returns public.agent_work_assignments
language plpgsql security definer set search_path='' as $$
declare candidate public.agent_work_assignments%rowtype;
begin
  select * into candidate from public.agent_work_assignments where id=target_assignment_id for update;
  if candidate.id is null then raise exception 'Assignment not found'; end if;
  if not public.is_org_owner(candidate.organization_id) then raise exception 'Owner authorization required'; end if;
  if candidate.verification_status<>'pending_review' then raise exception 'Assignment is not awaiting review'; end if;
  if target_quality_score not between 0 and 100 then raise exception 'A quality score between 0 and 100 is required'; end if;
  if length(btrim(coalesce(target_review_note,'')))<5 then raise exception 'A review note is required'; end if;
  update public.agent_work_assignments set verification_status=case when target_accepted then 'verified' else 'rejected' end,
    quality_score=target_quality_score,verified_at=now(),verified_by_user_id=auth.uid(),updated_at=now(),
    evidence=evidence||jsonb_build_object('owner_review_note',btrim(target_review_note),'owner_accepted',target_accepted)
  where id=candidate.id returning * into candidate;
  insert into public.agent_work_assignment_events(organization_id,assignment_id,agent_id,event_type,actor_type,actor_user_id,detail)
  values(candidate.organization_id,candidate.id,candidate.agent_id,case when target_accepted then 'assignment.verified' else 'assignment.rejected' end,'user',auth.uid(),jsonb_build_object('review_note',btrim(target_review_note)));
  if target_accepted then
    insert into public.agent_experience_events(agent_id,organization_id,event_type,source_type,source_id,outcome_status,quality_score,counts_toward_experience,evidence,occurred_at,validated_at,validated_by)
    values(candidate.agent_id,candidate.organization_id,'task','agent_work_assignment',candidate.id::text,candidate.outcome_status,candidate.quality_score,true,
      jsonb_build_object('assignment_id',candidate.id,'position_contract_id',candidate.position_contract_id,'execution_evidence',coalesce(candidate.agent_run_id::text,candidate.tool_execution_request_id::text,candidate.ai_request_audit_event_id::text)),
      coalesce(candidate.completed_at,now()),now(),auth.uid())
    on conflict do nothing;
  end if;
  return candidate;
end; $$;
revoke all on function public.validate_agent_work_outcome_v1(uuid,boolean,integer,text) from public,anon;
grant execute on function public.validate_agent_work_outcome_v1(uuid,boolean,integer,text) to authenticated;

create or replace function public.agent_operational_readiness_v1(target_agent_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  target_org uuid; contract_approved boolean:=false; autonomy_level integer:=0; autonomy_status text:='locked';
  verified_work integer:=0; successful_work integer:=0; failed_work integer:=0; work_rate numeric:=0;
  run_success integer:=0; run_failed integer:=0; tool_success integer:=0; tool_failed integer:=0; ai_execution_success integer:=0; ai_execution_failed integer:=0; verified_external integer:=0;
  validated_experience integer:=0; evaluation_pass integer:=0; governance_violations integer:=0;
  readiness_state text:='not_ready'; score integer:=0; blockers jsonb:='[]'::jsonb;
begin
  select organization_id into target_org from public.agents where id=target_agent_id;
  if target_org is null then raise exception 'Agent not found'; end if;
  if not public.is_org_member(target_org) and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Organization membership required'; end if;
  select exists(select 1 from public.agent_position_contracts c where c.agent_id=target_agent_id and c.status='approved') into contract_approved;
  select coalesce(p.current_level,0),coalesce(p.status,'locked') into autonomy_level,autonomy_status from public.agent_autonomy_profiles p where p.agent_id=target_agent_id;
  select count(*) filter(where verification_status='verified'),
    count(*) filter(where verification_status='verified' and outcome_status in ('successful','mixed')),
    count(*) filter(where verification_status='verified' and outcome_status='failed'),
    count(*) filter(where ai_request_audit_event_id is not null and status='completed'),
    count(*) filter(where ai_request_audit_event_id is not null and status='failed')
  into verified_work,successful_work,failed_work,ai_execution_success,ai_execution_failed from public.agent_work_assignments where agent_id=target_agent_id;
  if verified_work>0 then work_rate:=successful_work::numeric/verified_work::numeric; end if;
  select count(*) filter(where status='succeeded'),count(*) filter(where status='failed') into run_success,run_failed from public.agent_runs where agent_id=target_agent_id;
  select count(*) filter(where status='succeeded'),count(*) filter(where status='failed'),
    count(*) filter(where status='succeeded' and external_side_effect=true and verification_result->>'status'='verified')
  into tool_success,tool_failed,verified_external from public.tool_execution_requests where agent_id=target_agent_id and requested_by='agent';
  select count(*) into validated_experience from public.agent_experience_events where agent_id=target_agent_id and counts_toward_experience=true and validated_at is not null and outcome_status in ('successful','mixed');
  select count(*) filter(where verdict in ('PASS','CONDITIONAL_PASS')),count(*) filter(where governance_violation=true)
  into evaluation_pass,governance_violations from public.agent_evaluation_results where agent_id=target_agent_id;

  score:=least(100,
    (case when contract_approved then 15 else 0 end)+least(5,autonomy_level*2)+least(15,evaluation_pass*5)+
    least(15,validated_experience*5)+least(25,successful_work*5)+least(15,(run_success+tool_success+ai_execution_success)*3)+least(10,verified_external*5)
  );
  score:=greatest(0,score-least(30,(run_failed+tool_failed+ai_execution_failed+failed_work)*5)-least(30,governance_violations*15));

  if not contract_approved then blockers:=blockers||'[{"code":"POSITION_CONTRACT_UNAPPROVED","message":"Human-approved position contract required."}]'::jsonb; end if;
  if successful_work=0 then blockers:=blockers||'[{"code":"NO_VERIFIED_WORK","message":"No verified real work outcome exists."}]'::jsonb; end if;
  if run_success+tool_success+ai_execution_success=0 then blockers:=blockers||'[{"code":"NO_OPERATIONAL_EXECUTION","message":"No successful operational execution exists."}]'::jsonb; end if;
  if governance_violations>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','GOVERNANCE_VIOLATION','message','Governance violations must be remediated.','count',governance_violations)); end if;

  if contract_approved and autonomy_level>=3 and successful_work>=10 and work_rate>=0.90 and tool_success>=8 and verified_external>=3 and validated_experience>=5 and governance_violations=0 then
    readiness_state:='ready_independent';
  elsif contract_approved and autonomy_level>=2 and successful_work>=5 and work_rate>=0.80 and run_success+tool_success+ai_execution_success>=5 and tool_success>=3 and validated_experience>=3 and governance_violations=0 then
    readiness_state:='ready_limited';
  elsif contract_approved and successful_work>=2 and work_rate>=0.70 and run_success+tool_success+ai_execution_success>=2 and evaluation_pass>=1 and governance_violations=0 then
    readiness_state:='ready_with_supervision';
  end if;

  return jsonb_build_object(
    'agent_id',target_agent_id,'readiness_state',readiness_state,'readiness_score',score,
    'position_contract_approved',contract_approved,'autonomy_level',autonomy_level,'autonomy_status',autonomy_status,
    'verified_work_count',verified_work,'successful_work_count',successful_work,'failed_work_count',failed_work,'verified_work_success_rate',round(work_rate,4),
    'agent_run_success_count',run_success,'agent_run_failure_count',run_failed,'agent_tool_success_count',tool_success,'agent_tool_failure_count',tool_failed,
    'ai_task_execution_success_count',ai_execution_success,'ai_task_execution_failure_count',ai_execution_failed,
    'verified_external_action_count',verified_external,'validated_experience_count',validated_experience,'evaluation_pass_count',evaluation_pass,
    'governance_violation_count',governance_violations,'blockers',blockers,
    'evidence_policy','Operational execution and independently verified outcomes are required; titles, knowledge bindings and synthetic benchmarks are insufficient.'
  );
end; $$;
revoke all on function public.agent_operational_readiness_v1(uuid) from public,anon;
grant execute on function public.agent_operational_readiness_v1(uuid) to authenticated,service_role;

create or replace function public.organization_agent_operational_readiness_v1(target_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_org_member(target_organization_id) and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Organization membership required'; end if;
  select coalesce(jsonb_agg(public.agent_operational_readiness_v1(a.id) order by a.agent_code),'[]'::jsonb)
  into result from public.agents a where a.organization_id=target_organization_id and a.agent_status<>'archived';
  return result;
end; $$;
revoke all on function public.organization_agent_operational_readiness_v1(uuid) from public,anon;
grant execute on function public.organization_agent_operational_readiness_v1(uuid) to authenticated,service_role;

create or replace function public.promote_agent_autonomy_v1(target_agent_id uuid, target_level integer, target_review_reason text)
returns public.agent_autonomy_profiles
language plpgsql security definer set search_path='' as $$
declare target_org uuid; profile public.agent_autonomy_profiles%rowtype; readiness jsonb; state text;
begin
  select organization_id into target_org from public.agents where id=target_agent_id and agent_status<>'archived';
  if target_org is null then raise exception 'Agent not found'; end if;
  if not public.is_org_owner(target_org) then raise exception 'Owner authorization required'; end if;
  if length(btrim(coalesce(target_review_reason,'')))<10 then raise exception 'A substantive autonomy review reason is required'; end if;
  select * into profile from public.agent_autonomy_profiles where agent_id=target_agent_id for update;
  if profile.agent_id is null or profile.status in ('locked','suspended') then raise exception 'Autonomy profile is unavailable'; end if;
  if target_level<>profile.current_level+1 or target_level>profile.maximum_level then raise exception 'Autonomy can increase by one level only'; end if;
  readiness:=public.agent_operational_readiness_v1(target_agent_id); state:=readiness->>'readiness_state';
  if target_level=2 and state not in ('ready_with_supervision','ready_limited','ready_independent') then raise exception 'L2 requires supervised position readiness'; end if;
  if target_level=3 and state not in ('ready_limited','ready_independent') then raise exception 'L3 requires limited-scope position readiness'; end if;
  if target_level=4 and state<>'ready_independent' then raise exception 'L4 requires independently verified low-risk readiness'; end if;
  update public.agent_autonomy_profiles set current_level=target_level,
    status=case when target_level>=3 then 'approved' else 'conditional' end,
    allowed_risk_levels=case when target_level=2 then array['low','medium']::text[] else array['low','medium','high']::text[] end,
    requires_approval_for_external_actions=true,last_reviewed_at=now(),last_reviewed_by_user_id=auth.uid(),
    review_reason=btrim(target_review_reason),updated_at=now()
  where agent_id=target_agent_id returning * into profile;
  insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(target_org,'user',auth.uid(),'agent.autonomy_promoted','agent',target_agent_id::text,'high',
    jsonb_build_object('autonomy_level',target_level,'readiness_state',state,'readiness_score',readiness->'readiness_score','external_actions_still_require_approval',true,'review_reason',btrim(target_review_reason)));
  return profile;
end; $$;
revoke all on function public.promote_agent_autonomy_v1(uuid,integer,text) from public,anon;
grant execute on function public.promote_agent_autonomy_v1(uuid,integer,text) to authenticated;

-- Fail closed if an execution request bypasses the application-level autonomy policy.
create or replace function public.enforce_agent_autonomy_on_execution_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare profile public.agent_autonomy_profiles%rowtype;
begin
  if new.agent_id is null or coalesce(new.requested_by,'user')<>'agent' then return new; end if;
  select * into profile from public.agent_autonomy_profiles where agent_id=new.agent_id;
  if profile.agent_id is null or profile.status in ('locked','suspended') or profile.current_level<1 then raise exception 'AGENT_AUTONOMY_LOCKED'; end if;
  if (new.external_side_effect or new.risk_level in ('medium','high','restricted')) and profile.current_level<2 then raise exception 'AGENT_AUTONOMY_INSUFFICIENT'; end if;
  if tg_op='UPDATE' and new.status='executing' and old.status is distinct from new.status then
    if ((new.external_side_effect and (profile.current_level<3 or profile.requires_approval_for_external_actions)) or new.financial_impact or new.risk_level in ('high','restricted'))
      and (not new.human_approval_required or new.approval_status<>'approved') then raise exception 'APPROVAL_REQUIRED_BY_AUTONOMY'; end if;
  end if;
  return new;
end; $$;
revoke all on function public.enforce_agent_autonomy_on_execution_v1() from public,anon,authenticated;
drop trigger if exists tool_execution_agent_autonomy_guard on public.tool_execution_requests;
create trigger tool_execution_agent_autonomy_guard before insert or update of status on public.tool_execution_requests
for each row execute function public.enforce_agent_autonomy_on_execution_v1();

comment on table public.agent_position_contracts is 'Human-approved position scope. A job title alone grants no operational readiness or authority.';
comment on table public.agent_work_assignments is 'Traceable real-work assignments. Only terminal execution evidence plus human validation may count as experience.';
comment on function public.agent_operational_readiness_v1(uuid) is 'Evidence-backed position readiness; synthetic benchmarks contribute limited competency evidence but never replace verified work.';

commit;
