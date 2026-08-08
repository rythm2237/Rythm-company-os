# RYTHM Company OS — Batch 3 Security Baseline

## Security invariants

1. Human CEO / Owner remains the only authority for consequential state changes.
2. External actions remain disabled unless separately approved and enabled through explicit governance.
3. Organization-scoped data must be protected by RLS and organization membership/ownership checks.
4. Cross-organization reads and writes are forbidden.
5. Workflow events, audit history, decisions, approvals, legal reviews, meeting records and action history must remain attributable and persistent.
6. Security-definer helpers must use an explicit `search_path`, expose only the minimum execute grants required, and never infer business authorization from events, timelines or semantic relationships.
7. Retry/recovery paths must be idempotent and must not duplicate valid deliberation turns, decisions, approvals, actions or audit events.
8. User-visible failures must not silently corrupt governed records.
9. Server secrets remain server-side. Client code must not require service-role credentials.
10. Batch 3 is hardening only and does not expand the frozen MVP business scope.

## Control areas

- 3.1 RLS & Authorization Hardening
- 3.2 Governance Boundary Validation
- 3.3 Reliability / Retry / Recovery Hardening
- 3.4 Observability & Operational Error Handling
- 3.5 Security / Audit Validation

## Explicit non-goals

No autonomous external actions, billing, enterprise SSO, broad UX redesign, investor tooling or unrestricted workflow builder are introduced in Batch 3.
