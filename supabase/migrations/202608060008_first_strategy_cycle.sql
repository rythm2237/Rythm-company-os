-- First governed strategy cycle for AI Position Roadmap.

create table if not exists public.project_strategy_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  analysis_code text not null,
  title text not null,
  status text not null default 'completed' check (status in ('draft','in_progress','completed','superseded')),
  strategic_question text not null,
  current_state jsonb not null default '{}'::jsonb,
  options jsonb not null default '[]'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  risk_register jsonb not null default '[]'::jsonb,
  plan_90_days jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  evidence_scope text not null default 'internal_only',
  web_research_status text not null default 'not_requested',
  proposed_by_agent_id uuid references public.agents(id),
  decision_id uuid references public.decisions(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (project_id, analysis_code)
);

alter table public.project_strategy_analyses enable row level security;
drop policy if exists project_strategy_analyses_member_read on public.project_strategy_analyses;
create policy project_strategy_analyses_member_read on public.project_strategy_analyses for select using (public.is_org_member(organization_id));
drop policy if exists project_strategy_analyses_owner_write on public.project_strategy_analyses;
create policy project_strategy_analyses_owner_write on public.project_strategy_analyses for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create index if not exists project_strategy_analyses_project_idx on public.project_strategy_analyses(project_id, created_at desc);

-- Create the CEO decision draft proposed by A-101.
insert into public.decisions (
  organization_id, project_id, decision_key, title, context, options, recommendation,
  rationale, risk_level, status, requires_human_approval, proposed_by_agent_id
)
select
  p.organization_id,
  p.id,
  'AI-PR-001-DEC-001',
  'Approve the controlled 90-day public-release path',
  'AI Position Roadmap has a substantial product and validation foundation. The next decision is whether to continue broad feature expansion, release immediately, or execute a controlled 90-day credibility and commercialization program before public scale.',
  jsonb_build_array(
    'Option A — Immediate broad public release with the current product surface',
    'Option B — Continue feature expansion before exposing the product to users',
    'Option C — Controlled 90-day release-readiness program followed by a limited public beta'
  ),
  jsonb_build_object(
    'text','Approve Option C: freeze non-critical feature expansion, validate the core user journey and content quality, establish monetization and trust controls, then release a measured public beta with explicit gates.'
  ),
  'Internal evidence indicates that technical breadth is ahead of commercial validation. A controlled beta preserves trust, limits operational risk, and produces real usage evidence before further scaling.',
  'medium',
  'review',
  true,
  a.id
from public.projects p
join public.agents a on a.organization_id=p.organization_id and a.agent_code='A-101'
where p.project_code='AI-PR-001'
  and not exists (select 1 from public.decisions d where d.organization_id=p.organization_id and d.decision_key='AI-PR-001-DEC-001');

