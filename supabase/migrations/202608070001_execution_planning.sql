-- AI-PR-001 governed execution planning release batch.
-- Extends the existing Action Item Engine; it does not create a parallel task system.

alter table public.action_items add column if not exists action_code text;
alter table public.action_items add column if not exists phase_code text;
alter table public.action_items add column if not exists phase_name text;
alter table public.action_items add column if not exists execution_order smallint;
alter table public.action_items add column if not exists owner_label text;
alter table public.action_items add column if not exists assigned_agent_id uuid references public.agents(id) on delete set null;
alter table public.action_items add column if not exists strategy_analysis_id uuid references public.project_strategy_analyses(id) on delete set null;
alter table public.action_items add column if not exists dependencies jsonb not null default '[]'::jsonb;
alter table public.action_items add column if not exists success_criteria jsonb not null default '[]'::jsonb;
alter table public.action_items add column if not exists evidence_required jsonb not null default '[]'::jsonb;
alter table public.action_items add column if not exists risk_level text not null default 'low';

create unique index if not exists action_items_project_action_code_uidx
  on public.action_items(project_id, action_code)
  where project_id is not null and action_code is not null;
create index if not exists action_items_execution_plan_idx
  on public.action_items(project_id, phase_code, execution_order);
create index if not exists action_items_assigned_agent_idx
  on public.action_items(assigned_agent_id, status, due_at);

-- Keep the risk vocabulary aligned with the governance engines without assuming
-- an existing named constraint on action_items.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.action_items'::regclass
      and conname = 'action_items_risk_level_check'
  ) then
    alter table public.action_items
      add constraint action_items_risk_level_check
      check (risk_level in ('low','medium','high','critical')) not valid;
    alter table public.action_items validate constraint action_items_risk_level_check;
  end if;
end $$;

