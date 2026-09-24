import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";
import { discoverGoogleResources, exchangeGoogleOAuthCode, googleProfile } from "@/lib/integrations/connections/providers";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";

const SCOPE = "https://www.googleapis.com/auth/business.manage";
type StatePayload = { integrationId: string; organizationId: string; userId: string; projectId?: string | null; providerKey: "google_business_profile"; nonce: string; issuedAt: number };

function credentials() {
  return {
    clientId: process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
  };
}
function canonicalOrigin(request: Request) { const explicit = process.env.RYTHM_PUBLIC_APP_ORIGIN?.trim(); if (explicit) return new URL(explicit).origin; if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return "https://rythm-os.com"; return new URL(request.url).origin; }
function cookieMap(request: Request) { const raw = request.headers.get("cookie") ?? ""; return new Map(raw.split(";").map(v => v.trim()).filter(Boolean).map(v => { const i = v.indexOf("="); return i < 0 ? [v, ""] : [v.slice(0, i), decodeURIComponent(v.slice(i + 1))]; })); }
function verifyState(state: string, secret: string): StatePayload | null { const [encoded, supplied] = state.split("."); if (!encoded || !supplied) return null; const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url"); const a = Buffer.from(supplied), b = Buffer.from(expected); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null; try { const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload; if (value.providerKey !== "google_business_profile" || !value.integrationId || !value.organizationId || !value.userId || !value.nonce || !Number.isFinite(value.issuedAt) || Date.now() - value.issuedAt > 600000 || value.issuedAt > Date.now() + 60000) return null; return value; } catch { return null; } }
function finish(request: Request, id: string, projectId: string | null | undefined, key: "message" | "error", message: string) { const url = new URL(`/integrations/${id}/setup`, canonicalOrigin(request)); url.searchParams.set(key, message); if (projectId) url.searchParams.set("project", projectId); const response = NextResponse.redirect(url, 303); const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/integrations/google-business-profile", maxAge: 0 }; for (const name of ["rythm_gbp_state", "rythm_gbp_integration", "rythm_gbp_user", "rythm_gbp_organization", "rythm_gbp_pkce"]) response.cookies.set(name, "", opts); return response; }

export async function GET(request: Request) {
  const url = new URL(request.url); const state = url.searchParams.get("state")?.trim() || ""; const code = url.searchParams.get("code")?.trim() || ""; const providerError = url.searchParams.get("error")?.trim(); const { clientId, clientSecret } = credentials(); const payload = clientSecret && state ? verifyState(state, clientSecret) : null; const jar = cookieMap(request); const id = payload?.integrationId || jar.get("rythm_gbp_integration") || "";
  if (providerError) return finish(request, id, payload?.projectId, "error", `Google authorization was not completed: ${providerError}`);
  if (!clientId || !clientSecret) return finish(request, id, payload?.projectId, "error", "Google OAuth platform credentials are not configured.");
  if (!payload || !code || jar.get("rythm_gbp_state") !== state || jar.get("rythm_gbp_integration") !== payload.integrationId || jar.get("rythm_gbp_user") !== payload.userId || jar.get("rythm_gbp_organization") !== payload.organizationId || !jar.get("rythm_gbp_pkce")) return finish(request, id, payload?.projectId, "error", "Google Business Profile OAuth state validation failed. Start again from RYTHM.");

  const context = await resolveOrganizationContext();
  if (!context || context.user.id !== payload.userId || context.organizationId !== payload.organizationId || context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) return finish(request, id, payload.projectId, "error", "Your RYTHM session changed during Google authorization.");
  const connection = await context.supabase.from("organization_integrations").select("id,provider_key").eq("id", id).eq("organization_id", context.organizationId).maybeSingle();
  if (!connection.data || connection.data.provider_key !== "google_business_profile") return finish(request, id, payload.projectId, "error", "This Google Business Profile connection is no longer valid.");

  try {
    const redirectUri = `${canonicalOrigin(request)}/api/integrations/google-business-profile/callback`;
    const tokens = await exchangeGoogleOAuthCode({ code, clientId, clientSecret, redirectUri, codeVerifier: String(jar.get("rythm_gbp_pkce")) });
    if (!(tokens.scope ?? "").split(/\s+/).includes(SCOPE)) throw new Error("Google did not grant Business Profile management access.");
    const [resources, profile] = await Promise.all([discoverGoogleResources("google_business_profile", tokens.access_token!), googleProfile(tokens.access_token!)]);
    if (!resources.length) throw new Error("Google Business Profile authorization succeeded, but no accessible account or location was returned.");

    const envelope = JSON.stringify({ version: 1, provider: "google_business_profile", auth_mode: "oauth", access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_type: tokens.token_type || "Bearer", scope: tokens.scope || SCOPE, expires_at: new Date(Date.now() + Math.max(60, Number(tokens.expires_in ?? 3600)) * 1000).toISOString() });
    const stored = await createExecutionServiceClient().rpc("store_organization_integration_secret_unverified_v1", { target_integration_id: id, secret_value: envelope });
    if (stored.error) throw new Error(`Google Business Profile credential could not be stored securely: ${stored.error.message}`);

    const now = new Date().toISOString();
    await context.supabase.from("integration_resources").update({ available: false }).eq("integration_id", id).eq("organization_id", context.organizationId);
    const saved = await context.supabase.from("integration_resources").upsert(resources.map(resource => ({ organization_id: context.organizationId, integration_id: id, provider_key: "google_business_profile", resource_type: resource.resourceType, resource_id: resource.resourceId, resource_name: resource.resourceName, resource_metadata: resource.metadata ?? {}, discovered_at: now, last_verified_at: now, available: true })), { onConflict: "integration_id,resource_type,resource_id" });
    if (saved.error) throw new Error("Google Business Profile resources were discovered but could not be saved.");

    const updated = await context.supabase.from("organization_integrations").update({ account_ref: String(profile.email ?? ""), auth_type: "oauth", status: "connected", enabled: true, granted_scopes: ["business.manage"], connected_at: now, last_verified_at: now, last_health_check_at: now, last_error_at: null, last_error_code: null, last_error_message: null, metadata: { verification_result: "verified", setup_state: "verified", credential_format: "oauth_token_envelope_v1", resource_count: resources.length, verification_endpoint: "mybusinessaccountmanagement.googleapis.com/v1/accounts" }, updated_at: now }).eq("id", id).eq("organization_id", context.organizationId);
    if (updated.error) throw new Error(updated.error.message);
    await context.supabase.from("audit_events").insert({ organization_id: context.organizationId, actor_type: "user", actor_user_id: context.user.id, event_type: "integration.google_business_profile_connected", object_type: "organization_integration", object_id: id, risk_level: "low", payload: { resource_count: resources.length, scope: "business.manage", project_id: payload.projectId ?? null } });
    return finish(request, id, payload.projectId, "message", `Google Business Profile connected and verified. ${resources.length} resource(s) discovered.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Business Profile authorization could not be completed.";
    const now = new Date().toISOString();
    await context.supabase.from("organization_integrations").update({ status: "needs_attention", last_error_at: now, last_error_code: "oauth_callback_failed", last_error_message: message.slice(0, 500), updated_at: now }).eq("id", id).eq("organization_id", context.organizationId);
    return finish(request, id, payload.projectId, "error", message);
  }
}
