# WF-008 — Attention Center & Executive Review

Status: Canonical implementation contract for Batch 2.4
Scope: RYTHM Company OS MVP v1.0
Authority: Human CEO / Owner remains the consequential authority

## Purpose

WF-008 creates a deterministic executive attention projection over existing governed records. It does not create a second source of truth and does not authorize or mutate Decisions, Approvals, Legal Reviews, Actions, Meetings, Projects, or Intake Items.

Canonical attention sources:

1. pending or review-stage Human CEO Decisions;
2. pending Approval Requests;
3. legal triage/review work that still requires completion;
4. blocked Action Items;
5. overdue non-final Action Items;
6. Idea/Issue intake records waiting for review, research, or evaluation.

## Priority model

The Attention Center uses a deterministic display priority only:

- P0 — Critical governance gate: critical pending approval, licensed-counsel/legal stop, critical blocked work.
- P1 — High governance/operational attention: high-risk pending approval, pending legal review, high-risk blocked work, overdue P1 work.
- P2 — Decision/review attention: CEO decision package, medium-risk approval, overdue normal-priority work.
- P3 — Intake/housekeeping attention: ideas/issues waiting for review, lower-risk overdue work.

Display priority never changes domain risk, status, authority, or approval requirements.

## Executive Review contract

The Executive Review is a read-only roll-up intended to answer:

- What requires the Human CEO now?
- What is legally/governance blocked?
- What execution work is blocked or overdue?
- What Idea/Issue should be reviewed next?
- What project/workflow surface should the CEO open to resolve it?

The review uses live records from existing authoritative tables and deep-links to the corresponding governed UI.

## Invariants

- no autonomous decision or approval;
- no autonomous meeting start or agent authorization;
- no autonomous status transition;
- no external actions;
- no duplicate attention persistence table for MVP;
- attention items are projections and disappear when the underlying authoritative condition is resolved;
- organization scope is mandatory;
- project scope is displayed when available.

## Acceptance criteria

Batch 2.4 is complete when Production demonstrates:

1. an authenticated Owner can open `/attention`;
2. pending Decisions, Approvals and legal work are aggregated;
3. blocked and overdue Action Items are aggregated;
4. Idea/Issue review work is aggregated when present;
5. priority ordering is deterministic and clearly explained;
6. each attention item links to its authoritative workflow surface;
7. an Executive Review summary exposes total attention, critical/high attention and core queue counts;
8. Human CEO authority and external-action-disabled constraints remain explicit;
9. no new database migration is required for the projection-only MVP implementation.
