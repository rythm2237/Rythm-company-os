# WF-005 — Workflow State Machine

Status: Approved architecture for Batch 2.1 implementation  
Applies to: RYTHM Company OS MVP v1.0  
Depends on: WF-001, WF-002, WF-003, WF-004

## 1. Purpose

The Workflow State Machine defines the canonical operational state of a governed project journey in RYTHM. It prevents independent screens and features from inventing incompatible status semantics.

The state machine does not replace domain-specific status fields such as meeting status or action status. It provides the normalized project-level operating state derived from those domain records and company events.

## 2. Canonical project workflow states

The MVP state vocabulary is:

- `INTAKE`
- `DISCOVERY`
- `DELIBERATION`
- `LEGAL_REVIEW`
- `DECISION_PENDING`
- `APPROVAL_PENDING`
- `EXECUTION`
- `BLOCKED`
- `COMPLETE`
- `CANCELLED`

These states are intentionally broader than individual entity lifecycle statuses.

## 3. State meanings

### INTAKE
A governed project/issue/idea exists, but the operating path has not yet entered substantive analysis or discussion.

### DISCOVERY
Context, evidence, resources, assumptions or project framing are being prepared.

### DELIBERATION
A governed meeting or structured multi-agent analysis is active or is the current required step.

### LEGAL_REVIEW
The current decision path is waiting for or undergoing AI Legal Review or licensed-counsel handling that is directly relevant to the current execution path.

### DECISION_PENDING
A decision package exists and Human CEO action is required.

### APPROVAL_PENDING
A governed high/critical approval gate is pending after or as part of a consequential decision path.

### EXECUTION
The approved decision has active governed actions or implementation work.

### BLOCKED
Progress cannot continue because a governed blocker exists. The blocker reason must be explicit and traceable.

### COMPLETE
The project's current governed objective or defined workflow loop is complete.

### CANCELLED
The governed project/workflow was intentionally stopped and is not awaiting further work.

## 4. Primary transition model

The normal MVP path is:

`INTAKE → DISCOVERY → DELIBERATION → [LEGAL_REVIEW] → DECISION_PENDING → [APPROVAL_PENDING] → EXECUTION → COMPLETE`

Square-bracket states are conditional.

Any active non-terminal state may transition to `BLOCKED` when a valid blocker is recorded. A blocked project can return only to an allowed prior/next active state after the blocker is resolved.

A project may transition to `CANCELLED` through authorized Human CEO or governance rules.

## 5. Transition authority

No AI agent may unilaterally complete a consequential Human CEO decision or approval transition.

Transition authority is separated as follows:

### System-derived transitions
May occur when objective persisted conditions become true, for example:

- meeting starts → `DELIBERATION`
- meeting synthesis completes and legal review is not required → `DECISION_PENDING`
- decision approved and actions exist → `EXECUTION`
- all required completion criteria satisfied → eligible for `COMPLETE`

### Agent-recommended transitions
Agents may recommend or trigger preparation for transitions within their authority, but cannot bypass Human CEO gates.

### Human CEO transitions
Required for:

- consequential decision finalization
- high/critical approval outcome where CEO is approver
- scope exception approval
- cancellation of governed strategic work when authority requires it
- final MVP Release Gate

## 6. Guard conditions

A transition is valid only when its guard conditions are satisfied.

Examples:

### DELIBERATION → LEGAL_REVIEW
Allowed when:
- B-001 legal relevance triage recommends review; or
- Human CEO manually requests AI Legal Review.

### DELIBERATION → DECISION_PENDING
Allowed when:
- deliberation is complete;
- synthesis exists;
- no blocking legal review is pending.

### LEGAL_REVIEW → DECISION_PENDING
Allowed when:
- AI Legal Review is completed; and
- outcome does not prohibit the current strategic decision path.

`LICENSED_COUNSEL_REQUIRED` may block legally sensitive execution without necessarily blocking strategic direction, consistent with A-106 calibration.

### DECISION_PENDING → APPROVAL_PENDING
Allowed when:
- Human CEO records a decision whose risk/governance rules require governed approval.

### DECISION_PENDING → EXECUTION
Allowed when:
- Human CEO records the decision;
- no additional approval gate is required;
- execution is authorized within the approved scope.

### APPROVAL_PENDING → EXECUTION
Allowed when:
- approval request is approved;
- all required conditions are satisfied.

### EXECUTION → COMPLETE
Allowed when:
- required actions/milestones/acceptance criteria for the current objective are complete;
- no unresolved critical blocker remains;
- Human CEO gate is satisfied where explicitly required.

## 7. Blocked-state model

`BLOCKED` is not a generic error status.

A blocked workflow must record:

- `blocked_from_state`
- `blocker_type`
- `blocker_summary`
- `blocking_entity_type`
- `blocking_entity_id`
- `risk_level`
- `blocked_at`
- `resolution_required`

