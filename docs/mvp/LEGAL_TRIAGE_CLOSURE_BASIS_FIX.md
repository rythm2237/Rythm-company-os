# Legal Triage Closure-Basis Remediation

During authenticated second-project MVP acceptance, the Legal Relevance Check briefly showed `Pending` and then reverted to a stored `Not indicated` result whose reason incorrectly stated that the meeting remained open.

## Root cause

The first post-closure integrity fix validated only timestamp ordering (`legal_triaged_at >= meeting.ended_at`). That is insufficient provenance: a stored result can have a later timestamp while still being based on stale or contradictory meeting-state context.

## Remediation

- Add `meeting_agent_sessions.legal_triage_basis_closed_at`.
- Treat triage as valid only when the stored closure basis exactly matches the current `meetings.ended_at` snapshot.
- Reset completed-session triage results that do not carry that exact closure basis.
- Persist the closure basis with every new B-001 legal relevance result.
- Explicitly provide the authoritative Human CEO / Chair closure fact to B-001.
- Reject and retry AI output that claims the meeting remains open or is awaiting closure.
- Prevent meeting-sourced decisions unless the legal triage is closure-bound.
- Preserve immutable historical resolved decisions.

Migration: `supabase/migrations/202608090021_legal_triage_closure_basis.sql`
