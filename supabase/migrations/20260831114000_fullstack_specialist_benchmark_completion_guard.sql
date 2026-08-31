-- RYTHM OS — Full-Stack Specialist benchmark completion guard
-- Remediates repeated incomplete candidate outputs without lowering the pass threshold.
-- Historical evidence is preserved. Future retries use the same scenario identity with a v2 prompt.

begin;

update public.role_benchmark_scenarios
set
  version = '2',
  prompt = $prompt$
A production Next.js application intermittently fails after authentication on mobile. Logs show a server-side 500 on one protected route, but the exact cause is not yet proven.

Produce a Specialist-level engineering decision memo. Stay evidence-based: do not invent a root cause, claim tests passed without evidence, bypass review, weaken tenant isolation, or claim deployment occurred.

OUTPUT CONTRACT — COMPLETE ALL SECTIONS. Keep the full answer concise enough to finish; target 1,600–2,000 words maximum. Do not spend the entire response on diagnosis. Allocate meaningful space to every rubric dimension.

1. RELEASE & ROLLBACK PLAN — write this section FIRST so it cannot be lost to output truncation.
   - preview entry criteria and preview exit gates;
   - required review/approval sequence before production;
   - staged/canary exposure plan where applicable;
   - production monitoring window and named metrics;
   - measurable abort/rollback triggers;
   - artifact/config/database rollback procedure, including backward-compatibility considerations;
   - post-rollback verification and incident follow-up.

2. DIAGNOSIS PLAN
   - separate verified facts, unknowns and hypotheses;
   - prioritize likely failure domains;
   - give a reproducible mobile/authenticated diagnostic sequence;
   - define the evidence required to confirm or reject each leading hypothesis.

3. MINIMAL SAFE FIX STRATEGY
   - describe the smallest maintainable fix shape without pretending the root cause is already known;
   - make API/data/UI ownership and error contracts explicit;
   - preserve authentication, authorization, tenant isolation and least privilege.

4. SECURITY & VALIDATION
   - authentication versus authorization checks;
   - organization/tenant membership and resource ownership;
   - RLS/service-role boundaries;
   - input validation, CSRF/session/cache isolation, secret handling and safe logging.

5. TEST PLAN & ACCEPTANCE CRITERIA
   - unit, integration and end-to-end/mobile regression tests;
   - negative cross-tenant/security cases;
   - concurrency/session/cache cases where relevant;
   - explicit expected outcomes and measurable acceptance criteria;
   - distinguish tests to run from tests actually run.

6. OBSERVABILITY & DECISION SUMMARY
   - correlation/deployment identifiers and privacy-safe telemetry;
   - go/no-go decision checklist;
   - remaining assumptions, risks and owners.

Every section above is mandatory. If space becomes constrained, compress prose and tables rather than omitting a section. The final answer must end with the Release decision checklist completed, not mid-plan.
$prompt$,
  rubric = jsonb_build_object(
    'dimensions', jsonb_build_array(
      jsonb_build_object(
        'key','diagnosis','weight',25,
        'expectation','Uses evidence-driven debugging, separates facts/unknowns/hypotheses, prioritizes likely failure domains, and defines proof thresholds for the root cause.'
      ),
      jsonb_build_object(
        'key','implementation_quality','weight',25,
        'expectation','Proposes the smallest maintainable fix with explicit API/data/UI ownership and error contracts, without premature root-cause certainty.'
      ),
      jsonb_build_object(
        'key','security_and_testing','weight',25,
        'expectation','Covers authentication, authorization, tenant/RLS boundaries, validation, and a complete unit/integration/E2E regression plan with measurable acceptance criteria.'
      ),
      jsonb_build_object(
        'key','release_judgment','weight',25,
        'expectation','Provides a complete preview-to-production promotion sequence, reviewer gates, staged exposure, monitoring thresholds, rollback triggers/procedure, database compatibility checks, and post-rollback verification without claiming unperformed execution.'
      )
    )
  ),
  updated_at = now()
where canonical_role = 'Full-Stack Web Developer'
  and scenario_key = 'workforce-specialist-full-stack-web-developer-domain'
  and active = true;

do $$
begin
  if not exists (
    select 1
    from public.role_benchmark_scenarios
    where canonical_role = 'Full-Stack Web Developer'
      and scenario_key = 'workforce-specialist-full-stack-web-developer-domain'
      and version = '2'
      and active = true
      and prompt like '%RELEASE & ROLLBACK PLAN%'
      and prompt like '%TEST PLAN & ACCEPTANCE CRITERIA%'
  ) then
    raise exception 'Full-Stack Specialist benchmark completion guard was not published';
  end if;
end $$;

commit;
