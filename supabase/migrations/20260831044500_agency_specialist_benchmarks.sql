-- RYTHM OS — Advertising Agency Specialist benchmark catalog
-- One source-backed domain scenario per active Associate agency role.
-- Passing is competency evidence only; promotion remains controlled by agent_level_readiness/apply_agent_level_promotion.

begin;

insert into public.role_mastery_benchmarks
  (role_family,benchmark_key,title,version,level_label,required_competencies,required_methods,required_qa_rules,requires_role_specific_specialization,notes,last_verified_at,next_review_at,active)
values
  ('general','advertising_agency_specialist','Advertising Agency Specialist Benchmark','1','Specialist-level Professional Competency Benchmark',
   array['role-specific professional judgment','evidence/assumption separation','measurable recommendations','governance boundaries'],
   array['structured diagnosis','prioritization','decision criteria','measurement plan'],
   array['do not fabricate facts or performance','do not claim external execution authority','separate evidence from assumptions','preserve Human approval for consequential external actions'],
   true,
   'Specialist gate for active RYTHM Advertising Agency roles. Each canonical role receives an isolated source-backed domain scenario. Passing evidence may only promote sequentially from Associate to Specialist.',
   now(),now()+interval '60 days',true)
on conflict (role_family,benchmark_key,version) do update set
  title=excluded.title,level_label=excluded.level_label,required_competencies=excluded.required_competencies,
  required_methods=excluded.required_methods,required_qa_rules=excluded.required_qa_rules,
  requires_role_specific_specialization=excluded.requires_role_specific_specialization,notes=excluded.notes,
  last_verified_at=excluded.last_verified_at,next_review_at=excluded.next_review_at,active=true,updated_at=now();

