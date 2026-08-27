export const GOOGLE_OAUTH_REFRESH_BOUNDARY = {
  path: "lib/company-bootstrap/google-oauth.ts",
  classification: ["B", "D"] as const,
  disposition: "platform_control_boundary" as const,
  owner: "Integration Gateway",
  scope:
    "Service-role Google OAuth access-token refresh using an existing Human Owner-authorized refresh token",
  risk: "External credential refresh and secure Vault rotation",
  reason:
    "This server-only control-plane boundary renews an already-authorized provider credential; it cannot perform Gmail or Calendar business actions and does not expand scopes",
  migrationPlan:
    "Permanent OAuth control-plane boundary; operational Gmail and Calendar reads remain behind registered Phase 2 adapters and capabilities",
  reviewPoint: "Every Google OAuth scope, refresh, or credential-storage change",
};
