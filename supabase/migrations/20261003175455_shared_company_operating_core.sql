begin;
create table public.company_operating_template_contracts(
 template_key text not null,core_version text not null,configuration jsonb not null,primary key(template_key,core_version)
);
insert into public.company_operating_template_contracts values
('*','1.0','{"family":"general","required_roles":["Executive Director"],"intake":["objective","scope","budget","authority","acceptance"],"deliverables":["approved_scope","reviewed_outputs","verified_implementation_when_required","handover"],"evidence":["authoritative_references","quality_review"],"acceptance":"explicit_recorded_acceptance"}'),
('ready_ai_advertising_agency_v1','1.0','{"family":"advertising","required_roles":["Account Manager","Strategy Director","Creative Director","Analytics Specialist"],"intake":["audience","channels","brand_assets","media_budget","observation_period"],"deliverables":["strategy","content","authorized_launch","measurement","cycle_report"],"evidence":["provider_references","publishing","measurement_baseline"],"acceptance":"explicit_client_or_recorded_internal_acceptance","recurring_cycle":"contractual_period","playbooks":{"execution":"governed_campaign_activation","recovery":"channel_or_scope_alternative"}}'),
('ready_software_company_v1','1.0','{"family":"software","required_roles":["Product Manager","Engineer","QA"],"intake":["requirements","audience","design","stack","hosting","data_security"],"deliverables":["approved_requirements","design","implementation","security_checks","deployment","acceptance_tests","handover"],"evidence":["commit","test_results","deployment_reference","independent_verification"],"acceptance":"explicit_client_or_recorded_internal_acceptance","playbooks":{"execution":"governed_software_delivery","recovery":"rollback_or_reduced_scope"}}'),
('ready_web_development_company_v1','1.0','{"family":"software","required_roles":["Project Manager","Web Developer"],"intake":["requirements","audience","design","stack","hosting","data_security"],"deliverables":["approved_requirements","design","implementation","security_checks","deployment","acceptance_tests","handover"],"evidence":["commit","test_results","deployment_reference","independent_verification"],"acceptance":"explicit_client_or_recorded_internal_acceptance","playbooks":{"execution":"governed_software_delivery","recovery":"rollback_or_reduced_scope"}}');
alter table public.project_proposals add column external_action_required boolean;
alter table public.company_templates add column operating_core_version text not null default '1.0';
alter table public.organizations add column executive_director_agent_id uuid references public.agents(id);
alter table public.projects add column accountable_agent_id uuid references public.agents(id);
alter table public.projects add column operating_core_version text not null default '1.0';
alter table public.project_clarification_requests
 add column likely_source text not null default 'manager' check(likely_source in('manager','customer')),
 add column required_stage text not null default 'planning',
 add column omission_permitted boolean not null default false,
 add column consent_required boolean not null default false,
 add column waiver_reason text,
 add column clarification_version integer not null default 1,
 add column supporting_evidence jsonb not null default '[]',
 add column assumptions jsonb not null default '[]',
 add column display_condition jsonb;
