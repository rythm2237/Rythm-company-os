# RYTHM Phase 0 Security Invariants

These invariants are release gates for all future Routing, Execution, Connector, Memory and Economics work.

## Tenant isolation

- Every sensitive request resolves the authenticated user's active organization through the canonical organization-context layer.
- Every database read and mutation remains scoped by `organization_id` and RLS membership checks.
- Service-role access is server-only, explicit and never inferred from user-controlled metadata.

## Human authority

- AI output is analysis, recommendation or draft unless a governed policy grants execution authority.
- Consequential financial, legal, destructive, privileged or external actions require the configured Human CEO approval.
- Approval-required and rejected actions are non-executable.

## External execution

- External execution is disabled by default for Agents and Demo/Experience Mode.
- Connector availability never grants an Agent permission.
- Future execution uses the shared policy boundary before credentials or executors are reached.

## Permissions

- Canonical actions are `read`, `create`, `update`, `send`, `delete`, `publish`, `financial`, `external_communication`, `destructive` and `privileged`.
- Legacy permission strings are mapped centrally for compatibility.
- Missing, unknown or ambiguous permissions deny access.

## Credentials and logs

- OAuth tokens, refresh tokens, API keys, passwords, service-role secrets and connector credentials are never persisted in audit, tool-event, telemetry or error records.
- External provider error bodies are not persisted. Central redaction is applied before storing or logging operational error text.
- Credential resolution remains server-side and tenant-scoped.

## Read-only tools

- A capability named `read` cannot execute DML, DDL, transaction control, multiple statements, writable CTEs or non-allowlisted function calls.
- `sql.read` is validated and wrapped in a PostgreSQL read-only transaction with a bounded timeout.
- `schema.read` uses a fixed introspection query rather than caller-supplied SQL.

## Routing and execution boundaries

- Phase 0 does not implement Routing v2 or an execution worker.
- Future model routing and tool execution must remain configuration-driven, capability-based, auditable and feature-flagged.
- The approved future worker model is a DB-backed PostgreSQL/Supabase queue with atomic claims, leases, idempotency, retry, timeout and final-failure handling.
- The approved first connector pilot is Gmail + Google Calendar, followed by Microsoft 365 and GitHub.

## Audit behavior

- Consequential policy, approval and execution outcomes produce tenant-scoped structured audit records.
- Audit records must contain references and safe metadata, not unnecessary raw prompts, payloads or secrets.

## Demo isolation

- Demo/Experience Mode remains synthetic, read-only and isolated from production company records.
- Demo cannot resolve production credentials or perform external execution.

## Phase 0 migration rollback

`20260825071207_phase0_security_grant_hardening.sql` changes function/view definitions and grants only; it does not rewrite or delete tenant data.

- Preferred rollback: restore the affected function definitions from their immediately preceding migrations while retaining the Phase 0 `PUBLIC`/`anon` revocations and authorization guards. This isolates a compatibility regression without reopening anonymous execution.
- Full rollback: restore the prior `agent_professional_standing` view options, the five prior function definitions, their prior grants, and the prior default function privileges from the schema snapshot taken before deployment. A full rollback reintroduces the documented security findings and therefore requires incident-owner approval and compensating API isolation.
- Remove the migration ledger entry only after the database objects have been restored and their grants verified. Re-run the RLS/tenancy regression SQL and Security Advisor after either rollback path.

## Approved future context

- Budget hierarchy: Company → Department → Project → Agent, with warning, soft limit, hard limit and explicit human override.
- Generated memory defaults to a non-authoritative trust class such as `hypothesis` or `derived_knowledge`; authoritative promotion is traceable and governed.
- Ready Company order begins with SaaS Startup as the reference blueprint.
- Auto-Bootstrap uses staged organization, Agent, permission and integration review before final creation.
