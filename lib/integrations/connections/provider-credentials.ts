import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createGitHubInstallationAccessToken, type GitHubAppInstallationEnvelope } from "@/lib/integrations/connections/github-app";
import { isPlatformOAuthProvider, refreshPlatformOAuthToken, type PlatformOAuthToken } from "@/lib/integrations/connections/platform-oauth";

type OAuthEnvelope = {
  version?: number;
  provider?: string;
  auth_mode?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_at?: string;
  [key: string]: unknown;
};

type ServiceDb = SupabaseClient;

function parseEnvelope(secret: string): OAuthEnvelope | null {
  if (!secret.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(secret) as OAuthEnvelope;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isExpiringSoon(expiresAt?: string) {
  if (!expiresAt) return false;
  const value = Date.parse(expiresAt);
  return Number.isFinite(value) && value <= Date.now() + 5 * 60 * 1000;
}

async function storeEnvelope(service: ServiceDb, integrationId: string, envelope: OAuthEnvelope) {
  const result = await service.rpc("store_organization_integration_secret_unverified_v1", {
    target_integration_id: integrationId,
    secret_value: JSON.stringify(envelope),
  });
  if (result.error) throw new Error(`Refreshed provider credential could not be stored securely: ${result.error.message}`);
}

function googleClient() {
  return {
    clientId: process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
  };
}

function microsoftClient() {
  return {
    clientId: process.env.MICROSOFT_365_CLIENT_ID?.trim() || process.env.MICROSOFT_CLIENT_ID?.trim() || "",
    clientSecret: process.env.MICROSOFT_365_CLIENT_SECRET?.trim() || process.env.MICROSOFT_CLIENT_SECRET?.trim() || "",
    tenant: process.env.MICROSOFT_365_TENANT_ID?.trim() || process.env.MICROSOFT_TENANT_ID?.trim() || "common",
  };
}

async function refreshGoogle(refreshToken: string) {
  const { clientId, clientSecret } = googleClient();
  if (!clientId || !clientSecret) throw new Error("Google OAuth platform credentials are unavailable for token refresh.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; scope?: string; token_type?: string; error?: string };
  if (!response.ok || !raw.access_token) throw new Error(`Google OAuth token refresh failed${raw.error ? `: ${raw.error}` : "."}`);
  return raw;
}

async function refreshMicrosoft(refreshToken: string, scope?: string) {
  const { clientId, clientSecret, tenant } = microsoftClient();
  if (!clientId || !clientSecret) throw new Error("Microsoft OAuth platform credentials are unavailable for token refresh.");
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  if (scope) body.set("scope", scope);
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string; error?: string };
  if (!response.ok || !raw.access_token) throw new Error(`Microsoft OAuth token refresh failed${raw.error ? `: ${raw.error}` : "."}`);
  return raw;
}

function expiry(expiresIn: unknown) {
  const seconds = Math.max(60, Number(expiresIn ?? 3600));
  return new Date(Date.now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000).toISOString();
}

export async function resolveProviderCredential(input: {
  service: ServiceDb;
  integrationId: string;
  providerKey: string;
  storedSecret: string;
}) {
  const envelope = parseEnvelope(input.storedSecret);
  if (!envelope) return input.storedSecret;

  if (input.providerKey === "github" && envelope.auth_mode === "github_app_installation") {
    const installationId = String((envelope as GitHubAppInstallationEnvelope).installation_id ?? "");
    if (!installationId) throw new Error("GitHub App installation credential is incomplete.");
    return (await createGitHubInstallationAccessToken(installationId)).token;
  }

  const accessToken = typeof envelope.access_token === "string" ? envelope.access_token : "";
  if (accessToken && !isExpiringSoon(envelope.expires_at)) return accessToken;
  const refreshToken = typeof envelope.refresh_token === "string" ? envelope.refresh_token : "";
  if (!refreshToken) {
    if (accessToken && !envelope.expires_at) return accessToken;
    throw new Error("Provider authorization has expired and requires reauthorization.");
  }

  let refreshed: OAuthEnvelope;
  if (["google_search_console", "google_analytics", "google_workspace", "google_drive", "google_ads", "google_business_profile"].includes(input.providerKey)) {
    const token = await refreshGoogle(refreshToken);
    refreshed = {
      ...envelope,
      access_token: token.access_token,
      refresh_token: refreshToken,
      token_type: token.token_type || envelope.token_type || "Bearer",
      scope: token.scope || envelope.scope || "",
      expires_at: expiry(token.expires_in),
    };
  } else if (input.providerKey === "microsoft_365") {
    const token = await refreshMicrosoft(refreshToken, envelope.scope);
    refreshed = {
      ...envelope,
      access_token: token.access_token,
      refresh_token: token.refresh_token || refreshToken,
      token_type: token.token_type || envelope.token_type || "Bearer",
      scope: token.scope || envelope.scope || "",
      expires_at: expiry(token.expires_in),
    };
  } else if (isPlatformOAuthProvider(input.providerKey)) {
    if (input.providerKey === "vercel") throw new Error("Vercel authorization requires reauthorization.");
    const token: PlatformOAuthToken = await refreshPlatformOAuthToken(input.providerKey, refreshToken);
    refreshed = {
      ...envelope,
      ...token,
      access_token: token.access_token,
      refresh_token: token.refresh_token || refreshToken,
      expires_at: token.expires_in ? expiry(token.expires_in) : envelope.expires_at,
    };
  } else {
    if (accessToken) return accessToken;
    throw new Error("Provider credential format is not supported by the execution runtime.");
  }

  await storeEnvelope(input.service, input.integrationId, refreshed);
  if (!refreshed.access_token) throw new Error("Provider token refresh returned no usable access token.");
  return refreshed.access_token;
}

export function inspectStoredCredential(secret: string) {
  const envelope = parseEnvelope(secret);
  return envelope ? {
    format: envelope.auth_mode === "github_app_installation" ? "github_app_installation" : "oauth_envelope",
    provider: typeof envelope.provider === "string" ? envelope.provider : null,
    hasRefreshToken: typeof envelope.refresh_token === "string" && envelope.refresh_token.length > 0,
    expiresAt: typeof envelope.expires_at === "string" ? envelope.expires_at : null,
  } : { format: "provider_token", provider: null, hasRefreshToken: false, expiresAt: null };
}
