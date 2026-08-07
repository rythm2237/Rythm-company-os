# WF-006 — Governed Decision → Action Handoff

Status: Canonical implementation contract for Batch 2.2
Scope: RYTHM Company OS MVP v1.0
Depends on: WF-001 through WF-005, Decision Engine, Approval Engine, Action Item Engine

## Purpose

WF-006 closes the governed execution handoff between an approved Human CEO decision and accountable work. A decision is not treated as execution merely because it exists. RYTHM creates an execution handoff only after the decision is final and every required approval gate has been satisfied.

## Authority rule

The pipeline never grants authority.

- AI agents may recommend a decision or proposed action.
- The Human CEO records/finalizes the consequential decision.
- High/Critical decisions must have an approved Approval Request before execution handoff.
- A Decision → Action handoff cannot approve the underlying decision or approval request.
- External actions remain disabled unless separately approved.

## Handoff states

A decision is **not execution-authorized** when any of the following is true:

- decision status is `draft`, `review`, `rejected`, or `archived`;
- `decided_by_user_id` is missing;
- `decided_at` is missing;
- a High/Critical decision has no approved `approval_requests` record;
- a decision marked `requires_human_approval=true` has no approved Approval Request.

A decision is **execution-authorized** only when:

1. `decisions.status = 'approved'`;
2. Human CEO provenance exists (`decided_by_user_id` and `decided_at`);
3. if approval is required, a matching `approval_requests(subject_type='decision', subject_id=decision.id)` is `approved`.

## Automatic handoff

When a decision first becomes execution-authorized, RYTHM creates one accountable parent Action Item if no Action Item is already linked to that decision.

The parent Action Item:

- remains inside the existing `action_items` engine;
- is linked through `decision_id` and `project_id`;
- records authorization provenance and the Approval Request when applicable;
- inherits decision risk;
- starts as `open`;
- is assigned to the Human CEO by default for triage/delegation;
- explicitly states that external execution remains disabled;
- may later be decomposed into additional governed actions without changing the original decision authority.

If linked Action Items already exist (for example the 15-action AI-PR-001 execution plan), the pipeline does not create a duplicate parent action.

## Approval-aware guard

The guard is implemented at the database boundary, not only in UI code. This prevents a future API, agent, or UI path from silently creating execution work from an unapproved High/Critical decision.

Attempting to create the automatic execution handoff before required approval must fail rather than downgrade the risk or bypass governance.

## Idempotency

The automatic handoff is idempotent per decision:

- if an Action Item already references the decision, the existing action is returned;
- repeated trigger execution does not create a duplicate action;
- the Company Event uses a deterministic idempotency key.

## Company Event

Successful handoff emits:

`execution.action.created`

The event records:

- decision ID/key;
- action ID;
- project ID;
- approval ID when applicable;
- Human CEO authorization provenance;
- `external_actions=false`.

## Relationship graph

Successful handoff maintains semantic relationships:

- `action_item implements_decision decision`
- `action_item belongs_to_project project` when project-scoped

Direct foreign keys remain authoritative. Semantic edges exist for navigation/provenance only.

## Workflow convergence

The Action Item insert is visible to the WF-005 project resolver. An execution-authorized decision with an open governed action can move the project operating state to `EXECUTION`, subject to the WF-005 precedence rules (for example a newer pending legal/approval/decision gate may still have higher precedence).

## Existing execution-plan compatibility

`AI-PR-001-DEC-001` already has 15 governed Action Items. WF-006 does not backfill an extra parent action and does not alter those 15 records.

## Implementation acceptance

Steps 2.2.1–2.2.3 are satisfied when:

- the authority/approval handoff contract is explicit;
- database guard rejects unauthorized handoff;
- approved decisions can create a linked Action Item;
- existing linked actions prevent duplicates;
- high/critical approval is verified at the database boundary;
- Company Event and semantic relationships are recorded;
- external actions remain disabled;
- no existing execution-plan actions are duplicated.