Examples of valid blockers:

- required legal counsel
- rejected approval requiring revision
- critical defect
- required data/resource unavailable
- runtime governance failure
- scope conflict

Transient UI/network errors that do not change persisted governed state do not automatically move a project to `BLOCKED`.

## 8. Domain-state mapping

The project workflow state is derived from domain conditions and must not be inferred from a single table status alone.

Examples:

- meeting `running` can contribute to `DELIBERATION`;
- legal review `running/pending` can contribute to `LEGAL_REVIEW`;
- pending approval can contribute to `APPROVAL_PENDING`;
- open/in-progress actions after an approved decision can contribute to `EXECUTION`;
- a completed meeting without CEO decision normally contributes to `DECISION_PENDING`, not `COMPLETE`.

Step 2.1.6 will implement the deterministic resolver and persistence strategy.

## 9. Precedence rules

When multiple domain conditions exist simultaneously, the resolver must apply precedence instead of choosing arbitrarily.

Recommended MVP precedence, highest first:

1. `CANCELLED`
2. `BLOCKED`
3. `APPROVAL_PENDING`
4. `LEGAL_REVIEW`
5. `DECISION_PENDING`
6. `DELIBERATION`
7. `EXECUTION`
8. `DISCOVERY`
9. `INTAKE`
10. `COMPLETE` only when explicit completion conditions are met

`COMPLETE` is terminal and must be based on completion evidence, not merely on absence of active records.

## 10. Transition event requirement

Every committed workflow state transition must emit or correspond to a canonical WF-002 Company Event.

Minimum event semantics:

- `workflow.state_changed.v1`
- `workflow.blocked.v1`
- `workflow.resumed.v1`
- `workflow.completed.v1`
- `workflow.cancelled.v1`

The event must capture:

- before state
- after state
- project
- triggering entity
- actor
- correlation ID
- reason/guard evidence

## 11. Idempotency

Reprocessing the same causal event must not produce duplicate state transitions or duplicate timeline items.

The implementation must use deterministic/idempotent transition keys or equivalent safeguards.

## 12. Illegal transitions

The runtime must reject invalid transitions rather than silently accepting them.

Examples:

- `INTAKE → COMPLETE` without completion evidence
- `DELIBERATION → EXECUTION` without required CEO decision
- `LEGAL_REVIEW → EXECUTION` while a required approval remains pending
- any agent-only action that bypasses Human CEO authority

Rejected transition attempts should be auditable when they represent a governed operation, but ordinary UI validation errors do not need to become governance events.

## 13. State history

Current workflow state and historical state transitions are separate concepts.

The current state can be stored/derived for efficient UI queries. Historical transitions are preserved through Company Events/Operating Timeline/Audit where applicable.

History must never be reconstructed solely from the current state column.

## 14. Project Pulse integration

Project Pulse and workflow state serve different functions:

- Workflow State = what operating mode the project is currently in.
- Project Pulse = progress/milestone visualization and change communication.

Examples:

- `EXECUTION` may exist at 75% progress.
- `BLOCKED` may exist at 75% without reducing historical progress.
- `DECISION_PENDING` may exist at a milestone gate.

Step 2.1.6 will connect the resolver to existing project/progress infrastructure without creating a competing project record.

## 15. Attention Center integration

State changes can produce future Attention Center items.

Expected mappings include:

- `DECISION_PENDING` → CEO decision required
- `APPROVAL_PENDING` → approval required
- `LEGAL_REVIEW` → legal review pending/requested
- `BLOCKED` → blocker attention

Attention Center implementation remains outside WF-005 and is handled later in Batch 2.

## 16. Security and authority

The state resolver may run server-side/system-side, but authority-sensitive source changes must remain protected by existing RLS/API governance.

A state resolver does not grant permission to perform the underlying domain action.

Example: detecting that a pending approval exists can set/derive `APPROVAL_PENDING`; it does not grant the resolver authority to approve it.

## 17. Recovery semantics

After runtime interruption, the state resolver should converge from persisted domain records and events.

The system must avoid relying on ephemeral browser state to determine project workflow state.

This allows meeting retry/resume, backend recovery and future event replay without losing workflow continuity.

## 18. MVP acceptance conditions for WF-005

WF-005 architecture is satisfied when:

- canonical project workflow states are defined;
- transition authority and guard conditions are explicit;
- blocked-state semantics are explicit;
- domain-state mapping and precedence are defined;
- illegal transitions are defined as rejectable;
- state transition events and idempotency are required;
- Project Pulse and Attention Center boundaries are clear;
- Human CEO authority remains non-bypassable;
- backend resolver/persistence is explicitly deferred to Step 2.1.6;
- visible state/UI integration is explicitly deferred to Step 2.1.7.
