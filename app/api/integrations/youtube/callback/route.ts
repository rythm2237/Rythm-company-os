import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";
import { exchangeGoogleOAuthCode, getTokenConnectionAdapter, googleProfile } from "@/lib/integrations/connections/providers";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";

const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

type Payload = {
  integrationId: string;
  userId: string;
  projectId?: string;
  nonce: string;
  issuedAt: number;
};

function credentials() {
  return {
    clientId: process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
  };
}

function canonicalOrigin(request: Request) {
  const explicit = process.env.RYTHM_PUBLIC_APP_ORIGIN?.trim();
  if (explicit) return new URL(explicit).origin;
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return "https://rythm-os.com";
  return new URL(request.url).origin;
}

function requestCookies(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  return new Map(
    raw.split(";")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        const index = value.indexOf("=");
        return index < 0 ? [value, ""] : [value.slice(0, index), decodeURIComponent(value.slice(index + 1))];
      }),
  );
}

function verifyState(state: string) {
  const { clientSecret } = credentials();
  const [encoded, signature] = state.split(".");
  if (!clientSecret || !encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", clientSecret).update(encoded).digest("base64url");
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString()) as Payload;
    return value.integrationId && value.userId && Date.now() - value.issuedAt < 600_000 ? value : null;
  } catch {
    return null;
  }
}

function finish(request: Request, id: string, projectId: string | undefined, key: "message" | "error", message: string) {
  const url = new URL(`/integrations/${id}/setup`, canonicalOrigin(request));
  url.searchParams.set(key, message);
  if (projectId) url.searchParams.set("project", projectId);
  const response = NextResponse.redirect(url, 303);
  for (const name of ["rythm_yt_state", "rythm_yt_integration", "rythm_yt_user", "rythm_yt_pkce"]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations/youtube",
      maxAge: 0,
    });
  }
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const providerError = url.searchParams.get("error");
  const payload = verifyState(state);
  const jar = requestCookies(request);
  const id = payload?.integrationId || jar.get("rythm_yt_integration") || "";

  if (providerError) return finish(request, id, payload?.projectId, "error", `Google authorization was not completed: ${providerError}`);
  if (!payload || !code || jar.get("rythm_yt_state") !== state || jar.get("rythm_yt_integration") !== payload.integrationId || jar.get("rythm_yt_user") !== payload.userId || !jar.get("rythm_yt_pkce")) {
    return finish(request, id, payload?.projectId, "error", "YouTube OAuth state validation failed. Start again from RYTHM.");
  }

  const context = await resolveOrganizationContext();
  if (!context || context.user.id !== payload.userId || context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) {
    return finish(request, id, payload.projectId, "error", "Your RYTHM session changed during Google authorization.");
  }

  const connection = await context.supabase
    .from("organization_integrations")
    .select("id,provider_key")
    .eq("id", id)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!connection.data || connection.data.provider_key !== "youtube") {
    return finish(request, id, payload.projectId, "error", "This YouTube connection is no longer valid.");
  }

  const { clientId, clientSecret } = credentials();
  const redirectUri = `${canonicalOrigin(request)}/api/integrations/youtube/callback`;
  let tokens;
  try {
    tokens = await exchangeGoogleOAuthCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
      codeVerifier: String(jar.get("rythm_yt_pkce")),
    });
  } catch (error) {
    return finish(request, id, payload.projectId, "error", error instanceof Error ? error.message : "Google token exchange failed.");
  }

  const returnedScopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);
  if (returnedScopes.length && !returnedScopes.includes(SCOPE)) {
    return finish(request, id, payload.projectId, "error", "Google did not grant read-only YouTube access.");
  }

  const adapter = getTokenConnectionAdapter("youtube");
  if (!adapter) return finish(request, id, payload.projectId, "error", "The YouTube verification adapter is not available.");

  let verification;
  let profile;
  try {
    [verification, profile] = await Promise.all([
      adapter.verifyCredential(tokens.access_token!),
      googleProfile(tokens.access_token!),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "YouTube channel discovery failed.";
    return finish(request, id, payload.projectId, "error", `Google authorized the account, but RYTHM could not verify the YouTube channel: ${message}`);
  }

  const envelope = JSON.stringify({
    version: 1,
    provider: "youtube",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type || "Bearer",
    scope: tokens.scope || SCOPE,
    expires_at: new Date(Date.now() + Math.max(60, Number(tokens.expires_in ?? 3600)) * 1000).toISOString(),
  });
  const stored = await createExecutionServiceClient().rpc("store_organization_integration_secret_unverified_v1", {
    target_integration_id: id,
    secret_value: envelope,
  });
  if (stored.error) return finish(request, id, payload.projectId, "error", `Google credential could not be stored securely: ${stored.error.message}`);

  const now = new Date().toISOString();
  await context.supabase.from("integration_resources").update({ available: false }).eq("integration_id", id).eq("organization_id", context.organizationId);
  if (verification.resources.length) {
    const saved = await context.supabase.from("integration_resources").upsert(
      verification.resources.map((resource) => ({
        organization_id: context.organizationId,
        integration_id: id,
        provider_key: "youtube",
        resource_type: resource.resourceType,
        resource_id: resource.resourceId,
        resource_name: resource.resourceName,
        resource_metadata: resource.metadata ?? {},
        discovered_at: now,
        last_verified_at: now,
        available: true,
      })),
      { onConflict: "integration_id,resource_type,resource_id" },
    );
    if (saved.error) return finish(request, id, payload.projectId, "error", "YouTube channel was discovered but could not be saved.");
  }

  const email = typeof profile.email === "string" ? profile.email : "";
  const updated = await context.supabase.from("organization_integrations").update({
    account_ref: verification.accountRef || email,
    auth_type: "oauth",
    status: "connected",
    enabled: true,
    granted_scopes: verification.grantedScopes,
    connected_at: now,
    last_verified_at: now,
    last_health_check_at: now,
    last_error_at: null,
    last_error_code: null,
    last_error_message: null,
    metadata: {
      verification_result: "verified",
      verification_detail: verification.detail,
      credential_format: "oauth_token_envelope_v1",
      resource_count: verification.resources.length,
      readonly: true,
      google_account: email || null,
    },
    updated_at: now,
  }).eq("id", id).eq("organization_id", context.organizationId);
  if (updated.error) return finish(request, id, payload.projectId, "error", updated.error.message);

  await context.supabase.from("audit_events").insert({
    organization_id: context.organizationId,
    actor_type: "user",
    actor_user_id: context.user.id,
    event_type: "integration.youtube_connected",
    object_type: "organization_integration",
    object_id: id,
    risk_level: "low",
    payload: {
      resource_count: verification.resources.length,
      scope: "youtube.readonly",
      redirect_uri: redirectUri,
    },
  });

  return finish(
    request,
    id,
    payload.projectId,
    "message",
    `YouTube connected. ${verification.resources.length} ${verification.resources.length === 1 ? "channel" : "channels"} verified.`,
  );
}