insert into public.project_strategy_analyses (
  organization_id, project_id, analysis_code, title, status, strategic_question,
  current_state, options, recommendation, risk_register, plan_90_days, assumptions,
  evidence_scope, web_research_status, proposed_by_agent_id, decision_id, completed_at
)
select
  p.organization_id,
  p.id,
  'SA-001',
  'Controlled path to a commercially credible public release',
  'completed',
  'What is the highest-value controlled path for AI Position Roadmap from its current product state to a commercially credible public release?',
  jsonb_build_object(
    'strengths',jsonb_build_array(
      'Broad Next.js and Supabase product foundation with Admin Studio and governed data workflows',
      'Extensive automated validation covering careers, assessments, learning architecture, salary and occupation intelligence',
      'Existing public deployment capability and structured career-content model',
      'Company OS governance, approval, decision and execution controls are operational'
    ),
    'gaps',jsonb_build_array(
      'No validated primary target-user segment or quantified problem priority',
      'No production usage baseline for activation, retention or willingness to pay',
      'Content quality and source freshness require release-level acceptance thresholds',
      'Monetization, pricing, support and operational ownership are not yet validated',
      'SEO/GEO and trust controls require systematic release review'
    ),
    'assessment','The product is technically advanced but commercially pre-validation. The principal constraint is not feature scarcity; it is insufficient evidence that the current experience solves a narrow, valuable user problem reliably enough to monetize.'
  ),
  jsonb_build_array(
    jsonb_build_object('code','A','name','Immediate broad release','benefit','Fastest exposure and feedback','tradeoff','Highest trust, quality and support risk; weak measurement discipline'),
    jsonb_build_object('code','B','name','Continue feature expansion','benefit','More breadth and perceived completeness','tradeoff','Delays evidence, increases complexity and may build against unvalidated assumptions'),
    jsonb_build_object('code','C','name','Controlled 90-day beta-readiness program','benefit','Balances speed, evidence, trust and commercial learning','tradeoff','Requires scope discipline, explicit gates and temporary feature freeze')
  ),
  jsonb_build_object(
    'selected_option','C',
    'summary','Run a controlled 90-day beta-readiness program focused on one primary target segment, the end-to-end career decision journey, content credibility, measurement and initial monetization.',
    'release_principle','Do not scale traffic before product truth, content trust and operational ownership are measurable.',
    'gates',jsonb_build_array(
      'Primary target user and high-value job-to-be-done approved by the Human CEO',
      'Critical career journeys pass content and functional acceptance thresholds',
      'Analytics capture acquisition, activation, engagement and conversion events',
      'Pricing and free-versus-paid boundaries are defined and testable',
      'Privacy, source attribution, disclaimers and support processes pass review',
      'Limited beta produces evidence sufficient for a go, revise or stop decision'
    )
  ),
  jsonb_build_array(
    jsonb_build_object('risk','Target user remains too broad','severity','high','mitigation','Select one primary segment and defer secondary personas'),
    jsonb_build_object('risk','Career or salary information is stale or weakly sourced','severity','high','mitigation','Enforce source approval, freshness and confidence thresholds before exposure'),
    jsonb_build_object('risk','Feature breadth obscures the core journey','severity','medium','mitigation','Freeze non-critical expansion and define one canonical user flow'),
    jsonb_build_object('risk','Users do not convert to paid access','severity','high','mitigation','Test value proposition and pricing before scaling acquisition'),
    jsonb_build_object('risk','Operational support load exceeds capacity','severity','medium','mitigation','Use invite-based beta, issue triage and explicit response commitments'),
    jsonb_build_object('risk','SEO acquisition creates traffic before trust controls are ready','severity','medium','mitigation','Stage indexing and acquisition behind release gates')
  ),
  jsonb_build_array(
    jsonb_build_object('days','1-30','theme','Focus and truth','outcomes',jsonb_build_array('Approve primary persona and job-to-be-done','Freeze non-critical scope','Audit core career records and sources','Define analytics and release scorecard','Document pricing hypotheses')),
    jsonb_build_object('days','31-60','theme','Controlled validation','outcomes',jsonb_build_array('Repair critical journey and content gaps','Implement event measurement','Run internal and invited-user tests','Define free and paid boundaries','Complete privacy, risk and support review')),
    jsonb_build_object('days','61-90','theme','Limited beta and decision','outcomes',jsonb_build_array('Launch invite-based beta','Measure activation, repeat use, qualitative trust and payment intent','Resolve critical defects','Produce beta evidence report','Submit go, revise or stop recommendation to CEO'))
  ),
  jsonb_build_array(
    'Analysis uses validated internal repository and project evidence only',
    'No web research was required for this first directional decision',
    'Human CEO retains decision authority and controls all production releases',
    'External actions remain disabled'
  ),
  'internal_only',
  'not_requested',
  a.id,
  d.id,
  now()
from public.projects p
join public.agents a on a.organization_id=p.organization_id and a.agent_code='A-101'
join public.decisions d on d.organization_id=p.organization_id and d.decision_key='AI-PR-001-DEC-001'
where p.project_code='AI-PR-001'
on conflict (project_id, analysis_code) do update set
  current_state=excluded.current_state,
  options=excluded.options,
  recommendation=excluded.recommendation,
  risk_register=excluded.risk_register,
  plan_90_days=excluded.plan_90_days,
  assumptions=excluded.assumptions,
  decision_id=excluded.decision_id,
  completed_at=excluded.completed_at;

update public.project_strategy_briefs
set status='completed', updated_at=now()
where brief_code='SB-001' and project_id in (select id from public.projects where project_code='AI-PR-001');

update public.project_milestones
set status='completed', completed_at=now()
where sequence_no=4 and project_id in (select id from public.projects where project_code='AI-PR-001');

update public.projects
set stage='executive_decision', progress_percent=65, updated_at=now()
where project_code='AI-PR-001';

update public.project_kpis
set current_value=1, status='achieved'
where name='Governed strategy cycles' and project_id in (select id from public.projects where project_code='AI-PR-001');
