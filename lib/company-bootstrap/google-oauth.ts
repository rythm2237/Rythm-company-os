import "server-only";
import { createClient } from "@supabase/supabase-js";

export type GoogleOAuthEnvelope = {
  version?: number;
  provider?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_at?: string;
};

type GoogleRefreshResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function parseEnvelope(credential: string): GoogleOAuthEnvelope | null {
  const trimmed = credential.trim();
  if (!trimmed) throw new Error("Provider credential is unavailable.");
  if (!trimmed.startsWith("{")) return null;
  try {
    const envelope = JSON.parse(trimmed) as GoogleOAuthEnvelope;
    if (envelope.provider && envelope.provider !== "google_workspace")
      throw new Error("Google OAuth credential provider does not match the integration.");
    return envelope;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Google OAuth")) throw error;
    throw new Error("Google OAuth credential envelope is invalid.");
  }
}

export function validateGoogleOAuthCredential(credential: string) {
  const envelope = parseEnvelope(credential);
  if (!envelope) return;
  if (!envelope.access_token?.trim() && !envelope.refresh_token?.trim())
    throw new Error("Google OAuth credential does not contain a usable token.");
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Integration executor service credentials are not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function oauthClientCredentials() {
  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret)
    throw new Error("Google Workspace OAuth server credentials are not configured.");
  return { clientId, clientSecret };
}

function expiresSoon(expiresAt: string | undefined) {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) return true;
  return time <= Date.now() + 2 * 60 * 1000;
}

export async function resolveGoogleAccessToken(credential: string, integrationId: string) {
  const trimmed = credential.trim();
  const envelope = parseEnvelope(trimmed);
  if (!envelope) return trimmed;

  const currentToken = envelope.access_token?.trim() || "";
  if (currentToken && !expiresSoon(envelope.expires_at)) return currentToken;

  const refreshToken = envelope.refresh_token?.trim() || "";
  if (!refreshToken)
    throw new Error("Google OAuth access token expired and no refresh token is available. Reconnect is required.");

  const { clientId, clientSecret } = oauthClientCredentials();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const refreshed = (await response.json()) as GoogleRefreshResponse;
  if (!response.ok || !refreshed.access_token)
    throw new Error(
      refreshed.error === "invalid_grant"
        ? "Google OAuth refresh token is no longer valid. Reconnect is required."
        : "Google OAuth access token refresh failed.",
    );

  const now = Date.now();
  const updatedEnvelope: GoogleOAuthEnvelope = {
    ...envelope,
    version: envelope.version ?? 1,
    provider: "google_workspace",
    access_token: refreshed.access_token,
    refresh_token: refreshToken,
    token_type: refreshed.token_type || envelope.token_type || "Bearer",
    scope: refreshed.scope || envelope.scope || "",
    expires_at: new Date(now + Math.max(60, Number(refreshed.expires_in ?? 3600)) * 1000).toISOString(),
  };

  const supabase = serviceClient();
  const { error } = await supabase.rpc("rotate_organization_integration_secret_service_v1", {
    target_integration_id: integrationId,
    secret_value: JSON.stringify(updatedEnvelope),
  });
  if (error)
    throw new Error("Google OAuth token was refreshed but could not be persisted securely.");

  return refreshed.access_token;
}
