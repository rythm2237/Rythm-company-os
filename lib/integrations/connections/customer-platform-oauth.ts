import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";
import {
  buildGitHubAppInstallUrl,
  buildGitHubUserAuthorizationUrl,
  exchangeGitHubUserAuthorizationCode,
  githubAppConfig,
  prepareGitHubInstallationConnection,
} from "@/lib/integrations/connections/github-app";
import { buildPlatformAuthorizationUrl, discoverPlatformOAuthResources, exchangePlatformOAuthCode, isPlatformOAuthProvider, platformOAuthConfig, type PlatformOAuthProviderKey } from "@/lib/integrations/connections/platform-oauth";

type CustomerCoreOAuthProvider = "github" | PlatformOAuthProviderKey;
type StatePayload = { integrationId: string; organizationId: string; userId: string; providerKey: CustomerCoreOAuthProvider; projectId?: string | null; nonce: string; issuedAt: number };
type Json = Record<string, unknown>;
const COOKIE_PREFIX = "rythm_core_oauth";

function secretFor(providerKey: CustomerCoreOAuthProvider) {
  if (providerKey === "github") return githubAppConfig().clientSecret;
  return platformOAuthConfig(providerKey).clientSecret;
}

function callbackPath(providerKey: CustomerCoreOAuthProvider) {
  return `/api/integrations/${providerKey}/callback`;
}

function sign(providerKey: CustomerCoreOAuthProvider, payload: StatePayload) {
  const secret = secretFor(providerKey);
  if (!secret) throw new Error(`${providerKey} platform credentials are not configured.`);
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${crypto.createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

function verify(providerKey: CustomerCoreOAuthProvider, state: string) {
  const secret = secretFor(providerKey);
  const [encoded, supplied] = state.split(".");
  if (!secret || !encoded || !supplied) return null;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload;
    if (payload.providerKey !== providerKey || !payload.integrationId || !payload.organizationId || !payload.userId || !payload.nonce || !Number.isFinite(payload.issuedAt) || Date.now() - payload.issuedAt > 10 * 60 * 1000 || payload.issuedAt > Date.now() + 60_000) return null;
    return payload;
  } catch { return null; }
}

function cookieName(providerKey: CustomerCoreOAuthProvider, suffix: string) {
  return `${COOKIE_PREFIX}_${providerKey}_${suffix}`;
}

function cookieMap(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  return new Map(raw.split(";").map(value => value.trim()).filter(Boolean).map(value => {
    const index = value.indexOf("=");
    return index < 0 ? [value, ""] : [value.slice(0, index), decodeURIComponent(value.slice(index + 1))];
  }));
}

function redirectBack(request: Request, integrationId: string, projectId: string | null | undefined, key: "message" | "error", message: string) {
  const url = new URL(`/integrations/${integrationId}/setup`, request.url);
  url.searchParams.set(key, message);
  if (projectId) url.searchParams.set("project", projectId);
  return NextResponse.redirect(url, 303);
}

function cookieOptions(request: Request, providerKey: CustomerCoreOAuthProvider) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: callbackPath(providerKey).replace(/\/callback$/, ""), maxAge: 10 * 60 };
}

function clearCookies(response: NextResponse, providerKey: CustomerCoreOAuthProvider) {
  const options = cookieOptions(new Request("https://rythm-os.com"), providerKey);
  for (const suffix of ["state", "integration", "user", "organization", "pkce", "installation"]) {
    response.cookies.set(cookieName(providerKey, suffix), "", { ...options, maxAge: 0 });
  }
}

function canonicalOrigin(request: Request) {
  const explicit = process.env.RYTHM_PUBLIC_APP_ORIGIN?.trim();
  if (explicit) return new URL(explicit).origin;
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return "https://rythm-os.com";
  return new URL(request.url).origin;
}

