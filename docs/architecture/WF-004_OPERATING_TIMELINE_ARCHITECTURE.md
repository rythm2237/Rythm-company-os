# WF-004 — Operating Timeline Architecture

Status: Approved architecture for Batch 2.1 implementation  
Applies to: RYTHM Company OS MVP v1.0  
Depends on: WF-001 Unified Workflow Architecture, WF-002 Company Event Model, WF-003 Entity Relationship Engine

## 1. Purpose

The Operating Timeline is the chronological, project-centered operational history of governed work in RYTHM. It is not a duplicate audit log and it is not a free-form activity feed.

It exists to answer five operational questions:

1. What happened?
2. In what order did it happen?
3. Which governed entity changed?
4. What caused the change?
5. What is the next operationally relevant state?

The timeline becomes the canonical human-readable operational history used by Project Workspace, Project Pulse, Attention Center, future notifications, analytics and release evidence.

## 2. Architectural boundary

RYTHM maintains three distinct records of change:

- **Domain record** — current authoritative entity state, such as a meeting, decision or action.
- **Company event** — normalized workflow event defined by WF-002.
- **Audit event** — immutable governance/security evidence.

The Operating Timeline is a governed projection of Company Events and selected existing progress/audit records. It must never become the source of truth for entity state.

## 3. Timeline item contract

Every timeline item must expose the following logical fields, regardless of physical persistence model:

- `timeline_item_id`
- `organization_id`
- `project_id`
- `occurred_at`
- `event_type`
- `event_version`
- `category`
- `title`
- `summary`
- `actor_type`
- `actor_user_id` or `actor_agent_id` when applicable
- `subject_type`
- `subject_id`
- `related_entity_refs`
- `workflow_state_before` when meaningful
- `workflow_state_after` when meaningful
- `risk_level`
- `correlation_id`
- `causation_id` when available
- `source_event_id` or source reference
- `is_attention_relevant`
- `metadata`

## 4. Timeline categories

The MVP timeline uses a controlled category vocabulary:

- `idea`
- `meeting`
- `legal`
- `decision`
- `approval`
- `action`
- `project_progress`
- `memory`
- `system`

These categories are presentation groupings. They do not replace the canonical event type taxonomy from WF-002.

## 5. MVP timeline event coverage

At minimum, the following governed moments must be representable:

### Idea
- Idea registered
- Idea status changed
- Idea surfaced into a governed meeting

### Meeting
- Meeting created
- Meeting started
- Agent deliberation completed
- Executive synthesis completed
- Meeting completed

### Legal
- Legal relevance indicated
- AI Legal Review requested
- AI Legal Review completed
- Licensed counsel required

### Decision
- Decision package prepared
- Human CEO decision recorded
- Decision superseded or archived

### Approval
- Approval request created
- Approval approved
- Approval rejected
- Approval expired or cancelled

### Action
- Action created
- Action started
- Action blocked
- Action completed
- Action cancelled

### Project progress
- Project stage changed
- Project progress changed
- Milestone reached
- Project blocked
- Project resumed

### Memory
- Memory drafted
- Memory approved
- Memory superseded
- Memory archived

## 6. Ordering model

The default timeline order is:

1. `occurred_at`
2. deterministic event/source sequence as tie-breaker
3. immutable identifier as final tie-breaker

The UI may display newest-first or oldest-first, but persistence and reconstruction must preserve deterministic chronology.

## 7. Correlation and causation

Timeline items inherit WF-002 correlation semantics.

Example:

`MeetingCompleted`
→ causes `LegalReviewRequested`
→ causes `LegalReviewCompleted`
→ enables `DecisionRecorded`
→ causes `ActionCreated`

All items in the same operational chain should share a `correlation_id`. Direct parent/trigger relationship should be represented by `causation_id` when available.

This allows future features to reconstruct a decision path without guessing from timestamps.

## 8. Project-centered projection

The Project Timeline is the primary MVP view.

An event appears in a project's Operating Timeline when at least one of the following is true:

- the subject entity has a direct `project_id`;
- WF-003 resolves a governed relationship to the project;
- the event explicitly identifies the project as context;
- a project progress record references the same project.

Organization-wide events that are unrelated to a project must not be injected into a project timeline merely because they belong to the same organization.

## 9. Related-entity context

Every timeline item should be able to navigate to its relevant domain object when that UI exists.

Examples:

- meeting event → Boardroom / meeting
- legal event → associated meeting/legal review
- decision event → decision/meeting context
- action event → Action Item Engine
- project progress event → Project Pulse / Project Workspace
- memory event → Company Memory

Navigation is derived from WF-003 relationships, not hard-coded textual URLs in event payloads.

## 10. Human-readable rendering

Timeline rendering must separate canonical event data from display text.

Canonical event:

`decision.recorded.v1`

Possible human rendering:

`Human CEO recorded the Controlled Feature Expansion decision.`

Display text may evolve without rewriting historical event semantics.

## 11. Attention relevance

The timeline can feed the future Attention Center, but timeline existence does not automatically create attention.

An event may be marked attention-relevant when it creates or materially changes a condition such as:

- CEO decision required
- approval pending
- legal review required
- project blocked
- overdue action
- critical risk
- agent escalation

Attention state will be implemented by a dedicated projection in a later Batch 2 step.

## 12. Immutability and correction

Historical timeline items are append-only projections of historical events.

Corrections must occur by:

- fixing the domain record through an authorized operation;
- emitting a corrective/superseding company event;
- preserving the original audit/event history.

RYTHM must not silently rewrite historical timeline facts.

## 13. Replay and recovery

The architecture must support rebuilding the timeline projection from canonical company events and supported historical records.

Therefore:

- projection logic must be deterministic;
- event versions must remain interpretable;
- duplicated processing must be idempotent;
- a failed timeline projection must not roll back the authoritative domain transaction unless the workflow contract explicitly requires atomicity.

## 14. Existing Project Pulse compatibility

`project_progress_events` remain valid specialized project-progress evidence.

Batch 2 must integrate them into the unified Operating Timeline rather than deleting or replacing them prematurely.

Project Pulse remains a visual progress mechanism; Operating Timeline provides chronological operational context.

## 15. Data security

Timeline access inherits organization and project authorization.

A user must never receive a timeline item that indirectly reveals an entity they are not authorized to view.

RLS and backend projection queries must enforce organization boundaries at source-query level, not only after data has reached the application.

## 16. Performance target

For MVP, a project timeline should support efficient retrieval of recent operational history without scanning every company table in the browser.

The backend implementation in Step 2.1.6 should provide a server-side projection/query surface optimized for:

- project ID
- occurred time
- event category/type
- attention relevance
- related entity

## 17. MVP acceptance conditions for WF-004

WF-004 architecture is satisfied when:

- the timeline is explicitly a projection, not a competing source of truth;
- event/category coverage is defined;
- project association rules are deterministic;
- correlation/causation behavior is defined;
- Project Pulse compatibility is defined;
- immutability and replay rules are defined;
- navigation and security contracts are defined;
- backend persistence/projection work is deferred cleanly to Step 2.1.6;
- UI presentation work is deferred cleanly to Step 2.1.7.
