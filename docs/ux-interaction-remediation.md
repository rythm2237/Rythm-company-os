# Global interaction remediation — 2026-09-30

## Evidence and root causes

The project enhancer observed the entire document with a MutationObserver. Its callback rebuilt the approval toolbar using replaceChildren, which itself produced another observed child-list mutation. This made the observer self-sustaining, replaced button instances repeatedly and interfered with interactions. Its package approval path also used a hard page reload. The native React approval list and enhancer were independent owners of related UI.

The live React surface accepted every polling response, without an epoch or in-flight guard. A read begun before a successful mutation could overwrite the refreshed pending list after that mutation. This is a concrete stale-response race, exercised by the component regression test.

The global action overlay replaced window.fetch and attributed every request during a short timing window to the last clicked control. Background reads and synchronous navigation/toggle buttons therefore acquired misleading processing states. It has been removed; pending state belongs to the component or form.

The legacy action approval lookup excluded rejected decisions. The supervisor also automatically resumed the original blocked task after a recovery report. Neither constitutes changed human authorization. Rejection now remains authoritative, and exact repeated gates are suppressed in the database.

Production evidence: the Airolepath SEO project contained resolved approvals, while the AI Role Path GTM project had a rejected measurement/KPI decision recorded at 2026-09-30 20:11 UTC. Its status was still rejected during investigation. This establishes persisted rejection for that record; it does not establish that every reported disappearance/reappearance was a database status reversal. A signed-in reproduction is required for that attribution.

## Implementation

- Conditional approval transition stays protected by owner authorization and the existing atomic task trigger. Identical retry and concurrent winner return success without duplicate audit/activity or dispatch. Opposite outcomes return conflict. Read failures no longer masquerade as an empty successful state.
- Pre-mutation reads are invalidated; overlapping reads cannot commit stale data. The confirmed decision is removed only after server success. Errors retain the pending card, its note and retry control.
- Recent decision history includes request time, outcome, manager identifier, resolution time and reason. Existing full approval history remains available.
- PostgreSQL request fingerprints and transaction advisory locks suppress identical pending/rejected requests across workers. Repeat count, prior decision, last rejection and responsible agent are recorded. Duplicate proposals are marked needs_revision. Historical requests are retained; existing duplicate historical rows are not deleted.
- Recovery and meeting-action task gates converge in the same transaction. A completed recovery report does not reauthorize a rejected task.
- Shared Button/SubmitButton/ButtonGroup replace native controls across server action forms and client pages. Form submit identity and custom action props are retained. Component-level Promise locking and immediate loading replace the global fetch interceptor.
- Existing spacing/color/radius tokens are retained. Shared motion, focus, disabled states, coarse-pointer targets and wrapping action groups cover legacy controls. The rejection reason field remains visible; narrow approval grids can shrink to available width.
- The enhancer no longer owns approval controls or observes its own DOM mutations. Its display polling is in-flight guarded, pauses in hidden tabs, updates unchanged HTML only when needed, and uses a 15-second interval. Live polling is also 15 seconds and hidden-tab aware.

## Source audit and template coverage

All 132 page sources were inventoried in `ux-route-audit.csv`. This is a source audit, not a claim of 132 manually tested screens. Shared controls cover Home, Projects, project detail/roadmap/decisions, Inbox, Company, Departments, Agents, Reports, Meetings/Boardroom, integrations/settings, customer/admin surfaces, automation/monitoring, auth/onboarding, forms, tables, public routes and template marketplace/builder flows where those controls exist.

Software and advertising company templates render through the same shared project, intake, approval and studio UI. This change does not alter business template data or navigation architecture. Business gating remains enforced.

## Performance and accessibility

The self-triggering observer is removed. At steady state, project live and cockpit polling intervals change from 5 to 15 seconds, reducing each loop's periodic frequency by two thirds. Some cockpit and roadmap requests remain separate because their data owners differ. This is a configured frequency comparison, not a measured Production latency claim.

Native semantic buttons, submit name/value identity, keyboard focus, status/alert announcements, visible disabled/pending states, reduced motion and coarse-pointer targets are improved. No formal WCAG conformance certification or whole-site contrast certification is claimed.

## Validation and release

`test:interactions` exercises the actual React components and approval route: immediate pending UI, Promise failure/retry, double clicks, approval success/failure, rejection success, stale poll ordering, history, concurrent API compare-and-set, identical retry, conflicting retry and unauthenticated access. PGlite executes the migration and validates duplicate pending/rejected suppression, changed scope, repeat counters and approved/rejected task convergence. CI runs this test.

Release checkpoint (2026-10-01): Production build including all prebuild and postbuild checks passed; typecheck passed; all 29 CI test commands passed locally. Lint has zero errors and 24 existing warnings. Both database migrations have been applied successfully. A rolled-back Production transaction verified that an identical request after rejection was suppressed and its loop event recorded without changing the user's decision. Google authentication succeeded in the Production browser. Post-deployment private click/reload and visual checks remain to be recorded in the release report; these are distinct from the automated tests.

## Scope limits

Fingerprint detection covers identical normalized requests and declared scope/payload. It is not semantic similarity detection for differently worded AI proposals. Existing approvals are protected server-side; the shared button's client lock alone is not a blanket idempotency guarantee for every unrelated endpoint. Server-rendered mutations still use targeted framework revalidation where required for fresh data. The existing boardroom refresh loop is retained because it supplies server-owned meeting state; this change does not remove necessary updates without a replacement.