-- Seed the 15 governed actions from approved strategy SA-001 / AI-PR-001-DEC-001.
with project_context as (
  select
    p.id as project_id,
    p.organization_id,
    sa.id as strategy_analysis_id,
    d.id as decision_id
  from public.projects p
  join public.project_strategy_analyses sa
    on sa.project_id = p.id and sa.analysis_code = 'SA-001'
  join public.decisions d
    on d.project_id = p.id and d.decision_key = 'AI-PR-001-DEC-001'
  where p.project_code = 'AI-PR-001'
), action_seed as (
  select * from (values
    ('AI-PR-001-ACT-001','P1','Focus and Truth',1::smallint,'Define and approve primary target persona','Select one primary target-user segment for the beta-readiness program and document explicit exclusions for secondary personas.','A-101 Strategy Lead','A-101',1,'2026-08-12 18:00:00+02'::timestamptz,'[]'::jsonb,'["One primary persona documented","Problem context and key characteristics defined","Human CEO approval recorded"]'::jsonb,'["Approved persona brief","CEO approval evidence"]'::jsonb,'high'),
    ('AI-PR-001-ACT-002','P1','Focus and Truth',2::smallint,'Define primary Job-to-be-Done','Define the highest-value Job-to-be-Done for the approved primary persona and the measurable outcome the product must enable.','A-101 Strategy Lead','A-101',1,'2026-08-14 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-001"]'::jsonb,'["JTBD statement approved","Desired outcome and current alternatives documented","Acceptance criteria linked to core journey"]'::jsonb,'["JTBD brief","CEO approval or decision note"]'::jsonb,'high'),
    ('AI-PR-001-ACT-003','P1','Focus and Truth',3::smallint,'Freeze non-critical feature expansion','Establish a governed feature freeze for work that does not directly support the approved persona, JTBD, trust, measurement, monetization, or release controls.','B-001 Executive Orchestrator','B-001',1,'2026-08-10 18:00:00+02'::timestamptz,'[]'::jsonb,'["Freeze rule published","Exception path requires CEO approval","Current backlog classified as critical or deferred"]'::jsonb,'["Scope-freeze record","Deferred backlog list"]'::jsonb,'medium'),
    ('AI-PR-001-ACT-004','P1','Focus and Truth',4::smallint,'Audit core career records and sources','Audit the core career content used by the primary journey for source quality, freshness, completeness, confidence, and release suitability.','A-105 Research Analyst','A-105',1,'2026-08-24 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-001","AI-PR-001-ACT-002"]'::jsonb,'["Release-critical records identified","Source/freshness issues classified","Critical remediation queue produced"]'::jsonb,'["Career/source audit register","Critical content issue list"]'::jsonb,'high'),
    ('AI-PR-001-ACT-005','P1','Focus and Truth',5::smallint,'Define release analytics and event taxonomy','Define acquisition, activation, engagement, trust, retention-intent and conversion events plus the release scorecard used for the beta decision.','A-102 Operations Analyst','A-102',2,'2026-08-28 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-002"]'::jsonb,'["Canonical event taxonomy documented","Activation and conversion definitions approved","90-day release scorecard defined"]'::jsonb,'["Analytics event specification","Release scorecard"]'::jsonb,'medium'),
    ('AI-PR-001-ACT-006','P1','Focus and Truth',6::smallint,'Define pricing hypotheses and free/paid boundaries','Document testable pricing hypotheses, paid value proposition, free-tier boundaries and the evidence required before a commercial pricing decision.','A-101 Strategy Lead','A-101',1,'2026-09-05 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-001","AI-PR-001-ACT-002"]'::jsonb,'["At least two pricing hypotheses documented","Free versus paid boundary defined","Human CEO approves test boundaries"]'::jsonb,'["Pricing hypothesis brief","Free/paid entitlement matrix","CEO approval evidence"]'::jsonb,'high'),
    ('AI-PR-001-ACT-007','P2','Controlled Validation',7::smallint,'Repair highest-priority core user journey gaps','Resolve release-critical functional and content gaps across the canonical primary-persona journey.','A-102 Operations Analyst','A-102',1,'2026-09-15 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-002","AI-PR-001-ACT-004"]'::jsonb,'["Canonical journey completes without critical blockers","Critical content defects resolved or explicitly gated","Regression evidence captured"]'::jsonb,'["Journey acceptance checklist","Defect closure evidence"]'::jsonb,'high'),
    ('AI-PR-001-ACT-008','P2','Controlled Validation',8::smallint,'Implement activation, engagement and conversion analytics','Implement the approved event taxonomy and verify that beta-critical events are captured correctly end to end.','A-102 Operations Analyst','A-102',1,'2026-09-20 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-005","AI-PR-001-ACT-007"]'::jsonb,'["Critical events emit reliably","Event payloads match taxonomy","Release scorecard can be populated from captured data"]'::jsonb,'["Analytics validation log","Sample event evidence"]'::jsonb,'high'),
    ('AI-PR-001-ACT-009','P2','Controlled Validation',9::smallint,'Conduct internal usability validation','Run structured internal usability tests against the canonical journey and record severity-ranked findings.','A-102 Operations Analyst','A-102',2,'2026-09-25 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-007","AI-PR-001-ACT-008"]'::jsonb,'["Test protocol completed","Critical usability blockers identified","Remediation decisions recorded"]'::jsonb,'["Usability test notes","Severity-ranked findings register"]'::jsonb,'medium'),
    ('AI-PR-001-ACT-010','P2','Controlled Validation',10::smallint,'Prepare invited-user beta cohort and feedback process','Define the invited beta cohort, recruitment criteria, feedback instruments, evidence capture and user-research operating process.','A-105 Research Analyst','A-105',2,'2026-09-30 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-001","AI-PR-001-ACT-009"]'::jsonb,'["Cohort criteria documented","Feedback process and consent language prepared","Research remains within CEO-approved governance scope"]'::jsonb,'["Beta cohort plan","Feedback template","Research governance note"]'::jsonb,'medium'),
    ('AI-PR-001-ACT-011','P2','Controlled Validation',11::smallint,'Complete privacy, attribution, disclaimer and support review','Review privacy controls, source attribution, user-facing disclaimers, release-risk controls and beta support ownership.','A-104 Risk & Compliance Analyst','A-104',1,'2026-10-05 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-004","AI-PR-001-ACT-007"]'::jsonb,'["No unresolved critical trust/control issue","Source attribution standard approved","Support escalation path documented"]'::jsonb,'["Risk and trust review","Release-control checklist","Support escalation matrix"]'::jsonb,'high'),
    ('AI-PR-001-ACT-012','P3','Limited Beta and Decision',12::smallint,'Launch invite-based beta','Open the product only to the approved invited cohort after all beta release gates and Human CEO approval are satisfied.','B-001 Executive Orchestrator','B-001',1,'2026-10-12 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-008","AI-PR-001-ACT-010","AI-PR-001-ACT-011"]'::jsonb,'["Human CEO beta-release approval recorded","Invite-only access confirmed","External actions remain disabled unless separately approved"]'::jsonb,'["Beta release approval","Release checklist","Cohort access evidence"]'::jsonb,'critical'),
    ('AI-PR-001-ACT-013','P3','Limited Beta and Decision',13::smallint,'Measure activation, repeat use, trust and payment intent','Measure the approved beta scorecard and gather structured qualitative evidence on user trust and willingness to pay.','A-102 Operations Analyst','A-102',1,'2026-10-26 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-012"]'::jsonb,'["Activation and repeat-use metrics available","Trust evidence synthesized","Payment-intent evidence captured"]'::jsonb,'["Beta metrics snapshot","User evidence synthesis"]'::jsonb,'high'),
    ('AI-PR-001-ACT-014','P3','Limited Beta and Decision',14::smallint,'Resolve critical beta defects','Triage beta findings and close all critical defects or explicitly block release progression with a governed exception.','A-102 Operations Analyst','A-102',1,'2026-11-01 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-012","AI-PR-001-ACT-013"]'::jsonb,'["Zero unresolved critical defects or approved stop condition","High-risk exceptions documented","Regression evidence captured"]'::jsonb,'["Beta defect register","Regression evidence","Exception approvals if any"]'::jsonb,'critical'),
    ('AI-PR-001-ACT-015','P3','Limited Beta and Decision',15::smallint,'Produce beta evidence report and Go / Revise / Stop recommendation','Synthesize the 90-day evidence into a governed recommendation for the Human CEO, including strategic, operational, risk and commercial findings.','A-101 Strategy Lead','A-101',1,'2026-11-04 18:00:00+02'::timestamptz,'["AI-PR-001-ACT-013","AI-PR-001-ACT-014"]'::jsonb,'["Evidence report complete","Go / Revise / Stop recommendation explicit","Human CEO decision package prepared"]'::jsonb,'["90-day beta evidence report","Final recommendation","CEO decision draft"]'::jsonb,'high')
  ) as x(action_code,phase_code,phase_name,execution_order,title,description,owner_label,agent_code,priority,due_at,dependencies,success_criteria,evidence_required,risk_level)
)
insert into public.action_items (
  organization_id, project_id, decision_id, strategy_analysis_id,
  action_code, phase_code, phase_name, execution_order,
  title, description, owner_label, assigned_agent_id,
  status, priority, due_at, dependencies, success_criteria, evidence_required, risk_level
)
select
  pc.organization_id, pc.project_id, pc.decision_id, pc.strategy_analysis_id,
  s.action_code, s.phase_code, s.phase_name, s.execution_order,
  s.title, s.description, s.owner_label, a.id,
  'open', s.priority, s.due_at, s.dependencies, s.success_criteria, s.evidence_required, s.risk_level
