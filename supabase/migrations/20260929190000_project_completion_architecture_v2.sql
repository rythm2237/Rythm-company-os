begin;

create table if not exists public.project_completion_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  project_type_patterns text[] not null default '{}',
  required_dimensions jsonb not null default '{"work":true,"deliverable":true,"implementation":true,"verification":true,"outcome":true,"acceptance":true,"closeout":true}'::jsonb,
  weights jsonb not null default '{"work":20,"deliverable":10,"implementation":25,"verification":20,"outcome":10,"acceptance":10,"closeout":5}'::jsonb,
  mandatory_gates jsonb not null default '[]'::jsonb,
  observation_required boolean not null default false,
  minimum_observation_days integer not null default 0 check (minimum_observation_days >= 0),
  required_approvals jsonb not null default '[]'::jsonb,
  acceptance_authority text,
  required_deliverables jsonb not null default '[]'::jsonb,
  required_evidence_types jsonb not null default '[]'::jsonb,
  outcome_validation_required boolean not null default true,
  customer_signoff_required boolean not null default false,
  allow_residual_risk_acceptance boolean not null default true,
  unresolved_blockers_prevent_closure boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists project_completion_policies_global_code_uq on public.project_completion_policies(code) where organization_id is null;
create unique index if not exists project_completion_policies_org_code_uq on public.project_completion_policies(organization_id,code) where organization_id is not null;

insert into public.project_completion_policies(code,name,project_type_patterns,required_dimensions,weights,observation_required,minimum_observation_days,acceptance_authority,outcome_validation_required,customer_signoff_required,allow_residual_risk_acceptance,unresolved_blockers_prevent_closure,is_default)
values
('implementation_standard','Implementation project',['business_project','software','website','automation','integration','operations','security','advertising','seo'],
 '{"work":true,"deliverable":true,"implementation":true,"verification":true,"outcome":true,"acceptance":true,"closeout":true}'::jsonb,
 '{"work":20,"deliverable":10,"implementation":25,"verification":20,"outcome":10,"acceptance":10,"closeout":5}'::jsonb,false,0,'project_owner',true,false,true,true,true),
('research_analysis','Research / analysis project',['research','analysis','assessment','audit'],
 '{"work":true,"deliverable":true,"implementation":false,"verification":true,"outcome":true,"acceptance":false,"closeout":true}'::jsonb,
 '{"work":30,"deliverable":20,"implementation":0,"verification":20,"outcome":20,"acceptance":0,"closeout":10}'::jsonb,false,0,null,true,false,true,true,false),
('internal_analysis','Short internal analysis',['internal_analysis'],
 '{"work":true,"deliverable":true,"implementation":false,"verification":true,"outcome":true,"acceptance":false,"closeout":true}'::jsonb,
 '{"work":35,"deliverable":25,"implementation":0,"verification":15,"outcome":15,"acceptance":0,"closeout":10}'::jsonb,false,0,null,true,false,true,true,false)
on conflict do nothing;

alter table public.projects
  add column if not exists completion_policy_id uuid references public.project_completion_policies(id),
  add column if not exists lifecycle_state text not null default 'DISCOVERY',
  add column if not exists work_progress smallint not null default 0 check (work_progress between 0 and 100),
  add column if not exists deliverable_progress smallint not null default 0 check (deliverable_progress between 0 and 100),
  add column if not exists implementation_progress smallint not null default 0 check (implementation_progress between 0 and 100),
  add column if not exists verification_progress smallint not null default 0 check (verification_progress between 0 and 100),
  add column if not exists outcome_progress smallint not null default 0 check (outcome_progress between 0 and 100),
  add column if not exists acceptance_progress smallint not null default 0 check (acceptance_progress between 0 and 100),
  add column if not exists closeout_progress smallint not null default 0 check (closeout_progress between 0 and 100),
  add column if not exists overall_project_progress smallint not null default 0 check (overall_project_progress between 0 and 100),
  add column if not exists completion_eligible boolean not null default false,
  add column if not exists completion_evaluated_at timestamptz,
  add column if not exists completion_evaluator_version text,
  add column if not exists next_required_action text,
  add column if not exists completion_blocking_reasons jsonb not null default '[]'::jsonb,
  add column if not exists completion_satisfied_criteria jsonb not null default '[]'::jsonb,
  add column if not exists completion_overrides jsonb not null default '{}'::jsonb,
  add column if not exists legacy_completion_classification text,
  add column if not exists completion_metadata jsonb not null default '{}'::jsonb;

alter table public.project_task_runs
  add column if not exists outcome_status text not null default 'pending',
  add column if not exists implementation_status text not null default 'not_reported',
  add column if not exists verification_status text not null default 'not_verified',
  add column if not exists result_semantics jsonb not null default '{}'::jsonb,
  add column if not exists next_required_action text,
  add column if not exists completion_evidence jsonb not null default '[]'::jsonb;

create table if not exists public.project_completion_criteria (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  dimension text not null check (dimension in ('work','deliverable','implementation','verification','outcome','acceptance','closeout')),
  criterion_key text not null,
  description text not null,
  required boolean not null default true,
  evidence_requirement jsonb not null default '{}'::jsonb,
  validator_type text not null default 'structured_evidence',
  validation_rule jsonb not null default '{}'::jsonb,
  state text not null default 'pending' check (state in ('pending','passed','failed','blocked','not_applicable','waived')),
  failure_reason text,
  waiver_reason text,
  waiver_approver_user_id uuid references auth.users(id),
  waived_at timestamptz,
  residual_risk text,
  source_entity_type text,
  source_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,criterion_key)
);
create index if not exists project_completion_criteria_project_dim_idx on public.project_completion_criteria(project_id,dimension,state);