export async function startCustomerCoreOAuth(request: Request, providerKey: CustomerCoreOAuthProvider) {
  const context = await resolveOrganizationContext();
  if (!context) return NextResponse.redirect(new URL("/login", request.url), 303);
  const form = await request.formData();
  const integrationId = String(form.get("integrationId") ?? "").trim();
  const projectId = String(form.get("projectId") ?? "").trim() || null;
  if (context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) return redirectBack(request, integrationId, projectId, "error", "Owner authorization with an active entitlement is required.");
  const result = await context.supabase.from("organization_integrations").select("id,provider_key").eq("id", integrationId).eq("organization_id", context.organizationId).maybeSingle();
  if (!result.data || result.data.provider_key !== providerKey) return redirectBack(request, integrationId, projectId, "error", "This provider connection is not valid for the active company.");

  try {
    if (providerKey === "github") {
      const config = githubAppConfig();
      if (!config.clientId || !config.clientSecret || !config.slug || !config.privateKey) throw new Error("GitHub App platform credentials are not configured.");
    } else {
      const config = platformOAuthConfig(providerKey);
      if (!config.clientId || !config.clientSecret) throw new Error(`${providerKey} OAuth platform credentials are not configured.`);
    }
    const payload: StatePayload = { integrationId, organizationId: context.organizationId, userId: context.user.id, providerKey, projectId, nonce: crypto.randomBytes(24).toString("base64url"), issuedAt: Date.now() };
    const state = sign(providerKey, payload);
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const origin = canonicalOrigin(request);
    const redirectUri = `${origin}${callbackPath(providerKey)}`;
    const authorizationUrl = providerKey === "github" ? buildGitHubAppInstallUrl(state) : buildPlatformAuthorizationUrl({ providerKey, state, redirectUri, codeChallenge: challenge });
    const now = new Date().toISOString();
    await context.supabase.from("organization_integrations").update({ status: "authorizing", authorization_started_at: now, last_error_at: null, last_error_code: null, last_error_message: null, updated_at: now }).eq("id", integrationId).eq("organization_id", context.organizationId);
    await context.supabase.from("audit_events").insert({ organization_id: context.organizationId, actor_type: "user", actor_user_id: context.user.id, event_type: "integration.authorization_started", object_type: "organization_integration", object_id: integrationId, risk_level: "low", payload: { provider_key: providerKey, project_id: projectId } });
    const response = NextResponse.redirect(authorizationUrl, 303);
    const options = cookieOptions(request, providerKey);
    response.cookies.set(cookieName(providerKey, "state"), state, options);
    response.cookies.set(cookieName(providerKey, "integration"), integrationId, options);
    response.cookies.set(cookieName(providerKey, "user"), context.user.id, options);
    response.cookies.set(cookieName(providerKey, "organization"), context.organizationId, options);
    response.cookies.set(cookieName(providerKey, "pkce"), verifier, options);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider authorization could not be started.";
    return redirectBack(request, integrationId, projectId, "error", message);
  }
}

