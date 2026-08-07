# WF-007 — Idea / Issue Intake → Governed Meeting

Status: Canonical architecture for Batch 2.3
Scope: RYTHM Company OS MVP v1.0
Depends on: WF-001, WF-002, WF-003, WF-004, WF-005, existing Multi-Agent Meeting Runtime
Authority: Human CEO retains consequential authority

## Purpose

WF-007 closes the front of the governed MVP loop by turning a captured Idea or Issue into a durable operating record that can be deliberately surfaced into the existing Boardroom runtime.

Canonical path:

`Project → Idea / Issue → Governed Meeting → B-001 synthesis → optional AI Legal Review → Human CEO Decision → conditional Approval → Action → Progress → Memory/Audit`

Capturing or routing an intake item does **not** change approved project scope, authorize agents, start a meeting, create a Decision, or enable external actions.

## Domain model

The MVP uses one authoritative `intake_items` table for both ideas and issues. The canonical WF-003 graph entity remains `idea`; `item_type` distinguishes `idea` from `issue` without introducing a second graph vocabulary in MVP v1.

Required fields:
- organization and optional project scope
- stable intake key
- `item_type`: `idea` or `issue`
- title and summary
- category
- why it matters
- questions / assumptions
- status
- priority and risk
- suggested agent relevance
- revisit trigger
- Human CEO provenance
- optional routed meeting
- timestamps

## Intake lifecycle

Entity-local states are preserved and do not become a global workflow enum:

`inbox → to_review → research_required / scheduled_for_review / under_evaluation → deferred / accepted_for_decision / rejected / converted / archived`

Rules:
1. `inbox` is the default state for new capture.
2. Routing to a meeting sets `scheduled_for_review`.
3. `deferred` requires an explicit revisit trigger in the UI contract.
4. `accepted_for_decision` means the item may advance toward a governed CEO decision package; it is not itself a Decision.
5. `converted` indicates a later governed object has superseded the intake role; history remains immutable/auditable.
6. `rejected` and `archived` are terminal for meeting routing in Batch 2.3.

## Authority matrix

| Operation | Human CEO | Agent | System |
|---|---:|---:|---:|
| Capture Idea/Issue | Allowed | Proposal only | No autonomous capture |
| Edit/status an intake item | Allowed | Recommendation only | Deterministic housekeeping only |
| Route intake to meeting | Allowed | Recommendation only | No autonomous routing |
| Select/authorize meeting agents | Required through existing Boardroom | Cannot self-authorize | Not allowed |
| Start meeting | Required through existing meeting controls | Not allowed | Not allowed |
| Create/finalize Decision | Human CEO gate | Draft/recommend only | Not allowed |
| Enable external action | Separate governed approval required | Not allowed | Not allowed |

## Event contract

WF-007 uses the canonical WF-002 taxonomy:
- `idea.idea.registered`
- `idea.idea.updated`
- `idea.idea.routed`
- `idea.idea.deferred`
- `idea.idea.promoted`
- `meeting.meeting.created` when routing creates the draft meeting

For issue items the event domain remains `idea.idea.*`; payload carries `item_type: issue`. This preserves the canonical MVP event and relationship vocabularies.

Events are chronology, not authority. Audit records remain separate mutation evidence.

## Relationship contract

Direct FKs are authoritative:
- `intake_items.project_id → projects.id`
- `intake_items.routed_meeting_id → meetings.id`

Semantic WF-003 edges mirror operating meaning:
- `idea belongs_to_project project`
- `idea discussed_in meeting`

Edges are idempotent, organization scoped and never grant authority.

## Governed routing command

`route_intake_item_to_meeting(intake_item_id)` is idempotent and Human-CEO-only.

Preconditions:
- authenticated organization owner
- intake item exists in that organization
- item is not rejected, converted or archived
- linked project, when present, belongs to the same organization

Postconditions:
- if already routed, return the existing meeting ID
- otherwise create exactly one **draft** meeting in the existing Meetings domain
- preserve project scope
- set a structured review agenda
- mark the item `scheduled_for_review`
- emit `idea.idea.routed` and `meeting.meeting.created`
- add `discussed_in` relationship
- preserve audit evidence

The command explicitly does **not**:
- create `meeting_agent_sessions`
- select or authorize participants
- start the meeting
- invoke agents
- create a Decision
- change project scope
- authorize any external action

After routing, the Human CEO opens Boardroom, selects/authorizes agents and starts the existing meeting runtime using the established governance controls.

## Idempotency and concurrency

- Each intake item can hold only one active routed meeting in Batch 2.3.
- Routing returns the existing meeting when retried.
- The row is locked during routing to prevent duplicate meeting creation.
- Event idempotency keys are deterministic per intake/meeting mutation.
- Semantic relationship uniqueness follows WF-003.

## Security and RLS

- Organization members may read intake items.
- Only organization owners may mutate them in MVP.
- Runtime functions are `security invoker` and explicitly verify owner authority.
- No anonymous function execution.
- No cross-organization project or meeting linkage.
- Payloads contain minimal business metadata, no secrets.

## UI contract for 2.3.4

Idea Inbox must provide:
- create Idea or Issue
- project/category/status/type filtering
- priority/risk/agent relevance/revisit trigger visibility
- status updates under CEO control
- `Route to governed meeting`
- linked meeting navigation
- project/Boardroom cross-navigation
- explicit labels that capture/routing does not authorize execution

## Acceptance criteria

WF-007 is complete when Production demonstrates:
1. Human CEO can capture a new Idea or Issue with required metadata.
2. The record is DB-backed, organization/project scoped and visible after refresh.
3. Capture emits workflow + audit provenance and project relationship when applicable.
4. Human CEO can route an eligible item to exactly one draft Meeting.
5. Routing is retry-safe and creates the semantic `discussed_in` edge.
6. Boardroom opens the routed meeting, but no agents are selected/authorized and no meeting is auto-started.
7. Existing Meeting → Decision → Approval → Action governance remains unchanged.
8. External actions remain disabled.
