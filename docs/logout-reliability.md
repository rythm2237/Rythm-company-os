# Reliable workspace sign-out

The workspace navigation and legacy command-center now submit a native same-origin POST to `/auth/logout`. This endpoint is outside protected-page middleware, avoiding a remote `getUser()` request before logout. A full 303 navigation to `/login` discards the prior client router/workspace state. The form disables repeat submissions and shows “Signing out…” while navigating, with a native form fallback when JavaScript is unavailable.

`endSession` uses an isolated SSR auth client and explicitly revokes the current session (`scope: local`). Its total network wait is limited to three seconds. Auth-only transport failures and server failures become non-retryable failures for this short-lived client, avoiding refresh retry loops for expired sessions. The shared authentication client and middleware are unchanged.

After the attempt, the response expires the current project's auth cookies, all observed SSR chunks, user/PKCE cookies and the active-organization cookie at their existing root path. Cookies for other projects and preferences are preserved. A sealed cookie adapter prevents a late response from restoring credentials. The response is not cacheable; cross-origin/missing-origin POSTs are rejected. GET has no logout handler.

If remote revocation cannot be confirmed, local cookies are still removed and the login page explains the partial result. This does not assert that already-issued JWTs or copied refresh tokens have been revoked remotely. Logout no longer implicitly signs the user out on every device.

Legacy server action callers use the same bounded helper; current visible workspace buttons use native POST. Separate signup/password-reset/admin-app sign-out flows are outside this change.

## Validation

- `node --import tsx scripts/validate-logout.ts`: actual SDK, healthy response, unresponsive network, server/network failure, expired session without retry loops, project-scoped cookie matching, CSRF rejection, 303/no-store, chunk/context deletion and anonymous logout.
- `node --import tsx scripts/validate-logout-browser.ts`: actual form, HTTP POST, route and SDK with isolated synthetic auth transport. Healthy, unavailable and stalled service cases verify bounded full-page navigation and preserved unrelated cookies. Runs using Chrome in CI.
- Existing interaction/security checks and TypeScript verify shared component compatibility. No real user session is created or revoked by these tests; authenticated production logout remains a user smoke check.
