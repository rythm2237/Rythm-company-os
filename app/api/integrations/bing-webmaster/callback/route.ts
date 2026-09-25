import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";
import { discoverBingWebmasterSites, exchangeBingWebmasterCode } from "@/lib/integrations/adapters/bing-webmaster";

type StatePayload = { integrationId: string; userId: string; nonce: string; issuedAt: number };

function credentials() {
  return {
    clientId: process.env.BING_WEBMASTER_CLIENT_ID?.trim() || "",
    clientSecret: process.env.BING_WEBMASTER_CLIENT_SECRET?.trim() || "",
  };
}

function verifyState(state: string): StatePayload | null {
  const { clientSecret } = credentials();
  if (!clientSecret) return null;
  const [encoded, sig] = state.split(".");
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac("sha256", clientSecret).update(encoded).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload;
    if (!payload.integrationId || !payload.userId || !payload.nonce || !Number.isFinite(payload.issuedAt)) return null;
    if (Date.now() - payload.issuedAt > 10 * 60 * 1000 || payload.issuedAt > Date.now() + 60_000) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieMap(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  return new Map(raw.split(";").map((value) => value.trim()).filter(Boolean).map((value) => {
    const i = value.indexOf("=");
    return i < 0 ? [value, ""] : [value.slice(0, i), decodeURIComponent(value.slice(i + 1))];
  }));
}

function finish(request: Request, integrationId: string, key: "message" | "error", message: string) {
  const url = new URL(`/integrations/${integrationId}/setup`, request.url);
  url.searchParams.set(key, message);
  const response = NextResponse.redirect(url, 303);
  for (const name of ["rythm_bing_state", "rythm_bing_integration", "rythm_bing_user"]) {
    response.cookies.set(name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/integrations/bing-webmaster", maxAge: 0 });
  }
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() || "";
  const state = url.searchParams.get("state")?.trim() || "";
  const providerError = url.searchParams.get("error")?.trim();
  const payload = state ? verifyState(state) : null;
  const cookies = cookieMap(request);
  const integrationId = payload?.integrationId || cookies.get("rythm_bing_integration") || "";

  if (providerError) return finish(request, integrationId, "error", `Bing Webmaster authorization was not completed: ${providerError}`);
  if (!payload || !code || cookies.get("rythm_bing_state") !== state || cookies.get("rythm_bing_integration") !== payload.integrationId || cookies.get("rythm_bing_user") !== payload.userId) {
    return finish(request, integrationId, "error", "Bing Webmaster OAuth state validation failed. Start the connection again from RYTHM.");
  }

  const context = await resolveOrganizationContext();
  if (!context || context.user.id !== payload.userId || context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) {
    return finish(request, payload.integrationId, "error", "Your RYTHM session changed during Bing Webmaster authorization. Sign in again and retry.");
  }

  const { data: integration } = await context.supabase
    .from("organization_integrations")
    .select("id,provider_key")
    .eq("id", payload.integrationId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!integration || integration.provider_key !== "bing_webmaster") {
    return finish(request, payload.integrationId, "error", "This Bing Webmaster connection is no longer valid.");
  }

  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) return finish(request, payload.integrationId, "error", "Bing Webmaster OAuth platform credentials are not configured yet.");

  const redirectUri = `${url.origin}/api/integrations/bing-webmaster/callback`;
  let tokens;
  try {
    tokens = await exchangeBingWebmasterCode({ clientId, clientSecret, code, redirectUri });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bing Webmaster token exchange failed.";
    return finish(request, payload.integrationId, "error", message);
  }
  if (!tokens.refresh_token) return finish(request, payload.integrationId, "error", "Bing Webmaster did not return a refresh token. Reconnect and approve access again.");

  let verification;
  try {
    verification = await discoverBingWebmasterSites(tokens.access_token!);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bing Webmaster site discovery failed.";
    return finish(request, payload.integrationId, "error", message);
  }
  const verifiedResources = verification.resources.filter((resource) => resource.metadata?.verified === true);
  if (!verifiedResources.length) return finish(request, payload.integrationId, "error", "Bing Webmaster authorized the account, but RYTHM could not find a verified site.");

  const envelope = JSON.stringify({
    version: 1,
    provider: "bing_webmaster",
    auth_mode: "oauth",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type || "Bearer",
    scope: tokens.scope || "Webmaster.read",
    expires_at: new Date(Date.now() + Math.max(60, Number(tokens.expires_in ?? 3600)) * 1000).toISOString(),
  });
  const service = createExecutionServiceClient();
  const { error: vaultError } = await service.rpc("store_organization_integration_secret_unverified_v1", { target_integration_id: payload.integrationId, secret_value: envelope });
  if (vaultError) return finish(request, payload.integrationId, "error", `Bing Webmaster credential could not be stored securely: ${vaultError.message}`);

  const now = new Date().toISOString();
  await context.supabase.from("integration_resources").update({ available: false }).eq("integration_id", payload.integrationId).eq("organization_id", context.organizationId);
  const resources = verifiedResources.map((resource) => ({
    organization_id: context.organizationId,
    integration_id: payload.integrationId,
    provider_key: "bing_webmaster",
    resource_type: resource.resourceType,
    resource_id: resource.resourceId,
    resource_name: resource.resourceName,
    resource_metadata: resource.metadata ?? {},
    discovered_at: now,
    last_verified_at: now,
    available: true,
  }));
  const saved = await context.supabase.from("integration_resources").upsert(resources, { onConflict: "integration_id,resource_type,resource_id" });
  if (saved.error) return finish(request, payload.integrationId, "error", "Bing Webmaster access was verified, but site resources could not be saved.");

  const grantedScopes = (tokens.scope || "Webmaster.read").split(/\s+/).filter(Boolean);
  const update = await context.supabase.from("organization_integrations").update({
    account_ref: verifiedResources[0]?.resourceId ?? null,
    auth_type: "oauth",
    status: "connected",
    enabled: true,
    granted_scopes: grantedScopes,
    connected_at: now,
    last_verified_at: now,
    last_health_check_at: now,
    last_error_at: null,
    last_error_code: null,
    last_error_message: null,
    metadata: {
      verification_result: "verified",
      oauth_flow: "customer_bing_webmaster_v1",
      credential_format: "oauth_token_envelope_v1",
      setup_state: "verified",
      resource_count: resources.length,
      readonly: true,
      scope: "Webmaster.read",
    },
    updated_at: now,
  }).eq("id", payload.integrationId).eq("organization_id", context.organizationId);
  if (update.error) return finish(request, payload.integrationId, "error", `Bing Webmaster was authorized, but the connection registry could not be updated: ${update.error.message}`);

  await context.supabase.from("audit_events").insert({
    organization_id: context.organizationId,
    actor_type: "user",
    actor_user_id: context.user.id,
    event_type: "integration.bing_webmaster_connected",
    object_type: "organization_integration",
    object_id: payload.integrationId,
    risk_level: "low",
    payload: { auth_type: "oauth", scopes: grantedScopes, resource_count: resources.length, readonly: true },
  });

  return finish(request, payload.integrationId, "message", `Bing Webmaster connected successfully with ${resources.length} verified site${resources.length === 1 ? "" : "s"}.`);
}
