# Continuous Program Engine — Phase 1 Implementation Checkpoint

Updated: 2026-10-21

## Implementation completed on feature branch

1. **Shared lifecycle foundation** — explicit finite / campaign / continuous project kinds; existing projects default to finite. No automatic conversion.
2. **Tenant-scoped relational model** — continuous programs with optional explicit SEO site mapping; review cycles with immutable schedule identity, RLS, and same-org integrity checks.
3. **Safety guards** — continuous project cannot transition to COMPLETED, converting closed projects is rejected, project ON_HOLD/BLOCKED/PAUSED prevents scheduler dispatch.
4. **Review scheduler** — privileged SKIP LOCKED queue claim, unique cycle key, bounded batched processing, stale-running recovery, no background browser polling.
5. **Evidence worker** — rechecks project governance, uses existing agency_seo_snapshots, requires two fresh observations separated by at least six hours, handles missing/stale data as waiting_for_data.
6. **Deterministic optimization signals** — 10-point technical SEO regression OR persistent medium/high/critical finding on two snapshots. Creates *draft* project_proposals only; never self-approves or changes websites. Deduplicates against unresolved proposals of the same type.
7. **Project UI** — readable review schedule, technical evidence, concise history. Owner-controlled source selection and activation in Advanced settings.
8. **Completion evaluator adapter** — mirrors the current Production evaluator, preserving existing evidence dimensions while ensuring opt-in continuous projects never enter CLOSEOUT/COMPLETED after initial delivery.
9. **CI regression contract** — prebuild runs domain, repeated-finding, SQL guard, and integration boundary assertions.

## Real-world evidence verified (read-only Production)

- aiRolePath.com SEO monitor exists with 28 snapshots (latest checked Oct 21, 2026).
- Latest technical SEO score was 87; the previous snapshot also scored 87.
- Two medium-severity findings persisted: homepage canonical and meta-description review. Routine reviews must flag persistent findings even when the score is unchanged.
- project_metric_measurements currently contains zero records; no verified organic CTR, GSC click trends, Google ranking changes, AI referral or conversion outcomes can be inferred.
- Airolepath SEO is still blocked / ON_HOLD / completion_eligible=false.
- There is no continuous_programs table or lifecycle_kind column in Production yet.

## Validation status

- Static and deterministic tests added and attached to prebuild.
- Vercel Preview builds used to validate application integration; latest commit state needs checking before release.
- A Supabase development database branch was requested for integration testing. Supabase required explicit **paid compute confirmation**; therefore no development database was created and SQL migration was NOT executed.
- PostgreSQL migration runtime, RLS isolation, concurrent claim behavior, and governance reconciliation remain **unverified against a live staging database**.
- No Production migrations, new project statuses, feature flags or external actions were changed.

## Staged rollout checklist

1. Obtain approved isolated Supabase development environment and run full migration/rollback verification.
2. Test real database RLS (owner, unrelated tenant, anon), cross-org FKs, migration repeatability, opt-in/hold/closeout guards, review claim concurrency and retry behavior.
3. Run typecheck, existing project completion tests, full Next.js build, and smoke test Project Details and Actions.
4. Merge reviewed branch only after all gates pass, with environment feature flag disabled.
5. Apply migration in proper version order; verify schema, grants, policies, and health.
6. In project Advanced settings, explicitly associate the approved SEO site and configure monitoring. Keep Airolepath's ON_HOLD until governance requirements are resolved.
7. Enable scheduling for a test tenant, then optionally Production behind CONTINUOUS_PROGRAM_ENGINE_ENABLED=true; verify initial review cycle and draft proposal before enabling any further organizations.
8. Implement/authorize verified GSC and GA4 metric ingestion as a separate integration; do not claim those KPIs in the interim.
9. Review recurring proposal effectiveness, deduplication and costs after pilot; do not enable autonomous deployment.

## Critical non-goals

- This phase does not create valid GSC/GA4 metrics where connections are missing.
- A completed review is not evidence of implementation or business outcome success.
- Draft proposals are not CEO approvals. Existing human decision and execution gateway remain authoritative.
- This code has not been merged to main or deployed to Production.

## Review location

GitHub PR #421, `feature/continuous-program-engine-phase1`.

## Required staging verification matrix

- Migration applies cleanly in dependency order (foundation before evaluator adapter) and is repeatable.
- SECURITY INVOKER scheduler RPCs are inaccessible to authenticated/anon roles; tenant RLS reads are isolated.
- Mismatched organization/project/SEO site combinations are rejected by database integrity rules.
- Closed projects cannot be converted to continuous without evidence-preserving reconciliation.
- Paused/blocked programs cannot claim cycles; an already-claimed cycle is cancelled if governance changes before execution.
- Two concurrent schedulers cannot create duplicate (program_id,scheduled_for) records.
- 0 or 1 recent snapshots creates waiting_for_data; 2 old or too-close snapshots also wait.
- Two valid snapshots with unchanged score and repeated medium-severity findings create only one non-executable draft proposal.
- Approved Project proposal processing still requires a separately authorized approval gate; continuous review cannot approve actions.
- Standard finite project closeout remains unchanged after the evaluator adapter.
- Existing ON_HOLD AI RolePath SEO project remains on hold until an explicit governance decision changes it.
