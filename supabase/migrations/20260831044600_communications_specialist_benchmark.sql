-- RYTHM OS — Communications Manager Specialist benchmark
begin;

with benchmark as (
  select id from public.role_mastery_benchmarks
  where role_family='general' and benchmark_key='advertising_agency_specialist' and version='1'
)
insert into public.role_benchmark_scenarios
  (benchmark_id,canonical_role,scenario_key,scenario_type,title,version,prompt,rubric,minimum_score,source_ids,active)
select b.id,
  'Customer Support & Communications Manager',
  'company-specialist-communications',
  'domain',
  'Customer communication triage and response governance',
  '1',
  'A software company receives three simultaneous customer communications: (1) a frustrated user reporting a billing issue, (2) a journalist requesting confirmation of an unreleased feature, and (3) a customer asking for deletion of personal data. Build the triage and response plan. Define urgency, ownership, response boundaries, what facts must be verified, what can be answered immediately, escalation paths, tone principles, privacy/compliance handling, and follow-up tracking. Do not invent account facts, disclose unreleased information, or claim to execute account/data changes.',
  jsonb_build_object('dimensions',jsonb_build_array(
    jsonb_build_object('key','triage_prioritization','weight',25,'expectation','Prioritizes requests by impact, urgency and required expertise.'),
    jsonb_build_object('key','response_quality','weight',25,'expectation','Provides clear, empathetic and channel-appropriate response guidance.'),
    jsonb_build_object('key','privacy_escalation','weight',25,'expectation','Recognizes privacy/data deletion and media disclosure boundaries and escalates correctly.'),
    jsonb_build_object('key','evidence_governance','weight',25,'expectation','Does not invent account facts, disclose confidential information, or claim unauthorized execution.'))),
  85,
  array['10000000-0000-0000-0000-000000000011'::uuid,'10000000-0000-0000-0000-000000000010'::uuid,'1755e4e9-15f1-4b20-a315-b7017384bda1'::uuid],
  true
from benchmark b
on conflict (benchmark_id,scenario_key,version) do update set
  canonical_role=excluded.canonical_role,scenario_type=excluded.scenario_type,title=excluded.title,
  prompt=excluded.prompt,rubric=excluded.rubric,minimum_score=excluded.minimum_score,
  source_ids=excluded.source_ids,active=true,updated_at=now();

commit;
