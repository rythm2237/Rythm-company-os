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
  minimum_observation_days integer not null default 0 check (minimum_observation_days>=0),
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

insert into public.project_completion_policies(code,name,project_type_patterns,required_dimensions,weights,observation_required,minimum_observation_days,acceptance_authority,outcome_validation_required,customer_signoff_required,allow_residual_risk_acceptance,unresolved_blockers_prevent_closure,is_default) values
('implementation_standard','Implementation project',ARRAY['business_project','software','website','automation','integration','operations','security','advertising','seo'],'{"work":true,"deliverable":true,"implementation":true,"verification":true,"outcome":true,"acceptance":true,"closeout":true}'::jsonb,'{"work":20,"deliverable":10,"implementation":25,"verification":20,"outcome":10,"acceptance":10,"closeout":5}'::jsonb,false,0,'project_owner',true,false,true,true,true),
('research_analysis','Research / analysis project',ARRAY['research','analysis','assessment','audit'],'{"work":true,"deliverable":true,"implementation":false,"verification":true,"outcome":true,"acceptance":false,"closeout":true}'::jsonb,'{"work":30,"deliverable":20,"implementation":0,"verification":20,"outcome":20,"acceptance":0,"closeout":10}'::jsonb,false,0,null,true,false,true,true,false),
('internal_analysis','Short internal analysis',ARRAY['internal_analysis'],'{"work":true,"deliverable":true,"implementation":false,"verification":true,"outcome":true,"acceptance":false,"closeout":true}'::jsonb,'{"work":35,"deliverable":25,"implementation":0,"verification":15,"outcome":15,"acceptance":0,"closeout":10}'::jsonb,false,0,null,true,false,true,true,false)
on conflict do nothing;

alter table public.projects
  add column if not exists completion_policy_id uuid references public.project_completion_policies(id),
  add column if not exists lifecycle_state text not null default 'DISCOVERY',
  add column if not exists work_progress smallint not null default 0 check(work_progress between 0 and 100),
  add column if not exists deliverable_progress smallint not null default 0 check(deliverable_progress between 0 and 100),
  add column if not exists implementation_progress smallint not null default 0 check(implementation_progress between 0 and 100),
  add column if not exists verification_progress smallint not null default 0 check(verification_progress between 0 and 100),
  add column if not exists outcome_progress smallint not null default 0 check(outcome_progress between 0 and 100),
  add column if not exists acceptance_progress smallint not null default 0 check(acceptance_progress between 0 and 100),
  add column if not exists closeout_progress smallint not null default 0 check(closeout_progress between 0 and 100),
  add column if not exists overall_project_progress smallint not null default 0 check(overall_project_progress between 0 and 100),
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

create table if not exists public.project_completion_criteria(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
  dimension text not null check(dimension in('work','deliverable','implementation','verification','outcome','acceptance','closeout')), criterion_key text not null, description text not null, required boolean not null default true,
  evidence_requirement jsonb not null default '{}'::jsonb, validator_type text not null default 'structured_evidence', validation_rule jsonb not null default '{}'::jsonb,
  state text not null default 'pending' check(state in('pending','passed','failed','blocked','not_applicable','waived')), failure_reason text, waiver_reason text, waiver_approver_user_id uuid references auth.users(id), waived_at timestamptz, residual_risk text,
  source_entity_type text, source_entity_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id,criterion_key)
);
create index if not exists project_completion_criteria_project_dim_idx on public.project_completion_criteria(project_id,dimension,state);

create table if not exists public.project_completion_evidence(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
  task_run_id uuid references public.project_task_runs(id) on delete set null, milestone_id uuid references public.project_milestones(id) on delete set null, criterion_id uuid references public.project_completion_criteria(id) on delete set null,
  lifecycle_dimension text check(lifecycle_dimension is null or lifecycle_dimension in('work','deliverable','implementation','verification','outcome','acceptance','closeout')), evidence_type text not null, source text not null, authoritative_source boolean not null default false,
  collected_at timestamptz not null default now(), validator text, verification_result text, confidence numeric check(confidence is null or(confidence>=0 and confidence<=1)), evidence_url text,
  artifact_id uuid references public.agent_artifacts(id) on delete set null, external_system_reference text, measurement_start timestamptz, measurement_end timestamptz, before_value numeric, after_value numeric, unit text,
  segmentation jsonb not null default '{}'::jsonb, structured_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists project_completion_evidence_project_dim_idx on public.project_completion_evidence(project_id,lifecycle_dimension,collected_at desc);

create table if not exists public.project_observation_windows(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
  criterion_id uuid references public.project_completion_criteria(id) on delete set null, observation_start timestamptz, observation_end timestamptz, required_duration_days integer not null check(required_duration_days>=0),
  sufficient_data boolean not null default false, status text not null default 'pending' check(status in('pending','in_progress','complete','insufficient_data','cancelled')), evidence_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists project_observation_windows_due_idx on public.project_observation_windows(project_id,status,observation_end);

create table if not exists public.project_metric_measurements(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
  metric_name text not null, measurement_kind text not null check(measurement_kind in('baseline','outcome')), source text not null, measurement_start timestamptz, measurement_end timestamptz, value numeric, value_text text, unit text,
  segmentation jsonb not null default '{}'::jsonb, confidence numeric check(confidence is null or(confidence>=0 and confidence<=1)), evidence_id uuid references public.project_completion_evidence(id) on delete set null, created_at timestamptz not null default now()
);
create index if not exists project_metric_measurements_project_metric_idx on public.project_metric_measurements(project_id,metric_name,measurement_kind);

create table if not exists public.project_completion_evaluations(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
  previous_state text, new_state text not null, eligible_for_completion boolean not null, work_progress smallint not null, deliverable_progress smallint not null, implementation_progress smallint not null,
  verification_progress smallint not null, outcome_progress smallint not null, acceptance_progress smallint not null, closeout_progress smallint not null, overall_project_progress smallint not null,
  blocking_reasons jsonb not null default '[]'::jsonb, satisfied_criteria jsonb not null default '[]'::jsonb, next_required_action text, evaluator_version text not null, triggered_event text not null,
  source_type text, source_id uuid, evidence_references jsonb not null default '[]'::jsonb, evaluated_at timestamptz not null default now()
);
create index if not exists project_completion_evaluations_project_time_idx on public.project_completion_evaluations(project_id,evaluated_at desc);

create table if not exists public.project_closeout_reports(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'draft' check(status in('draft','review','final','accepted','rejected')), report_data jsonb not null default '{}'::jsonb, artifact_id uuid references public.agent_artifacts(id) on delete set null,
  generated_at timestamptz not null default now(), reviewed_at timestamptz, accepted_at timestamptz, accepted_by_user_id uuid references auth.users(id), closure_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
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
create policy project_completion_policies_member_read on public.project_completion_policies for select to authenticated using(organization_id is null or public.is_org_member(organization_id));
drop policy if exists project_completion_policies_owner_write on public.project_completion_policies;
create policy project_completion_policies_owner_write on public.project_completion_policies for all to authenticated using(organization_id is not null and public.is_org_owner(organization_id)) with check(organization_id is not null and public.is_org_owner(organization_id));

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

commit;
