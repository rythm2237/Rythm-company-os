# Continuous Program Engine — Phase 1 Implementation Checkpoint

Updated: 2026-10-21

## Implementation completed on feature branch

1. **Shared lifecycle foundation** — explicit finite / campaign / continuous project kinds; existing projects default to finite. No automatic conversion.
2. **Tenant-scoped relational model** — continuous programs with optional explicit SEO site mapping; review cycles with immutable schedule identity, RLS, and same-org integrity checks.
3. **Safety guards** — continuous project cannot transition to COMPLETED, converting closed projects is rejected, project ON_HOLD/BLOCKED/PAUSED prevents scheduler dispatch.
4. **Review scheduler** — privileged SKIP LOCKED queue claim, unique cycle key, bounded batched processing, stale-running recovery, no background browser polling.
5. **Evidence worker** — rechecks project governance, uses existing agency_seo_snapshots, requires two fresh observations separated by at least six hours, handles missing/stale data as waiting_for_data.
6. **Deterministic optimization signals** — 10-point technical SEO regression OR persistent medium/high/critical finding on two snapshots. Creates *draft* project_proposals only; never self-approves or changes websites. Deduplicates against unresolved proposals of the same type.
7. **Governed proposal submission and execution isolation** — project owner explicitly submits an evidence-backed draft to existing approval_requests using an atomic SQL transaction. The shared approved-proposal execution bridge explicitly excludes all `continuous_program_*` investigation proposals from external action planning, even after approval.
8. **Project UI** — readable review schedule, technical evidence, concise history. Owner-controlled source selection and activation in Advanced settings; draft findings appear in Overview with an explicit button to submit for approval.
9. **Completion evaluator adapter** — mirrors the current Production evaluator, preserving existing evidence dimensions while ensuring opt-in continuous projects never enter CLOSEOUT/COMPLETED after initial delivery.
10. **Zero-cloud-cost integration suite** — prebuild executes the actual foundation migration twice against PGlite, validates tenant RLS, privileges, scheduler claiming, cross-tenant guards, lifecycle and approval idempotency; the real Review Worker is exercised against a controlled Supabase-shaped adapter for valid, stale, missing and repeated evidence, ON_HOLD state, proposal deduplication and overlapping dispatch calls. The authoritative completion-evaluator adapter is also compiled against the isolated PGlite schema (passed in Vercel build logs).

## Real-world evidence verified (read-only Production)

- aiRolePath.com SEO monitor exists with 28 snapshots (latest checked Oct 21, 2026).
- Latest technical SEO score was 87; the previous snapshot also scored 87.
- Two medium-severity findings persisted: homepage canonical and meta-description review. Routine reviews must flag persistent findings even when the score is unchanged.
- project_metric_measurements currently contains zero records; no verified organic CTR, GSC click trends, Google ranking changes, AI referral or conversion outcomes can be inferred.
- Airolepath SEO is still blocked / ON_HOLD / completion_eligible=false.
- There is no continuous_programs table or lifecycle_kind column in Production yet.

## Validation status

- PGlite is already an installed project development dependency (`@electric-sql/pglite`): no Docker daemon or extra Supabase paid branch is required.
- Run `npm ci && npm run test:continuous-program` in a repository checkout. The same tests run automatically inside Vercel `prebuild`.
- Real PostgreSQL **foundation** migration passed in an isolated in-memory database twice (verified from Vercel build log); tenant RLS, RPC execute restrictions, same-org site constraints, completion guards, review idempotency and governed proposal submission also passed.
- A blocking ambiguous `ON CONFLICT(program_id,...)` SQL issue was discovered by this test and corrected with a named unique constraint. Both foundation and adapter compile checks now pass in PGlite.
- Added a partial unique index on active Continuous Program proposals, with worker-level recovery from PostgreSQL uniqueness races.
- Added an execution bridge guard: approving a Continuous Program investigation can NEVER automatically generate external tool execution intents.
- Evaluator adapter compilation passed in the in-memory database; full evaluator runtime needs the authoritative schema and controlled end-to-end checks.
- PGlite cannot demonstrate managed Supabase Auth / PostgREST behavior or a full live tenant and end-to-end worker; these remain separate pre-release validation gates. Concurrent independent database sessions are not simulated by the single in-memory connection.
- No Production migrations, project state, flags, external integrations or billing records were changed; no paid development branch was created.

