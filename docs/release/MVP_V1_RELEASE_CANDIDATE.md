# RYTHM Company OS — MVP v1.0 Release Candidate

Release candidate date: 2026-08-08

## Candidate scope

This release candidate is bounded by `docs/mvp/MVP_SCOPE_V1.md` and the Must Pass conditions in `docs/mvp/MVP_ACCEPTANCE_MATRIX.md`.

Core governed loop:

`Login → Project Portfolio → Project → Idea/Issue → Multi-Agent Meeting → B-001 Synthesis → optional AI Legal Review → Human CEO Decision → conditional Approval → Action → Project Progress → Memory/Audit`

## Production evidence already exercised

- Human CEO login/session and Owner authorization.
- Multi-project Project Portfolio and project-aware operating view.
- Idea/Issue capture and routing into a governed draft meeting.
- Authorized multi-agent meeting execution with persistent turns.
- Human CEO contribution before chair-controlled closure.
- B-001 synthesis and legal relevance triage.
- A-106 advisory legal review with calibrated outcome.
- Human CEO Decision Gate and audit trail.
- Decision → Action traceability and project-scoped action filtering.
- Project Pulse milestone feedback and replayable progress visualization.
- Attention Center and Weekly Executive Review.
- Meeting economics with token capture, provider USD reconciliation, EUR CEO display and margin estimate.
- Security posture page showing RLS, anonymous-access, owner-authority and append-only controls passing.
- Incident/recovery diagnostics available to the Owner.
- Global navigation, responsive overflow hardening and MVP onboarding guide.

## Release-blocking invariants

- Human CEO retains consequential authority.
- Agents may advise, analyze, draft, route and escalate; they do not finalize consequential decisions.
- A-106 is advisory and is never represented as licensed legal approval.
- External actions remain disabled unless separately authorized by a future governed capability.
- Workflow/audit history remains append-only for application roles.
- Organization-scoped data remains protected by RLS.
- Meeting runtime uses bounded budget and records usage/cost when provider rates are configured.

## Known deferred capabilities

The following are intentionally outside MVP v1 and are not release blockers:

- realtime/live voice meetings;
- agent text-to-speech personalities;
- public billing/checkout;
- agent marketplace;
- enterprise SSO/SCIM;
- unrestricted workflow builder;
- native mobile application;
- autonomous external execution.

## Release candidate status

Technical release candidate may proceed only after:

1. CI succeeds on the release branch and merged release commit;
2. Production deployment is READY;
3. final production smoke checks show no Critical/High regression;
4. backup/recovery runbook is present and the MVP recovery drill is recorded;
5. Human CEO explicitly approves the Final Release Gate.

The Human CEO Release Gate must not be inferred from implementation activity or prior feature approvals.