create table public.company_operating_evaluations(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),agent_id uuid not null references public.agents(id),suite_version text not null,results jsonb not null,requested_by_user_id uuid references auth.users(id),created_at timestamptz not null default now());
create table public.company_core_migration_snapshot(entity_type text not null,entity_id uuid not null,prior_state jsonb not null,primary key(entity_type,entity_id));
insert into public.company_core_migration_snapshot select 'agent',id,jsonb_build_object('enabled',enabled,'reports_to_agent_id',reports_to_agent_id) from public.agents;
insert into public.company_core_migration_snapshot select 'department',id,jsonb_build_object('manager_agent_id',manager_agent_id) from public.departments;
create table public.project_operating_obligations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id),obligation_key text not null,
 owner_agent_id uuid not null references public.agents(id),next_action text not null,follow_up_at timestamptz not null,
 resume_condition text not null,escalation text not null,status text not null default 'waiting' check(status in('waiting','active','resolved','paused','cancelled')),
 evidence jsonb not null default '{}',created_at timestamptz not null default now(),unique(project_id,obligation_key)
);
create table public.project_budget_accounts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),project_id uuid not null references public.projects(id),
 category text not null check(category in('media','service_fees','third_party','internal')),currency text not null check(currency ~ '^[A-Z]{3}$'),
 period_start date not null,period_end date not null check(period_end>=period_start),approximate_min numeric check(approximate_min>=0),approximate_max numeric check(approximate_max>=approximate_min),
 authorized_ceiling numeric not null default 0 check(authorized_ceiling>=0),approval_threshold numeric check(approval_threshold>=0),
 authorization_evidence jsonb not null default '{}',authorized_by_user_id uuid references auth.users(id),
 includes_service_fees boolean not null default false,includes_media boolean not null default false,
 unique(project_id,category,currency,period_start,period_end)
);
create table public.project_budget_reservations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),account_id uuid not null references public.project_budget_accounts(id),
 idempotency_key text not null,amount numeric not null check(amount>=0),actual_amount numeric check(actual_amount>=0),
 status text not null default 'reserved' check(status in('reserved','charged','released','uncertain')),
 evidence jsonb not null default '{}',created_at timestamptz not null default now(),unique(organization_id,idempotency_key)
);
create table public.project_customer_forms(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),project_id uuid not null references public.projects(id),
 token_hash text not null unique,clarification_version integer not null,language text not null default 'en',
 questions jsonb not null,answers jsonb not null default '{}',revision integer not null default 0,
 expires_at timestamptz not null,revoked_at timestamptz,submitted_at timestamptz,
 status text not null default 'draft' check(status in('draft','submitted','correction','revoked')),
 previous_form_id uuid references public.project_customer_forms(id),communication_message_id uuid references public.communication_messages(id),created_at timestamptz not null default now()
);
create table public.project_customer_submissions(
 id uuid primary key default gen_random_uuid(),form_id uuid not null references public.project_customer_forms(id),organization_id uuid not null references public.organizations(id),
 revision integer not null,answers jsonb not null,validation_errors jsonb not null default '[]',created_at timestamptz not null default now(),unique(form_id,revision)
);
alter table public.communication_threads add column if not exists project_id uuid references public.projects(id);
alter table public.communication_messages add column if not exists project_id uuid references public.projects(id);

-- New writes are service-only. Owner reads are explicit; token access is server-mediated.
do $$ declare t text; begin
 foreach t in array array['company_core_migration_snapshot','company_operating_evaluations','company_operating_template_contracts','project_operating_obligations','project_budget_accounts','project_budget_reservations','project_customer_forms','project_customer_submissions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 if t not in ('company_core_migration_snapshot','company_operating_evaluations','project_customer_forms','project_customer_submissions','company_operating_template_contracts') then
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())))',t);
 end if;
 end loop;
end $$;

