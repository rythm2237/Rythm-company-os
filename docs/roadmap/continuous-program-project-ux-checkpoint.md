# Continuous Programs and Project Experience — Implementation Checkpoint

## Scope

This checkpoint covers the first non-destructive Projects portfolio UI update. A shared lifecycle change and detail-page redesign remain pending.

## Confirmed production finding (2026-10-15)

The Airolepath SEO project had a blocked / ON_HOLD project lifecycle while all six roadmap phases were marked completed. The observation record required 30 days, had sufficient_data=false, and remained pending. Roadmap phase completion must not imply validated project outcomes or that ongoing SEO operations have ended.

## Changes on this branch

- Added client-side search and operational filters to the Projects portfolio.
- Made project rows more compact and reduced repeated on-screen information.
- Added a provisional ongoing-optimization scope hint for projects whose name, description, or code indicates SEO/GEO/AEO.
- Kept authoritative project status visible; the scope hint is **not** a database lifecycle state.
- Labeled progress for these projects as **Current delivery**, not program completion.

## Important limitations

- Text classification is a temporary presentation hint; it must be replaced with authoritative lifecycle_type from a versioned database migration.
- The existing workflow state machine and completion evaluator remain unchanged.
- No project status, milestone, or observation records were modified.
- No Production deployment has been performed.
- No automated build, TypeScript checks, or browser acceptance tests have been executed yet.

## Next implementation batches

1. Inspect the authoritative completion evaluator, triggers, and phase update handlers; record root cause with reproducible failing tests.
2. Introduce lifecycle_kind: finite, campaign, continuous; preserve old project_type taxonomy. Add observation and completion guards and auditable legacy reconciliation.
3. Implement recurring review-cycle entities using existing governance/scheduler primitives, with idempotency and approval gating.
4. Redesign project detail navigation and Actions using progressive disclosure, a contextual detail panel, concise decision summaries, and resilient optimistic/pending/error states.
5. Run existing project-completion, project-os, cockpit, accessibility, typecheck, and build validations; verify preview, request code review, and only then merge/deploy.

## Acceptance criteria

Continuous programs cannot transition to COMPLETED because a finite roadmap or review cycle completes. Any success claim needs source evidence and valid observation. The portfolio remains readable with many projects, and approval controls remain durable and race-safe.
