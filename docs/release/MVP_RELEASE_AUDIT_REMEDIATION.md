# RYTHM Company OS — MVP Release Audit Remediation

Date: 2026-08-08
Release candidate: MVP v1.0
Status: implementation complete on release-audit hotfix branch; Production verification pending.

## Independent audit findings

### H1 — Paused Agent could execute in Boardroom
Remediation:
- Boardroom only permits enabled agents to be selected.
- B-001 must be enabled and selected for governed synthesis.
- Meeting start re-checks every participant server-side.
- Deliberation API re-checks every participant on every runtime call, so pausing an agent mid-meeting stops the next turn.
- Database trigger prevents paused agents from being added and prevents a session from entering `running` with paused participants or without enabled B-001.
- Human CEO / Owner can explicitly Enable or Pause non-execution agents from the Agent Profile. State changes are audit logged.

Production proof required:
1. Keep B-001 Paused.
2. Confirm B-001 is disabled in Boardroom selection and a governed session cannot execute without enabled B-001.
3. Human CEO explicitly enables B-001 from `/agents/b-001`.
4. Confirm a new governed session can then proceed.

### H2 — AI-PR-001 hard-coded in CEO Decision workflow
Remediation:
- Removed fixed AI-PR-001 Decision title.
- Decision title/context are derived from the actual Project and Meeting records.
- Boardroom no longer silently falls back to the latest meeting; the CEO explicitly selects a meeting.
- Optional project context filters the Boardroom meeting list.
- Project Portfolio now supports governed Project creation through the normal UI.

Production proof required:
- Create a second project and complete a meeting decision.
- Confirm the resulting Decision references the second project's code/name and not AI-PR-001.

### H3 — Meeting Session to CEO Decision was not idempotent
Remediation:
- `decisions.source_meeting_session_id` records canonical session provenance.
- Unique partial index permits at most one Decision per organization/session.
- Historical canonical mappings are backfilled from audit evidence without deleting history.
- `record_meeting_ceo_decision` RPC performs Decision, conditional Approval Request, CEO meeting message, Meeting minutes, and Audit event in one database transaction.
- Repeated/concurrent submissions return the existing canonical Decision rather than creating duplicate governed side effects.

Production proof required:
- Submit/refresh the same completed session's CEO decision path more than once.
- Confirm there remains one canonical Decision and no duplicate pending Approval for that session.

### H4 — Authenticated second-project E2E unverified
Production proof required:

`Login → Second Project → Idea/Issue → Meeting → B-001 synthesis → Chair Close → Legal triage/review when relevant → CEO Decision → Approval if High/Critical → Action → Project Progress/Pulse → Audit/Traceability`

Evidence must show project isolation/context is the second project throughout the chain.

## Additional audit hardening

- `/api/bootstrap-status` is now authenticated Owner-only and no longer performs a public Service Role diagnostic read.
- Runtime environment diagnostics prefer `VERCEL_ENV`, so Production reports `production` when running on Vercel Production.
- Boardroom persistence failures return governed user-facing messages while raw database details stay server-side.
- Deferred browser Voice Dictation / Speech Synthesis code was removed from the MVP Boardroom rather than hidden with global CSS selectors.
- Broad CSS selectors previously used to hide Voice controls were removed.

## Governance invariants retained

- Human CEO retains consequential authority.
- Agent output remains advisory.
- Meeting synthesis cannot close a meeting.
- Human Chair explicitly closes the meeting.
- AI Legal Review remains advisory and may require licensed counsel.
- High/Critical decisions route to governed approval.
- External actions remain disabled unless separately authorized.
- Final MVP Release Gate remains exclusively a Human CEO decision.

## Release gate

These remediations are not considered Production-validated until:
1. migration `202608080018_mvp_release_audit_blockers.sql` is applied successfully;
2. the Production deployment is READY;
3. H1 negative/positive tests pass;
4. the second-project E2E passes;
5. an independent audit delta/re-audit reports no remaining Critical or High release blocker.