create function public.ensure_company_operating_core_v1(target_org uuid) returns uuid
language plpgsql security invoker set search_path=public as $$
declare director uuid; department_row record; foundation record; begin
 perform 1 from public.organizations where id=target_org for update;
 if not found then raise exception 'Company not found'; end if;
 select executive_director_agent_id into director from public.organizations where id=target_org;
 if director is not null then return director; end if;
 if director is null then
 select id into director from public.agents where organization_id=target_org and agent_status<>'archived' and (agent_code='RYTHM-EXECUTIVE' or role_title ilike '%Executive Orchestrator%' or role_title ilike '%Chief Operating Officer%') order by (agent_code='RYTHM-EXECUTIVE') desc,enabled desc limit 1;
 if director is null then
 insert into public.agents(organization_id,agent_code,name,role_title,purpose,enabled,agent_status,authority_level,risk_ceiling,external_actions_allowed,system_instructions,skills)
 values(target_org,'RYTHM-EXECUTIVE','Executive Director','Executive Director / COO','Accountable project ownership and department coordination',true,'enabled',2,'medium',false,
 'Own projects from intake to accepted closeout. Coordinate department managers. Clarify material gaps with the Human CEO first. Respect pauses, rejection constraints, budgets and evidence gates. Apply strategy, operations, finance, marketing, project management, negotiation and risk reasoning. Prompts do not establish professional competence. Use deterministic services for permissions, spending and queues.',
 '["strategy","operations","finance","marketing","project management","negotiation","risk"]') returning id into director;
 end if;
 update public.organizations set executive_director_agent_id=director where id=target_org;
 end if;
 for department_row in select id from public.departments where organization_id=target_org and manager_agent_id is null loop
 update public.departments set manager_agent_id=coalesce((select a.id from public.agents a where a.organization_id=target_org and a.department_id=department_row.id and a.agent_status<>'archived' and (a.role_title ~* '(manager|director|head|lead)' or exists(select 1 from public.agents s where s.organization_id=target_org and s.reports_to_agent_id=a.id)) order by a.authority_level desc,a.created_at limit 1),director) where id=department_row.id;
 end loop;
 update public.agents a set reports_to_agent_id=director where a.organization_id=target_org and a.id<>director and a.agent_status<>'archived' and (a.reports_to_agent_id is null or exists(select 1 from public.departments d where d.organization_id=target_org and d.manager_agent_id=a.id));
 update public.agents a set reports_to_agent_id=d.manager_agent_id from public.departments d where a.organization_id=target_org and d.organization_id=target_org and a.department_id=d.id and d.manager_agent_id is not null and a.id<>d.manager_agent_id and a.id<>director;
 -- Reuse the catalog's validated management knowledge; no invented certification or copied tenant documents.
 select id,version into foundation from public.role_foundations where canonical_role='Executive Orchestrator & AI Chief of Staff' and status in('active','validated') order by last_verified_at desc nulls last limit 1;
 if foundation.id is not null and not exists(select 1 from public.agent_role_foundation_bindings where agent_id=director and status='active') then
 insert into public.agent_role_foundation_bindings(organization_id,agent_id,role_foundation_id,foundation_version,status) values(target_org,director,foundation.id,foundation.version,'active');
 end if;
 update public.projects set accountable_agent_id=director where organization_id=target_org and accountable_agent_id is null;
 return director;
end $$;
revoke all on function public.ensure_company_operating_core_v1(uuid) from public,anon,authenticated;
grant execute on function public.ensure_company_operating_core_v1(uuid) to service_role;

create function public.reserve_project_budget_v1(target_org uuid,target_account uuid,reservation_key text,reserve_amount numeric)
returns uuid language plpgsql security invoker set search_path=public as $$
declare a public.project_budget_accounts; r public.project_budget_reservations; used numeric; result uuid; begin
 if reserve_amount is null or reserve_amount<0 or coalesce(reservation_key,'')='' then raise exception 'Invalid reservation'; end if;
 select * into a from public.project_budget_accounts where id=target_account and organization_id=target_org for update;
 if not found then raise exception 'Budget account not found'; end if;
 select * into r from public.project_budget_reservations where organization_id=target_org and idempotency_key=reservation_key;
 if found then
 if r.account_id<>target_account or r.amount<>reserve_amount or r.status='released' then raise exception 'Reservation conflict'; end if;
 return r.id; end if;
 if a.authorized_by_user_id is null or a.authorization_evidence='{}' or current_date not between a.period_start and a.period_end then raise exception 'Spending authorization missing or expired'; end if;
 select coalesce(sum(case when status='charged' then actual_amount else amount end),0) into used from public.project_budget_reservations where account_id=a.id and status<>'released';
 if used+reserve_amount>a.authorized_ceiling then raise exception 'Authorized spending ceiling exceeded'; end if;
 insert into public.project_budget_reservations(organization_id,account_id,idempotency_key,amount) values(target_org,a.id,reservation_key,reserve_amount) returning id into result;
 return result; end $$;