create table if not exists public.project_completion_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_run_id uuid references public.project_task_runs(id) on delete set null,
  milestone_id uuid references public.project_milestones(id) on delete set null,
  criterion_id uuid references public.project_completion_criteria(id) on delete set null,
  lifecycle_dimension text check (lifecycle_dimension is null or lifecycle_dimension in ('work','deliverable','implementation','verification','outcome','acceptance','closeout')),
  evidence_type text not null,
  source text not null,
  authoritative_source boolean not null default false,
  collected_at timestamptz not null default now(),
  validator text,
  verification_result text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_url text,
  artifact_id uuid references public.agent_artifacts(id) on delete set null,
  external_system_reference text,
  measurement_start timestamptz,
  measurement_end timestamptz,
  before_value numeric,
  after_value numeric,
  unit text,
  segmentation jsonb not null default '{}'::jsonb,
  structured_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists project_completion_evidence_project_dim_idx on public.project_completion_evidence(project_id,lifecycle_dimension,collected_at desc);

create table if not exists public.project_observation_windows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  criterion_id uuid references public.project_completion_criteria(id) on delete set null,
  observation_start timestamptz,
  observation_end timestamptz,
  required_duration_days integer not null check (required_duration_days >= 0),
  sufficient_data boolean not null default false,
  status text not null default 'pending' check (status in ('pending','in_progress','complete','insufficient_data','cancelled')),
  evidence_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_observation_windows_due_idx on public.project_observation_windows(project_id,status,observation_end);

create table if not exists public.project_metric_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  metric_name text not null,
  measurement_kind text not null check (measurement_kind in ('baseline','outcome')),
  source text not null,
  measurement_start timestamptz,
  measurement_end timestamptz,
  value numeric,
  value_text text,
  unit text,
  segmentation jsonb not null default '{}'::jsonb,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_id uuid references public.project_completion_evidence(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists project_metric_measurements_project_metric_idx on public.project_metric_measurements(project_id,metric_name,measurement_kind);

create table if not exists public.project_completion_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  previous_state text,
  new_state text not null,
  eligible_for_completion boolean not null,
  work_progress smallint not null,
  deliverable_progress smallint not null,
  implementation_progress smallint not null,
  verification_progress smallint not null,
  outcome_progress smallint not null,
  acceptance_progress smallint not null,
  closeout_progress smallint not null,
  overall_project_progress smallint not null,
  blocking_reasons jsonb not null default '[]'::jsonb,
  satisfied_criteria jsonb not null default '[]'::jsonb,
  next_required_action text,
  evaluator_version text not null,
  triggered_event text not null,
  source_type text,
  source_id uuid,
  evidence_references jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now()
);
create index if not exists project_completion_evaluations_project_time_idx on public.project_completion_evaluations(project_id,evaluated_at desc);

create table if not exists public.project_closeout_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','review','final','accepted','rejected')),
  report_data jsonb not null default '{}'::jsonb,
  artifact_id uuid references public.agent_artifacts(id) on delete set null,
  generated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id),
  closure_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_closeout_reports_project_status_idx on public.project_closeout_reports(project_id,status,generated_at desc);

alter table public.project_completion_policies enable row level security;
alter table public.project_completion_criteria enable row level security;
alter table public.project_completion_evidence enable row level security;
alter table public.project_observation_windows enable row level security;
alter table public.project_metric_measurements enable row level security;
alter table public.project_completion_evaluations enable row level security;
alter table public.project_closeout_reports enable row level security;

drop policy if exists project_completion_policies_member_read on public.project_completion_policies;
create policy project_completion_policies_member_read on public.project_completion_policies for select to authenticated using (organization_id is null or public.is_org_member(organization_id));
drop policy if exists project_completion_policies_owner_write on public.project_completion_policies;
create policy project_completion_policies_owner_write on public.project_completion_policies for all to authenticated using (organization_id is not null and public.is_org_owner(organization_id)) with check (organization_id is not null and public.is_org_owner(organization_id));

do $$ declare t text; begin
  foreach t in array array['project_completion_criteria','project_completion_evidence','project_observation_windows','project_metric_measurements','project_completion_evaluations','project_closeout_reports'] loop
    execute format('drop policy if exists %I_member_read on public.%I',t,t);
    execute format('create policy %I_member_read on public.%I for select to authenticated using (public.is_org_member(organization_id))',t,t);
    execute format('drop policy if exists %I_owner_write on public.%I',t,t);
    execute format('create policy %I_owner_write on public.%I for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id))',t,t);
  end loop;
end $$;

grant select on public.project_completion_policies,public.project_completion_criteria,public.project_completion_evidence,public.project_observation_windows,public.project_metric_measurements,public.project_completion_evaluations,public.project_closeout_reports to authenticated;
grant select,insert,update,delete on public.project_completion_criteria,public.project_completion_evidence,public.project_observation_windows,public.project_metric_measurements,public.project_closeout_reports to authenticated;
revoke insert,update,delete on public.project_completion_evaluations from authenticated,anon;

