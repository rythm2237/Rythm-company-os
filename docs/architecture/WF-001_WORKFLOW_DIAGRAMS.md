# WF-001 — Workflow Architecture Diagrams

These diagrams are the visual companion to `WF-001_UNIFIED_WORKFLOW_ARCHITECTURE.md`.

## 1. Governed operating loop

```mermaid
flowchart LR
  P[Project] --> I[Idea / Issue]
  I --> M[Governed Meeting]
  M --> S[B-001 Synthesis]
  S --> L{Legal review indicated?}
  L -- No --> D[Human CEO Decision]
  L -- Yes --> LR[A-106 AI Legal Review]
  LR --> D
  D --> A{Additional approval required?}
  A -- No --> X[Action / Execution]
  A -- Yes --> AP[Approval Request]
  AP --> X
  X --> PG[Project Progress]
  PG --> MM[Memory + Audit]
  MM --> P
```

## 2. Entity relationship view

```mermaid
erDiagram
  PROJECT ||--o{ IDEA : contains
  PROJECT ||--o{ MEETING : governs
  PROJECT ||--o{ DECISION : records
  PROJECT ||--o{ ACTION : executes
  PROJECT ||--o{ MEMORY : contextualizes
  PROJECT ||--o{ APPROVAL_REQUEST : governs
  PROJECT ||--o{ PROGRESS_EVENT : advances

  IDEA }o--o{ MEETING : surfaced_in
  MEETING ||--o{ AGENT_SESSION : runs
  MEETING ||--o{ LEGAL_REVIEW : reviewed_by
  MEETING ||--o| DECISION : resolves_to
  DECISION ||--o{ ACTION : creates
  DECISION ||--o| APPROVAL_REQUEST : may_require
  DECISION ||--o{ MEMORY : may_create
```

## 3. Authority boundary

```mermaid
flowchart TB
  B[B-001 Orchestrator] -->|analyze / route / synthesize / escalate| H[Human CEO]
  S[Specialist Agents] -->|advisory analysis| B
  L[A-106 Legal Counsel] -->|advisory legal review| H
  H -->|final consequential decision| D[Decision]
  D -->|policy permits| X[Execution path]
  D -->|high/critical| A[Approval Engine]
  A --> X
```

## 4. Failure-safe progression

```mermaid
flowchart LR
  R[Request] --> V{Valid response / write?}
  V -- No --> F[Retain current authoritative state]
  F --> RR[Retry / Resume]
  RR --> R
  V -- Yes --> E[Record canonical event]
  E --> N[Advance workflow state]
```

## 5. Lifecycle boundaries

```text
Project:      draft → active → blocked/on_hold → completed → archived
Idea:         inbox → triaged → research/scheduled/deferred → accepted/rejected → archived
Meeting:      draft → scheduled → running → completed → archived/cancelled
Decision:     proposed → pending_human → pending_approval → approved/rejected → superseded
Action:       planned → ready → in_progress → blocked → completed/cancelled
Legal Review: requested → running → completed/failed
Memory:       draft → approved → archived
```

## 6. Navigation contract

```text
Project
 ├─ Ideas
 ├─ Meetings
 ├─ Decisions
 ├─ Legal Reviews
 ├─ Approvals
 ├─ Actions
 ├─ Memory
 └─ Timeline / Progress

Meeting
 ├─ Related Project
 ├─ Related Idea(s)
 ├─ Agent Session
 ├─ Legal Review(s)
 ├─ Human CEO Decision
 └─ Resulting Action(s)

Decision
 ├─ Related Project
 ├─ Source Meeting
 ├─ Approval Request
 ├─ Actions
 └─ Memory
```