revoke all on function public.reserve_project_budget_v1(uuid,uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.reserve_project_budget_v1(uuid,uuid,text,numeric) to service_role;
create function public.reconcile_project_budget_v1(target_org uuid,target_reservation uuid,new_status text,actual_cost numeric,cost_evidence jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare r public.project_budget_reservations; begin
 select * into r from public.project_budget_reservations where id=target_reservation and organization_id=target_org;
 if not found then raise exception 'Reservation not found'; end if;
 perform 1 from public.project_budget_accounts where id=r.account_id for update;
 select * into r from public.project_budget_reservations where id=target_reservation for update;
 if new_status not in('charged','released','uncertain') or (new_status='charged' and (actual_cost is null or actual_cost<0 or cost_evidence='{}')) then raise exception 'Cost reconciliation requires evidence'; end if;
 if r.status in('charged','released') then
 if r.status=new_status and r.actual_amount is not distinct from actual_cost then return; end if;
 raise exception 'Terminal reservation'; end if;
 -- Overcharges remain visible and block further reservations; never silently increase authority.
 update public.project_budget_reservations set status=new_status,actual_amount=actual_cost,evidence=cost_evidence where id=r.id;
 end $$;
revoke all on function public.reconcile_project_budget_v1(uuid,uuid,text,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_project_budget_v1(uuid,uuid,text,numeric,jsonb) to service_role;

-- Protect paused/foreign agents at the queue boundary, including old callers.
create function public.guard_company_task_claim_v1() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.status='running' and old.status is distinct from 'running' and new.assigned_agent_id is not null and not exists(select 1 from public.agents a where a.id=new.assigned_agent_id and a.organization_id=new.organization_id and a.enabled and a.agent_status='enabled') then
 new.status='waiting_for_agent';new.lease_owner=null;new.lease_expires_at=null;new.next_attempt_at=null;new.attempt_count=old.attempt_count;
 end if;return new;end $$;
revoke all on function public.guard_company_task_claim_v1() from public,anon,authenticated;
create trigger company_core_task_claim before update of status on public.project_task_runs for each row execute function public.guard_company_task_claim_v1();

-- Conservative backfill: preserve all task/execution/approval history and explicit pauses.
select public.ensure_company_operating_core_v1(id) from public.organizations;
update public.agents set enabled=false where enabled and agent_status in('paused','archived');
insert into public.project_operating_obligations(organization_id,project_id,obligation_key,owner_agent_id,next_action,follow_up_at,resume_condition,escalation,status)
select organization_id,id,'project-accountability',accountable_agent_id,coalesce(nullif(next_required_action,''),'Review project evidence, outstanding scope and next delivery action'),now()+interval '1 day','Required input, authority, capacity and evidence available','Human CEO',case when status='on_hold' or stage in('paused','on_hold') then 'paused' else 'waiting' end
from public.projects where status not in('completed','cancelled');

-- Serialized drafts/submissions: stale tabs cannot overwrite newer answers.
create function public.save_project_customer_form_v1(form_token_hash text,expected_revision integer,new_answers jsonb,submit_form boolean,validation_errors jsonb)
returns integer language plpgsql security invoker set search_path=public as $$
declare f public.project_customer_forms; next_revision integer; begin
 select * into f from public.project_customer_forms where token_hash=form_token_hash and revoked_at is null and expires_at>now() for update;
 if not found or f.status not in('draft','correction') then raise exception 'Form unavailable'; end if;
 if f.revision<>expected_revision then raise exception 'Form changed; reload latest answers'; end if;
 if jsonb_typeof(new_answers)<>'object' then raise exception 'Invalid answers'; end if;
 next_revision:=f.revision+1;
 update public.project_customer_forms set answers=new_answers,revision=next_revision,status=case when submit_form then 'submitted' else f.status end,submitted_at=case when submit_form then now() else null end where id=f.id;
 if submit_form then
 insert into public.project_customer_submissions(form_id,organization_id,revision,answers,validation_errors) values(f.id,f.organization_id,next_revision,new_answers,validation_errors);
 update public.project_clarification_requests q set supporting_evidence=q.supporting_evidence||jsonb_build_array(jsonb_build_object('source','customer_form','form_id',f.id,'answer',new_answers->q.id::text,'revision',next_revision)) where q.organization_id=f.organization_id and q.project_id=f.project_id and exists(select 1 from jsonb_array_elements(f.questions) as field(value) where field.value->>'id'=q.id::text);
 insert into public.project_operating_obligations(organization_id,project_id,obligation_key,owner_agent_id,next_action,follow_up_at,resume_condition,escalation)
 select f.organization_id,f.project_id,'customer-form:'||f.id,o.executive_director_agent_id,'Review customer answers, contradictions and required corrections before planning',now()+interval '1 day','Manager validates submitted answers or requests correction','Human CEO' from public.organizations o where o.id=f.organization_id
 on conflict(project_id,obligation_key) do update set status='waiting',next_action=excluded.next_action;
 end if;
 return next_revision; end $$;
revoke all on function public.save_project_customer_form_v1(text,integer,jsonb,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.save_project_customer_form_v1(text,integer,jsonb,boolean,jsonb) to service_role;

alter table public.tool_execution_requests add column if not exists project_budget_account_id uuid references public.project_budget_accounts(id);
alter table public.tool_execution_requests add column if not exists project_budget_reservation_id uuid references public.project_budget_reservations(id);

-- Every future installation/project receives the same ownership contract.
create function public.company_core_installation_trigger_v1() returns trigger language plpgsql security invoker set search_path=public as $$
begin perform public.ensure_company_operating_core_v1(new.organization_id);return new;end $$;
revoke all on function public.company_core_installation_trigger_v1() from public,anon,authenticated;
create trigger company_core_installation after insert on public.organization_template_installations for each row execute function public.company_core_installation_trigger_v1();
create function public.company_core_project_trigger_v1() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 select executive_director_agent_id into new.accountable_agent_id from public.organizations where id=new.organization_id;
 if new.accountable_agent_id is null then new.accountable_agent_id:=public.ensure_company_operating_core_v1(new.organization_id); end if;
 return new;end $$;
revoke all on function public.company_core_project_trigger_v1() from public,anon,authenticated;
create trigger company_core_project before insert on public.projects for each row execute function public.company_core_project_trigger_v1();

-- Govern all project approval subjects through one rejection/continuation contract.
alter table public.approval_requests add column decision_kind text not null default 'revision'
 check(decision_kind in('revision','cost','approach','evidence','definitive','conditional'));
alter table public.approval_requests add column conditions_satisfied boolean not null default false;
create function public.company_core_decision_trigger_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare director uuid; exec_id uuid; task_id uuid; begin
 if new.project_id is null or old.status is not distinct from new.status or new.status not in('rejected','expired','cancelled','approved') then return new; end if;
 select accountable_agent_id into director from public.projects where id=new.project_id and organization_id=new.organization_id;
 if director is null then return new; end if;
 if new.status='approved' and new.decision_kind<>'conditional' then return new; end if;
 insert into public.project_operating_obligations(organization_id,project_id,obligation_key,owner_agent_id,next_action,follow_up_at,resume_condition,escalation,evidence)
 values(new.organization_id,new.project_id,'approval:'||new.id,director,
 case when new.status='approved' then 'Validate approval conditions before any execution' when new.decision_kind='definitive' then 'Respect rejected branch; seek scope, schedule or budget decision if no feasible alternative remains' else 'Develop materially changed alternative or new evidence within the recorded rejection constraints' end,
 now()+interval '1 day',case when new.decision_kind='definitive' then 'Human CEO explicitly reopens branch or changes scope' else 'Manager reviews changed proposal, cost, feasibility and evidence' end,'Human CEO',jsonb_build_object('approval_id',new.id,'subject_type',new.subject_type,'decision_kind',new.decision_kind,'reason',new.response_note))
 on conflict(project_id,obligation_key) do nothing;
 if new.status='approved' then
 update public.project_task_runs set status='waiting_for_data',next_attempt_at=null,input=input||jsonb_build_object('conditional_approval_id',new.id) where project_id=new.project_id and organization_id=new.organization_id and (waiting_on_approval_id=new.id or id=new.subject_id or action_item_id=new.subject_id or input->>'approved_proposal_id'=new.subject_id::text) and status in('queued','waiting_for_approval');
 return new;end if;
 if new.decision_kind='definitive' then
 update public.project_task_runs set error_class='approval_rejected_closed',next_attempt_at=null where waiting_on_approval_id=new.id and organization_id=new.organization_id;
 return new;end if;
 -- Avoid a second supervisor recovery branch for the same governed decision.
 update public.project_task_runs set status='blocked',error_class='company_core_decision_revision',next_attempt_at=null where organization_id=new.organization_id and project_id=new.project_id and (waiting_on_approval_id=new.id or id=new.subject_id or action_item_id=new.subject_id or input->>'approved_proposal_id'=new.subject_id::text) and status not in('completed','cancelled');
 select id into exec_id from public.project_executions where project_id=new.project_id and organization_id=new.organization_id and status in('queued','running') order by execution_no desc limit 1;
 if exec_id is not null then
 insert into public.project_task_runs(organization_id,project_id,execution_id,task_key,title,assigned_agent_id,status,dependencies,idempotency_key,input)
 values(new.organization_id,new.project_id,exec_id,'revision:'||new.id,'Review rejected decision and develop a changed alternative',director,'queued','[]','decision-revision:'||new.id,
 jsonb_build_object('description','Review the recorded reason and constraints. Produce a materially changed alternative, new evidence, or a concrete decision packet if no feasible alternative exists. Never resubmit the rejected proposal unchanged.','approval_id',new.id,'subject_type',new.subject_type,'subject_id',new.subject_id,'decision_kind',new.decision_kind,'reason',new.response_note,'internal_revision_only',true)) on conflict(organization_id,idempotency_key) do nothing;
 end if;
 return new;end $$;
revoke all on function public.company_core_decision_trigger_v1() from public,anon,authenticated;
create trigger zzz_company_core_decision after update of status on public.approval_requests for each row execute function public.company_core_decision_trigger_v1();

create or replace function public.claim_project_task_runs_v1(worker_id text, claim_limit integer default 8, lease_seconds integer default 240)
returns setof public.project_task_runs
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(worker_id,'')='' then raise exception 'worker_id required'; end if;
  return query
  with candidates as (
    select tr.id
    from public.project_task_runs tr
    join public.project_executions pe on pe.id=tr.execution_id and pe.status in('queued','running')
    join public.projects p on p.id=tr.project_id and p.status='active'
    where tr.status in('queued','retrying')
      and (tr.assigned_agent_id is null or exists(select 1 from public.agents a where a.id=tr.assigned_agent_id and a.organization_id=tr.organization_id and a.enabled and a.agent_status='enabled'))
      and (tr.next_attempt_at is null or tr.next_attempt_at<=now())
      and (tr.lease_expires_at is null or tr.lease_expires_at<now())
      -- Every declared dependency must exist in this execution and be complete.
      and not exists(
        select 1 from jsonb_array_elements_text(tr.dependencies) d(task_key)
        where not exists(
          select 1 from public.project_task_runs dep
          where dep.execution_id=tr.execution_id and dep.task_key=d.task_key and dep.status='completed'
        )
      )
      -- An assigned agent with no project capacity stays queued. Unassigned internal tasks may run.
      and (tr.assigned_agent_id is null or exists(
        select 1 from public.project_agent_capacity pac
        where pac.project_id=tr.project_id and pac.agent_id=tr.assigned_agent_id and pac.allocation_percent>0
      ))
    order by tr.priority asc, coalesce(pe.last_heartbeat_at,pe.created_at) asc, tr.created_at asc
    for update of tr skip locked
    limit greatest(1,least(claim_limit,32))
  )
  update public.project_task_runs tr
  set status='running',lease_owner=worker_id,lease_expires_at=now()+make_interval(secs=>greatest(30,lease_seconds)),attempt_count=attempt_count+1,started_at=coalesce(started_at,now()),updated_at=now()
  from candidates c where tr.id=c.id
  returning tr.*;
end $$;
revoke all on function public.claim_project_task_runs_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_project_task_runs_v1(text,integer,integer) to service_role;


create function public.reserve_company_followup_v1(source_task uuid,source_lease text,followup_key text,followup_title text,followup_description text,followup_owner uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare source public.project_task_runs; result uuid; gate uuid; begin
 select * into source from public.project_task_runs where id=source_task and status='running' and lease_owner=source_lease for update;
 if not found then raise exception 'Source lease lost'; end if;
 if not exists(select 1 from public.agents where id=followup_owner and organization_id=source.organization_id and enabled and agent_status='enabled') then raise exception 'Follow-up agent unavailable'; end if;
 select id into result from public.project_task_runs where organization_id=source.organization_id and idempotency_key='followup:'||source.id||':'||followup_key;
 if found then return result;end if;
 insert into public.project_task_runs(organization_id,project_id,execution_id,roadmap_id,roadmap_phase_id,task_key,title,assigned_agent_id,status,dependencies,idempotency_key,input,work_weight)
 values(source.organization_id,source.project_id,source.execution_id,source.roadmap_id,source.roadmap_phase_id,'followup:'||source.id||':'||followup_key,followup_title,followup_owner,'waiting_for_approval',jsonb_build_array(source.task_key),'followup:'||source.id||':'||followup_key,jsonb_build_object('description',followup_description,'predecessor_task_id',source.id,'scope_review_required',true,'followup_depth',coalesce((source.input->>'followup_depth')::integer,0)+1),1) returning id into result;
 insert into public.approval_requests(organization_id,project_id,subject_type,subject_id,title,summary,risk_level,requested_by_agent_id,status,conditions)
 values(source.organization_id,source.project_id,'project_task',result,'Follow-up scope review: '||followup_title,followup_description,'low',followup_owner,'pending','["Confirm approved scope, budget and ownership before executing this follow-up."]') returning id into gate;
 update public.project_task_runs set waiting_on_approval_id=gate where id=result;
 return result;end $$;
revoke all on function public.reserve_company_followup_v1(uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_company_followup_v1(uuid,text,text,text,text,uuid) to service_role;

-- Initial planning automatically continues once manager clarification is sufficient.
create table public.company_planning_jobs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 project_id uuid not null unique references public.projects(id),status text not null default 'queued' check(status in('queued','running','succeeded','failed')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),lease_owner text,lease_expires_at timestamptz,result jsonb not null default '{}'
);
alter table public.company_planning_jobs enable row level security;
revoke all on public.company_planning_jobs from public,anon,authenticated;
grant all on public.company_planning_jobs to service_role;
create function public.claim_company_planning_jobs_v1(worker_id text) returns setof public.company_planning_jobs
language plpgsql security invoker set search_path=public as $$
begin
 if coalesce(worker_id,'')='' then raise exception 'Worker required'; end if;
 insert into public.company_planning_jobs(organization_id,project_id)
 select p.organization_id,p.id from public.projects p where p.stage in('clarification','scope_review') and p.status not in('on_hold','cancelled','completed')
 and not exists(select 1 from public.project_clarification_requests q where q.project_id=p.id and q.organization_id=p.organization_id and q.status='open' and q.materiality='required' and q.required_stage in('planning','intake'))
 and not exists(select 1 from public.project_roadmaps r where r.project_id=p.id)
 and not exists(select 1 from public.project_executions e where e.project_id=p.id and e.status in('queued','running','paused'))
 on conflict(project_id) do nothing;
 update public.company_planning_jobs set status='failed',lease_owner=null,lease_expires_at=null where status='running' and lease_expires_at<now() and attempts>=3;
 return query with candidates as(
 select j.id from public.company_planning_jobs j join public.projects p on p.id=j.project_id
 where (j.status='queued' or (j.status='running' and j.lease_expires_at<now())) and j.attempts<3 and j.next_attempt_at<=now()
 and p.status not in('on_hold','cancelled','completed') and p.stage in('clarification','scope_review')
 and not exists(select 1 from public.project_clarification_requests q where q.project_id=p.id and q.status='open' and q.materiality='required' and q.required_stage in('intake','planning'))
 order by j.next_attempt_at for update of j skip locked limit 1
 ) update public.company_planning_jobs j set status='running',attempts=j.attempts+1,lease_owner=worker_id,lease_expires_at=now()+interval '6 minutes' from candidates c where j.id=c.id returning j.*;
end $$;
revoke all on function public.claim_company_planning_jobs_v1(text) from public,anon,authenticated;
grant execute on function public.claim_company_planning_jobs_v1(text) to service_role;

-- Deterministic continuity includes completed batches with unfinished obligations.
create function public.reconcile_company_obligations_v1() returns integer
language plpgsql security invoker set search_path=public as $$
declare affected integer;begin
 insert into public.project_operating_obligations(organization_id,project_id,obligation_key,owner_agent_id,next_action,follow_up_at,resume_condition,escalation,status,evidence)
 select t.organization_id,t.project_id,'task:'||t.id,coalesce(t.assigned_agent_id,p.accountable_agent_id),
 case t.status when 'waiting_for_approval' then 'Review pending decision for: ' when 'waiting_for_data' then 'Provide required input or connection for: ' when 'waiting_for_agent' then 'Resolve qualified agent availability and capacity for: ' when 'failed' then 'Review exhausted execution failure for: ' when 'blocked' then 'Resolve recorded blocker for: ' else 'Complete delegated work for: ' end||coalesce(t.title,t.task_key,'Untitled task'),
 coalesce(t.next_attempt_at,now()+interval '1 day'),'Task prerequisites, scope, authority, budget and availability are satisfied','Human CEO',case when p.status='on_hold' then 'paused' else 'waiting' end,jsonb_build_object('task_id',t.id,'task_status',t.status)
 from public.project_task_runs t join public.projects p on p.id=t.project_id and p.organization_id=t.organization_id
 where t.status not in('completed','cancelled') and p.status not in('completed','cancelled') and p.accountable_agent_id is not null
 on conflict(project_id,obligation_key) do update set next_action=excluded.next_action,owner_agent_id=excluded.owner_agent_id,status=excluded.status,evidence=excluded.evidence;
 get diagnostics affected=row_count;
 insert into public.project_operating_obligations(organization_id,project_id,obligation_key,owner_agent_id,next_action,follow_up_at,resume_condition,escalation)
 select j.organization_id,j.project_id,'planning',p.accountable_agent_id,'Resolve exhausted planning job; review provider, capacity, inputs and budget',now()+interval '1 day','Explicit manager planning recovery after the failure is resolved','Human CEO'
 from public.company_planning_jobs j join public.projects p on p.id=j.project_id where j.status='failed' and p.accountable_agent_id is not null and p.status not in('completed','cancelled')
 on conflict(project_id,obligation_key) do nothing;
 update public.project_operating_obligations o set status='resolved' from public.project_task_runs t where o.obligation_key='task:'||t.id and t.status='completed';
 update public.project_operating_obligations o set status='cancelled' from public.project_task_runs t where o.obligation_key='task:'||t.id and t.status='cancelled';
 update public.project_operating_obligations set evidence=evidence||'{"overdue":true}'::jsonb where status in('active','waiting') and follow_up_at<now();
 return affected;
end $$;
revoke all on function public.reconcile_company_obligations_v1() from public,anon,authenticated;
grant execute on function public.reconcile_company_obligations_v1() to service_role;

-- Consent validation reads immutable customer submissions, never model-provided evidence labels.
create function public.customer_answer_matches_v1(target_org uuid,target_project uuid,question_id uuid,answer_value jsonb) returns boolean
language sql security invoker set search_path=public as $$
 select coalesce((select s.answers->question_id::text=answer_value from public.project_customer_submissions s join public.project_customer_forms f on f.id=s.form_id
 where s.organization_id=target_org and f.organization_id=target_org and f.project_id=target_project and s.answers ? question_id::text
 order by s.created_at desc,s.revision desc limit 1),false);
$$;
revoke all on function public.customer_answer_matches_v1(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.customer_answer_matches_v1(uuid,uuid,uuid,jsonb) to service_role;

alter table public.project_proposals add column bridge_lease_owner text,add column bridge_lease_expires_at timestamptz;
create function public.claim_project_proposal_bridge_v1(target_proposal uuid,worker_id text) returns setof public.project_proposals
language plpgsql security invoker set search_path=public as $$
begin
 if coalesce(worker_id,'')='' then raise exception 'Worker required';end if;
 return query update public.project_proposals set bridge_lease_owner=worker_id,bridge_lease_expires_at=now()+interval '6 minutes'
 where id=target_proposal and status='approved' and (bridge_lease_expires_at is null or bridge_lease_expires_at<now()) returning *;
end $$;
revoke all on function public.claim_project_proposal_bridge_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_project_proposal_bridge_v1(uuid,text) to service_role;

commit;