from project_context pc
cross join action_seed s
left join public.agents a
  on a.organization_id = pc.organization_id and a.agent_code = s.agent_code
where not exists (
  select 1 from public.action_items existing
  where existing.project_id = pc.project_id and existing.action_code = s.action_code
);

-- Create the execution-plan approval request atomically with the plan itself.
insert into public.approval_requests (
  organization_id, project_id, subject_type, subject_id, title, summary,
  risk_level, requested_by_agent_id, status, conditions
)
select
  p.organization_id,
  p.id,
  'project_execution_plan',
  p.id,
  'Approve AI-PR-001 90-day governed execution plan',
  'Approve the 15-action execution plan that converts SA-001 and AI-PR-001-DEC-001 into a controlled 90-day beta-readiness program. Approval authorizes execution sequencing only; external actions remain disabled and consequential release/pricing decisions remain with the Human CEO.',
  'high',
  a.id,
  'pending',
  jsonb_build_array(
    'Execution uses the existing Action Item Engine',
    'External actions remain disabled unless separately approved',
    'Web research by governed agents still requires CEO approval',
    'Beta launch requires a separate consequential CEO release approval',
    'Production deployment remains release-batch based'
  )
from public.projects p
join public.agents a
  on a.organization_id = p.organization_id and a.agent_code = 'B-001'
where p.project_code = 'AI-PR-001'
  and not exists (
    select 1 from public.approval_requests ar
    where ar.project_id = p.id
      and ar.subject_type = 'project_execution_plan'
      and ar.title = 'Approve AI-PR-001 90-day governed execution plan'
  );

-- Execution planning starts now, but completion progress is not awarded before CEO approval.
update public.projects
set status = 'active', stage = 'execution_planning', updated_at = now()
where project_code = 'AI-PR-001';

update public.project_milestones m
set status = case when m.status = 'completed' then 'completed' else 'in_progress' end
from public.projects p
where m.project_id = p.id
  and p.project_code = 'AI-PR-001'
  and m.sequence_no = 5;

-- Milestone-weighted onboarding model: 15 + 15 + 15 + 20 + 10 = 75.
-- Existing completed work accounts for 65; execution-plan approval contributes the final 10.
create or replace function public.apply_execution_plan_approval()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.subject_type = 'project_execution_plan'
     and new.project_id is not null
     and old.status = 'pending'
     and new.status in ('approved','rejected') then

    if new.status = 'approved' then
      update public.project_milestones
      set status = 'completed', completed_at = coalesce(completed_at, now())
      where project_id = new.project_id and sequence_no = 5;

      update public.projects
      set progress_percent = greatest(progress_percent, 75),
          stage = 'execution_ready',
          updated_at = now()
      where id = new.project_id;

      update public.project_kpis
      set current_value = greatest(coalesce(current_value, 0), 75), status = 'on_track'
      where project_id = new.project_id and name = 'Project onboarding completion';
    else
      update public.project_milestones
      set status = 'blocked', completed_at = null
      where project_id = new.project_id and sequence_no = 5 and status <> 'completed';

      update public.projects
      set stage = 'execution_planning', updated_at = now()
      where id = new.project_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists approval_execution_plan_resolution on public.approval_requests;
create trigger approval_execution_plan_resolution
after update of status on public.approval_requests
for each row execute function public.apply_execution_plan_approval();
