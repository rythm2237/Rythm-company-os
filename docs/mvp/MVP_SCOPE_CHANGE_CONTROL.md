# RYTHM Company OS — MVP Scope Change Control

This policy applies from the MVP v1.0 Scope Freeze until the Human CEO approves the MVP release.

## Purpose

Prevent feature creep while still allowing defects, security work, and true release blockers to be resolved.

## Default rule

A new idea does **not** enter MVP automatically. It goes to the Idea Register unless it is required to complete or protect the frozen MVP operating loop.

## Allowed without scope exception

- bug fixes;
- security/RLS fixes;
- reliability and retry fixes;
- accessibility/responsiveness fixes for existing MVP flows;
- completion of UI/API/storage needed by an already in-scope capability;
- observability and release-readiness work;
- documentation and onboarding required to operate the MVP;
- cost/budget visibility required by the frozen scope.

## Scope exception required

A Scope Exception is required when a change:

- introduces a new business capability rather than completing an existing one;
- adds a new external action or third-party operational dependency;
- materially changes the primary governed operating loop;
- expands agent authority;
- introduces a new regulated data/payment/contractual flow;
- materially increases release time or operational risk.

## Scope Exception package

B-001 prepares a concise package containing:

1. Proposed capability/change.
2. Why it is necessary before MVP release.
3. Which frozen objective or blocker it resolves.
4. Expected implementation effort and release impact.
5. Security, legal, cost, and operational implications.
6. Alternative: defer to post-MVP.
7. Recommendation.

If legal relevance is plausible, the normal Legal Review workflow applies.

## Decision authority

Only the Human CEO can approve a change to the frozen MVP scope.

Possible decisions:

- `APPROVE_MVP_EXCEPTION`
- `DEFER_POST_MVP`
- `REJECT`
- `RESEARCH_REQUIRED`

The decision and rationale must be retained in the governed decision/audit history.

## Idea Register relationship

All valuable deferred ideas remain in the Idea Register with a revisit trigger such as:

- after MVP release;
- during monetization review;
- during enterprise-readiness planning;
- before public launch;
- when a related project/meeting is opened.

This protects innovation without allowing the MVP target to continuously move.
