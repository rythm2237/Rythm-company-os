# Project lifecycle and workspace v3

## Diagnosis verified on 15 October 2026

The affected SEO program has one approved baseline with six phases recorded as completed. The project itself is blocked / ON_HOLD, is not completion-eligible, and has a pending 30-day observation window with no start/end and insufficient data. Its project metric table has no measurements and no project-specific connection bindings were found. The cancelled predecessor is a separate project.

The phase synchronizer in `20260927193000_project_autonomy_supervisor_recovery.sql` considered all non-cancelled tasks being completed sufficient to complete a phase. This bypassed deliverable and observation validation, even though the newer project completion evaluator correctly withheld project completion. The operating workspace also mounted a DOM-injected cockpit which fetched the same roadmap/live context every 15 seconds, repeated status/progress on every section and exposed completed phases as success. Another unused legacy worker still attempted to write project completion directly.

Existing approval handling already has compare-and-set resolution, durable final decisions, request fingerprints, duplicate-generation suppression, and stale-read epochs. Those protections are retained and regression-tested rather than replaced.

## Implemented boundaries

- `projects.lifecycle_type`: finite, campaign, continuous. Finite and campaign retain the evidence-backed completion evaluator and existing lifecycle reporting contract.
- Separate initial-delivery, operational and program-health columns. Continuous work never becomes completed through initial delivery or a cycle. The compatible legacy progress fields retain their old meaning and remain below 100 for an open program.
- Phase completion now requires explicit required criteria, authoritative criterion-linked evidence, valid waivers, no unresolved blockers, and completed observation windows where applicable. Direct phase writes use the same guard. Future phases receive deliverable and verification criteria. Evidence, criteria and observation changes refresh phase validation.
- Unverified historical claims are retained in `historical_completion` and project activity before reconciliation. The affected program is explicitly classified as continuous while preserving its HOLD; the cancelled predecessor is not reactivated.
- Review schedules and durable cycles use the existing project dispatcher, executions, tasks, agents, proposals and approvals. Defaults are daily/weekly/monthly/quarterly (configurable day intervals). There is at most one unfinished cycle per schedule and one task idempotency key per cycle. Due work uses row locks and skip-locked claiming.
- A review without fresh authorized measurements covering its observation window stays waiting for data. The worker receives referenced authoritative measurements and compares only matching source/unit/segmentation/window lengths. It cannot create a trend proposal without a comparable baseline. Changes are observed associations, not causal claims.
- Agent task completion leaves a cycle validation-pending. Independent, cycle-specific evidence and a scoped approved decision are needed for completion and scheduling the next cycle. The existing dispatcher reconciles that evidence. HOLD/paused/blocked/cancelled/archived programs are not dispatched.
- New tables expose member SELECT through RLS; writes and internal RPCs are service-only. Owner-scoped configuration routes check the tenant and membership before calling audited transactional configuration functions. An assigned enabled agent is required as review owner.
- Revised proposals retain a visible link and revision number to a prior rejection. Unchanged requests remain subject to the existing fingerprint guard. Request changes is recorded as rejection with an explicit changes-requested note, preserving the existing approval state contract.

## Workspace changes

The existing operating route and legacy view aliases remain. Resources, Performance and Settings replace the visible labels Files, Results and Advanced. Overview shows four compact status dimensions, attention, current work and the next action/review; objective, analysis and scope are disclosed on demand. It no longer mounts the injected cockpit or mutates workflow state on page reads.

Work combines task records and unlinked actions, avoiding linked-task duplication. Details are fetched only on selection through a tenant-scoped endpoint. A native modal dialog supplies the contextual drawer, Escape handling and native focus containment/restoration, with a full-width mobile treatment and reduced-motion styling. URL context and filters survive panel closure. Actions uses the same panel and a collapsed creation form. Portfolio adds search/type/status/sort controls. Long approval context and discussion are collapsed; decision controls preserve immediate pending/error/success feedback.

## Changed routes and components

- `/projects`, `/projects/operating`, `/actions`
- `/api/projects/program`, `/api/projects/work-item`
- Existing `/api/projects/dispatch`, `/api/projects/control`, `/api/projects/live`
- `ContextPanel`, `ActionDetailPanel`, `ProjectWorkList`, `ProgramSettings`
- Shared roadmap/progress presentation, structured task worker and measurement comparison utility

## Verification

- Actual migration executed in PGlite against synthetic baseline tables: lifecycle compatibility, continuous non-terminality, evidence/observation gates, idempotent review scheduling, cycle validation, scoped approval, next-cycle behavior, RLS and service-only RPC checks.
- React/jsdom behavior tests: comparable measurement evidence, attribution/source separation, lazy details, collapsed evidence, stable URL/filters and completed-work filtering. jsdom modal methods are shimmed; these tests do not establish browser focus or visual accessibility compliance.
- Existing approval regression: double clicks, stale polls, errors/retry, durable decision history, simultaneous resolution, duplicate requests and recovery transactions.
- Existing project-completion, operating architecture, cockpit, supervisor and build preflight checks remain enabled.

## Rollout and outstanding release gates

This is a reviewable implementation branch, not a claim of production rollout. The SQL migration has NOT been applied to production. No production project was modified. Main has NOT been merged. The authenticated browser audit reached the login page; secure authentication timed out without a verified signed-in session. There are no verified redesigned-screen screenshots.

Before release:

1. Validate the migration against a staging copy of the actual production schema and migrations; synthetic tests are not a replacement for that integration check.
2. Deploy the branch to Preview. Keep lifecycle settings unavailable until the migration exists. Verify authenticated desktop/mobile views, native dialog focus/Escape behavior, approval interactions, screen-reader announcements, contrast and reduced motion.
3. Inspect migration reconciliation in staging, including preserved historical phase claims and the affected program's unchanged HOLD. Verify existing organization/role boundaries and scheduler integration.
4. Apply the reviewed migration through the normal controlled procedure, verify RLS/advisors and inspect actual project/evidence state. Then release the verified application commit and inspect production runtime logs.
5. Connect authorized analytics/Search Console sources and ingestion to this project's measurement records before expecting live SEO/AI-referral monitoring. The implementation does not invent credentials, fetch another project's data, or manufacture missing metrics.

## Remaining scope limits

- No live Google Search Console / analytics ingestion or validated SEO improvement proposal is claimed: the target project has no measurements or scoped connections.
- Existing owner-only project routes remain owner-only. Manager/contributor-specific experiences need a separate authorized access-model extension.
- Campaign identity uses the existing evidence-backed state machine; a separate campaign launch/preparation taxonomy, budget-closeout specialization and calendar-based recurrence are not added here.
- Work queries are bounded; full history pagination and more elaborate KPI/execution/cycle drawer views remain follow-up work.
- Archived identity is protected by the evaluator/scheduler but a dedicated archive/restore management flow is not added.
- The project completion evaluator still uses the established criterion state contract. This change tightens phase evidence and observation-time validation; it does not re-verify every pre-existing project criterion or claim a complete new business-outcome validation system.
