import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";
import {
  assertGitHubAppConfigured,
  buildGitHubAppInstallUrl,
  buildGitHubUserAuthorizationUrl,
  exchangeGitHubUserAuthorizationCode,
  githubAppConfig,
  prepareGitHubInstallationConnection,
} from "@/lib/integrations/connections/github-app";

type StatePayload = {
  integrationId: string;
  organizationId: string;
  userId: string;
  providerKey: "github";
  projectId?: string | null;
  nonce: string;
  issuedAt: number;
};

type Json = Record<string, unknown>;
const COOKIE_PREFIX = "rythm_core_oauth_github";
const text = (value: unknown) => typeof value === "string" ? value : "";
const list = (value: unknown) => Array.isArray(value) ? value as Json[] : [];

function callbackPath() { return "/api/integrations/github/callback"; }
function cookieName(suffix: string) { return `${COOKIE_PREFIX}_${suffix}`; }
function canonicalOrigin(request: Request) {
  const explicit = process.env.RYTHM_PUBLIC_APP_ORIGIN?.trim();
  if (explicit) return new URL(explicit).origin;
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return "https://rythm-os.com";
  return new URL(request.url).origin;
}
function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/integrations/github", maxAge: 10 * 60 };
}
function cookieMap(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  return new Map(raw.split(";").map(value => value.trim()).filter(Boolean).map(value => {
    const index = value.indexOf("=");
    return index < 0 ? [value, ""] : [value.slice(0, index), decodeURIComponent(value.slice(index + 1))];
  }));
}
function sign(payload: StatePayload) {
  const secret = githubAppConfig().clientSecret;
  if (!secret) throw new Error("GitHub App platform credentials are not configured.");
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
function verify(state: string) {
  const secret = githubAppConfig().clientSecret;
  const [encoded, supplied] = state.split(".");
  if (!secret || !encoded || !supplied) return null;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload;
    if (payload.providerKey !== "github" || !payload.integrationId || !payload.organizationId || !payload.userId || !payload.nonce || !Number.isFinite(payload.issuedAt) || Date.now() - payload.issuedAt > 10 * 60 * 1000 || payload.issuedAt > Date.now() + 60_000) return null;
    return payload;
  } catch { return null; }
}
function redirectBack(request: Request, integrationId: string, projectId: string | null | undefined, key: "message" | "error", message: string) {
  const url = new URL(`/integrations/${integrationId}/setup`, request.url);
  url.searchParams.set(key, message);
  if (projectId) url.searchParams.set("project", projectId);
  return NextResponse.redirect(url, 303);
}
function clearCookies(response: NextResponse) {
  const options = cookieOptions();
  for (const suffix of ["state", "integration", "user", "organization", "pkce", "installation"]) {
    response.cookies.set(cookieName(suffix), "", { ...options, maxAge: 0 });
  }
}

