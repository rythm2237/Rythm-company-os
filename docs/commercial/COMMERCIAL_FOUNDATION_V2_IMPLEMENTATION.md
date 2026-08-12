# RYTHM Commercial Foundation V2 — Implementation Note

**Implementation date:** 2026-08-12
**Branch:** `agent/commercial-security-foundation`

## Outcome

This batch adds the approved customer-facing commercial foundation without replacing the existing governed Company OS core.

## Public offer model

| Public offer | Backward-compatible entitlement mapping | Access model |
|---|---|---|
| Ready AI Company | `ready_company` | Self-service workspace provisioning; activation remains controlled |
| Custom AI Company | `company_studio` | Self-service workspace provisioning with Company Studio |
| Enterprise AI Workforce | None in this batch | Contact Sales / Enterprise Beta |
| RYTHM Assisted Build | Add-on service | Manually scoped implementation service |

The legacy `custom_company` entitlement code remains supported in the database for existing organizations. It is no longer presented as a separate customer-facing product; Assisted Build is the public service layer instead.

## Fail-closed entitlement boundary

Commercial capability flags are necessary but no longer sufficient. Customer-originated commercial mutations require all of the following:

1. authenticated user;
2. valid organization membership;
3. required Owner authority where applicable;
4. entitlement status `active`;
5. entitlement validity window currently in effect;
6. relevant capability flag and plan limit.

The `202608120002_commercial_security_catalog.sql` migration enforces this rule through:

- `has_active_organization_entitlement(uuid)`;
- database mutation guards on `agents`, `departments`, and `company_builder_drafts`;
- active-entitlement RLS requirements for Company Builder draft writes;
- trusted-only mutation of the public commercial catalog.

Server Actions and Studio pages also require an active entitlement. UI hiding remains a convenience, never the authorization boundary.

## Route and layout architecture

- `(public)` contains Landing, Pricing, and Enterprise / Assisted Build intake surfaces.
- `(auth)` contains login, signup, password recovery, callback, and company setup.
- `(app)` contains authenticated Company OS routes and the internal App Shell.
- Root layout contains only document-wide metadata and styles.
- Middleware uses one explicit protected-route registry rather than protecting only Command Center.

Route groups do not change public URLs.

## Release requirements

Before treating this batch as production-complete:

1. apply migration `202608120002_commercial_security_catalog.sql` to Supabase Production;
2. confirm `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is configured;
3. optionally configure `NEXT_PUBLIC_SALES_EMAIL` before opening Enterprise intake;
4. verify pending entitlement cannot create, edit, clone, archive, enable, template-provision, or company-build;
5. verify active legacy RYTHM organization retains access;
6. verify Landing, Pricing, Login, Signup, and authenticated workspace in Production.

## Deferred to the next commercial batch

- paid one-off trial Meeting checkout and temporary workspace lifecycle;
- payment provider and webhook-backed entitlement activation;
- crediting the introductory meeting fee toward a subscription;
- Enterprise lead capture workflow;
- full product detail pages and conversion analytics.
