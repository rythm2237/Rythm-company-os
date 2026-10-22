# Shared Enterprise CRM

## Verified baseline — 2026-10-22

Inspected main `1234aab66ef152c9db8ba20fa8d11263be62c919`, repository governance, authentication, project intake (portfolio and home), operating view, Project OS analysis, document ingestion, AI tools, existing CRM and Finance Center, migrations, and live PostgreSQL metadata/policies.

The user's attached implementation directive authorizes this scope expansion. No AGENTS.md was present. Existing organization membership and active-company context remain authoritative. CRM (`crm_accounts`, contacts, opportunities, activities and stages), project contracts, invoices, invoice lines, budgets and transactions already exist. Platform billing/customer_profiles are different domains and must remain separate.

Actual templates are separate: `ready_ai_advertising_agency_v1`, `ready_software_company_v1`, `ready_web_development_company_v1`, plus `ready_saas_startup_v1`. The domain is organization-scoped, with no template-specific fork.

Live read-only audit found seven projects, six without even an owner label, one CRM account, zero project_clients, zero project_contracts and zero finance invoices. Labels and project_agents are not reliable primary ownership. No owner will be inferred from creator, CEO, or a manager-like title.

Security gaps: contract SELECT used company membership; financial policies used owner/admin roles without active status; opportunities exposed values to all members. Canonical tool permissions collapse domains to actions (e.g. `finance.read` becomes `read`) and cannot authorize confidential resources. Existing service-role project analysis retrieved contracts/documents before checking agent authority.

## Implementation plan

1. Extend existing tables, reuse existing membership and agent identities, add exact scoped capability grants and audit records. Confidential domains have no implicit role grants.
2. Add customer/project/contract and ledger foreign keys with company-scoped integrity. Retain existing legacy values and flag uncertain relationships for reconciliation.
3. Enforce a single manager FK, eligibility, controlled reassignment and immutable assignment history. Legacy rows remain marked for reconciliation; no silent reassignment. New projects cannot omit ownership or external customer.
4. Extend CRM and customer detail UI, shared project intake/filtering and explicit access administration.
5. Minimize default AI inputs and quarantine confidential documents from shared Project Knowledge. Only an explicit principal-aware path may retrieve protected CRM records.
6. Execute real migration/RLS tests in isolated PostgreSQL, typecheck, build and regression checks. Prepare a PR and staged release instructions. Production remains unchanged pending validation and release approval.

Implementation evidence, remaining limitations and release instructions are appended as work is verified.

## Implemented in this branch

- Existing CRM extended with business/individual profiles, optional legal/tax/address/language fields, tags, status, ownership, search, filters, sorting and 20-record directory pagination.
- Customer detail sections for profiles, contacts, permitted projects, contracts, ledger invoices/transactions, opportunities, and filtered activity. Contacts support one primary contact through serialized updates.
- Customer-to-project FK, explicit internal/external classification, one human accountable manager (active organization membership), controlled reassignment, immutable history, and generic stakeholder notifications. Project task agents remain separate from primary accountability.
- Existing contract table extended with customer linkage, lifecycle, dates/renewal, scope, amendment parent and project-contract join table. The legacy originating project remains compatible; joins support many contracts/projects. Scope/customer equality is checked in the database.
- Existing Finance Center extended with customer/project/contract attribution; atomic invoice headers/lines and idempotent partial receipts in the existing transaction ledger. Currency is preserved, with no cross-currency aggregation or fabricated profitability.
- Explicit user/agent scoped grants, immediate revocation, active membership checks, immutable grant identity, access audit, database policies, and backend capability checks. Company owners administer grants but do not implicitly receive confidential read/write access. Operational owner/member behavior is retained; exact capabilities supplement it. Canonical action expansion is never used for commercial authorization.
- Confidential opportunity rows are protected as a whole rather than exposing value columns to operational readers. Contract terms including values require explicit contract permission. Project budget reads use a finance-authorized RPC, not unrestricted SELECT columns. Existing financial audit events are also filtered.
- Protected contract attachments reuse project_documents and the private project-files bucket. Caller RLS runs before privileged download; streamed downloads are no-store and reveal no permanent public URL. Contract files are excluded from general document ingestion and shared Project Knowledge.
- Confidential document derivatives are classified and quarantined. Shared analysis, task, proposal and meeting inputs explicitly select operational context. A service-only CRM context RPC checks agent grants and, for user-triggered work, the initiating user too. Structured project workers consume operational customer context only. Private commercial responses are never written into shared summaries by this integration.

## Schema inventory

New relations: `crm_access_grants`, `crm_audit_log`, `project_manager_history`, `project_contract_links`; internal helpers live in unexposed `crm_private`.

Extended: `crm_accounts`, `crm_contacts`, `crm_opportunities`, `crm_activities`, `projects`, `project_contracts`, `finance_invoices`, `finance_transactions`, `finance_invoice_lines`, `project_documents`, `project_context_documents`, `project_document_chunks`. Restrictive financial audit/storage policies supplement existing policies. `organizations`, `organization_members`, `agents`, `notifications` and `audit_events` are reused, not duplicated.