async function findAccessibleInstallations(userAccessToken: string) {
  const response = await fetch("https://api.github.com/user/installations?per_page=100", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${userAccessToken}`,
      "X-GitHub-Api-Version": "2026-03-10",
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(`GitHub installation discovery failed (${response.status}).`);
  const slug = assertGitHubAppConfigured().slug;
  return list(body.installations).filter(row => text(row.app_slug) === slug || text((row.app as Json | undefined)?.slug) === slug);
}

export async function startGitHubCustomerOAuth(request: Request) {
  const context = await resolveOrganizationContext();
  if (!context) return NextResponse.redirect(new URL("/login", request.url), 303);
  const form = await request.formData();
  const integrationId = String(form.get("integrationId") ?? "").trim();
  const projectId = String(form.get("projectId") ?? "").trim() || null;
  if (context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) return redirectBack(request, integrationId, projectId, "error", "Owner authorization with an active entitlement is required.");
  const integration = await context.supabase.from("organization_integrations").select("id,provider_key").eq("id", integrationId).eq("organization_id", context.organizationId).maybeSingle();
  if (!integration.data || integration.data.provider_key !== "github") return redirectBack(request, integrationId, projectId, "error", "This GitHub connection is not valid for the active company.");

  try {
    assertGitHubAppConfigured();
    const payload: StatePayload = { integrationId, organizationId: context.organizationId, userId: context.user.id, providerKey: "github", projectId, nonce: crypto.randomBytes(24).toString("base64url"), issuedAt: Date.now() };
    const state = sign(payload);
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const redirectUri = `${canonicalOrigin(request)}${callbackPath()}`;
    const authorizationUrl = buildGitHubUserAuthorizationUrl({ state, redirectUri, codeChallenge: challenge });
    const now = new Date().toISOString();
    await context.supabase.from("organization_integrations").update({ status: "authorizing", authorization_started_at: now, last_error_at: null, last_error_code: null, last_error_message: null, updated_at: now }).eq("id", integrationId).eq("organization_id", context.organizationId);
    await context.supabase.from("audit_events").insert({ organization_id: context.organizationId, actor_type: "user", actor_user_id: context.user.id, event_type: "integration.authorization_started", object_type: "organization_integration", object_id: integrationId, risk_level: "low", payload: { provider_key: "github", project_id: projectId, flow: "existing_installation_first" } });
    const response = NextResponse.redirect(authorizationUrl, 303);
    const options = cookieOptions();
    response.cookies.set(cookieName("state"), state, options);
    response.cookies.set(cookieName("integration"), integrationId, options);
    response.cookies.set(cookieName("user"), context.user.id, options);
    response.cookies.set(cookieName("organization"), context.organizationId, options);
    response.cookies.set(cookieName("pkce"), verifier, options);
    return response;
  } catch (error) {
    return redirectBack(request, integrationId, projectId, "error", error instanceof Error ? error.message : "GitHub authorization could not be started.");
  }
}

export async function finishGitHubExistingInstallationOAuth(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() || "";
  if (!code) return null;
  const state = url.searchParams.get("state")?.trim() || "";
  const payload = verify(state);
  const jar = cookieMap(request);
  const integrationId = payload?.integrationId || jar.get(cookieName("integration")) || "";
  const projectId = payload?.projectId ?? null;
  if (!payload || jar.get(cookieName("state")) !== state || jar.get(cookieName("integration")) !== payload.integrationId || jar.get(cookieName("user")) !== payload.userId || jar.get(cookieName("organization")) !== payload.organizationId) {
    return redirectBack(request, integrationId, projectId, "error", "Secure GitHub authorization state validation failed. Start again from RYTHM.");
  }
  const context = await resolveOrganizationContext();
  if (!context || context.user.id !== payload.userId || context.organizationId !== payload.organizationId || context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) return redirectBack(request, integrationId, projectId, "error", "Your RYTHM session changed during GitHub authorization.");
  const verifier = jar.get(cookieName("pkce")) || "";
  if (!verifier) return redirectBack(request, integrationId, projectId, "error", "GitHub PKCE verifier is unavailable. Start again from RYTHM.");

  try {
    const redirectUri = `${canonicalOrigin(request)}${callbackPath()}`;
    const userAccessToken = await exchangeGitHubUserAuthorizationCode({ code, redirectUri, codeVerifier: verifier });
    const installations = await findAccessibleInstallations(userAccessToken);
    if (installations.length !== 1) {
      const response = NextResponse.redirect(buildGitHubAppInstallUrl(state), 303);
      return response;
    }
    const installationId = String(installations[0]?.id ?? "");
    if (!/^\d+$/.test(installationId)) throw new Error("GitHub returned an invalid installation id.");
    const prepared = await prepareGitHubInstallationConnection(installationId, userAccessToken);
    const service = createExecutionServiceClient();
    const stored = await service.rpc("store_organization_integration_secret_unverified_v1", { target_integration_id: payload.integrationId, secret_value: JSON.stringify(prepared.envelope) });
    if (stored.error) throw new Error(`GitHub credential could not be stored securely: ${stored.error.message}`);
    const verifiedAt = new Date().toISOString();
    await context.supabase.from("integration_resources").update({ available: false }).eq("integration_id", payload.integrationId).eq("organization_id", context.organizationId);
    if (prepared.resources.length) {
      const saved = await context.supabase.from("integration_resources").upsert(prepared.resources.map(resource => ({ organization_id: context.organizationId, integration_id: payload.integrationId, provider_key: "github", resource_type: resource.resourceType, resource_id: resource.resourceId, resource_name: resource.resourceName, resource_metadata: resource.metadata ?? {}, last_verified_at: verifiedAt, available: true })), { onConflict: "integration_id,resource_type,resource_id" });
      if (saved.error) throw new Error("Verified GitHub repositories could not be saved.");
    }
    const updated = await context.supabase.from("organization_integrations").update({ account_ref: prepared.accountRef, auth_type: "oauth", status: "connected", enabled: true, granted_scopes: prepared.grantedScopes, connected_at: verifiedAt, last_verified_at: verifiedAt, last_health_check_at: verifiedAt, last_error_at: null, last_error_code: null, last_error_message: null, metadata: { verification_result: "verified", credential_format: "github_app_installation_v1", setup_state: "verified", resource_count: prepared.resources.length, ...prepared.detail }, updated_at: verifiedAt }).eq("id", payload.integrationId).eq("organization_id", context.organizationId);
    if (updated.error) throw new Error(`GitHub was authorized but the connection registry could not be updated: ${updated.error.message}`);
    await context.supabase.from("audit_events").insert({ organization_id: context.organizationId, actor_type: "user", actor_user_id: context.user.id, event_type: "integration.github_connected", object_type: "organization_integration", object_id: payload.integrationId, risk_level: "low", payload: { auth_type: "github_app", installation_id: installationId, resource_count: prepared.resources.length, project_id: projectId } });
    const response = redirectBack(request, payload.integrationId, projectId, "message", `GitHub connected. ${prepared.resources.length} verified repository resource(s) discovered.`);
    clearCookies(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub authorization could not be completed.";
    await context.supabase.from("organization_integrations").update({ status: "needs_attention", last_error_at: new Date().toISOString(), last_error_code: "oauth_callback_failed", last_error_message: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", payload.integrationId).eq("organization_id", context.organizationId);
    const response = redirectBack(request, payload.integrationId, projectId, "error", message);
    clearCookies(response);
    return response;
  }
}
