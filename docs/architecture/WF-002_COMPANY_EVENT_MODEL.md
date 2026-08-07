# WF-002 — Company Event Model

Status: Canonical architecture for Batch 2.1
Scope: RYTHM Company OS MVP v1.0
Authority: Human CEO retains consequential decision authority

## Purpose

The Company Event Model defines the canonical vocabulary and envelope for meaningful state changes across RYTHM. Events are immutable facts about what occurred. They support auditability, timeline generation, attention/notification derivation, analytics, replay/debugging, and future governed automation without allowing an event consumer to bypass Human CEO authority.

## Core principles

1. Events describe completed facts; commands/requests describe intent.
2. A domain mutation and its event must be persisted atomically when backend integration is implemented.
3. UI components never become the source of truth for workflow progression.
4. Event consumers are idempotent.
5. Consequential actions remain approval/CEO gated even when triggered by an event.
6. External actions remain disabled unless separately approved.
7. Events are organization-scoped and, where applicable, project-scoped.
8. Every event carries a correlation identifier so a full operating chain can be reconstructed.
9. Sensitive payloads contain identifiers and minimal metadata, not secrets or unnecessary personal data.
10. Event history is append-only; corrections are represented by later corrective events rather than destructive edits.

## Canonical event envelope

Every workflow event must support the following logical fields:

| Field | Meaning |
|---|---|
| event_id | Immutable unique event identifier |
| event_type | Canonical event name |
| event_version | Event schema version, initially `1` |
| organization_id | Owning organization |
| project_id | Related project when applicable |
| aggregate_type | Primary entity type |
| aggregate_id | Primary entity identifier |
| actor_type | `user`, `agent`, or `system` |
| actor_user_id | Human actor when actor_type=user |
| actor_agent_id | Agent actor when actor_type=agent |
| correlation_id | Links all events in one business flow |
| causation_id | Event/command that directly caused this event when known |
| risk_level | low / medium / high / critical |
| occurred_at | Business occurrence timestamp |
| recorded_at | Persistence timestamp |
| payload | Versioned minimal JSON metadata |

## Event naming convention

Canonical storage names use lower-case dotted domains:

`<domain>.<entity>.<past-tense-fact>`

Examples:
- `project.project.created`
- `meeting.meeting.completed`
- `governance.decision.recorded`
- `legal.review.completed`
- `execution.action.blocked`

Human-readable labels can be derived separately by the UI.

## MVP event taxonomy

### Project
- `project.project.created`
- `project.project.updated`
- `project.stage.changed`
- `project.progress.changed`
- `project.milestone.started`
- `project.milestone.completed`
- `project.project.blocked`
- `project.project.unblocked`
- `project.project.completed`

### Idea / issue intake
- `idea.idea.registered`
- `idea.idea.updated`
- `idea.idea.routed`
- `idea.idea.deferred`
- `idea.idea.promoted`

### Meeting
- `meeting.meeting.created`
- `meeting.meeting.started`
- `meeting.agent.authorized`
- `meeting.agent.turn-recorded`
- `meeting.ceo.contribution-recorded`
- `meeting.synthesis.completed`
- `meeting.summary.generated`
- `meeting.meeting.completed`
- `meeting.meeting.resumed`
- `meeting.meeting.failed`

### Legal
- `legal.triage.completed`
- `legal.review.requested`
- `legal.review.completed`
- `legal.review.failed`
- `legal.counsel-required.flagged`

### Decision / approval
- `governance.decision.drafted`
- `governance.decision.recorded`
- `governance.approval.requested`
- `governance.approval.approved`
- `governance.approval.rejected`
- `governance.approval.cancelled`
- `governance.approval.expired`

### Execution / action
- `execution.action.created`
- `execution.action.assigned`
- `execution.action.started`
- `execution.action.blocked`
- `execution.action.unblocked`
- `execution.action.completed`
- `execution.action.cancelled`
- `execution.action.overdue`

### Memory
- `memory.record.created`
- `memory.record.approved`
- `memory.record.superseded`
- `memory.record.archived`

### Runtime / governance
- `runtime.agent-run.started`
- `runtime.agent-run.succeeded`
- `runtime.agent-run.failed`
- `runtime.budget.threshold-reached`
- `runtime.external-action.blocked`

## Required payload discipline

Payloads must be minimal and stable. The primary entity is referenced by envelope identifiers; payload should only contain attributes necessary for downstream interpretation. Consumers must retrieve current entity state from the authoritative table when they need full details.

Never place API keys, credentials, raw provider responses, or unrestricted personal information in event payloads.

## Correlation and causation

A correlation ID follows a complete business thread, for example:

`idea → meeting → legal review → CEO decision → action → progress → memory`

A causation ID identifies the direct preceding command/event. This permits reconstruction of why an event happened without treating chronological proximity as causality.

## Delivery semantics

The MVP uses at-least-once consumer semantics. Therefore:
- event producers must not assume a consumer runs exactly once;
- consumers use `event_id` or a deterministic derived key for deduplication;
- derived notifications/timeline rows must be idempotent;
- retrying event processing must never duplicate CEO decisions, approvals, or actions.

## Relationship to audit_events

`audit_events` and workflow events serve different purposes:
- audit events answer **who did what to which governed object**;
- workflow events answer **what business/domain fact occurred and what can react to it**.

A consequential domain change may create both records in one transaction. The audit ledger must not be replaced by the workflow event stream.

## Consumer classes allowed in MVP

Read/derive consumers:
- Operating Timeline
- Project Pulse
- Attention Center
- internal notifications
- dashboard counters
- observability/analytics

Governed mutation consumers:
- Decision → Action pipeline
- project stage/progress derivation
- memory update proposals

Any governed mutation consumer must enforce the same authorization/risk rules as a direct command. Events do not grant additional authority.

## Versioning

Event type names are stable contracts. Breaking payload changes require an `event_version` increment. Existing historical events remain valid under their original version.

## Failure handling

Producer failure: the domain transaction rolls back if the required event cannot be persisted.

Consumer failure: the event remains immutable and replayable; the consumer records failure diagnostics without altering the event. No workflow state is silently advanced because a consumer failed.

## Implementation boundary

WF-002 defines the contract. Database tables/functions, typed application helpers, transaction integration, and backfill of selected historical events belong to Step 2.1.6 — Database & Backend Integration.