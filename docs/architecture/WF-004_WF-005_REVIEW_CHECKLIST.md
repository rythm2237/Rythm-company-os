# WF-004 + WF-005 Architecture Review Checklist

Batch: 2.1.4 + 2.1.5  
Scope: Operating Timeline Architecture + Workflow State Machine

## Alignment

- [x] Aligns with frozen MVP scope.
- [x] Extends WF-001 rather than creating a parallel workflow framework.
- [x] Uses WF-002 Company Events as canonical transition/event semantics.
- [x] Uses WF-003 relationships for project association and navigation.
- [x] Preserves existing Project Pulse/progress records.
- [x] Preserves existing Audit system as separate governance evidence.
- [x] Preserves Human CEO consequential authority.
- [x] Keeps external actions disabled unless separately approved.

## WF-004 Operating Timeline

- [x] Timeline is a projection, not a source of truth.
- [x] Controlled event categories are defined.
- [x] MVP event coverage is defined.
- [x] Deterministic ordering is defined.
- [x] Correlation and causation are defined.
- [x] Project-association rules are explicit.
- [x] Related-entity navigation contract is defined.
- [x] Historical correction is append-only/superseding.
- [x] Replay/recovery requirements are defined.
- [x] Security/RLS requirements are defined.
- [x] Backend implementation is deferred to 2.1.6.
- [x] UI rendering is deferred to 2.1.7.

## WF-005 Workflow State Machine

- [x] Canonical project states are defined.
- [x] Normal and conditional transition paths are defined.
- [x] System, agent and Human CEO transition authority is separated.
- [x] Legal/decision/approval guards are defined.
- [x] Blocked-state semantics are explicit.
- [x] Domain-state mapping is defined.
- [x] Precedence rules are defined.
- [x] Transition events are mandatory.
- [x] Idempotency requirement is explicit.
- [x] Illegal transitions are rejectable.
- [x] Project Pulse boundary is explicit.
- [x] Attention Center boundary is explicit.
- [x] Recovery converges from persisted state.
- [x] Backend resolver implementation is deferred to 2.1.6.
- [x] Visible state integration is deferred to 2.1.7.

## Implementation handoff to Step 2.1.6

Step 2.1.6 must convert these contracts into the minimum additive Production implementation, including:

1. a durable company-event persistence/projection strategy;
2. deterministic project workflow-state resolution;
3. timeline retrieval/projection for a project;
4. idempotent transition/event handling;
5. integration with existing projects, meetings, legal reviews, decisions, approvals, action items, memory, audit and project progress;
6. organization-scoped RLS/security;
7. migration/backfill strategy that preserves existing Production records.

No database schema or runtime behavior is changed by Steps 2.1.4/2.1.5 themselves.