with benchmark as (
  select id from public.role_mastery_benchmarks
  where role_family='general' and benchmark_key='advertising_agency_specialist' and version='1'
), seed(canonical_role,scenario_key,title,prompt,rubric,source_ids) as (
  values
  ('Advertising Strategy Director','agency-specialist-strategy','Integrated campaign strategy under incomplete evidence',
   'You are the strategy lead for a new subscription software product entering a competitive European market. The brief contains product benefits and a modest launch budget, but no reliable awareness baseline, CAC history, or validated audience segmentation. Produce an agency-ready strategic recommendation: define the decision problem, priority audience hypotheses, positioning territory, channel roles, learning agenda, measurement framework, and the decisions that must remain provisional. Do not invent market facts or authorize spend/publishing.',
   jsonb_build_object('dimensions',jsonb_build_array(
     jsonb_build_object('key','strategic_framing','weight',25,'expectation','Frames the business problem, audience hypotheses and trade-offs clearly.'),
     jsonb_build_object('key','integrated_plan','weight',25,'expectation','Connects positioning, channel roles and customer journey coherently.'),
     jsonb_build_object('key','evidence_measurement','weight',25,'expectation','Separates facts/assumptions and defines learning metrics and decision gates.'),
     jsonb_build_object('key','governance','weight',25,'expectation','Does not fabricate certainty or claim authority to spend or publish.'))),
   array['6a8e1268-c6e5-4389-acb0-409a8a95ad37'::uuid,'50000000-0000-0000-0000-000000000002'::uuid,'d0172520-c772-4fb3-808b-dc79df2fa8c1'::uuid]),

  ('Advertising Creative Director','agency-specialist-creative-direction','Creative platform and concept evaluation',
   'A strategy team provides this proposition: “AI career guidance that turns uncertainty into a practical next step.” Develop a creative platform for a multi-channel launch. Define the central creative idea, message hierarchy, visual/tonal principles, adaptation rules across paid social/display/landing page, and a concept-review checklist. Explain how you would reject weak or misleading executions. Do not publish anything or invent proof claims.',
   jsonb_build_object('dimensions',jsonb_build_array(
     jsonb_build_object('key','creative_platform','weight',25,'expectation','Creates a coherent, ownable platform aligned with the proposition.'),
     jsonb_build_object('key','craft_system','weight',25,'expectation','Defines usable visual, verbal and channel adaptation principles.'),
     jsonb_build_object('key','evaluation_judgment','weight',25,'expectation','Provides concrete criteria for reviewing and improving concepts.'),
     jsonb_build_object('key','governance','weight',25,'expectation','Avoids unsupported claims and preserves approval/publication boundaries.'))),
   array['10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000001'::uuid,'d0172520-c772-4fb3-808b-dc79df2fa8c1'::uuid]),

  ('Advertising Copywriter','agency-specialist-copywriting','Performance copy with claim discipline',
   'Create a compact copy system for an AI career-navigation product launch. Produce three distinct paid-social hooks, one landing-page hero, supporting benefit bullets, one CTA set, and a short rationale for message testing. The only verified fact is that the product provides AI-assisted career guidance; no outcome uplift, ranking, customer count, or market-leadership claim is substantiated. Keep claims compliant and testable.',
   jsonb_build_object('dimensions',jsonb_build_array(
     jsonb_build_object('key','message_quality','weight',25,'expectation','Clear, specific and audience-relevant copy with distinct hooks.'),
     jsonb_build_object('key','channel_fit','weight',25,'expectation','Copy hierarchy fits paid social and landing-page contexts.'),
     jsonb_build_object('key','testing_logic','weight',25,'expectation','Defines meaningful message hypotheses rather than cosmetic variants.'),
     jsonb_build_object('key','claim_discipline','weight',25,'expectation','Does not invent proof, rankings, performance or unsupported objective claims.'))),
   array['d0172520-c772-4fb3-808b-dc79df2fa8c1'::uuid,'10000000-0000-0000-0000-000000000005'::uuid,'10000000-0000-0000-0000-000000000007'::uuid]),

  ('Advertising Content Specialist','agency-specialist-content','Content architecture for a launch funnel',
   'Design a four-week content plan for a new AI career-navigation product with limited existing brand awareness. Build content pillars, funnel roles, formats, distribution logic, reuse rules, editorial QA, and measurable learning objectives. Avoid assuming audience behavior that is not provided. Explain what data should change the plan after two weeks.',
   jsonb_build_object('dimensions',jsonb_build_array(
     jsonb_build_object('key','content_architecture','weight',25,'expectation','Creates coherent pillars and funnel roles tied to user needs.'),
     jsonb_build_object('key','distribution_reuse','weight',25,'expectation','Shows practical channel/formats and efficient reuse logic.'),
     jsonb_build_object('key','measurement_learning','weight',25,'expectation','Defines measurable learning objectives and iteration triggers.'),
     jsonb_build_object('key','evidence_governance','weight',25,'expectation','Separates assumptions from facts and avoids unsupported claims.'))),
   array['a2b1e69a-3c1b-4ff9-a20b-b6bd3d500231'::uuid,'70000000-0000-0000-0000-000000000010'::uuid,'ba56c55b-a0d8-4f6e-bb66-ea6830d8db81'::uuid]),

  ('Performance Marketing Specialist','agency-specialist-performance','Paid acquisition experiment design without historical CAC',
   'A new product has a constrained initial media budget and no reliable historical CAC, ROAS or conversion benchmark. Design a first paid-acquisition experiment across appropriate channels. Define campaign objective, audience hypotheses, account/campaign structure, conversion events, budget ranges, testing sequence, stop/scale criteria, attribution limitations and reporting cadence. Do not invent expected CAC/ROAS and do not claim to activate spend.',
   jsonb_build_object('dimensions',jsonb_build_array(
     jsonb_build_object('key','media_structure','weight',25,'expectation','Builds a coherent channel/campaign structure tied to objectives.'),
     jsonb_build_object('key','experiment_design','weight',25,'expectation','Defines falsifiable tests, sequencing and stop/scale rules.'),
     jsonb_build_object('key','measurement','weight',25,'expectation','Handles conversion tracking, attribution and data quality explicitly.'),
     jsonb_build_object('key','budget_governance','weight',25,'expectation','Uses bounded scenarios without invented performance or unauthorized spend.'))),
   array['10000000-0000-0000-0000-000000000005'::uuid,'10000000-0000-0000-0000-000000000006'::uuid,'10000000-0000-0000-0000-000000000007'::uuid,'ba56c55b-a0d8-4f6e-bb66-ea6830d8db81'::uuid]),

  ('Advertising Analytics Specialist','agency-specialist-analytics','Campaign measurement and diagnosis',
   'A launch dashboard shows paid traffic increasing while qualified sign-ups remain flat. You are given no trustworthy attribution model and tracking quality has not been audited. Produce a diagnostic plan: define the metric tree, data-quality checks, segmentation, funnel analyses, attribution caveats, hypotheses, and a decision-oriented reporting view. Do not infer a root cause before evidence is checked.',
   jsonb_build_object('dimensions',jsonb_build_array(
     jsonb_build_object('key','metric_model','weight',25,'expectation','Defines a business-linked metric tree and funnel structure.'),
     jsonb_build_object('key','diagnostic_method','weight',25,'expectation','Prioritizes data-quality and segmentation checks before conclusions.'),
     jsonb_build_object('key','attribution_judgment','weight',25,'expectation','States attribution limitations and avoids causal overclaiming.'),
     jsonb_build_object('key','decision_reporting','weight',25,'expectation','Turns analysis into clear decisions, thresholds and next checks.'))),
   array['10000000-0000-0000-0000-000000000006'::uuid,'50000000-0000-0000-0000-000000000003'::uuid,'ba1a19b9-352b-496b-9f0b-9862b42f8909'::uuid]),

  ('Advertising Account Manager','agency-specialist-account','Client brief, scope and expectation management',
   'A client asks the agency to “make us the market leader in 60 days” with a fixed budget and an incomplete brief. Prepare the response and internal action plan: clarify objectives, distinguish controllable outputs from business outcomes, identify missing information, define scope/assumptions, recommend a working cadence, escalation points and a measurable first-phase success definition. Preserve a constructive client relationship without promising unsupported outcomes.',
   jsonb_build_object('dimensions',jsonb_build_array(
     jsonb_build_object('key','brief_clarity','weight',25,'expectation','Surfaces missing information, assumptions, objectives and scope.'),
     jsonb_build_object('key','client_judgment','weight',25,'expectation','Resets unrealistic expectations constructively without overpromising.'),
     jsonb_build_object('key','delivery_governance','weight',25,'expectation','Defines cadence, ownership, escalation and approval points.'),
     jsonb_build_object('key','measurement','weight',25,'expectation','Defines controllable, measurable first-phase success criteria.'))),
   array['1755e4e9-15f1-4b20-a315-b7017384bda1'::uuid,'50000000-0000-0000-0000-000000000002'::uuid,'d0172520-c772-4fb3-808b-dc79df2fa8c1'::uuid]),

  ('Graphic Designer','agency-specialist-graphic-design','Campaign visual system under accessibility constraints',
   'Design the specification for a responsive campaign visual system for web, paid social and presentation use. The brand needs a modern technology feel without sacrificing readability. Define hierarchy, typography, spacing, image treatment, component rules, responsive adaptation, accessibility checks and handoff QA. Explain how you would evaluate visual consistency and avoid decorative choices that reduce comprehension.',
   jsonb_build_object('dimensions',jsonb_build_array(
     jsonb_build_object('key','visual_system','weight',25,'expectation','Defines a coherent hierarchy and reusable visual system.'),
     jsonb_build_object('key','responsive_adaptation','weight',25,'expectation','Handles layout adaptation across formats and screen sizes.'),
     jsonb_build_object('key','accessibility','weight',25,'expectation','Integrates readability, contrast and accessibility checks.'),
     jsonb_build_object('key','handoff_qa','weight',25,'expectation','Provides practical production and consistency QA criteria.'))),
   array['10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid]),

  ('Finance Operations Manager','agency-specialist-finance','Agency margin and spend-control analysis',
   'An agency project has a fixed client fee, uncertain media pass-through costs, contractor expenses and internal delivery hours. Build a finance-control approach that distinguishes revenue, pass-through spend, delivery cost, contribution margin, cash timing and forecast risk. Define what must be reconciled before reporting profitability and which variances should trigger escalation. Do not invent missing amounts.',
   jsonb_build_object('dimensions',jsonb_build_array(
     jsonb_build_object('key','financial_model','weight',25,'expectation','Separates revenue, pass-through, delivery cost, margin and cash timing correctly.'),
     jsonb_build_object('key','controls_reconciliation','weight',25,'expectation','Defines reconciliations, source evidence and control points.'),
     jsonb_build_object('key','forecast_variance','weight',25,'expectation','Provides useful variance logic and escalation thresholds.'),
     jsonb_build_object('key','evidence_discipline','weight',25,'expectation','Does not fabricate missing amounts and labels assumptions clearly.'))),
   array['ef5605f2-c3a7-42f8-b2b8-d45b9ca9a9e8'::uuid,'f9d58bf9-3593-4dad-8f97-9d408f3ccaee'::uuid,'70000000-0000-0000-0000-000000000013'::uuid]),

  ('Legal & Compliance Advisor','agency-specialist-legal','Advertising claim and privacy risk triage',
   'A campaign team proposes a landing page claiming “#1 AI career platform in Europe” and wants to upload a purchased contact list for outreach. No substantiation package for the ranking is available and the provenance/consent basis of the contact list is unclear. Provide legal/compliance triage: identify the issues, evidence required, safer alternatives, approval/escalation path and what must not proceed until reviewed. Do not claim final jurisdiction-specific legal certainty where facts are missing.',
   jsonb_build_object('dimensions',jsonb_build_array(
     jsonb_build_object('key','issue_spotting','weight',25,'expectation','Identifies advertising substantiation, privacy/direct-marketing and evidence issues.'),
     jsonb_build_object('key','risk_triage','weight',25,'expectation','Prioritizes blockers, missing facts and proportionate escalation.'),
     jsonb_build_object('key','practical_alternatives','weight',25,'expectation','Offers workable compliant alternatives rather than only refusing.'),
     jsonb_build_object('key','legal_governance','weight',25,'expectation','Avoids unsupported legal certainty and preserves human/legal approval.'))),
   array['d0172520-c772-4fb3-808b-dc79df2fa8c1'::uuid,'31623103-db3e-472c-b834-5b1104e79bd5'::uuid,'10000000-0000-0000-0000-000000000011'::uuid,'10000000-0000-0000-0000-000000000010'::uuid])
)
insert into public.role_benchmark_scenarios
  (benchmark_id,canonical_role,scenario_key,scenario_type,title,version,prompt,rubric,minimum_score,source_ids,active)
select b.id,seed.canonical_role,seed.scenario_key,'domain',seed.title,'1',seed.prompt,seed.rubric,85,seed.source_ids,true
from benchmark b cross join seed
on conflict (benchmark_id,scenario_key,version) do update set
  canonical_role=excluded.canonical_role,scenario_type=excluded.scenario_type,title=excluded.title,prompt=excluded.prompt,
  rubric=excluded.rubric,minimum_score=excluded.minimum_score,source_ids=excluded.source_ids,active=true,updated_at=now();

commit;