export async function finishCustomerCoreOAuth(request: Request, providerKey: CustomerCoreOAuthProvider) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() || "";
  const payload = verify(providerKey, state);
  const jar = cookieMap(request);
  const integrationId = payload?.integrationId || jar.get(cookieName(providerKey, "integration")) || "";
  const projectId = payload?.projectId ?? null;
  const providerError = url.searchParams.get("error")?.trim();
  if (providerError) return redirectBack(request, integrationId, projectId, "error", `Provider authorization was not completed: ${providerError}`);
  if (!payload || jar.get(cookieName(providerKey, "state")) !== state || jar.get(cookieName(providerKey, "integration")) !== payload.integrationId || jar.get(cookieName(providerKey, "user")) !== payload.userId || jar.get(cookieName(providerKey, "organization")) !== payload.organizationId) {
    return redirectBack(request, integrationId, projectId, "error", "Secure provider authorization state validation failed. Start again from RYTHM.");
  }
  const context = await resolveOrganizationContext();
  if (!context || context.user.id !== payload.userId || context.organizationId !== payload.organizationId || context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) return redirectBack(request, integrationId, projectId, "error", "Your RYTHM session changed during provider authorization.");
  const integration = await context.supabase.from("organization_integrations").select("id,provider_key").eq("id", payload.integrationId).eq("organization_id", context.organizationId).maybeSingle();
  if (!integration.data || integration.data.provider_key !== providerKey) return redirectBack(request, integrationId, projectId, "error", "This provider connection is no longer valid.");

  try {
    const origin = canonicalOrigin(request);
    const redirectUri = `${origin}${callbackPath(providerKey)}`;
    const verifier = jar.get(cookieName(providerKey, "pkce")) || "";

    if (providerKey === "github" && !url.searchParams.get("code")) {
      const installationId = url.searchParams.get("installation_id")?.trim() || "";
      if (!/^\d+$/.test(installationId) || !verifier) throw new Error("GitHub App installation did not return a valid installation or PKCE verifier.");
      const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
      const authorizationUrl = buildGitHubUserAuthorizationUrl({ state, redirectUri, codeChallenge: challenge });
      const response = NextResponse.redirect(authorizationUrl, 303);
      response.cookies.set(cookieName(providerKey, "installation"), installationId, cookieOptions(request, providerKey));
      return response;
    }

    let accountRef: string | null = null;
    let resources: Array<{ resourceType: string; resourceId: string; resourceName: string; metadata?: Json }> = [];
    let grantedScopes: string[] = [];
    let detail: Json = {};
    let secretEnvelope: Json;

    if (providerKey === "github") {
      const code = url.searchParams.get("code")?.trim() || "";
      const installationId = jar.get(cookieName(providerKey, "installation")) || url.searchParams.get("installation_id")?.trim() || "";
      if (!code || !installationId || !verifier) throw new Error("GitHub user authorization did not complete securely.");
      const userAccessToken = await exchangeGitHubUserAuthorizationCode({ code, redirectUri, codeVerifier: verifier });
      const prepared = await prepareGitHubInstallationConnection(installationId, userAccessToken);
      accountRef = prepared.accountRef;
      resources = prepared.resources;
      grantedScopes = prepared.grantedScopes;
      detail = prepared.detail;
      secretEnvelope = prepared.envelope as unknown as Json;
    } else {
      const code = url.searchParams.get("code")?.trim() || "";
      if (!code) throw new Error("Provider did not return an authorization code.");
      if (!verifier && providerKey !== "vercel") throw new Error("OAuth PKCE verifier is unavailable.");
      const tokens = await exchangePlatformOAuthCode({ providerKey, code, redirectUri, codeVerifier: verifier, configurationId: url.searchParams.get("configurationId") });
      const discovered = await discoverPlatformOAuthResources(providerKey, tokens.access_token, { ...tokens, team_id: url.searchParams.get("teamId") || tokens.team_id });
      accountRef = discovered.accountRef;
      resources = discovered.resources;
      grantedScopes = discovered.grantedScopes;
      detail = discovered.detail;
      secretEnvelope = {
        version: 1,
        provider: providerKey,
        auth_mode: "oauth",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_type: tokens.token_type || "Bearer",
        scope: tokens.scope || grantedScopes.join(" "),
        expires_at: tokens.expires_in ? new Date(Date.now() + Math.max(60, Number(tokens.expires_in)) * 1000).toISOString() : null,
        configuration_id: tokens.configuration_id ?? null,
        team_id: url.searchParams.get("teamId") || tokens.team_id || null,
      };
    }

    const service = createExecutionServiceClient();
    const stored = await service.rpc("store_organization_integration_secret_unverified_v1", { target_integration_id: payload.integrationId, secret_value: JSON.stringify(secretEnvelope) });
    if (stored.error) throw new Error(`Provider credential could not be stored securely: ${stored.error.message}`);
    const verifiedAt = new Date().toISOString();
    await context.supabase.from("integration_resources").update({ available: false }).eq("integration_id", payload.integrationId).eq("organization_id", context.organizationId);
    if (resources.length) {
      const saved = await context.supabase.from("integration_resources").upsert(resources.map(resource => ({ organization_id: context.organizationId, integration_id: payload.integrationId, provider_key: providerKey, resource_type: resource.resourceType, resource_id: resource.resourceId, resource_name: resource.resourceName, resource_metadata: resource.metadata ?? {}, last_verified_at: verifiedAt, available: true })), { onConflict: "integration_id,resource_type,resource_id" });
      if (saved.error) throw new Error("Verified provider resources could not be saved.");
    }
    const updated = await context.supabase.from("organization_integrations").update({ account_ref: accountRef, auth_type: "oauth", status: "connected", enabled: true, granted_scopes: grantedScopes, connected_at: verifiedAt, last_verified_at: verifiedAt, last_health_check_at: verifiedAt, last_error_at: null, last_error_code: null, last_error_message: null, metadata: { verification_result: "verified", credential_format: providerKey === "github" ? "github_app_installation_v1" : "oauth_token_envelope_v1", setup_state: "verified", resource_count: resources.length, ...detail }, updated_at: verifiedAt }).eq("id", payload.integrationId).eq("organization_id", context.organizationId);
    if (updated.error) throw new Error(`Provider was authorized but the connection registry could not be updated: ${updated.error.message}`);
    await context.supabase.from("audit_events").insert({ organization_id: context.organizationId, actor_type: "user", actor_user_id: context.user.id, event_type: `integration.${providerKey}_connected`, object_type: "organization_integration", object_id: payload.integrationId, risk_level: "low", payload: { auth_type: providerKey === "github" ? "github_app" : "oauth", resource_count: resources.length, project_id: projectId } });
    const response = redirectBack(request, payload.integrationId, projectId, "message", `${providerKey === "github" ? "GitHub" : providerKey === "vercel" ? "Vercel" : providerKey === "supabase" ? "Supabase" : "Cloudflare"} connected. ${resources.length} verified resource(s) discovered.`);
    clearCookies(response, providerKey);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider authorization could not be completed.";
    await context.supabase.from("organization_integrations").update({ status: "needs_attention", last_error_at: new Date().toISOString(), last_error_code: "oauth_callback_failed", last_error_message: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", payload.integrationId).eq("organization_id", context.organizationId);
    const response = redirectBack(request, payload.integrationId, projectId, "error", message);
    clearCookies(response, providerKey);
    return response;
  }
}

export function isCustomerCoreOAuthProvider(value: string): value is CustomerCoreOAuthProvider {
  return value === "github" || isPlatformOAuthProvider(value);
}
