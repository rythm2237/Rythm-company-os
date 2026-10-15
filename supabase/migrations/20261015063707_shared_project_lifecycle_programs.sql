begin;

-- Identity, delivery, operations and cycle progress are independent dimensions.
alter table public.projects add column if not exists lifecycle_type text not null default 'finite';
alter table public.projects add column if not exists initial_delivery_status text not null default 'pending';
alter table public.projects add column if not exists operational_status text not null default 'setup';
alter table public.projects add column if not exists program_health text not null default 'unknown';
alter table public.projects add constraint projects_lifecycle_type_check check(lifecycle_type in ('finite','campaign','continuous'));
alter table public.projects add constraint projects_initial_delivery_check check(initial_delivery_status in ('pending','in_progress','validation_pending','accepted'));
alter table public.projects add constraint projects_operational_status_check check(operational_status in ('setup','baseline','implementation','validation','monitoring','optimization','paused','blocked','waiting_for_data','cancelled','archived'));
alter table public.projects add constraint projects_program_health_check check(program_health in ('unknown','healthy','needs_attention','stale'));

alter table public.project_roadmap_phases add column if not exists validation_status text not null default 'pending';
alter table public.project_roadmap_phases add column if not exists historical_completion jsonb;
alter table public.project_roadmap_phases add constraint project_phase_validation_check check(validation_status in ('pending','validated','legacy_unverified'));

-- Read-only to members; mutations go through owner-scoped routes or scheduler RPCs.
create table public.project_review_schedules (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id), cadence text not null check(cadence in ('daily','weekly','monthly','quarterly')),
 interval_days integer not null check(interval_days between 1 and 366), enabled boolean not null default true,
 owner_agent_id uuid references public.agents(id), observation_days integer not null default 30 check(observation_days between 0 and 366),
 configuration jsonb not null default '{"approval_required":true,"execution_permission":"propose_only","risk":"low","sources":[],"kpi_thresholds":{},"escalation":"owner"}'::jsonb,
 next_review_at timestamptz not null default now(), last_review_at timestamptz, created_at timestamptz not null default now(),
 unique(project_id,cadence), unique(id,project_id,organization_id)
);
create index project_review_due_idx on public.project_review_schedules(next_review_at) where enabled;
create table public.project_review_cycles (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id), schedule_id uuid not null,
 due_at timestamptz not null, status text not null default 'waiting_for_data' check(status in ('waiting_for_data','in_progress','validation_pending','completed','cancelled')),
 task_run_id uuid references public.project_task_runs(id), evidence_refs jsonb not null default '[]',
 outcome jsonb not null default '{}', stages jsonb not null default '[]', created_at timestamptz not null default now(), completed_at timestamptz,
 foreign key(schedule_id,project_id,organization_id) references public.project_review_schedules(id,project_id,organization_id), unique(schedule_id,due_at)
);
create unique index project_review_one_open_idx on public.project_review_cycles(schedule_id) where status not in ('completed','cancelled');
create index project_review_history_idx on public.project_review_cycles(project_id,created_at desc);
alter table public.project_review_schedules enable row level security;
alter table public.project_review_cycles enable row level security;
create policy review_schedules_member_read on public.project_review_schedules for select to authenticated using(exists(select 1 from public.organization_members m where m.organization_id=project_review_schedules.organization_id and m.user_id=(select auth.uid())));
create policy review_cycles_member_read on public.project_review_cycles for select to authenticated using(exists(select 1 from public.organization_members m where m.organization_id=project_review_cycles.organization_id and m.user_id=(select auth.uid())));
revoke all on public.project_review_schedules,public.project_review_cycles from anon,authenticated;
grant select on public.project_review_schedules,public.project_review_cycles to authenticated;
grant all on public.project_review_schedules,public.project_review_cycles to service_role;

-- Task terminality is necessary but never sufficient for milestone validation.
create or replace function public.project_phase_evidence_valid_v1(p_phase_id uuid)
returns boolean language sql stable security invoker set search_path=''
as $$
 select exists(select 1 from public.project_completion_criteria c where c.source_entity_type='roadmap_phase' and c.source_entity_id=ph.id and c.required)
 and not exists(
  select 1 from public.project_completion_criteria c where c.project_id=ph.project_id and c.organization_id=ph.organization_id
  and c.source_entity_type='roadmap_phase' and c.source_entity_id=ph.id and c.required
  and not ((c.state='not_applicable' and coalesce(c.metadata->>'not_applicable_reason','')<>'')
    or (c.state='waived' and c.waiver_approver_user_id is not null and c.waived_at is not null and coalesce(c.waiver_reason,'')<>'' and exists(select 1 from public.projects p join public.project_completion_policies pol on pol.id=p.completion_policy_id where p.id=ph.project_id and pol.allow_residual_risk_acceptance))
    or (c.state='passed' and exists(select 1 from public.project_completion_evidence e where e.criterion_id=c.id and e.project_id=c.project_id and e.organization_id=c.organization_id and e.authoritative_source and e.verification_result in ('passed','verified','succeeded')))))
 and not exists(select 1 from public.project_completion_criteria c where c.project_id=ph.project_id and c.required and c.state in ('failed','blocked'))
 and (concat_ws(' ',ph.title,ph.description,ph.success_criteria::text)!~*'observation|outcome validation|[0-9]+[ -]?day'
  or not exists(select 1 from public.project_observation_windows o where o.project_id=ph.project_id and o.status<>'cancelled' and (o.status<>'complete' or not o.sufficient_data or o.observation_start is null or o.observation_end>now() or o.observation_end-o.observation_start < make_interval(days=>o.required_duration_days)))
  and exists(select 1 from public.project_observation_windows o where o.project_id=ph.project_id and o.status='complete' and o.sufficient_data))
 from public.project_roadmap_phases ph where ph.id=p_phase_id