Routes: `/crm`, `/crm/[id]`, `/crm/access`, `/api/crm/documents/[id]`; integrations in `/projects`, `/projects/operating`, `/home`, `/finance`, project file upload and existing project AI workers.

## Migration and reconciliation

Migration: `20261022153241_shared_enterprise_crm.sql`, generated with Supabase CLI before editing. It preserves existing records. Legacy projects are explicitly marked for reconciliation; assigning a manager alone does not confirm whether a legacy project is internal or external. The access/accountability screen requires the owner to confirm classification, customer where external, and manager. No manager is backfilled from creator, CEO, label, or agent title. Existing unlinked contracts are retained and flagged, not assigned to fictional customers.

Legacy foreign keys marked NOT VALID protect new writes while allowing investigation of any old anomalies. They require validation in staging after existing data reconciliation. `scripts/crm-release-preflight.sql` reports release blockers and must return zero counts before rollout is accepted. The database blocks new ambiguous projects and prevents removing an active manager before reassignment. Until legacy records are reconciled, the global active-project invariant is intentionally **not claimed**.

## Verification evidence

- `npm run test:enterprise-crm`: passed. Executes the real migration in isolated PostgreSQL (PGlite), exercising RLS as authenticated users, grants/revocation, inactive members, tenant relationships, manager invariants/history/notifications, explicit reconciliation, contract approval denial, attachments/derivatives, budget column privacy, agent/user intersection, atomic drafts, payment retries and exact partial-payment totals. React/JSDOM tests exercise real customer/manager/type filter changes, escaped names, optional individual fields and exclusion of financial profile fields.
- `npm run typecheck`: passed.
- Direct Next production build (`node node_modules/next/dist/bin/next build`): passed during development; final-head results are recorded in the PR. `npm run test:project-completion`: passed, including eleven lifecycle regression scenarios.
- Seventeen impacted existing regression commands passed: Project OS, cockpit, supervisor, connections phases 1/2, security definer, tenant email, commercial funnel/payment, integration availability, continuous program, Google provider/quota recovery, project detail UX, boardroom, customer administration and interactions.
- Lint: zero errors; existing warnings remain. No production data write, migration, or release was executed.

The default npm build lifecycle was initially blocked by automatic approval review because an existing prebuild script downloads a production-subdomain media asset. Inspection confirmed a plain GET of a checksum-verified public MP4, with no credentials or request body. Subsequent code validation used the direct Next build and explicit regression commands; the unrelated media download was not retried.

## Still pending / not implemented

- Authenticated staging end-to-end tests and desktop/mobile screenshot review, including real Supabase Storage HTTP delivery. Browser installation failed in this environment, so component/JSDOM checks are not claimed as browser verification.
- Production legacy reconciliation and migration: zero records migrated in production; no release approval requested yet.
- Automatic private financial/legal AI insight generation is not implemented. The scoped retrieval boundary exists; the Insights section explicitly states that no insights were generated. Existing shared legal analysis no longer consumes confidential files; a dedicated private, approved commercial workflow is required before re-enabling this processing.
- Full customer profitability aggregation, FX conversion, renewal automation and a dedicated contract approval-request UI are not implemented. The existing operational ledger and explicit human contract approval capability are used; this is not a new accounting engine.
- Primary accountable managers currently reference human organization members, with AI execution teams preserved separately. No AI-primary-manager implementation is claimed.

These limits mean this PR is a **reviewable implementation with release blockers**, not a claim that every enterprise acceptance criterion has been completed.

## Controlled release and rollback

1. Restore a staging database snapshot or use an approved staging environment. Apply the migration and run the SQL/UI suites plus authenticated RLS/Storage acceptance with two tenants, operational member, assigned manager, contract reader, finance reader, revoked and inactive users, and scoped agents.
2. Review existing sensitive derived content and validate the NOT VALID tenant FKs after resolving anomalies. Confirm templates use the same organization CRM paths.
3. Confirm the owner-selected legacy classifications/managers and explicit commercial grants. All preflight blocker counts must be zero before considering the release complete.
4. Obtain release approval. In a coordinated maintenance window, freeze project/commercial writes, back up the database, apply the tested migration in version order and deploy the matching application commit. Old application builds cannot create projects without the new required manager; avoid a mixed write window.
5. Use the accountability screen to record the approved legacy assignments/classifications. Grant commercial capabilities explicitly; do not bootstrap implicit owner financial access. Repeat preflight, authenticated tenant isolation/revocation and download checks; only then reopen writes and mark the release complete.
6. Roll back application behavior through a reviewed forward fix or a pretested compatibility build. Preserve CRM/ledger data and restrictive policies. Do not roll back to an old unrestricted build or drop new tables/columns; use the backup only through an approved database recovery procedure. If reconciliation/security checks fail, keep writes closed and the release on hold.
