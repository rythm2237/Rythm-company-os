# Batch 3 — Security, Governance and Reliability Validation

## Implementation evidence

### 3.1 RLS & Authorization Hardening
- Anonymous privileges are explicitly revoked from organization-scoped public tables.
- RLS is forced on tables that already have RLS and at least one policy.
- Owner-only security posture RPC verifies organization-scoped RLS coverage.

### 3.2 Governance Boundary Validation
- Human CEO / Owner remains authoritative for consequential transitions.
- Audit history is append-only for application roles.
- Canonical workflow/company event history receives the same append-only trigger when the canonical table is present.
- External actions are not enabled or widened by Batch 3.

### 3.3 Reliability / Retry / Recovery Hardening
- Existing meeting runtime retains safe-retry semantics: empty output is not recorded as a valid turn and claimed state prevents duplicate starts.
- Runtime incidents use stable incident keys and occurrence counters to converge repeated failures.
- Recovery diagnostics never authorize decisions, approvals, meeting closure, scope changes or external actions.

### 3.4 Observability & Operational Error Handling
- `operational_incidents` stores organization-scoped, deduplicated operational failures with severity, safe message, correlation ID, first/last seen timestamps and occurrence count.
- Meeting session failures/warnings with `error_message` are automatically captured.
- `/operations/health` exposes owner-only security posture and incident diagnostics.

### 3.5 Security / Audit Validation
Production validation after migrations must confirm:
1. `/operations/health` loads for the Human CEO / Owner.
2. `organization_rls`, `anonymous_table_access`, `audit_append_only`, `owner_authority`, and `external_actions` report `PASS`.
3. Anonymous users cannot read organization-scoped records.
4. Application roles cannot update/delete `audit_events`.
5. A controlled runtime warning/failure can appear in the incident register without creating a second valid agent turn or granting authority.
6. Existing governed workflow remains operational after hardening.

## Later-batch boundary
Onboarding, broad responsive redesign, release QA, backup/restore execution test, final release gate and investor readiness remain in Batches 4–6.