$$;
revoke all on function public.project_phase_evidence_valid_v1(uuid) from public,anon,authenticated;
grant execute on function public.project_phase_evidence_valid_v1(uuid) to service_role;

create or replace function public.refresh_project_roadmap_phase_status_v1(p_phase_id uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare ph public.project_roadmap_phases%rowtype; total integer; done integer; blocked integer; started integer; next_status text; valid boolean;
begin
 select * into ph from public.project_roadmap_phases where id=p_phase_id for update;
 if not found then return null; end if;
 select count(*) filter(where status<>'cancelled'),count(*) filter(where status='completed'),count(*) filter(where status in ('blocked','failed')),count(*) filter(where status not in ('queued','cancelled'))
 into total,done,blocked,started from public.project_task_runs where roadmap_phase_id=p_phase_id;
 valid:=coalesce(public.project_phase_evidence_valid_v1(p_phase_id),false);
 next_status:=case when total>0 and total=done and valid then 'completed' when blocked>0 then 'blocked' when total>0 and total=done then 'monitoring' when started>0 then 'in_progress' else 'not_started' end;
 update public.project_roadmap_phases set status=next_status,validation_status=case when next_status='completed' then 'validated' else 'pending' end,updated_at=now() where id=p_phase_id and (status is distinct from next_status or validation_status is distinct from case when next_status='completed' then 'validated' else 'pending' end);
 return next_status;
end $$;
revoke all on function public.refresh_project_roadmap_phase_status_v1(uuid) from public,anon,authenticated;
grant execute on function public.refresh_project_roadmap_phase_status_v1(uuid) to service_role;

-- Prevent direct phase writers from bypassing the same evidence evaluator.
create or replace function public.guard_phase_completion_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' and not coalesce(public.project_phase_evidence_valid_v1(new.id),false) then
  new.status:='monitoring'; new.validation_status:='pending';
 elsif new.status='completed' then new.validation_status:='validated'; end if;
 return new;
end $$;
revoke all on function public.guard_phase_completion_v1() from public,anon,authenticated;
create trigger project_phase_evidence_guard before insert or update of status on public.project_roadmap_phases for each row execute function public.guard_phase_completion_v1();

-- Preserve exactly what was claimed, then explicitly reconcile unvalidated history.
insert into public.project_activity_events(organization_id,project_id,event_type,headline,detail,importance,metadata)
select ph.organization_id,ph.project_id,'roadmap.evidence_reconciled','Roadmap completion requires validation','Historical completion claims are preserved; closed tasks do not establish validated outcomes.','attention',jsonb_build_object('phase_id',ph.id,'previous',to_jsonb(ph),'reconciliation_version','lifecycle-v3')
from public.project_roadmap_phases ph where ph.status='completed' and not coalesce(public.project_phase_evidence_valid_v1(ph.id),false);
update public.project_roadmap_phases ph set historical_completion=jsonb_build_object('status',ph.status,'outcome_progress_percent',ph.outcome_progress_percent,'updated_at',ph.updated_at,'reconciled_at',now()),status='monitoring',validation_status='legacy_unverified'
where ph.status='completed' and not coalesce(public.project_phase_evidence_valid_v1(ph.id),false);

-- The known program is classified only after independent production inspection.
-- A cancelled predecessor and similarly named work in other tenants are untouched.
insert into public.project_activity_events(organization_id,project_id,event_type,headline,detail,importance,metadata)
select organization_id,id,'project.lifecycle_reconciled','Continuous program identity established','Initial delivery and recurring operations are tracked independently. Existing governance hold is preserved.','normal',jsonb_build_object('previous',to_jsonb(p),'reconciliation_version','lifecycle-v3') from public.projects p
where id='8170be30-e034-4c6e-9126-f31f519ec980' and organization_id='825dca00-30c6-4e57-902c-80c0c8af604c' and name='Airolepath SEO';
update public.projects set lifecycle_type='continuous',initial_delivery_status='validation_pending',operational_status='blocked',program_health='needs_attention'
where id='8170be30-e034-4c6e-9126-f31f519ec980' and organization_id='825dca00-30c6-4e57-902c-80c0c8af604c' and name='Airolepath SEO';
insert into public.project_review_schedules(organization_id,project_id,cadence,interval_days,observation_days)
select p.organization_id,p.id,c.cadence,c.days,30 from public.projects p cross join (values('daily',1),('weekly',7),('monthly',30),('quarterly',90))c(cadence,days) where p.lifecycle_type='continuous' on conflict(project_id,cadence) do nothing;

create or replace function public.evaluate_project_completion_v1(
  p_project_id uuid,
  p_trigger_event text default 'manual',
  p_source_type text default null,
  p_source_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 p public.projects%rowtype;pol public.project_completion_policies%rowtype;v_policy_id uuid;
 req_work boolean;req_deliverable boolean;req_implementation boolean;req_verification boolean;req_outcome boolean;req_acceptance boolean;req_closeout boolean;
 w_work numeric;w_deliverable numeric;w_implementation numeric;w_verification numeric;w_outcome numeric;w_acceptance numeric;w_closeout numeric;total_weight numeric;
 work_p integer;deliverable_p integer;implementation_p integer;verification_p integer;outcome_p integer;acceptance_p integer;closeout_p integer;overall_p integer;
 observation_required boolean;observation_complete boolean:=true;has_blocker boolean:=false;has_hold boolean:=false;workflow_contradiction boolean:=false;has_roadmap boolean:=false;has_execution boolean:=false;
 blocking jsonb:='[]'::jsonb;satisfied jsonb:='[]'::jsonb;evidence_refs jsonb:='[]'::jsonb;lifecycle text;previous_lifecycle text;eligible boolean:=false;next_action text;final_report_exists boolean:=false;
 evaluator_version constant text:='completion-v3';
begin
 select * into p from public.projects where id=p_project_id for update;if not found then raise exception 'Project not found';end if;
 previous_lifecycle:=p.lifecycle_state;v_policy_id:=coalesce(p.completion_policy_id,public.assign_project_completion_policy_v1(p_project_id));select * into pol from public.project_completion_policies where id=v_policy_id;if not found then raise exception 'Completion policy unavailable';end if;
 req_work:=coalesce((pol.required_dimensions->>'work')::boolean,true);req_deliverable:=coalesce((pol.required_dimensions->>'deliverable')::boolean,true);req_implementation:=coalesce((pol.required_dimensions->>'implementation')::boolean,true);req_verification:=coalesce((pol.required_dimensions->>'verification')::boolean,true);req_outcome:=coalesce((pol.required_dimensions->>'outcome')::boolean,true);req_acceptance:=coalesce((pol.required_dimensions->>'acceptance')::boolean,true);req_closeout:=coalesce((pol.required_dimensions->>'closeout')::boolean,true);
 w_work:=coalesce((pol.weights->>'work')::numeric,0);w_deliverable:=coalesce((pol.weights->>'deliverable')::numeric,0);w_implementation:=coalesce((pol.weights->>'implementation')::numeric,0);w_verification:=coalesce((pol.weights->>'verification')::numeric,0);w_outcome:=coalesce((pol.weights->>'outcome')::numeric,0);w_acceptance:=coalesce((pol.weights->>'acceptance')::numeric,0);w_closeout:=coalesce((pol.weights->>'closeout')::numeric,0);
 select exists(select 1 from public.project_roadmaps r where r.project_id=p_project_id and r.status='approved' and r.is_baseline=true) into has_roadmap;select exists(select 1 from public.project_executions e where e.project_id=p_project_id) into has_execution;
 work_p:=public.project_work_progress_v1(p_project_id);deliverable_p:=public.project_dimension_progress_v1(p_project_id,'deliverable',req_deliverable,pol.allow_residual_risk_acceptance);implementation_p:=public.project_dimension_progress_v1(p_project_id,'implementation',req_implementation,pol.allow_residual_risk_acceptance);verification_p:=public.project_dimension_progress_v1(p_project_id,'verification',req_verification,pol.allow_residual_risk_acceptance);outcome_p:=public.project_dimension_progress_v1(p_project_id,'outcome',req_outcome,pol.allow_residual_risk_acceptance);acceptance_p:=public.project_dimension_progress_v1(p_project_id,'acceptance',req_acceptance,pol.allow_residual_risk_acceptance);
 select exists(select 1 from public.project_closeout_reports where project_id=p_project_id and status in('final','accepted')) into final_report_exists;closeout_p:=case when not req_closeout then 100 when final_report_exists then 100 else public.project_dimension_progress_v1(p_project_id,'closeout',true,pol.allow_residual_risk_acceptance) end;
 observation_required:=coalesce((p.completion_overrides->>'observation_required')::boolean,pol.observation_required);if observation_required then select coalesce(bool_and(status='complete' and sufficient_data and observation_start is not null and observation_end<=now() and observation_end-observation_start>=make_interval(days=>required_duration_days)),false) into observation_complete from public.project_observation_windows where project_id=p_project_id and status<>'cancelled';if not exists(select 1 from public.project_observation_windows where project_id=p_project_id and status<>'cancelled') then observation_complete:=false;end if;end if;
 select exists(select 1 from public.project_completion_criteria c where c.project_id=p_project_id and c.required and c.state in('failed','blocked')) into has_blocker;select exists(select 1 from public.project_completion_criteria c where c.project_id=p_project_id and c.required and c.state='blocked' and c.metadata->>'blocker_type'='governance_hold') into has_hold;has_blocker:=has_blocker or p.blocker_type is not null;workflow_contradiction:=coalesce(p.workflow_state,'') in('DECISION_PENDING','APPROVAL_PENDING','LEGAL_REVIEW','DELIBERATION','BLOCKED');
 select coalesce(jsonb_agg(jsonb_build_object('criterionKey',criterion_key,'dimension',dimension,'reason',coalesce(failure_reason,description),'state',state) order by created_at),'[]'::jsonb) into blocking from public.project_completion_criteria where project_id=p_project_id and required and state in('failed','blocked','pending');
 if observation_required and not observation_complete then blocking:=blocking||jsonb_build_array(jsonb_build_object('dimension','outcome','reason','Required observation window is incomplete or lacks sufficient data','state','pending'));end if;
 if p.blocker_type is not null then blocking:=blocking||jsonb_build_array(jsonb_build_object('dimension','project','reason',coalesce(p.blocker_summary,p.blocker_type),'state','blocked'));end if;
 if workflow_contradiction then blocking:=blocking||jsonb_build_array(jsonb_build_object('dimension','workflow','reason','Workflow state '||p.workflow_state||' is not compatible with project completion','state','blocked'));end if;
 select coalesce(jsonb_agg(jsonb_build_object('criterionKey',criterion_key,'dimension',dimension,'state',state) order by created_at),'[]'::jsonb) into satisfied from public.project_completion_criteria where project_id=p_project_id and required and(state in('passed','not_applicable') or(state='waived' and pol.allow_residual_risk_acceptance));
 select coalesce(jsonb_agg(id),'[]'::jsonb) into evidence_refs from public.project_completion_evidence where project_id=p_project_id and authoritative_source=true;
 total_weight:=(case when req_work then w_work else 0 end)+(case when req_deliverable then w_deliverable else 0 end)+(case when req_implementation then w_implementation else 0 end)+(case when req_verification then w_verification else 0 end)+(case when req_outcome then w_outcome else 0 end)+(case when req_acceptance then w_acceptance else 0 end)+(case when req_closeout then w_closeout else 0 end);if total_weight<=0 then total_weight:=1;end if;
 overall_p:=round(((case when req_work then w_work*work_p else 0 end)+(case when req_deliverable then w_deliverable*deliverable_p else 0 end)+(case when req_implementation then w_implementation*implementation_p else 0 end)+(case when req_verification then w_verification*verification_p else 0 end)+(case when req_outcome then w_outcome*outcome_p else 0 end)+(case when req_acceptance then w_acceptance*acceptance_p else 0 end)+(case when req_closeout then w_closeout*closeout_p else 0 end))/total_weight)::integer;
 if p.status='cancelled' then lifecycle:='CANCELLED';next_action:='No action — project is cancelled.';
 elsif p.status='failed' then lifecycle:='FAILED';next_action:='Review failure and decide whether to restart or close the project.';
 elsif p.status='paused' or p.lifecycle_state='PAUSED' then lifecycle:='PAUSED';next_action:='Resume the project when work is authorized to continue.';
 elsif has_hold then lifecycle:='ON_HOLD';next_action:='Resolve the active governance HOLD and its unmet completion gates.';
 elsif has_blocker and pol.unresolved_blockers_prevent_closure then lifecycle:='BLOCKED';next_action:=coalesce(p.resolution_required,(select coalesce(failure_reason,description) from public.project_completion_criteria where project_id=p_project_id and required and state in('failed','blocked') order by created_at desc limit 1),'Resolve blocking completion criteria.');
 elsif not has_roadmap then lifecycle:=case when p.status='idea' then 'DRAFT' when p.status='planning' then 'PLANNING' else 'DISCOVERY' end;next_action:='Complete project analysis and approve the baseline roadmap.';
 elsif not has_execution then lifecycle:='READY_FOR_EXECUTION';next_action:='Start execution from the approved roadmap.';
 elsif req_work and work_p<100 then lifecycle:='EXECUTION';next_action:='Complete remaining planned work.';
 elsif req_deliverable and deliverable_p<100 then lifecycle:='EXECUTION';next_action:='Complete and validate mandatory deliverables.';
 elsif req_implementation and implementation_p<100 then lifecycle:='IMPLEMENTATION_PENDING';next_action:='Execute and evidence mandatory real-world implementation items.';
 elsif req_verification and verification_p<100 then lifecycle:='VERIFICATION';next_action:='Verify implementation against mandatory acceptance criteria.';
 elsif observation_required and not observation_complete then lifecycle:='OBSERVATION';next_action:=coalesce((select 'Continue observation until '||to_char(observation_end,'YYYY-MM-DD') from public.project_observation_windows where project_id=p_project_id and status in('pending','in_progress','insufficient_data') order by observation_end desc nulls last limit 1),'Start the required observation window and collect authoritative measurements.');
 elsif req_outcome and outcome_p<100 then lifecycle:='OUTCOME_VALIDATION';next_action:='Validate measurable project outcomes from authoritative evidence.';
 elsif req_acceptance and acceptance_p<100 then lifecycle:='ACCEPTANCE_PENDING';next_action:='Obtain the required authorized stakeholder acceptance.';
 elsif req_closeout and closeout_p<100 then lifecycle:='CLOSEOUT';next_action:='Generate and review the final project closeout report.';
 elsif workflow_contradiction then lifecycle:=case when p.workflow_state='BLOCKED' then 'BLOCKED' else 'ACCEPTANCE_PENDING' end;next_action:='Resolve the pending governed workflow state before closure.';
 else lifecycle:='COMPLETED';eligible:=true;overall_p:=100;next_action:='Project closed with required evidence and acceptance.';end if;
 if p.operational_status='archived' then
  lifecycle:='ON_HOLD';eligible:=false;next_action:='Program archived by explicit governance decision.';
 elsif p.lifecycle_type='continuous' and lifecycle='COMPLETED' then
  lifecycle:='OBSERVATION';eligible:=false;next_action:='Initial delivery accepted. Continue recurring monitoring and optimization.';
 end if;
 if not eligible then overall_p:=least(overall_p,99);end if;
 update public.projects set initial_delivery_status=case when p.lifecycle_type<>'continuous' then p.initial_delivery_status when deliverable_p=100 and implementation_p=100 and verification_p=100 and outcome_p=100 and acceptance_p=100 and observation_complete then 'accepted' when work_p=100 then 'validation_pending' else 'in_progress' end,
 operational_status=case when p.lifecycle_type<>'continuous' then p.operational_status when p.operational_status='archived' then 'archived' when lifecycle='CANCELLED' then 'cancelled' when lifecycle='PAUSED' then 'paused' when lifecycle in ('BLOCKED','ON_HOLD') then 'blocked' when not observation_complete then 'waiting_for_data' when deliverable_p=100 and implementation_p=100 and verification_p=100 and outcome_p=100 and acceptance_p=100 then 'monitoring' else 'validation' end,
 completion_policy_id=v_policy_id,lifecycle_state=lifecycle,work_progress=work_p,deliverable_progress=deliverable_p,implementation_progress=implementation_p,verification_progress=verification_p,outcome_progress=outcome_p,acceptance_progress=acceptance_p,closeout_progress=closeout_p,overall_project_progress=overall_p,progress_percent=overall_p,completion_eligible=eligible,completion_evaluated_at=now(),completion_evaluator_version=evaluator_version,next_required_action=next_action,completion_blocking_reasons=blocking,completion_satisfied_criteria=satisfied,status=case when lifecycle='COMPLETED' then 'completed' when lifecycle='CANCELLED' then 'cancelled' when lifecycle='FAILED' then 'failed' when lifecycle in('BLOCKED','ON_HOLD') then 'blocked' else case when status='completed' then 'active' else status end end,stage=lower(lifecycle),updated_at=now() where id=p_project_id;
 insert into public.project_completion_evaluations(organization_id,project_id,previous_state,new_state,eligible_for_completion,work_progress,deliverable_progress,implementation_progress,verification_progress,outcome_progress,acceptance_progress,closeout_progress,overall_project_progress,blocking_reasons,satisfied_criteria,next_required_action,evaluator_version,triggered_event,source_type,source_id,evidence_references) values(p.organization_id,p_project_id,previous_lifecycle,lifecycle,eligible,work_p,deliverable_p,implementation_p,verification_p,outcome_p,acceptance_p,closeout_p,overall_p,blocking,satisfied,next_action,evaluator_version,coalesce(p_trigger_event,'manual'),p_source_type,p_source_id,evidence_refs);
 return jsonb_build_object('eligibleForCompletion',eligible,'currentLifecycleState',lifecycle,'workProgress',work_p,'deliverableProgress',deliverable_p,'implementationProgress',implementation_p,'verificationProgress',verification_p,'outcomeProgress',outcome_p,'acceptanceProgress',acceptance_p,'closeoutProgress',closeout_p,'overallProjectProgress',overall_p,'blockingReasons',blocking,'satisfiedCriteria',satisfied,'nextRequiredAction',next_action,'evaluatorVersion',evaluator_version,'observationRequired',observation_required,'observationComplete',observation_complete,'requiredDimensions',pol.required_dimensions);
end $$;

revoke all on function public.evaluate_project_completion_v1(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.evaluate_project_completion_v1(uuid,text,text,uuid) to service_role;



-- Uses the existing authenticated dispatcher and worker, not a separate scheduler.
create or replace function public.schedule_program_reviews_v1(p_limit integer default 20)
returns integer language plpgsql security invoker set search_path=''
as $$
declare s public.project_review_schedules%rowtype; p public.projects%rowtype; c public.project_review_cycles%rowtype; refs jsonb; execution_id uuid; task_id uuid; manager_id uuid; n integer:=0;
begin
 for s in select * from public.project_review_schedules where enabled and next_review_at<=now() order by next_review_at limit least(greatest(p_limit,1),50) for update skip locked loop
  select * into p from public.projects where id=s.project_id and organization_id=s.organization_id for update;
  if not found or p.lifecycle_type<>'continuous' or p.status in ('paused','on_hold','blocked','cancelled','failed') or p.lifecycle_state in ('PAUSED','ON_HOLD','BLOCKED','CANCELLED','FAILED') or p.operational_status in ('paused','blocked','archived','cancelled') then continue; end if;
  select * into c from public.project_review_cycles where schedule_id=s.id and status not in ('completed','cancelled') for update;
  if not found then
   insert into public.project_review_cycles(organization_id,project_id,schedule_id,due_at) values(s.organization_id,s.project_id,s.id,s.next_review_at) returning * into c;
  end if;
  if c.status<>'waiting_for_data' then continue; end if;
  select coalesce(jsonb_agg(m.id),'[]') into refs from public.project_metric_measurements m join public.project_completion_evidence e on e.id=m.evidence_id and e.project_id=m.project_id and e.organization_id=m.organization_id
   where m.project_id=p.id and m.organization_id=p.organization_id and e.authoritative_source and m.value is not null
   and m.measurement_end<=now() and (m.measurement_kind='baseline' and m.measurement_end>=now()-interval '366 days' or m.measurement_kind='outcome' and m.measurement_end>=now()-make_interval(days=>s.interval_days+1))
   and m.measurement_start is not null and m.measurement_end-m.measurement_start>=make_interval(days=>s.observation_days)
   and (jsonb_array_length(coalesce(s.configuration->'sources','[]'))=0 or (s.configuration->'sources') ? m.source);
  if jsonb_array_length(refs)=0 then
   update public.project_review_cycles set outcome=jsonb_build_object('reason','Validation Pending — Insufficient Evidence','missing_dependency','Fresh authorized measurements covering the observation window'),stages=jsonb_build_array(jsonb_build_object('stage','collect','status','waiting_for_data','at',now())) where id=c.id;
   update public.projects set program_health='stale',operational_status='waiting_for_data' where id=p.id;
   continue;
  end if;
  select pa.agent_id into manager_id from public.project_agents pa join public.agents a on a.id=pa.agent_id where pa.project_id=p.id and pa.organization_id=p.organization_id and pa.status in ('assigned','active') and a.enabled order by (pa.assignment_role ilike '%manager%') desc limit 1;
  manager_id:=coalesce(s.owner_agent_id,manager_id);
  if manager_id is null then
   update public.project_review_cycles set outcome=jsonb_build_object('reason','Review owner is required') where id=c.id; continue;
  end if;
  -- Serialize with existing execution writers through the project row lock.
  if exists(select 1 from public.project_executions where project_id=p.id and status in ('running','queued','paused')) then continue; end if;
  insert into public.project_executions(organization_id,project_id,execution_no,status,execution_context,plan_snapshot,budget_snapshot,started_at,last_heartbeat_at,last_progress_at)
   select p.organization_id,p.id,coalesce(max(execution_no),0)+1,'running',jsonb_build_object('review_cycle_id',c.id),'{}',jsonb_build_object('ai_budget_usd',p.budget_cap_usd),now(),now(),now() from public.project_executions where project_id=p.id returning id into execution_id;
  insert into public.project_task_runs(organization_id,project_id,execution_id,task_key,title,assigned_agent_id,status,priority,dependencies,idempotency_key,input,work_weight)
   values(p.organization_id,p.id,execution_id,'review-'||c.id,s.cadence||' program review',manager_id,'queued',3,'[]','review:'||c.id,
    jsonb_build_object('review_cycle_id',c.id,'measurement_ids',refs,'review_configuration',s.configuration,'risk','low','description',
     'Collect the referenced authorized measurements; measure against matching historical baselines; detect anomalies and data-quality issues; diagnose separating observed evidence from hypotheses; prioritize by impact, benefit, confidence, effort, urgency, risk and dependencies. Propose evidence-backed improvements through existing governance. Never execute external work or claim implementation, causal impact, AI assistant recommendations or verified outcomes from analysis alone. Wait for approval, governed execution and independent validation. Record traceable lessons as unverified until validated.'),1) returning id into task_id;
  update public.project_review_cycles set status='in_progress',task_run_id=task_id,evidence_refs=refs,stages=stages||jsonb_build_array(jsonb_build_object('stage','measure_detect_diagnose_prioritize_propose','status','queued','at',now())) where id=c.id;
  update public.projects set operational_status='optimization',program_health='unknown' where id=p.id;
  insert into public.project_activity_events(organization_id,project_id,event_type,headline,importance,metadata) values(p.organization_id,p.id,'program.review_started',s.cadence||' review started','normal',jsonb_build_object('cycle_id',c.id,'measurement_ids',refs));
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.schedule_program_reviews_v1(integer) from public,anon,authenticated;
grant execute on function public.schedule_program_reviews_v1(integer) to service_role;

create or replace function public.sync_program_review_task_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' and old.status is distinct from new.status then
  update public.project_review_cycles set status='validation_pending',outcome=jsonb_build_object('task_run_id',new.id,'agent_claims',new.safe_result,'authority','non_authoritative','next_action','Approve proposals, execute governed work and validate with independent evidence'),stages=stages||jsonb_build_array(jsonb_build_object('stage','approve_execute_validate','status','validation_pending','at',now())) where task_run_id=new.id and status='in_progress';
 end if;
 return new;
end $$;
revoke all on function public.sync_program_review_task_v1() from public,anon,authenticated;
create trigger project_review_task_sync after update of status on public.project_task_runs for each row execute function public.sync_program_review_task_v1();

create or replace function public.complete_program_review_v1(p_cycle_id uuid,p_evidence_id uuid,p_approval_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.project_review_cycles%rowtype; s public.project_review_schedules%rowtype;
begin
 select * into c from public.project_review_cycles where id=p_cycle_id for update;
 if not found then raise exception 'Cycle not found'; end if;
 if c.status='completed' then return jsonb_build_object('replayed',true); end if;
 select * into s from public.project_review_schedules where id=c.schedule_id for update;
 if c.status<>'validation_pending' then raise exception 'Cycle is not awaiting validation'; end if;
 if not exists(select 1 from public.project_completion_evidence e where e.id=p_evidence_id and e.project_id=c.project_id and e.organization_id=c.organization_id and e.authoritative_source and e.lifecycle_dimension in ('verification','outcome') and e.verification_result in ('passed','verified','succeeded') and e.structured_data->>'review_cycle_id'=c.id::text and e.collected_at>=c.created_at) then raise exception 'Independent cycle-specific validation evidence required'; end if;
 if coalesce((s.configuration->>'approval_required')::boolean,true) and not exists(select 1 from public.approval_requests a where a.id=p_approval_id and a.project_id=c.project_id and a.organization_id=c.organization_id and a.status='approved' and a.resolved_at>=c.created_at and (a.subject_id=c.task_run_id or a.subject_id=c.id or exists(select 1 from public.project_proposals pr where pr.id=a.subject_id and pr.source_task_run_id=c.task_run_id and pr.organization_id=c.organization_id and pr.project_id=c.project_id))) then raise exception 'Authorized approval required'; end if;
 update public.project_review_cycles set status='completed',completed_at=now(),outcome=outcome||jsonb_build_object('validation_evidence_id',p_evidence_id,'approval_id',p_approval_id),stages=stages||jsonb_build_array(jsonb_build_object('stage','learn','status','validated','evidence_id',p_evidence_id,'at',now())) where id=c.id;
 update public.project_review_schedules set last_review_at=now(),next_review_at=now()+make_interval(days=>interval_days) where id=s.id;
 update public.projects set operational_status='monitoring',program_health='unknown' where id=c.project_id and operational_status not in ('paused','blocked','cancelled','archived');
 insert into public.project_activity_events(organization_id,project_id,event_type,headline,importance,metadata) values(c.organization_id,c.project_id,'program.review_completed','Review validated; next cycle scheduled','normal',jsonb_build_object('cycle_id',c.id,'validation_evidence_id',p_evidence_id));
 return jsonb_build_object('completed',true,'cycle_id',c.id);
end $$;
revoke all on function public.complete_program_review_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_program_review_v1(uuid,uuid,uuid) to service_role;

-- Continuous programs cannot be closed by legacy or direct completion writers.
create or replace function public.guard_program_completion_v1() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.lifecycle_type='continuous' then
  if new.status='completed' then new.status:='active'; end if;
  if new.lifecycle_state='COMPLETED' then new.lifecycle_state:='OBSERVATION'; end if;
  new.completion_eligible:=false;
  new.overall_project_progress:=least(new.overall_project_progress,99);
  new.progress_percent:=least(new.progress_percent,99);
 end if;
 return new;
end $$;
revoke all on function public.guard_program_completion_v1() from public,anon,authenticated;
create trigger projects_zz_program_completion_guard before insert or update on public.projects for each row execute function public.guard_program_completion_v1();

create or replace function public.configure_project_program_v1(p_project_id uuid,p_organization_id uuid,p_actor_id uuid,p_lifecycle_type text)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.projects%rowtype;
begin
 if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_actor_id and role='owner') then raise exception 'Owner authorization required';end if;
 if p_lifecycle_type not in ('finite','campaign','continuous') then raise exception 'Invalid lifecycle type';end if;
 select * into p from public.projects where id=p_project_id and organization_id=p_organization_id for update;
 if not found then raise exception 'Project not found';end if;
 if p.lifecycle_type=p_lifecycle_type then return;end if;
 if p.status in ('completed','cancelled','failed') or p.operational_status='archived' then raise exception 'Historical terminal projects require explicit reconciliation';end if;
 update public.projects set lifecycle_type=p_lifecycle_type,updated_at=now() where id=p.id;
 if p_lifecycle_type='continuous' then
  insert into public.project_review_schedules(organization_id,project_id,cadence,interval_days) select p.organization_id,p.id,v.cadence,v.days from(values('daily',1),('weekly',7),('monthly',30),('quarterly',90))v(cadence,days) on conflict(project_id,cadence) do nothing;
 else
  update public.project_review_schedules set enabled=false where project_id=p.id;
 end if;
 insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload) values(p.organization_id,'user',p_actor_id,'project.lifecycle_configured','project',p.id,'medium',jsonb_build_object('previous',p.lifecycle_type,'next',p_lifecycle_type));
 perform public.evaluate_project_completion_v1(p.id,'lifecycle_configured');
end $$;
revoke all on function public.configure_project_program_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.configure_project_program_v1(uuid,uuid,uuid,text) to service_role;

create or replace function public.configure_program_schedule_v1(p_project_id uuid,p_organization_id uuid,p_actor_id uuid,p_schedule_id uuid,p_interval integer,p_observation integer,p_enabled boolean,p_owner_id uuid,p_configuration jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_actor_id and role='owner') then raise exception 'Owner authorization required';end if;
 perform 1 from public.projects where id=p_project_id and organization_id=p_organization_id and lifecycle_type='continuous' for update;
 if not found then raise exception 'Continuous program not found';end if;
 if p_owner_id is not null and not exists(select 1 from public.project_agents pa join public.agents a on a.id=pa.agent_id where pa.project_id=p_project_id and pa.organization_id=p_organization_id and pa.agent_id=p_owner_id and pa.status in ('assigned','active') and a.enabled) then raise exception 'Owner must be an enabled assigned project agent';end if;
 update public.project_review_schedules set interval_days=p_interval,observation_days=p_observation,enabled=p_enabled,owner_agent_id=p_owner_id,configuration=p_configuration||'{"approval_required":true,"execution_permission":"propose_only"}'::jsonb where id=p_schedule_id and project_id=p_project_id and organization_id=p_organization_id;
 if not found then raise exception 'Review schedule not found';end if;
 insert into public.audit_events(organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload) values(p_organization_id,'user',p_actor_id,'program.schedule_configured','project',p_project_id,'low',jsonb_build_object('schedule_id',p_schedule_id,'interval_days',p_interval,'observation_days',p_observation,'enabled',p_enabled,'configuration',p_configuration));
end $$;
revoke all on function public.configure_program_schedule_v1(uuid,uuid,uuid,uuid,integer,integer,boolean,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.configure_program_schedule_v1(uuid,uuid,uuid,uuid,integer,integer,boolean,uuid,jsonb) to service_role;
-- New proposals carry a visible revision link; the existing fingerprint guard
-- still suppresses identical requests and preserves rejected authority.
alter table public.approval_requests add column if not exists revision_of uuid references public.approval_requests(id);
alter table public.approval_requests add column if not exists revision_number integer not null default 1 check(revision_number>0);
create or replace function public.link_approval_revision_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare prior public.approval_requests%rowtype;
begin
 new.revision_of:=null;new.revision_number:=1;
 if new.project_id is null then return new;end if;
 select * into prior from public.approval_requests a where a.organization_id=new.organization_id and a.project_id=new.project_id
  and a.status='rejected' and a.subject_type=new.subject_type and a.requested_by_agent_id is not distinct from new.requested_by_agent_id
  and lower(btrim(a.title))=lower(btrim(new.title)) order by a.resolved_at desc nulls last limit 1;
 if found then new.revision_of:=prior.id;new.revision_number:=prior.revision_number+1;end if;
 return new;
end $$;
revoke all on function public.link_approval_revision_v1() from public,anon,authenticated;
create trigger trg_za_approval_revision before insert on public.approval_requests for each row execute function public.link_approval_revision_v1();

-- Future roadmaps receive the same explicit criteria as reconciled historical ones.
create or replace function public.seed_roadmap_phase_criteria_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.project_completion_criteria(organization_id,project_id,dimension,criterion_key,description,required,validator_type,state,source_entity_type,source_entity_id,metadata)
 select new.organization_id,new.project_id,v.dimension,'phase-'||case when v.dimension='verification' then 'success' else v.dimension end||'-'||new.id::text||'-'||left(md5(to_jsonb(x.value)::text),16),x.value,true,'authoritative_evidence','pending','roadmap_phase',new.id,'{}'
 from (values('deliverable',new.deliverables),('verification',new.success_criteria))v(dimension,items)
 cross join lateral jsonb_array_elements_text(case when jsonb_typeof(v.items)='array' then v.items else '[]'::jsonb end)x
 where length(btrim(x.value))>0 on conflict(project_id,criterion_key) do nothing;
 return new;
end $$;
revoke all on function public.seed_roadmap_phase_criteria_v1() from public,anon,authenticated;
create trigger roadmap_phase_seed_criteria after insert on public.project_roadmap_phases for each row execute function public.seed_roadmap_phase_criteria_v1();

create or replace function public.refresh_phase_validation_evidence_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare phase_id uuid;
begin
 for phase_id in select distinct c.source_entity_id from public.project_completion_criteria c where c.project_id=coalesce(new.project_id,old.project_id) and c.source_entity_type='roadmap_phase' loop
  perform public.refresh_project_roadmap_phase_status_v1(phase_id);
 end loop;
 return coalesce(new,old);
end $$;
revoke all on function public.refresh_phase_validation_evidence_v1() from public,anon,authenticated;
create trigger phase_criteria_validation_sync after insert or update or delete on public.project_completion_criteria for each row execute function public.refresh_phase_validation_evidence_v1();
create trigger phase_evidence_validation_sync after insert or update or delete on public.project_completion_evidence for each row execute function public.refresh_phase_validation_evidence_v1();
create trigger phase_observation_validation_sync after insert or update or delete on public.project_observation_windows for each row execute function public.refresh_phase_validation_evidence_v1();

-- Scheduler reconciliation consumes only independent cycle-specific evidence and
-- its scoped approval. Agent completion never calls this authority directly.
create or replace function public.reconcile_program_reviews_v1(p_limit integer default 20)
returns integer language plpgsql security invoker set search_path='' as $$
declare c record; evidence_id uuid; approval_id uuid; n integer:=0;
begin
 for c in select r.*,s.configuration from public.project_review_cycles r join public.project_review_schedules s on s.id=r.schedule_id
  join public.projects p on p.id=r.project_id and p.organization_id=r.organization_id
  where r.status='validation_pending' and p.lifecycle_type='continuous' and p.status not in ('paused','on_hold','blocked','cancelled','failed')
   and p.lifecycle_state not in ('PAUSED','ON_HOLD','BLOCKED','CANCELLED','FAILED') and p.operational_status not in ('paused','blocked','archived','cancelled')
  order by r.created_at limit least(greatest(p_limit,1),50) for update of r skip locked loop
  evidence_id:=null;approval_id:=null;
  select e.id into evidence_id from public.project_completion_evidence e where e.project_id=c.project_id and e.organization_id=c.organization_id
   and e.authoritative_source and e.lifecycle_dimension in ('verification','outcome') and e.verification_result in ('passed','verified','succeeded')
   and e.structured_data->>'review_cycle_id'=c.id::text and e.collected_at>=c.created_at order by e.collected_at desc limit 1;
  if evidence_id is null then continue;end if;
  select a.id into approval_id from public.approval_requests a where a.project_id=c.project_id and a.organization_id=c.organization_id
   and a.status='approved' and a.resolved_at>=c.created_at and (a.subject_id=c.id or a.subject_id=c.task_run_id or exists(select 1 from public.project_proposals pr where pr.id=a.subject_id and pr.source_task_run_id=c.task_run_id and pr.project_id=c.project_id and pr.organization_id=c.organization_id)) order by a.resolved_at desc limit 1;
  if coalesce((c.configuration->>'approval_required')::boolean,true) and approval_id is null then continue;end if;
  perform public.complete_program_review_v1(c.id,evidence_id,approval_id);n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.reconcile_program_reviews_v1(integer) from public,anon,authenticated;
grant execute on function public.reconcile_program_reviews_v1(integer) to service_role;

commit;
