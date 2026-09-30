# Project Completion Architecture

RYTHM separates completion of assigned agent work from completion of the real-world project outcome.

## Lifecycle dimensions

1. Work
2. Deliverables
3. Implementation
4. Verification
5. Outcomes
6. Acceptance
7. Closeout

`project_task_runs.status = completed` means the assigned work finished. It does not by itself complete the project.

The deterministic database evaluator `evaluate_project_completion_v1` is the canonical completion authority. AI agents can provide structured claims and evidence suggestions, but agent claims are stored as non-authoritative until validated by configured completion criteria or an authoritative execution/measurement source.

## Lifecycle states

`DRAFT → DISCOVERY → PLANNING → READY_FOR_EXECUTION → EXECUTION → IMPLEMENTATION_PENDING → VERIFICATION → OUTCOME_VALIDATION / OBSERVATION → ACCEPTANCE_PENDING → CLOSEOUT → COMPLETED`

Exceptional states: `BLOCKED`, `PAUSED`, `CANCELLED`, `FAILED`, `ON_HOLD`.

## Production safeguards

- Terminal task runs complete an execution, not the project.
- Unfinished projects are capped below 100% overall progress.
- A database guard rejects/normalizes legacy attempts to write false project completion.
- Observation clocks start only after required implementation and verification gates pass.
- Final acceptance supports accepted, accepted with conditions, rejected, and policy-controlled waiver.
- Closeout reports are generated from structured project records and evidence.
- Governed external actions become implementation evidence only after the Integration & Execution Gateway reports real success; simulation is never implementation.
- KPI outcome evidence is event-driven and does not establish causality by itself.
- Completion-aware project health surfaces blockers, missing evidence, failed verification, stale observation and contradictory states.
- Every evaluator run is audited with previous/new state, blockers, satisfied criteria, evidence references, trigger and evaluator version.
