import "server-only";
import crypto from "node:crypto";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics-admin";
import { executeJsonRequest, secureProviderUrl } from "@/lib/integrations/adapters/http";

export const GOOGLE_SEARCH_CONSOLE_PROVIDER = "google_search_console";
export const GOOGLE_SEARCH_CONSOLE_PROPERTY = "sc-domain:rythm-os.com";
export const GOOGLE_SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export type GoogleSearchConsoleOAuthState = {
  purpose: "platform_google_search_console_v1";
  userId: string;
  nonce: string;
  issuedAt: number;
};

type GoogleOAuthEnvelope = {
  version: 1;
  provider: typeof GOOGLE_SEARCH_CONSOLE_PROVIDER;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string;
  expires_at: string;
};

type GoogleRefreshResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
};

export function googleOAuthServerCredentials() {
  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Google OAuth server credentials are not configured.");
  return { clientId, clientSecret };
}

function stateSecret() {
  return process.env.GOOGLE_SEARCH_CONSOLE_STATE_SECRET?.trim() ||
    process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    "";
}

export function signGoogleSearchConsoleState(payload: GoogleSearchConsoleOAuthState) {
  if (!stateSecret()) throw new Error("Google OAuth state signing is not configured.");
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyGoogleSearchConsoleState(state: string): GoogleSearchConsoleOAuthState | null {
  if (!stateSecret()) return null;
  const [encoded, suppliedSignature] = state.split(".");
  if (!encoded || !suppliedSignature) return null;
  const expectedSignature = crypto.createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as GoogleSearchConsoleOAuthState;
    if (
      payload.purpose !== "platform_google_search_console_v1" ||
      !payload.userId ||
      !payload.nonce ||
      !Number.isFinite(payload.issuedAt) ||
      Date.now() - payload.issuedAt > 10 * 60 * 1000 ||
      payload.issuedAt > Date.now() + 60_000
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createGoogleSearchConsoleEnvelope(tokens: {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
}): GoogleOAuthEnvelope {
  return {
    version: 1,
    provider: GOOGLE_SEARCH_CONSOLE_PROVIDER,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_type: tokens.tokenType || "Bearer",
    scope: tokens.scope || GOOGLE_SEARCH_CONSOLE_SCOPE,
    expires_at: new Date(Date.now() + Math.max(60, Number(tokens.expiresIn ?? 3600)) * 1000).toISOString(),
  };
}

function parseEnvelope(value: string): GoogleOAuthEnvelope {
  try {
    const parsed = JSON.parse(value) as GoogleOAuthEnvelope;
    if (
      parsed.version !== 1 ||
      parsed.provider !== GOOGLE_SEARCH_CONSOLE_PROVIDER ||
      !parsed.refresh_token?.trim()
    ) throw new Error("invalid");
    return parsed;
  } catch {
    throw new Error("Google Search Console credential envelope is invalid.");
  }
}

function expiresSoon(expiresAt: string) {
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= Date.now() + 2 * 60 * 1000;
}

export async function verifyGoogleSearchConsolePropertyAccess(accessToken: string) {
  const url = await secureProviderUrl("https://www.googleapis.com/webmasters/v3/sites", ["www.googleapis.com"]);
  const body = await executeJsonRequest(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, 20_000) as {
    siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
  };
  const property = body.siteEntry?.find((entry) => entry.siteUrl === GOOGLE_SEARCH_CONSOLE_PROPERTY);
  if (!property) throw new Error("The authorized Google account does not have access to the canonical rythm-os.com domain property.");
  return property;
}

export async function storeGoogleSearchConsoleCredential(input: {
  envelope: GoogleOAuthEnvelope;
  userId: string;
  accountRef: string | null;
  permissionLevel: string | null;
}) {
  const admin = createAnalyticsAdminClient();
  if (!admin) throw new Error("Supabase service-role environment is unavailable.");
  const now = new Date().toISOString();
  const metadata = {
    oauth_flow: "platform_google_search_console_v1",
    credential_format: "oauth_token_envelope_v1",
    readonly: true,
    permission_level: input.permissionLevel,
  };
  const { error: registryError } = await admin.from("platform_integrations").upsert({
    provider_key: GOOGLE_SEARCH_CONSOLE_PROVIDER,
    display_name: "Google Search Console",
    status: "disconnected",
    enabled: true,
    account_ref: input.accountRef,
    property_ref: GOOGLE_SEARCH_CONSOLE_PROPERTY,
    granted_scopes: [GOOGLE_SEARCH_CONSOLE_SCOPE],
    metadata,
    connected_by_user_id: input.userId,
    last_error: null,
    updated_at: now,
  }, { onConflict: "provider_key" });
  if (registryError) throw new Error(`Search Console registry could not be updated: ${registryError.message}`);

  const { error: vaultError } = await admin.rpc("set_platform_integration_secret_service_v1", {
    target_provider_key: GOOGLE_SEARCH_CONSOLE_PROVIDER,
    secret_value: JSON.stringify(input.envelope),
  });
  if (vaultError) {
    await admin.from("platform_integrations").update({ status: "error", last_error: "Vault credential storage failed.", updated_at: now })
      .eq("provider_key", GOOGLE_SEARCH_CONSOLE_PROVIDER);
    throw new Error("Google credential could not be stored securely in Vault.");
  }

  const [{ error: integrationError }, { error: taskError }] = await Promise.all([
    admin.from("platform_integrations").update({
      status: "connected",
      connected_at: now,
      last_verified_at: now,
      last_error: null,
      metadata,
      updated_at: now,
    }).eq("provider_key", GOOGLE_SEARCH_CONSOLE_PROVIDER),
    admin.from("automation_tasks").update({ configuration_status: "ready", updated_at: now })
      .eq("slug", "search-index-monitoring"),
  ]);
  if (integrationError || taskError) throw new Error(integrationError?.message || taskError?.message || "Search Console activation failed.");
}

export async function resolveGoogleSearchConsoleAccessToken() {
  const admin = createAnalyticsAdminClient();
  if (!admin) throw new Error("Supabase service-role environment is unavailable.");
  const { data: secret, error } = await admin.rpc("get_platform_integration_secret_service_v1", {
    target_provider_key: GOOGLE_SEARCH_CONSOLE_PROVIDER,
  });
  if (error || typeof secret !== "string") throw new Error("Google Search Console is not connected.");
  const envelope = parseEnvelope(secret);
  if (envelope.access_token?.trim() && !expiresSoon(envelope.expires_at)) return envelope.access_token.trim();

  const { clientId, clientSecret } = googleOAuthServerCredentials();
  const tokenUrl = await secureProviderUrl("https://oauth2.googleapis.com/token", ["oauth2.googleapis.com"]);
  let refreshed: GoogleRefreshResponse;
  try {
    refreshed = await executeJsonRequest(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: envelope.refresh_token,
      grant_type: "refresh_token",
    }),
    }, 20_000) as GoogleRefreshResponse;
  } catch {
    await admin.from("platform_integrations").update({
      status: "error",
      last_error: "Google token refresh failed or authorization was revoked.",
      updated_at: new Date().toISOString(),
    }).eq("provider_key", GOOGLE_SEARCH_CONSOLE_PROVIDER);
    throw new Error("Google Search Console must be reconnected.");
  }
  if (!refreshed.access_token) throw new Error("Google Search Console access token refresh failed.");

  const updated = createGoogleSearchConsoleEnvelope({
    accessToken: refreshed.access_token,
    refreshToken: envelope.refresh_token,
    tokenType: refreshed.token_type || envelope.token_type,
    scope: refreshed.scope || envelope.scope,
    expiresIn: refreshed.expires_in,
  });
  const { error: rotateError } = await admin.rpc("set_platform_integration_secret_service_v1", {
    target_provider_key: GOOGLE_SEARCH_CONSOLE_PROVIDER,
    secret_value: JSON.stringify(updated),
  });
  if (rotateError) throw new Error("Google token was refreshed but could not be rotated securely.");
  return refreshed.access_token;
}
