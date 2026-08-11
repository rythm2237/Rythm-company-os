# RYTHM Company OS — Day 2 Multi-Tenant Acceptance

**Target:** B2B Paid Public Beta  
**Acceptance rule:** Customer A and Customer B must operate independent Organizations with zero unauthorized cross-tenant read/write.

## Implemented architecture

- Supabase Auth remains the identity provider.
- `customer_profiles` stores customer/onboarding context.
- `organization_members` remains the authorization relationship.
- `customer_profiles.active_organization_id` is the authoritative current company context.
- `list_my_organizations()` is the only application path for enumerating all organizations belonging to the current user.
- `set_active_organization()` validates membership before changing context.
- a restrictive SELECT RLS policy limits ordinary `organization_members` reads to the active Organization.
- existing organization-scoped RLS remains authoritative for business tables.
- `organization_entitlements` resolves commercial product capabilities server-side.
- `organization_support_access` defines future support elevation without granting an implicit tenant bypass.
- external actions remain disabled by default.

## Acceptance Test A — independent customer provisioning

Create two unrelated authenticated accounts:

- Customer A / Organization A
- Customer B / Organization B

For each account verify:

1. signup succeeds;
2. company provisioning creates a unique Organization;
3. the authenticated user receives `owner` membership only for that Organization;
4. an Organization entitlement is created in `pending` state;
5. active Organization context resolves to the newly provisioned Organization;
6. Human CEO authority remains explicit.

## Acceptance Test B — cross-tenant read isolation

As Customer A, attempt direct reads using known Organization B identifiers against at least:

- organizations
- organization_members
- projects
- agents
- company_memory
- meetings
- decisions
- approval_requests
- action_items
- company_events
- audit_events
- organization_entitlements

Expected result: no Organization B business record is returned to Customer A.

Repeat symmetrically as Customer B against Organization A identifiers.

## Acceptance Test C — cross-tenant write isolation

As Customer A, attempt INSERT/UPDATE/DELETE operations carrying Organization B identifiers against writable launch surfaces.

Expected result: database authorization/RLS rejects the operation or returns no affected row.

Repeat symmetrically as Customer B.

## Acceptance Test D — forged active context

As Customer A:

1. submit `set_active_organization(Organization B)`;
2. forge/change the `rythm_active_org` browser cookie to Organization B;
3. request authenticated application surfaces.

Expected result:

- the RPC rejects the switch because Customer A is not a member of Organization B;
- the forged cookie does not expand authorization;
- database `active_organization_id` remains Organization A;
- no Organization B data is returned.

## Acceptance Test E — legitimate organization switching

For a test user that legitimately owns two Organizations:

1. call/list through the Organization Switcher;
2. switch from Organization 1 to Organization 2;
3. verify `active_organization_id` changes only after membership validation;
4. verify legacy owner-context surfaces now resolve exactly one membership;
5. verify Project, Meeting, Decision, Approval, Action, Memory and audit views show only active-company data;
6. switch back and confirm context reverses cleanly.

## Acceptance Test F — entitlement isolation

Verify:

- Organization A can resolve only its own entitlement;
- Organization B can resolve only its own entitlement;
- normal customer roles cannot mutate subscription price/product entitlements directly;
- UI visibility is not treated as authorization;
- server/database entitlement resolution remains authoritative.

## Acceptance Test G — support isolation

Verify normal customer accounts cannot insert/update/delete `organization_support_access` rows.

Any future support elevation must be explicit, reason-bound, time-bound when appropriate, revocable, and separately audited.

## Release gates

Day 2 is complete only when all of the following are true:

- [x] Customer signup implementation exists
- [x] Organization provisioning implementation exists
- [x] Organization ownership is established
- [x] Active Organization context is server/database validated
- [x] Organization switcher architecture exists
- [x] Commercial entitlement foundation exists
- [x] Customer profile foundation exists
- [x] Support/admin access architecture exists
- [x] Existing single-membership application assumption is constrained to active Organization at DB boundary
- [ ] CI `npm run build` succeeds for the final branch head
- [ ] migrations `202608110001` and `202608110002` are applied to Production in order
- [ ] authenticated Customer A / Customer B Production E2E passes
- [ ] zero cross-tenant leakage is confirmed

Do not mark Day 2 COMPLETE before the Production isolation test passes.
