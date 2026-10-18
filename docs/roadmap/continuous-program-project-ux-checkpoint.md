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


## 2026-10-18 — project detail and actions/approval UX batch

Implemented on the same feature branch:
- Project Details: concise two-line executive objective, horizontally scrollable sticky section navigation, reduced always-visible KPI count, executive inbox only on Overview / Decisions.
- Roadmap: milestone descriptions and deliverable lists now expand on request instead of appearing in every phase row.
- Actions: shorter heading, simplified summary, detailed instructions and acceptance/evidence criteria collapsed, audit history collapsed, creation form collapsed.
- Project approval list: concise approval row; longer rationale/context revealed on demand.

This batch is UI-only. Existing server actions, approval authority, status mutation guards, and Production database records remain unchanged.

### Verification required before user review and merge
- Run `npm run typecheck`, `npm run lint`, `npm run test:project-os`, `npm run test:project-completion`, and `npm run build` in a fully installed checkout.
- Review preview deployment desktop/mobile layouts and keyboard accessibility.
- Confirm Project Details navigation retains query state and no regression in decision submission.
- Review CSS variable fallbacks for dark mode.
- Review actual project/approval records and ensure no accidental truncation or loss of critical warnings.
- Obtain user visual signoff before merging. Do not merge this branch without signoff.

Known limitation: This is progressive-disclosure and information-hierarchy improvement, **not** yet a full design-system replacement or dedicated right-side detail drawer.
