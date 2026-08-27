import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { resolveOrganizationContext, isOrganizationEntitlementActive } from "@/lib/auth/organization-context";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type OAuthStatePayload = {
  integrationId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
};

function finish(request: Request, key: "error" | "message", message: string) {
  const url = new URL("/integrations", request.url);
  url.searchParams.set(key, message);
  const response = NextResponse.redirect(url, 303);
  for (const name of [
    "rythm_google_oauth_state",
    "rythm_google_oauth_integration",
    "rythm_google_oauth_user",
  ]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations/google-workspace",
      maxAge: 0,
    });
  }
  return response;
}

function stateSecret() {
  return (
    process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    ""
  );
}

function verifySignedState(state: string): OAuthStatePayload | null {
  const secret = stateSecret();
  if (!secret) return null;
  const [encoded, suppliedSignature] = state.split(".");
  if (!encoded || !suppliedSignature) return null;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected))
    return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
    if (
      !payload.integrationId ||
      !payload.userId ||
      !payload.nonce ||
      !Number.isFinite(payload.issuedAt) ||
      Date.now() - payload.issuedAt > 10 * 60 * 1000 ||
      payload.issuedAt > Date.now() + 60_000
    )
      return null;
    return payload;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const providerError = url.searchParams.get("error")?.trim();

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = new Map(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
  const expectedState = cookies.get("rythm_google_oauth_state") ?? "";
  const cookieIntegrationId = cookies.get("rythm_google_oauth_integration") ?? "";
  const cookieUserId = cookies.get("rythm_google_oauth_user") ?? "";
  const signedPayload = state ? verifySignedState(state) : null;
  const cookieStateValid = Boolean(state && expectedState && state === expectedState);
  const integrationId = cookieStateValid ? cookieIntegrationId : signedPayload?.integrationId ?? "";
  const expectedUserId = cookieStateValid ? cookieUserId : signedPayload?.userId ?? "";

  if (providerError)
    return finish(request, "error", `Google authorization was not completed: ${providerError}`);
  if (!code || !state || (!cookieStateValid && !signedPayload) || !integrationId || !expectedUserId)
    return finish(request, "error", "Google OAuth state validation failed. Start the connection again from Integrations.");

  const context = await resolveOrganizationContext();
  if (!context || context.user.id !== expectedUserId)
    return finish(request, "error", "Your RYTHM session changed during Google authorization. Sign in again and retry.");
  if (context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement))
    return finish(request, "error", "Owner authorization with an active entitlement is required.");

  const { data: integration } = await context.supabase
    .from("organization_integrations")
    .select("id,organization_id,provider_key,connected_by_user_id")
    .eq("id", integrationId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (
    !integration ||
    integration.provider_key !== "google_workspace" ||
    integration.connected_by_user_id !== context.user.id
  )
    return finish(request, "error", "The Google Workspace connection request is no longer valid.");

  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = stateSecret();
  if (!clientId || !clientSecret)
    return finish(request, "error", "Google Workspace OAuth server credentials are not configured.");

  const redirectUri = `${url.origin}/api/integrations/google-workspace/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokens.access_token)
    return finish(
      request,
      "error",
      `Google token exchange failed${tokens.error ? `: ${tokens.error}` : "."}`,
    );
  if (!tokens.refresh_token)
    return finish(
      request,
      "error",
      "Google did not return an offline refresh token. Reconnect and approve access again.",
    );

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store",
  });
  const profile = profileResponse.ok
    ? ((await profileResponse.json()) as { email?: string; verified_email?: boolean })
    : {};

  const now = Date.now();
  const envelope = JSON.stringify({
    version: 1,
    provider: "google_workspace",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type || "Bearer",
    scope: tokens.scope || "",
    expires_at: new Date(now + Math.max(60, Number(tokens.expires_in ?? 3600)) * 1000).toISOString(),
  });

  const { error: vaultError } = await context.supabase.rpc(
    "set_organization_integration_secret_v1",
    { target_integration_id: integrationId, secret_value: envelope },
  );
  if (vaultError)
    return finish(request, "error", `Google credential could not be stored in Vault: ${vaultError.message}`);

  const { error: updateError } = await context.supabase
    .from("organization_integrations")
    .update({
      account_ref: profile.email ?? null,
      auth_type: "oauth",
      status: "connected",
      enabled: true,
      granted_scopes: ["gmail.readonly", "calendar.readonly"],
      connected_at: new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
      metadata: {
        oauth_flow: "google_workspace_v1",
        credential_format: "oauth_token_envelope_v1",
        phase3_read_only_bootstrap: true,
        google_email_verified: profile.verified_email === true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationId)
    .eq("organization_id", context.organizationId);
  if (updateError)
    return finish(request, "error", `Google was authorized, but the connection registry could not be updated: ${updateError.message}`);

  await context.supabase.from("audit_events").insert({
    organization_id: context.organizationId,
    actor_type: "user",
    actor_user_id: context.user.id,
    event_type: "integration.google_workspace_connected",
    object_type: "organization_integration",
    object_id: integrationId,
    risk_level: "medium",
    payload: {
      auth_type: "oauth",
      scopes: ["gmail.readonly", "calendar.readonly"],
      phase3_read_only_bootstrap: true,
      account_ref: profile.email ?? null,
    },
  });

  return finish(request, "message", "Google Workspace connected securely with read-only Gmail and Calendar access.");
}