## Staged rollout checklist

1. Run the PGlite integration suite locally or in Vercel CI, including foundation migration, evaluator adapter compilation and rollback expectations. No paid Supabase branch is needed.
2. Verify grants and RLS through PGlite role simulation, cross-org FKs, idempotency, opt-in/hold/closeout guards; validate actual concurrent independent sessions separately before first production enablement.
3. Run TypeScript checks, project completion tests, full Next.js build, and Preview smoke test Project Details and Actions. Confirm signed-in account can reach tenant-specific UI.
4. Merge reviewed branch only after all gates pass, with environment feature flag disabled.
5. Apply migration in proper version order; verify schema, grants, policies, and health.
6. In project Advanced settings, explicitly associate the approved SEO site and configure monitoring. Keep Airolepath's ON_HOLD until governance requirements are resolved.
7. Enable scheduling for a test tenant, then optionally Production behind CONTINUOUS_PROGRAM_ENGINE_ENABLED=true; verify initial review cycle and draft proposal before enabling any further organizations.
8. Implement/authorize verified GSC and GA4 metric ingestion as a separate integration; do not claim those KPIs in the interim.
9. Review recurring proposal effectiveness, deduplication and costs after pilot; do not enable autonomous deployment.

## Critical non-goals

- This phase does not create valid GSC/GA4 metrics where connections are missing.
- A completed review is not evidence of implementation or business outcome success.
- Draft proposals are not CEO approvals. Owner submission creates a separate pending approval request. The existing Human CEO decision and execution gateway remain authoritative.
- This code has not been merged to main or deployed to Production.

## Review location

GitHub PR #421, `feature/continuous-program-engine-phase1`.

## Required staging verification matrix

- Foundation migration applies cleanly twice in PGlite (passed). Evaluator adapter compilation and full operational behavior require separate checks.
- SECURITY INVOKER scheduler RPCs are inaccessible to authenticated/anon roles; tenant RLS reads are isolated.
- Mismatched organization/project/SEO site combinations are rejected by database integrity rules.
- Closed projects cannot be converted to continuous without evidence-preserving reconciliation.
- Paused/blocked programs cannot claim cycles; an already-claimed cycle is cancelled if governance changes before execution.
- Two concurrent schedulers cannot create duplicate (program_id,scheduled_for) records.
- 0 or 1 recent snapshots creates waiting_for_data; 2 old or too-close snapshots also wait.
- Two valid snapshots with unchanged score and repeated medium-severity findings create only one non-executable draft proposal. Review Worker test verifies proposal reuse, blocked governor checks, and overlapping claims.
- Approved Project proposal processing must bypass external action planning for `continuous_program_*` investigations; only a separately scoped implementation proposal may authorize external actions.
- Standard finite project closeout remains unchanged after the evaluator adapter.
- Existing ON_HOLD AI RolePath SEO project remains on hold until an explicit governance decision changes it.

## Cost decision

The paid Supabase cloud development branch is **not required** for database migration regression checks. Use the existing, ephemeral, in-memory PGlite suite and current Vercel CI. Do not create chargeable infrastructure without explicit user approval.

## Latest feature-branch QA checkpoint (2026-10-21)

- PGlite actual migration tests: PASS in Vercel.
- Completion evaluator SQL compilation: PASS in Vercel.
- Review Worker deterministic integration suite is now included in `npm run test:continuous-program`, and the full build must pass before merging.
- Approved continuous investigation execution isolation: implemented and protected by static safety assertions.
- No claim of a full Supabase integration or a verified authenticated UI session is made; these remain pre-rollout gates.
