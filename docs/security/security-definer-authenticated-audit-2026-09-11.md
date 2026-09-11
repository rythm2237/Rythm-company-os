# SECURITY DEFINER authenticated-callable audit — 2026-09-11

Scope: public-schema SECURITY DEFINER functions callable by the `authenticated` role in RYTHM Company OS production.

## Result

- 39 authenticated-callable SECURITY DEFINER functions were reviewed in production.
- No cross-tenant unauthenticated bypass was identified in this set.
- Functions fall into these authorization patterns:
  - explicit `auth.uid()` guard plus `is_org_owner(...)` authorization;
  - explicit `auth.uid()` guard plus `is_org_member(...)` authorization;
  - self-scoped helper functions that derive access exclusively from `auth.uid()` and organization membership;
  - service-role-aware read paths that still require tenant membership for non-service callers.
- Two dependency-maintenance SECURITY DEFINER functions that were previously executable by `PUBLIC`, `anon`, and `authenticated` were separately hardened in migration `20260911195800_revoke_project_dependency_rpc_public_execute.sql`; only privileged execution remains.

## Reviewed self-scoped / helper cases

The following functions are intentionally callable by authenticated users without a separate owner helper because their definitions scope results or writes directly to `auth.uid()` or an equivalent active-owner predicate:

- `consume_api_rate_limit(...)` — rate-limit state is keyed to `auth.uid()`.
- `has_active_organization_entitlement(...)` — joins organization membership to `auth.uid()`.
- `is_org_member(...)` — membership helper keyed to `auth.uid()`.
- `is_org_owner(...)` — owner helper keyed to `auth.uid()`.
- `is_platform_admin()` — platform-admin check keyed to `auth.uid()`.
- `list_my_organizations()` — returns only memberships for `auth.uid()`.
- `provision_customer_organization(...)` — requires authentication and creates an organization owned by the caller with a pending entitlement.
- `set_active_organization(...)` — requires authenticated membership in the target organization.
- `set_organization_integration_secret_v1(...)` — requires active owner membership for the target integration organization.

## Security posture

Supabase Security Advisor reports authenticated-callable SECURITY DEFINER functions generically. For RYTHM, authenticated callability alone is not treated as a vulnerability when the function enforces caller identity and tenant/owner boundaries internally. These functions should remain under regression review because SECURITY DEFINER bypasses table-level caller privileges by design.

## Regression requirements

1. No SECURITY DEFINER function may be executable by `PUBLIC` or `anon` unless an explicit documented exception exists.
2. Any SECURITY DEFINER function granted to `authenticated` must enforce at least one caller boundary: `auth.uid()`, `is_org_member`, `is_org_owner`, an equivalent active-membership predicate, or an explicitly documented service-role path.
3. Tenant-changing operations must remain owner-authorized unless the product requirement explicitly calls for member-level authority.
4. Service-role execution must not implicitly authorize normal authenticated users.
