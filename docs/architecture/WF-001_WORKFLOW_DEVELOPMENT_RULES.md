# WF-001 — Workflow Development Rules

These rules apply to every workflow-connected feature in RYTHM Company OS.

## Required design questions

Before implementation, every feature that creates or mutates business state must document:

1. Canonical entity and organization/project ownership.
2. Valid lifecycle states and transitions.
3. Actor/authority permitted to trigger each transition.
4. Canonical domain event for each consequential transition.
5. Audit evidence retained.
6. Relationships created or required.
7. Retry/idempotency behavior.
8. Failure behavior and rollback boundary.
9. Human CEO, approval, legal, or external-action gates that apply.
10. Navigation/read-model requirements for related entities.

## Mandatory implementation rules

- Do not create a second source of truth for an existing business fact.
- Do not advance workflow state from client-only state.
- Do not treat a failed/empty agent output as a completed business transition.
- Do not bypass Human CEO authority through agent orchestration.
- Do not enable external actions implicitly when completing internal workflow.
- Do not infer authoritative relationships solely from titles, text, or URL parameters.
- Persist organization-scoped identifiers for relationships.
- Record consequential events using stable semantic event names.
- Make replay/retry safe where duplicate requests are possible.
- Preserve prior Human CEO decisions during recovery or migration operations.
- Preserve failed attempts when needed for audit, while excluding them from active workflow state.
- Add RLS/policy changes through versioned migrations only.
- Apply migrations in order and verify Production before considering the feature complete.

## Event naming standard

Canonical domain events use lowercase dot-separated semantic names:

`<domain>.<subject>_<transition>`

Examples:
- `meeting.started`
- `meeting.completed`
- `meeting.ai_legal_review_completed`
- `decision.recorded`
- `approval.requested`
- `action.created`
- `action.completed`
- `project.progress_changed`
- `memory.approved`
- `idea.triaged`

UI-specific names such as `button_clicked` are analytics events, not domain events.

## Provenance standard

Where applicable, downstream records must persist:
- `organization_id`
- `project_id`
- source entity id (`meeting_id`, `decision_id`, etc.)
- creating actor/user/agent where available
- created timestamp
- current lifecycle status

## Human authority standard

Any transition that creates a consequential company commitment must identify whether authority is:
- Human CEO direct;
- Human CEO after specialist/legal advice;
- governed approval request;
- internal non-consequential system operation.

If authority is unclear, the transition must stop and escalate rather than infer permission.

## Legal standard

B-001 may perform legal relevance triage but not legal analysis. A-106 may perform advisory issue-spotting but cannot issue formal legal approval. A licensed-counsel requirement blocks the affected execution step until resolved.

## Cost standard

Agent-backed operations must remain within configured budget controls. Token usage and estimated provider cost should be persisted when available. CEO-facing commercial display is EUR even if provider reconciliation uses another currency internally.

## Completion standard

A workflow-connected feature is done only when:
- implementation matches WF-001;
- build/CI passes;
- required migration is on `main` and applied to Production;
- authoritative relationships are testable;
- failure/retry path is tested where relevant;
- audit/event evidence exists;
- Human CEO authority is preserved;
- Production validation passes.
