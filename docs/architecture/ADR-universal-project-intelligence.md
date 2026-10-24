# ADR: Universal project intelligence over the existing operating core

Date: 2026-10-24
Status: Implemented on feature branch; production release pending staging validation.

## Existing system and verified gaps

The current core already has projects/customer identities, one human accountable manager, Project Knowledge, readiness assessments, scope versions, roadmap approval/baselines, durable task runs, dependency claims, autonomous meetings, governed proposals, completion evidence and organization isolation. The production main baseline audited was `8ba2f605f9fc926ab5428284f125589540a16ff0` (PR #436), Vercel project `prj_zDgN04lvSuAEzkLr5MzQSohmwYoB`, Supabase `dezbacyuvsdrlpmmpjht`.

Quick Start copied the beginning of the objective into project names. Analysis used broad generic reasoning, could repeatedly ask for known information, and materialized model-selected agents without a capacity eligibility decision. The existing live mesh animated generic repeating packets. The task lease boundary did not enforce agent concurrency. Project controls and next-action guidance were derived separately.

## Decision

Extend the existing engine. Do not introduce a parallel project table, workflow state machine, agent fleet or event bus.

| Responsibility | Existing contract extended |
| --- | --- |
| Intake | Existing CRM-linked project creation RPC; guided four-step client; budgeted naming Gateway |
| Business context | Operational Project Knowledge + caller-RLS CRM allowlist + approved reusable customer corrections |
| Evidence | Source identity, recorded timestamp, recorded/approved/submitted verification and claim reliability |
| Questions | Server priority filter, answered-key suppression, target 0–3 essential questions; deferred task dependencies |
| Diagnosis | Competing hypotheses, provisional problem definition, uncertainty, success measures; discovery/delivery distinction |
| Team | Existing company agents, `project_agents`, capacity reservations and actual queued/running tasks |
| Roadmap | Versioned `project_roadmaps.generated_from.intelligence`; human review snapshots problem definition |
| Guidance | One pure server projection shared by overview and action APIs |
| Execution | Existing durable workers, task waits, supervisor, Integration & Execution Gateway and completion evaluator |
| Live operations | Existing persisted `project_activity_events`, deterministic handoff identities and cursor replay |

Company templates contribute expertise and capability profiles. Project evidence selects versioned domain profiles for software/digital products, hospitality, marketing and operations. An unrecognized domain keeps the shared reasoning framework; it is not asserted to have specialist knowledge. The profile catalog is extensible in code. No principal orchestration branch depends on a company-template name.

## Important reasoning boundaries

- A CRM field is recorded information; an inferred industry classification is an inference. A possible audience is a hypothesis. Vegan hospitality never implies vegan-only customers.
- Model source references are filtered against actual supplied source IDs. Model claims cannot certify their own implementation, verification or business outcomes.
- URL submission is not a connected integration or proof of page inspection. The structured worker has no browser tool. Page-specific tasks require usable supplied page evidence; independent plans/checklists may continue.
- An initial question budget does not discard later task requirements. Required input keys link deferred clarifications to the relevant task wait.
- Existing contracts and finance are excluded from shared analysis. CRM enrichment runs through the caller's authenticated RLS client, using a small operational field allowlist. Customer correction reuse requires visibility of that same customer and prior operational, explicitly approved customer-scoped assertions.
- The human accountable manager remains `projects.primary_manager_user_id`. The AI lead is a project agent assignment role; these are separate identities.

## Assignment and capacity

The configurable deterministic scoring default is skills 40, domain 25, capacity 20, independently verified historical quality 10, scheduling 5. Unknown quality/domain is excluded from the available-weight denominator. Candidate ties use queue size then stable ID. Profile skills are explicitly listed as **declared**, not falsely certified. A minimal capability match, enabled/provisioned state, execution restrictions, queue limits and capacity are checked before ranking.

Reservations lock the project and agent rows, recheck the scoped owner, agent profile version, actual task workload and active allocations, and write the assignment/capacity/audit event together. A partial unique index permits one active AI lead. Existing assignment roles and the human manager are preserved. Every capacity writer serializes on the same agent lock and rejects over-allocation. The scheduler locks agent rows using `SKIP LOCKED` and leases only available concurrency slots (default one, bounded configurable maximum).

Historical performance uses existing independently verified work records; missing history stays unknown. This change does not add per-skill professional certification or invent evaluation history.

## Persistence and migrations

No new table is needed. Existing JSON contracts carry context, diagnosis, setup choices, assignment explanations and event metadata. Two CLI-generated migrations add the reservation RPC/index and harden the existing capacity trigger/claim RPC:

1. `20261024140353_universal_agent_assignment.sql`
2. `20261024141204_project_scheduler_capacity_enforcement.sql`

Both RPCs are `SECURITY INVOKER`, have fixed empty search paths and are service-role-only. The existing capacity trigger remains a restricted `SECURITY DEFINER` trigger with explicit tenant integrity checks. No business facts or legacy progress are backfilled.

## Legacy compatibility and failure handling

Reanalysis preserves active execution/baseline state. The Run endpoint returns an existing active legacy run rather than pausing it or starting another run. Existing roadmap approval replays do not reset progress. Rejected/stale review versions cannot become a new baseline through a replay. Holds and terminal states are exposed by canonical guidance and checked before execution/approval. Setup uses a stable request identity and existing project uniqueness, retries incomplete persistence, and does not duplicate completed creation audits/assignments.

Browser drafts are scoped to organization, user and customer, versioned, and stored locally. Cross-device draft synchronization is not included. Naming cache is bounded and organization-scoped; cache loss only repeats the governed request. No new external-fetch or SSRF surface is introduced.

## Rollout and recovery

Feature branch → tests and review → staging migrations/runtime verification → main merge → established Vercel release → authenticated smoke checks. Do not merge a runtime that requires missing RPCs.

Before applying migrations, inspect duplicate active AI leads and invalid existing capacity totals. Capture `pg_get_functiondef` for the existing capacity trigger and claim RPC as a rollback artifact in the controlled release record. Roll back application deployment and restore captured previous functions only after stopping scheduler workers and evaluating affected task leases; do not delete projects, task history, assignments or events. A forward repair is preferred. The new reservation primitive can remain unused after application rollback.

Staging restoration was attempted and rejected by Supabase's two-active-free-project limit. Do not pause an unrelated active project or enable paid compute without the user's choice. Production DDL and merge are withheld until that environment gate can be satisfied.