create or replace function public.assign_project_completion_policy_v1(p_project_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_type text; v_policy uuid;
begin
  select project_type,completion_policy_id into v_type,v_policy from public.projects where id=p_project_id;
  if v_policy is not null then return v_policy; end if;
  select id into v_policy from public.project_completion_policies
   where organization_id is null
   order by case
     when lower(coalesce(v_type,'')) ~ '(research|analysis|assessment|audit)' and code='research_analysis' then 0
     when lower(coalesce(v_type,''))='internal_analysis' and code='internal_analysis' then 0
     when code='implementation_standard' then 1 else 9 end, created_at
   limit 1;
  update public.projects set completion_policy_id=v_policy where id=p_project_id and completion_policy_id is null;
  return v_policy;
end $$;

create or replace function public.project_dimension_progress_v1(p_project_id uuid,p_dimension text,p_required boolean,p_allow_waiver boolean default true)
returns integer language sql stable set search_path=public as $$
  with c as (
    select state from public.project_completion_criteria
    where project_id=p_project_id and dimension=p_dimension and required=true
  )
  select case when count(*)=0 then case when p_required then 0 else 100 end
    else round(100.0 * count(*) filter(where state in('passed','not_applicable') or (state='waived' and p_allow_waiver)) / count(*))::integer end
  from c
$$;

create or replace function public.project_work_progress_v1(p_project_id uuid)
returns integer language sql stable set search_path=public as $$
  with latest as (select id from public.project_executions where project_id=p_project_id order by execution_no desc limit 1),
  t as (select greatest(0.1,coalesce(work_weight,1)) w,status from public.project_task_runs where project_id=p_project_id and execution_id=(select id from latest) and status<>'cancelled')
  select case when coalesce(sum(w),0)=0 then 0 else round(100.0*coalesce(sum(w) filter(where status='completed'),0)/sum(w))::integer end from t
$$;

create or replace function public.evaluate_project_completion_v1(p_project_id uuid,p_trigger_event text default 'manual',p_source_type text default null,p_source_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  p public.projects%rowtype; pol public.project_completion_policies%rowtype; v_policy_id uuid;
  req_work boolean; req_deliverable boolean; req_implementation boolean; req_verification boolean; req_outcome boolean; req_acceptance boolean; req_closeout boolean;
  w_work numeric; w_deliverable numeric; w_implementation numeric; w_verification numeric; w_outcome numeric; w_acceptance numeric; w_closeout numeric; total_weight numeric;
  work_p integer; deliverable_p integer; implementation_p integer; verification_p integer; outcome_p integer; acceptance_p integer; closeout_p integer; overall_p integer;
  observation_required boolean; observation_complete boolean:=true; has_blocker boolean:=false; has_hold boolean:=false; workflow_contradiction boolean:=false;
  has_roadmap boolean:=false; has_execution boolean:=false;
  blocking jsonb:='[]'::jsonb; satisfied jsonb:='[]'::jsonb; evidence_refs jsonb:='[]'::jsonb;
  lifecycle text; previous_lifecycle text; eligible boolean:=false; next_action text; final_report_exists boolean:=false;
  evaluator_version constant text:='completion-v2.0';
begin
  select * into p from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found'; end if;
  previous_lifecycle:=p.lifecycle_state;
  v_policy_id:=coalesce(p.completion_policy_id,public.assign_project_completion_policy_v1(p_project_id));
  select * into pol from public.project_completion_policies where id=v_policy_id;
  if not found then raise exception 'Completion policy unavailable'; end if;

  req_work:=coalesce((pol.required_dimensions->>'work')::boolean,true); req_deliverable:=coalesce((pol.required_dimensions->>'deliverable')::boolean,true);
  req_implementation:=coalesce((pol.required_dimensions->>'implementation')::boolean,true); req_verification:=coalesce((pol.required_dimensions->>'verification')::boolean,true);
  req_outcome:=coalesce((pol.required_dimensions->>'outcome')::boolean,true); req_acceptance:=coalesce((pol.required_dimensions->>'acceptance')::boolean,true); req_closeout:=coalesce((pol.required_dimensions->>'closeout')::boolean,true);
  w_work:=coalesce((pol.weights->>'work')::numeric,0); w_deliverable:=coalesce((pol.weights->>'deliverable')::numeric,0); w_implementation:=coalesce((pol.weights->>'implementation')::numeric,0);
  w_verification:=coalesce((pol.weights->>'verification')::numeric,0); w_outcome:=coalesce((pol.weights->>'outcome')::numeric,0); w_acceptance:=coalesce((pol.weights->>'acceptance')::numeric,0); w_closeout:=coalesce((pol.weights->>'closeout')::numeric,0);

  select exists(select 1 from public.project_roadmaps r where r.project_id=p_project_id and r.status='approved' and r.is_baseline=true) into has_roadmap;
  select exists(select 1 from public.project_executions e where e.project_id=p_project_id) into has_execution;
  work_p:=public.project_work_progress_v1(p_project_id);
  deliverable_p:=public.project_dimension_progress_v1(p_project_id,'deliverable',req_deliverable,pol.allow_residual_risk_acceptance);
  implementation_p:=public.project_dimension_progress_v1(p_project_id,'implementation',req_implementation,pol.allow_residual_risk_acceptance);
  verification_p:=public.project_dimension_progress_v1(p_project_id,'verification',req_verification,pol.allow_residual_risk_acceptance);
  outcome_p:=public.project_dimension_progress_v1(p_project_id,'outcome',req_outcome,pol.allow_residual_risk_acceptance);
  acceptance_p:=public.project_dimension_progress_v1(p_project_id,'acceptance',req_acceptance,pol.allow_residual_risk_acceptance);
  select exists(select 1 from public.project_closeout_reports where project_id=p_project_id and status in('final','accepted')) into final_report_exists;
  closeout_p:=case when not req_closeout then 100 when final_report_exists then 100 else public.project_dimension_progress_v1(p_project_id,'closeout',true,pol.allow_residual_risk_acceptance) end;

  observation_required:=coalesce((p.completion_overrides->>'observation_required')::boolean,pol.observation_required);
  if observation_required then
    select coalesce(bool_and(status='complete' and sufficient_data),false) into observation_complete from public.project_observation_windows where project_id=p_project_id and status<>'cancelled';
    if not exists(select 1 from public.project_observation_windows where project_id=p_project_id and status<>'cancelled') then observation_complete:=false; end if;
  end if;

  select exists(select 1 from public.project_completion_criteria c where c.project_id=p_project_id and c.required and c.state in('failed','blocked')) into has_blocker;
  select exists(select 1 from public.project_completion_criteria c where c.project_id=p_project_id and c.required and c.state='blocked' and c.metadata->>'blocker_type'='governance_hold') into has_hold;
  has_blocker:=has_blocker or p.blocker_type is not null;
  workflow_contradiction:=coalesce(p.workflow_state,'') in ('DECISION_PENDING','APPROVAL_PENDING','LEGAL_REVIEW','DELIBERATION','BLOCKED');

  select coalesce(jsonb_agg(jsonb_build_object('criterionKey',criterion_key,'dimension',dimension,'reason',coalesce(failure_reason,description),'state',state) order by created_at),'[]'::jsonb) into blocking
  from public.project_completion_criteria where project_id=p_project_id and required and state in('failed','blocked','pending');
  if observation_required and not observation_complete then blocking:=blocking||jsonb_build_array(jsonb_build_object('dimension','outcome','reason','Required observation window is incomplete or lacks sufficient data','state','pending')); end if;
  if p.blocker_type is not null then blocking:=blocking||jsonb_build_array(jsonb_build_object('dimension','project','reason',coalesce(p.blocker_summary,p.blocker_type),'state','blocked')); end if;
  if workflow_contradiction then blocking:=blocking||jsonb_build_array(jsonb_build_object('dimension','workflow','reason','Workflow state '||p.workflow_state||' is not compatible with project completion','state','blocked')); end if;
  select coalesce(jsonb_agg(jsonb_build_object('criterionKey',criterion_key,'dimension',dimension,'state',state) order by created_at),'[]'::jsonb) into satisfied
  from public.project_completion_criteria where project_id=p_project_id and required and (state in('passed','not_applicable') or (state='waived' and pol.allow_residual_risk_acceptance));
  select coalesce(jsonb_agg(id),'[]'::jsonb) into evidence_refs from public.project_completion_evidence where project_id=p_project_id and authoritative_source=true;

  total_weight:=(case when req_work then w_work else 0 end)+(case when req_deliverable then w_deliverable else 0 end)+(case when req_implementation then w_implementation else 0 end)+(case when req_verification then w_verification else 0 end)+(case when req_outcome then w_outcome else 0 end)+(case when req_acceptance then w_acceptance else 0 end)+(case when req_closeout then w_closeout else 0 end);
  if total_weight<=0 then total_weight:=1; end if;
  overall_p:=round(((case when req_work then w_work*work_p else 0 end)+(case when req_deliverable then w_deliverable*deliverable_p else 0 end)+(case when req_implementation then w_implementation*implementation_p else 0 end)+(case when req_verification then w_verification*verification_p else 0 end)+(case when req_outcome then w_outcome*outcome_p else 0 end)+(case when req_acceptance then w_acceptance*acceptance_p else 0 end)+(case when req_closeout then w_closeout*closeout_p else 0 end))/total_weight)::integer;

  if p.status='cancelled' then lifecycle:='CANCELLED'; next_action:='No action — project is cancelled.';
  elsif p.status='failed' then lifecycle:='FAILED'; next_action:='Review failure and decide whether to restart or close the project.';
  elsif has_hold then lifecycle:='ON_HOLD'; next_action:=coalesce((select failure_reason from public.project_completion_criteria where project_id=p_project_id and required and state='blocked' and metadata->>'blocker_type'='governance_hold' order by created_at desc limit 1),'Resolve the active governance HOLD decision.');
  elsif has_blocker and pol.unresolved_blockers_prevent_closure then lifecycle:='BLOCKED'; next_action:=coalesce(p.resolution_required,(select coalesce(failure_reason,description) from public.project_completion_criteria where project_id=p_project_id and required and state in('failed','blocked') order by created_at desc limit 1),'Resolve blocking completion criteria.');
  elsif not has_roadmap then lifecycle:=case when p.status='idea' then 'DRAFT' when p.status='planning' then 'PLANNING' else 'DISCOVERY' end; next_action:='Complete project analysis and approve the baseline roadmap.';
  elsif not has_execution then lifecycle:='READY_FOR_EXECUTION'; next_action:='Start execution from the approved roadmap.';
  elsif req_work and work_p<100 then lifecycle:='EXECUTION'; next_action:='Complete remaining planned work.';
  elsif req_deliverable and deliverable_p<100 then lifecycle:='EXECUTION'; next_action:='Complete and validate mandatory deliverables.';
  elsif req_implementation and implementation_p<100 then lifecycle:='IMPLEMENTATION_PENDING'; next_action:='Execute and evidence mandatory real-world implementation items.';
  elsif req_verification and verification_p<100 then lifecycle:='VERIFICATION'; next_action:='Verify implementation against mandatory acceptance criteria.';
  elsif observation_required and not observation_complete then lifecycle:='OBSERVATION'; next_action:=coalesce((select 'Continue observation until '||to_char(observation_end,'YYYY-MM-DD') from public.project_observation_windows where project_id=p_project_id and status in('pending','in_progress','insufficient_data') order by observation_end desc nulls last limit 1),'Start the required observation window and collect authoritative measurements.');
  elsif req_outcome and outcome_p<100 then lifecycle:='OUTCOME_VALIDATION'; next_action:='Validate measurable project outcomes from authoritative evidence.';
  elsif req_acceptance and acceptance_p<100 then lifecycle:='ACCEPTANCE_PENDING'; next_action:='Obtain the required authorized stakeholder acceptance.';
  elsif req_closeout and closeout_p<100 then lifecycle:='CLOSEOUT'; next_action:='Generate and review the final project closeout report.';
  elsif workflow_contradiction then lifecycle:=case when p.workflow_state='BLOCKED' then 'BLOCKED' else 'ACCEPTANCE_PENDING' end; next_action:='Resolve the pending governed workflow state before closure.';
  else lifecycle:='COMPLETED'; eligible:=true; overall_p:=100; next_action:='Project closed with required evidence and acceptance.'; end if;
  if not eligible then overall_p:=least(overall_p,99); end if;

  update public.projects set completion_policy_id=v_policy_id,lifecycle_state=lifecycle,work_progress=work_p,deliverable_progress=deliverable_p,implementation_progress=implementation_p,verification_progress=verification_p,outcome_progress=outcome_p,acceptance_progress=acceptance_p,closeout_progress=closeout_p,overall_project_progress=overall_p,progress_percent=overall_p,completion_eligible=eligible,completion_evaluated_at=now(),completion_evaluator_version=evaluator_version,next_required_action=next_action,completion_blocking_reasons=blocking,completion_satisfied_criteria=satisfied,
    status=case when lifecycle='COMPLETED' then 'completed' when lifecycle='CANCELLED' then 'cancelled' when lifecycle='FAILED' then 'failed' when lifecycle in('BLOCKED','ON_HOLD') then 'blocked' else case when status='completed' then 'active' else status end end,
    stage=lower(lifecycle),updated_at=now() where id=p_project_id;

  insert into public.project_completion_evaluations(organization_id,project_id,previous_state,new_state,eligible_for_completion,work_progress,deliverable_progress,implementation_progress,verification_progress,outcome_progress,acceptance_progress,closeout_progress,overall_project_progress,blocking_reasons,satisfied_criteria,next_required_action,evaluator_version,triggered_event,source_type,source_id,evidence_references)
  values(p.organization_id,p_project_id,previous_lifecycle,lifecycle,eligible,work_p,deliverable_p,implementation_p,verification_p,outcome_p,acceptance_p,closeout_p,overall_p,blocking,satisfied,next_action,evaluator_version,coalesce(p_trigger_event,'manual'),p_source_type,p_source_id,evidence_refs);

  return jsonb_build_object('eligibleForCompletion',eligible,'currentLifecycleState',lifecycle,'workProgress',work_p,'deliverableProgress',deliverable_p,'implementationProgress',implementation_p,'verificationProgress',verification_p,'outcomeProgress',outcome_p,'acceptanceProgress',acceptance_p,'closeoutProgress',closeout_p,'overallProjectProgress',overall_p,'blockingReasons',blocking,'satisfiedCriteria',satisfied,'nextRequiredAction',next_action,'evaluatorVersion',evaluator_version,'observationRequired',observation_required,'observationComplete',observation_complete,'requiredDimensions',pol.required_dimensions);
end $$;

create or replace function public.get_project_completion_explanation_v1(p_project_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('eligibleForCompletion',p.completion_eligible,'currentLifecycleState',p.lifecycle_state,'workProgress',p.work_progress,'deliverableProgress',p.deliverable_progress,'implementationProgress',p.implementation_progress,'verificationProgress',p.verification_progress,'outcomeProgress',p.outcome_progress,'acceptanceProgress',p.acceptance_progress,'closeoutProgress',p.closeout_progress,'overallProjectProgress',p.overall_project_progress,'blockingReasons',p.completion_blocking_reasons,'satisfiedCriteria',p.completion_satisfied_criteria,'nextRequiredAction',p.next_required_action,'evaluatorVersion',p.completion_evaluator_version,'evaluatedAt',p.completion_evaluated_at,'requiredDimensions',coalesce(pol.required_dimensions,'{}'::jsonb),'policyCode',pol.code)
  from public.projects p left join public.project_completion_policies pol on pol.id=p.completion_policy_id where p.id=p_project_id and public.is_org_member(p.organization_id)
$$;

create or replace function public.generate_project_closeout_report_v1(p_project_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare p public.projects%rowtype; report_id uuid; report jsonb; baseline jsonb; outcomes jsonb; comparisons jsonb;
begin
  select * into p from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.metric_name,m.measurement_start),'[]'::jsonb) into baseline from public.project_metric_measurements m where m.project_id=p_project_id and m.measurement_kind='baseline';
  select coalesce(jsonb_agg(to_jsonb(m) order by m.metric_name,m.measurement_start),'[]'::jsonb) into outcomes from public.project_metric_measurements m where m.project_id=p_project_id and m.measurement_kind='outcome';
  select coalesce(jsonb_agg(jsonb_build_object('metricName',b.metric_name,'unit',coalesce(o.unit,b.unit),'beforeValue',b.value,'afterValue',o.value,'absoluteChange',case when b.value is not null and o.value is not null then o.value-b.value else null end,'percentageChange',case when b.value is not null and b.value<>0 and o.value is not null then round(((o.value-b.value)/abs(b.value))*100,2) else null end,'interpretation','Observed change only; causal project impact is not established without separate causal evidence.','causalityConfidence','not_established')),'[]'::jsonb) into comparisons
  from public.project_metric_measurements b join lateral (select * from public.project_metric_measurements x where x.project_id=b.project_id and x.metric_name=b.metric_name and x.measurement_kind='outcome' order by x.measurement_end desc nulls last,x.created_at desc limit 1) o on true where b.project_id=p_project_id and b.measurement_kind='baseline';
  report:=jsonb_build_object(
    'executiveSummary',jsonb_build_object('lifecycleState',p.lifecycle_state,'overallProjectProgress',p.overall_project_progress,'eligibleForCompletion',p.completion_eligible),
    'originalObjective',p.objective,'scope',p.scope,'startingBaseline',baseline,
    'workPerformed',(select coalesce(jsonb_agg(jsonb_build_object('task',title,'workStatus',status,'completedAt',completed_at) order by created_at),'[]'::jsonb) from public.project_task_runs where project_id=p_project_id and status='completed'),
    'deliverablesProduced',(select coalesce(jsonb_agg(jsonb_build_object('criterion',description,'state',state,'evidenceRequirement',evidence_requirement) order by created_at),'[]'::jsonb) from public.project_completion_criteria where project_id=p_project_id and dimension='deliverable'),
    'implementationsExecuted',(select coalesce(jsonb_agg(jsonb_build_object('criterion',description,'state',state) order by created_at),'[]'::jsonb) from public.project_completion_criteria where project_id=p_project_id and dimension='implementation' and state in('passed','waived','not_applicable')),
    'verificationResults',(select coalesce(jsonb_agg(jsonb_build_object('criterion',description,'state',state,'failureReason',failure_reason) order by created_at),'[]'::jsonb) from public.project_completion_criteria where project_id=p_project_id and dimension='verification'),
    'beforeAfterMetrics',comparisons,'outcomeMeasurements',outcomes,
    'outcomeAssessment',jsonb_build_object('progress',p.outcome_progress,'causalityStatement','Observed changes are reported separately from causal attribution.'),
    'outstandingIssues',p.completion_blocking_reasons,
    'acceptedResidualRisks',(select coalesce(jsonb_agg(jsonb_build_object('criterion',description,'risk',residual_risk,'waiverReason',waiver_reason) order by created_at),'[]'::jsonb) from public.project_completion_criteria where project_id=p_project_id and state='waived'),
    'limitations',jsonb_build_array('Missing evidence is never treated as passed.','Planned work is not reported as executed.','Incomplete observation windows are not reported as measured outcomes.'),
    'recommendationsNextCycle',jsonb_build_array(coalesce(p.next_required_action,'No next action recorded.')),
    'finalAcceptance',(select coalesce(jsonb_agg(jsonb_build_object('criterion',description,'state',state,'waiverReason',waiver_reason) order by created_at),'[]'::jsonb) from public.project_completion_criteria where project_id=p_project_id and dimension='acceptance'),
    'closureDate',case when p.lifecycle_state='COMPLETED' then current_date else null end
  );
  insert into public.project_closeout_reports(organization_id,project_id,status,report_data) values(p.organization_id,p_project_id,'draft',report) returning id into report_id;
  return report_id;
end $$;

create or replace function public.refresh_project_progress_percent_v1(p_project_id uuid)
returns integer language plpgsql security definer set search_path=public as $$ declare r jsonb; begin r:=public.evaluate_project_completion_v1(p_project_id,'progress_event'); return coalesce((r->>'overallProjectProgress')::integer,0); end $$;

create or replace function public.reconcile_project_execution_terminal_states_v1()
returns integer language plpgsql security definer set search_path=public as $$
declare reconciled integer:=0; execution_row record; total_count integer; terminal_count integer;
begin
  for execution_row in select e.id,e.organization_id,e.project_id from public.project_executions e where e.status in('queued','running') for update skip locked loop
    select count(*),count(*) filter(where status in('completed','cancelled')) into total_count,terminal_count from public.project_task_runs where execution_id=execution_row.id;
    if total_count>0 and total_count=terminal_count then
      update public.project_executions set status='completed',completed_at=coalesce(completed_at,now()),last_heartbeat_at=now(),updated_at=now() where id=execution_row.id and status in('queued','running');
      if not exists(select 1 from public.project_activity_events where execution_id=execution_row.id and event_type='project.execution.work_completed') then
        insert into public.project_activity_events(organization_id,project_id,execution_id,event_type,headline,detail,importance,metadata) values(execution_row.organization_id,execution_row.project_id,execution_row.id,'project.execution.work_completed','Project work execution completed','All assigned work in this execution reached a terminal work state. Project completion remains subject to deliverable, implementation, verification, outcome, acceptance and closeout gates.','major',jsonb_build_object('terminal_work_states',jsonb_build_array('completed','cancelled')));
      end if;
      perform public.evaluate_project_completion_v1(execution_row.project_id,'execution_work_completed','project_execution',execution_row.id); reconciled:=reconciled+1;
    end if;
  end loop; return reconciled;
end $$;

create or replace function public.reconcile_project_completion_observations_v1()
returns integer language plpgsql security definer set search_path=public as $$
declare r record; n integer:=0;
begin
  for r in select * from public.project_observation_windows where status in('pending','in_progress','insufficient_data') and observation_start is not null loop
    update public.project_observation_windows set observation_end=coalesce(observation_end,observation_start+make_interval(days=>required_duration_days)),status=case when now()>=observation_start+make_interval(days=>required_duration_days) then case when sufficient_data then 'complete' else 'insufficient_data' end else 'in_progress' end,updated_at=now() where id=r.id;
    perform public.evaluate_project_completion_v1(r.project_id,'observation_tick','observation_window',r.id); n:=n+1;
  end loop; return n;
end $$;

create or replace function public.reconcile_project_completion_states_v1()
returns integer language plpgsql security definer set search_path=public as $$
declare r record; n integer:=0;
begin
  for r in select id from public.projects where status<>'cancelled' and (status<>'completed' or legacy_completion_classification='legacy_completion_incomplete') loop perform public.evaluate_project_completion_v1(r.id,'scheduler_tick'); n:=n+1; end loop;
  return n;
end $$;

create or replace function public.project_completion_recalc_trigger_v1()
returns trigger language plpgsql security definer set search_path=public as $$
declare pid uuid; sid uuid;
begin
  if tg_op='DELETE' then pid:=old.project_id; sid:=old.id; else pid:=new.project_id; sid:=new.id; end if;
  if pid is not null then perform public.evaluate_project_completion_v1(pid,lower(tg_table_name)||'.'||lower(tg_op),tg_table_name,sid); end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

create or replace function public.guard_project_completed_transition_v1()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') and (not coalesce(new.completion_eligible,false) or coalesce(new.lifecycle_state,'')<>'COMPLETED' or coalesce(new.overall_project_progress,0)<>100) then
    raise exception 'Project cannot transition to completed until deterministic completion gates are satisfied';
  end if;
  return new;
end $$;

-- Assign policies before importing legacy criteria. No recalculation triggers exist yet, so
-- historical completed rows cannot be silently reopened during classification.
update public.projects p set completion_policy_id=coalesce(p.completion_policy_id,(select id from public.project_completion_policies where organization_id is null order by case when lower(p.project_type) ~ '(research|analysis|assessment|audit)' and code='research_analysis' then 0 when lower(p.project_type)='internal_analysis' and code='internal_analysis' then 0 when code='implementation_standard' then 1 else 9 end limit 1));

insert into public.project_completion_criteria(organization_id,project_id,dimension,criterion_key,description,required,validator_type,state,source_entity_type,source_entity_id,metadata)
select p.organization_id,p.id,'outcome','project-success-'||left(md5(x.value::text),24),trim(both '"' from x.value::text),true,'authoritative_evidence','pending','project',p.id,jsonb_build_object('legacy_import',true)
from public.projects p cross join lateral jsonb_array_elements(coalesce(p.success_criteria,'[]'::jsonb)) x where jsonb_typeof(coalesce(p.success_criteria,'[]'::jsonb))='array' and length(trim(both '"' from x.value::text))>0 on conflict(project_id,criterion_key) do nothing;

insert into public.project_completion_criteria(organization_id,project_id,dimension,criterion_key,description,required,validator_type,state,source_entity_type,source_entity_id,metadata)
select ph.organization_id,ph.project_id,'deliverable','phase-deliverable-'||ph.id::text||'-'||left(md5(x.value::text),16),trim(both '"' from x.value::text),true,'artifact_or_structured_evidence','pending','roadmap_phase',ph.id,jsonb_build_object('legacy_import',true,'phase_key',ph.phase_key)
from public.project_roadmap_phases ph cross join lateral jsonb_array_elements(coalesce(ph.deliverables,'[]'::jsonb)) x where jsonb_typeof(coalesce(ph.deliverables,'[]'::jsonb))='array' and length(trim(both '"' from x.value::text))>0 on conflict(project_id,criterion_key) do nothing;

insert into public.project_completion_criteria(organization_id,project_id,dimension,criterion_key,description,required,validator_type,state,source_entity_type,source_entity_id,metadata)
select ph.organization_id,ph.project_id,'verification','phase-success-'||ph.id::text||'-'||left(md5(x.value::text),16),trim(both '"' from x.value::text),true,'independent_verification','pending','roadmap_phase',ph.id,jsonb_build_object('legacy_import',true,'phase_key',ph.phase_key)
from public.project_roadmap_phases ph cross join lateral jsonb_array_elements(coalesce(ph.success_criteria,'[]'::jsonb)) x where jsonb_typeof(coalesce(ph.success_criteria,'[]'::jsonb))='array' and length(trim(both '"' from x.value::text))>0 on conflict(project_id,criterion_key) do nothing;

with latest_human as (
  select distinct on (project_id) id,organization_id,project_id,decision,created_at from public.project_decision_memory where decision_maker_type='human_ceo' order by project_id,created_at desc
)
insert into public.project_completion_criteria(organization_id,project_id,dimension,criterion_key,description,required,validator_type,state,failure_reason,source_entity_type,source_entity_id,metadata)
select d.organization_id,d.project_id,'outcome','governance-hold-'||d.id::text,'Active Human CEO HOLD decision',true,'human_governance','blocked',d.decision,'project_decision_memory',d.id,jsonb_build_object('legacy_import',true,'blocker_type','governance_hold')
from latest_human d where d.decision ~* '\mHOLD\M' and d.decision !~* '\mLIFT(ED|ING)?\M.{0,40}\mHOLD\M' on conflict(project_id,criterion_key) do nothing;

with phase_text as (
  select ph.organization_id,ph.project_id,concat_ws(' ',ph.title,ph.description,ph.milestone,ph.deliverables::text,ph.success_criteria::text) txt from public.project_roadmap_phases ph
), detected as (
  select organization_id,project_id,max(((regexp_match(txt,'([0-9]{1,3})[ -]?day','i'))[1])::integer) days from phase_text where txt ~* '[0-9]{1,3}[ -]?day' group by organization_id,project_id
)
update public.projects p set completion_overrides=p.completion_overrides||jsonb_build_object('observation_required',true,'minimum_observation_days',d.days) from detected d where p.id=d.project_id;

insert into public.project_observation_windows(organization_id,project_id,required_duration_days,status,metadata)
select p.organization_id,p.id,coalesce((p.completion_overrides->>'minimum_observation_days')::integer,0),'pending',jsonb_build_object('legacy_import',true,'reason','Explicit roadmap observation requirement') from public.projects p
where coalesce((p.completion_overrides->>'observation_required')::boolean,false)=true and not exists(select 1 from public.project_observation_windows w where w.project_id=p.id and w.status<>'cancelled');

update public.projects set legacy_completion_classification='legacy_completion_unknown',lifecycle_state='COMPLETED',overall_project_progress=100,progress_percent=100 where status='completed' and legacy_completion_classification is null;
update public.projects p set legacy_completion_classification='legacy_completion_incomplete' where p.status='completed' and (coalesce(p.workflow_state,'') not in ('COMPLETE','COMPLETED') or p.blocker_type is not null or exists(select 1 from public.project_completion_criteria c where c.project_id=p.id and c.required and c.state in('failed','blocked')) or exists(select 1 from public.approval_requests a where a.project_id=p.id and a.status='pending'));

do $$ declare r record; begin
  for r in select id from public.projects where status<>'completed' or legacy_completion_classification='legacy_completion_incomplete' loop perform public.evaluate_project_completion_v1(r.id,'completion_architecture_migration'); end loop;
end $$;

-- Event-driven recalculation is enabled only after safe legacy classification/backfill.
drop trigger if exists project_completion_criteria_recalc_v1 on public.project_completion_criteria;
create trigger project_completion_criteria_recalc_v1 after insert or update or delete on public.project_completion_criteria for each row execute function public.project_completion_recalc_trigger_v1();
drop trigger if exists project_observation_windows_recalc_v1 on public.project_observation_windows;
create trigger project_observation_windows_recalc_v1 after insert or update or delete on public.project_observation_windows for each row execute function public.project_completion_recalc_trigger_v1();
drop trigger if exists project_closeout_reports_recalc_v1 on public.project_closeout_reports;
create trigger project_closeout_reports_recalc_v1 after insert or update or delete on public.project_closeout_reports for each row execute function public.project_completion_recalc_trigger_v1();
drop trigger if exists project_completion_approval_recalc_v1 on public.approval_requests;
create trigger project_completion_approval_recalc_v1 after insert or update of status on public.approval_requests for each row when (new.project_id is not null) execute function public.project_completion_recalc_trigger_v1();

drop trigger if exists projects_completion_transition_guard_v1 on public.projects;
create trigger projects_completion_transition_guard_v1 before insert or update of status on public.projects for each row execute function public.guard_project_completed_transition_v1();

-- New projects receive a policy at creation without forcing lifecycle advancement.
create or replace function public.initialize_project_completion_policy_v1() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.assign_project_completion_policy_v1(new.id); return new; end $$;
drop trigger if exists projects_completion_policy_init_v1 on public.projects;
create trigger projects_completion_policy_init_v1 after insert on public.projects for each row execute function public.initialize_project_completion_policy_v1();

revoke all on function public.assign_project_completion_policy_v1(uuid) from public,anon,authenticated;
revoke all on function public.evaluate_project_completion_v1(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.reconcile_project_completion_observations_v1() from public,anon,authenticated;
revoke all on function public.reconcile_project_completion_states_v1() from public,anon,authenticated;
revoke all on function public.generate_project_closeout_report_v1(uuid) from public,anon,authenticated;
grant execute on function public.assign_project_completion_policy_v1(uuid) to service_role;
grant execute on function public.evaluate_project_completion_v1(uuid,text,text,uuid) to service_role;
grant execute on function public.reconcile_project_completion_observations_v1() to service_role;
grant execute on function public.reconcile_project_completion_states_v1() to service_role;
grant execute on function public.generate_project_closeout_report_v1(uuid) to service_role;
revoke all on function public.get_project_completion_explanation_v1(uuid) from public,anon;
grant execute on function public.get_project_completion_explanation_v1(uuid) to authenticated,service_role;
revoke all on function public.project_dimension_progress_v1(uuid,text,boolean,boolean) from public,anon,authenticated;
revoke all on function public.project_work_progress_v1(uuid) from public,anon,authenticated;
grant execute on function public.project_dimension_progress_v1(uuid,text,boolean,boolean) to service_role;
grant execute on function public.project_work_progress_v1(uuid) to service_role;

commit;
