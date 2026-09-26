# Customer management and agent lifecycle

## Scope
Extends the existing Company OS app, organizations/memberships, entitlements,
platform-admin allowlist, Agent Studio, and audit_events. No SEO or provider
integration changes. No new tenant, membership or agent entities.

## Access
- `/admin/customers` and `/admin/customers/[id]`: allowlisted platform admins only.
- Existing organization owner is the supported company administration role. The
  actual role constraint is owner/executive/operator/auditor/viewer; this change
  does not add or implicitly promote an `admin` role.
- Platform views are read-only and audited. They do not impersonate a customer,
  switch workspace, or grant company management rights.
- New authenticated RPCs recheck platform authorization and return explicitly
  selected fields. No raw integration metadata, auth records or audit payloads.
- Inactive memberships no longer confer access via the shared membership helpers
  or company switch RPC. Existing tenant RLS remains in effect.

## Lifecycle
Reuse create/edit/provision/enable/disable/archive; restore goes to `paused`
(displayed as Disabled). Restore checks active entitlement and capacity under
an organization lock. Readiness/foundation guards remain in place. Hard deletion
is revoked for customer roles. History and foreign keys are retained. Configuration
and state writes are audited, including direct API writes. Cross-organization
reassignment is rejected by a trigger. Trusted role changes disable the agent
in the same database update and require re-provisioning.

The existing task and integration execution paths check enabled agents. Agent
Studio runtime now also rejects disabled agents; it previously allowed paused
agents to run. In-flight external work is not retroactively canceled.

## Privacy boundary (updated 2026-09-26)
Platform customer pages expose only company name/ID/status/creation date, product
entitlements, and aggregate membership/agent/integration counts. Personal names,
email/phone, profile/onboarding/location fields, company mission/vision, agent
names/configuration/runtime/purpose, integration identities, usage costs, billing
details and audit histories are excluded from both the pages and existing RPCs.
Search matches only company name/ID/product/plan, never private fields.
RPCs no longer join auth.users or customer_profiles. Empty compatibility arrays
keep the previous UI safe during the migration-first rollout; they contain no data.
Access audits still exist for authorized security operations but are not disclosed
in this cross-tenant customer view. The signed-in user identity in the sidebar is
the current operator, not the customer being viewed. Tenant-owned workspaces keep
their existing permissions. Previously rendered browser pages require a refresh.

## Data semantics (original rollout; superseded by privacy boundary above)
Inventory uses server pagination (25), search and sort. Organization status uses
the existing record enum (draft/review/approved/rejected/archived); entitlement
status is separate. User counts are active memberships. Agent totals include
archived agents, with separate enabled/disabled/archive counts. Last activity is
latest tenant audit activity excluding these administrative reads. Onboarding is
explicitly the owner's profile state, not an invented tenant health score.
Industry is Not provided because no authoritative normalized field exists.
Integration status is recorded state, not a fresh health check. Usage and USD
cost are scoped to the named existing telemetry tables, not complete billing.

## Verification
- `npm run test:customers`: server authorization, escaped output, real count and
  missing-data rendering, account identity, company choices, lifecycle controls.
- `supabase/tests/customer_admin_agent_lifecycle.sql`: transaction/rollback test
  using synthetic identities. Verifies RLS, RPC authorization, create/edit,
  enable/disable/archive/restore, capacity, history, switching and inactive access.
- Run the SQL suite only in a transaction. It rolls back all test records.
- Typecheck, lint, build, and existing CI suites must pass before merge.
- Signed-in production browser checks require an authenticated user session;
  database test claims are used only inside rollback transactions, not to create
  browser sessions or bypass authentication.

## Operations
Apply the additive migration before the single production merge/deployment.
The migration keeps existing RPC signatures and status values compatible.
Do not roll back history by deleting agent records. If UI rollout is reverted,
the schema supports the previous UI; revoked hard deletion should remain.

## Verified 2026-09-26
Typecheck and production build passed. Lint has zero errors and 20 existing
warnings. All 22 existing CI test scripts plus `test:customers` passed locally.
The rollback SQL suite passed both before and after applying migration
`20260926074014_customer_admin_agent_lifecycle` to Production.
The security advisor delta is limited to the two intentionally authenticated
SECURITY DEFINER read RPCs; each checks auth.uid() and is_platform_admin() before
access, denies anon, explicitly selects output fields, and audits the read.
The SQL suite verifies denial for ordinary owners/members and success for the
allowlisted platform identity. Existing unrelated advisor findings are unchanged.
