import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";
import {
  exchangeLinkedInAuthorizationCode,
  getTokenConnectionAdapter,
  LINKEDIN_MARKETING_API_VERSION,
  LINKEDIN_MARKETING_READ_SCOPES,
} from "@/lib/integrations/connections/providers";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";

type Payload = {
  integrationId: string;
  userId: string;
  projectId?: string;
  nonce: string;
  issuedAt: number;
};

function credentials() {
  return {
    clientId: process.env.LINKEDIN_CLIENT_ID?.trim() || "",
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET?.trim() || "",
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
  for (const name of ["rythm_li_state", "rythm_li_integration", "rythm_li_user"]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations/linkedin-marketing",
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
  const providerErrorDescription = url.searchParams.get("error_description");
  const payload = verifyState(state);
  const jar = requestCookies(request);
  const id = payload?.integrationId || jar.get("rythm_li_integration") || "";

  if (providerError) {
    return finish(
      request,
      id,
      payload?.projectId,
      "error",
      `LinkedIn authorization was not completed: ${providerErrorDescription || providerError}`,
    );
  }
  if (!payload || !code || jar.get("rythm_li_state") !== state || jar.get("rythm_li_integration") !== payload.integrationId || jar.get("rythm_li_user") !== payload.userId) {
    return finish(request, id, payload?.projectId, "error", "LinkedIn OAuth state validation failed. Start again from RYTHM.");
  }

  const context = await resolveOrganizationContext();
  if (!context || context.user.id !== payload.userId || context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) {
    return finish(request, id, payload.projectId, "error", "Your RYTHM session changed during LinkedIn authorization.");
  }

  const connection = await context.supabase
    .from("organization_integrations")
    .select("id,provider_key")
    .eq("id", id)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!connection.data || connection.data.provider_key !== "linkedin_marketing") {
    return finish(request, id, payload.projectId, "error", "This LinkedIn Marketing connection is no longer valid.");
  }

  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) {
    return finish(request, id, payload.projectId, "error", "LinkedIn OAuth platform credentials are not configured.");
  }

  const redirectUri = `${canonicalOrigin(request)}/api/integrations/linkedin-marketing/callback`;
  let tokens;
  try {
    tokens = await exchangeLinkedInAuthorizationCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });
  } catch (error) {
    return finish(request, id, payload.projectId, "error", error instanceof Error ? error.message : "LinkedIn token exchange failed.");
  }

  const returnedScopes = (tokens.scope ?? "").split(/[ ,]+/).filter(Boolean);
  const missingScope = returnedScopes.length
    ? LINKEDIN_MARKETING_READ_SCOPES.find((scope) => !returnedScopes.includes(scope))
    : undefined;
  if (missingScope) {
    return finish(request, id, payload.projectId, "error", `LinkedIn did not grant the required read-only permission: ${missingScope}.`);
  }

  const adapter = getTokenConnectionAdapter("linkedin_marketing");
  if (!adapter) return finish(request, id, payload.projectId, "error", "The LinkedIn Marketing verification adapter is not available.");

  let verification;
  try {
    verification = await adapter.verifyCredential(tokens.access_token!);
  } catch (error) {
    const message = error instanceof Error ? error.message : "LinkedIn Company Page discovery failed.";
    return finish(request, id, payload.projectId, "error", `LinkedIn authorized the account, but RYTHM could not verify a Company Page: ${message}`);
  }

  const envelope = JSON.stringify({
    version: 1,
    provider: "linkedin_marketing",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type || "Bearer",
    scope: tokens.scope || LINKEDIN_MARKETING_READ_SCOPES.join(" "),
    expires_at: new Date(Date.now() + Math.max(60, Number(tokens.expires_in ?? 5_184_000)) * 1000).toISOString(),
    linkedin_api_version: LINKEDIN_MARKETING_API_VERSION,
  });
  const stored = await createExecutionServiceClient().rpc("store_organization_integration_secret_unverified_v1", {
    target_integration_id: id,
    secret_value: envelope,
  });
  if (stored.error) return finish(request, id, payload.projectId, "error", `LinkedIn credential could not be stored securely: ${stored.error.message}`);

  const now = new Date().toISOString();
  await context.supabase.from("integration_resources").update({ available: false }).eq("integration_id", id).eq("organization_id", context.organizationId);
  if (verification.resources.length) {
    const saved = await context.supabase.from("integration_resources").upsert(
      verification.resources.map((resource) => ({
        organization_id: context.organizationId,
        integration_id: id,
        provider_key: "linkedin_marketing",
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
    if (saved.error) return finish(request, id, payload.projectId, "error", "LinkedIn Company Page was discovered but could not be saved.");
  }

  const updated = await context.supabase.from("organization_integrations").update({
    account_ref: verification.accountRef,
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
      linkedin_api_version: LINKEDIN_MARKETING_API_VERSION,
    },
    updated_at: now,
  }).eq("id", id).eq("organization_id", context.organizationId);
  if (updated.error) return finish(request, id, payload.projectId, "error", updated.error.message);

  await context.supabase.from("audit_events").insert({
    organization_id: context.organizationId,
    actor_type: "user",
    actor_user_id: context.user.id,
    event_type: "integration.linkedin_marketing_connected",
    object_type: "organization_integration",
    object_id: id,
    risk_level: "low",
    payload: {
      resource_count: verification.resources.length,
      scopes: [...LINKEDIN_MARKETING_READ_SCOPES],
      redirect_uri: redirectUri,
      readonly: true,
      linkedin_api_version: LINKEDIN_MARKETING_API_VERSION,
    },
  });

  return finish(
    request,
    id,
    payload.projectId,
    "message",
    `LinkedIn Marketing connected. ${verification.resources.length} Company ${verification.resources.length === 1 ? "Page" : "Pages"} verified.`,
  );
}
