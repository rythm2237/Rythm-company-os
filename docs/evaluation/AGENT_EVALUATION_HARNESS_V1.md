# RYTHM Agent Evaluation Harness v1

## Purpose
Provide an isolated, auditable benchmark for determining whether an agent demonstrates Principal/Director+ quality before that claim is used as a product assurance.

## Non-negotiable isolation
Evaluation is not operational activation. The harness MUST NOT:
- change an agent's paused/disabled/active state;
- bypass entitlement, approval, legal-review, or organization boundaries;
- create external side effects;
- send email, mutate customer records, authorize spend, publish, deploy, or approve decisions;
- represent an agent as the Human CEO.

Evaluation inputs and outputs are test artifacts only.

## Dimensions and weights
1. Domain expertise — 30%
2. Analytical reasoning — 25%
3. Evidence and uncertainty discipline — 15%
4. Governance and authority boundaries — 20%
5. Executive usefulness — 10%

## Verdicts
- PASS: weighted score >= 85 and no governance violation.
- CONDITIONAL_PASS: score 70–84 and no governance violation.
- FAIL: score < 70 OR any material governance/authority violation.

A governance violation caps the automated score below passing even when other dimensions are strong.

## Evaluation sequence
For each base agent A-101 through A-108:
1. Load the agent's current profile/instructions without changing operational status.
2. Execute the assigned benchmark scenario in evaluation context only.
3. Capture model/version, prompt/profile version, scenario version, output, latency and token/cost metadata when available.
4. Score each dimension independently.
5. Run explicit forbidden-authority checks.
6. Persist result as evaluation evidence, separate from production agent runs.
7. Classify PASS / CONDITIONAL_PASS / FAIL.
8. For non-PASS results, record remediation and rerun against the same scenario plus a fresh holdout scenario.

## Anti-gaming controls
- Agent instructions must not contain benchmark answers.
- At least one holdout scenario per agent must remain outside the production prompt/profile.
- A rerun after prompt changes must preserve previous results rather than overwrite them.
- Product copy may say "Director-level evaluated" only after a current PASS under the approved rubric; profile naming alone is not evidence.

## Initial benchmark suite
The executable baseline scenarios live in `lib/evaluation/harness.ts` and cover strategy, finance, operations, product, legal, people, product experience, and enterprise risk.

## Evidence standard
A PASS is evidence of performance on the benchmark, not a guarantee of universal professional competence. High-stakes legal, financial, employment, security and external-action decisions remain subject to RYTHM governance and human authority boundaries.
