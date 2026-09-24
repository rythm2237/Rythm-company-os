import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  isOrganizationEntitlementActive,
  resolveOrganizationContext,
} from "@/lib/auth/organization-context";
import { exchangeGoogleOAuthCode, verifyGoogleDriveAccess } from "@/lib/integrations/connections/providers";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";

const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

type StatePayload = {
  integrationId: string;
  organizationId: string;
  userId: string;
  projectId?: string | null;
  providerKey: "google_drive";
  nonce: string;
  issuedAt: number;
};

function credentials() {
  return {
    clientId:
      process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim() ||
      process.env.GOOGLE_CLIENT_ID?.trim() ||
      "",
    clientSecret:
      process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim() ||
      process.env.GOOGLE_CLIENT_SECRET?.trim() ||
      "",
  };
}

function verifyState(state: string, secret: string): StatePayload | null {
  const [encoded, supplied] = state.split(".");
  if (!encoded || !supplied) return null;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload;
    if (
      payload.providerKey !== "google_drive" ||
      !payload.integrationId ||
      !payload.organizationId ||
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

function cookieMap(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  return new Map(
    raw
      .split(";")
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => {
        const index = value.indexOf("=");
        return index < 0
          ? [value, ""]
          : [value.slice(0, index), decodeURIComponent(value.slice(index + 1))];
      }),
  );
}

function canonicalOrigin(request: Request) {
  const explicit = process.env.RYTHM_PUBLIC_APP_ORIGIN?.trim();
  if (explicit) return new URL(explicit).origin;
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return "https://rythm-os.com";
  return new URL(request.url).origin;
}

function finish(
  request: Request,
  integrationId: string,
  projectId: string | null | undefined,
  key: "message" | "error",
  message: string,
) {
  const url = new URL(`/integrations/${integrationId}/setup`, request.url);
  url.searchParams.set(key, message);
  if (projectId) url.searchParams.set("project", projectId);
  const response = NextResponse.redirect(url, 303);
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/integrations/google-drive",
    maxAge: 0,
  };
  for (const name of [
    "rythm_google_drive_oauth_state",
    "rythm_google_drive_oauth_integration",
    "rythm_google_drive_oauth_user",
    "rythm_google_drive_oauth_organization",
    "rythm_google_drive_oauth_pkce",
  ]) response.cookies.set(name, "", options);
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() || "";
  const code = url.searchParams.get("code")?.trim() || "";
  const providerError = url.searchParams.get("error")?.trim();
  const { clientId, clientSecret } = credentials();
  const payload = clientSecret && state ? verifyState(state, clientSecret) : null;
  const jar = cookieMap(request);
  const integrationId = payload?.integrationId || jar.get("rythm_google_drive_oauth_integration") || "";
  const projectId = payload?.projectId ?? null;

  if (providerError) {
    return finish(request, integrationId, projectId, "error", `Google authorization was not completed: ${providerError}`);
  }
  if (!clientId || !clientSecret) {
    return finish(request, integrationId, projectId, "error", "Google OAuth platform credentials are not configured.");
  }
  if (
    !payload ||
    !code ||
    jar.get("rythm_google_drive_oauth_state") !== state ||
    jar.get("rythm_google_drive_oauth_integration") !== payload.integrationId ||
    jar.get("rythm_google_drive_oauth_user") !== payload.userId ||
    jar.get("rythm_google_drive_oauth_organization") !== payload.organizationId
  ) {
    return finish(request, integrationId, projectId, "error", "Secure Google Drive OAuth state validation failed. Start again from RYTHM.");
  }

  const codeVerifier = jar.get("rythm_google_drive_oauth_pkce") || "";
  if (!codeVerifier) {
    return finish(request, integrationId, projectId, "error", "Google Drive OAuth PKCE verification is unavailable. Start again from RYTHM.");
  }

  const context = await resolveOrganizationContext();
  if (
    !context ||
    context.user.id !== payload.userId ||
    context.organizationId !== payload.organizationId ||
    context.role !== "owner" ||
    !isOrganizationEntitlementActive(context.entitlement)
  ) {
    return finish(request, integrationId, projectId, "error", "Your RYTHM session changed during Google authorization.");
  }

  const { data: integration } = await context.supabase
    .from("organization_integrations")
    .select("id,provider_key")
    .eq("id", payload.integrationId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!integration || integration.provider_key !== "google_drive") {
    return finish(request, integrationId, projectId, "error", "This Google Drive connection is no longer valid.");
  }

  try {
    const redirectUri = `${canonicalOrigin(request)}/api/integrations/google-drive/callback`;
    const tokens = await exchangeGoogleOAuthCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
      codeVerifier,
    });
    const scopes = new Set((tokens.scope ?? "").split(/\s+/).filter(Boolean));
    if (!scopes.has(GOOGLE_DRIVE_SCOPE)) {
      throw new Error("Google did not grant the required Google Drive file scope.");
    }

    const about = await verifyGoogleDriveAccess(String(tokens.access_token));
    const accountRef = about.accountRef;

    const envelope = {
      version: 1,
      provider: "google_drive",
      auth_mode: "oauth",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || "Bearer",
      scope: tokens.scope || GOOGLE_DRIVE_SCOPE,
      expires_at: new Date(Date.now() + Math.max(60, Number(tokens.expires_in ?? 3600)) * 1000).toISOString(),
    };
    const service = createExecutionServiceClient();
    const stored = await service.rpc("store_organization_integration_secret_unverified_v1", {
      target_integration_id: payload.integrationId,
      secret_value: JSON.stringify(envelope),
    });
    if (stored.error) throw new Error(`Google Drive credential could not be stored securely: ${stored.error.message}`);

    const verifiedAt = new Date().toISOString();
    await context.supabase
      .from("integration_resources")
      .update({ available: false })
      .eq("integration_id", payload.integrationId)
      .eq("organization_id", context.organizationId);

    const resourceId = about.user.permissionId || accountRef;
    const saved = await context.supabase.from("integration_resources").upsert({
      organization_id: context.organizationId,
      integration_id: payload.integrationId,
      provider_key: "google_drive",
      resource_type: "google_drive_account",
      resource_id: resourceId,
      resource_name: about.user.displayName || about.user.emailAddress || "Google Drive account",
      resource_metadata: {
        email_address: about.user.emailAddress,
        permission_id: about.user.permissionId,
        access_model: "drive.file",
      },
      discovered_at: verifiedAt,
      last_verified_at: verifiedAt,
      available: true,
    }, { onConflict: "integration_id,resource_type,resource_id" });
    if (saved.error) throw new Error("Google Drive was verified, but its account resource could not be saved.");

    const updated = await context.supabase
      .from("organization_integrations")
      .update({
        account_ref: accountRef,
        auth_type: "oauth",
        status: "connected",
        enabled: true,
        granted_scopes: ["drive.file"],
        connected_at: verifiedAt,
        last_verified_at: verifiedAt,
        last_health_check_at: verifiedAt,
        last_error_at: null,
        last_error_code: null,
        last_error_message: null,
        metadata: {
          verification_result: "verified",
          setup_state: "verified",
          oauth_flow: "google_drive_v1",
          credential_format: "oauth_token_envelope_v1",
          resource_count: 1,
          access_model: "drive.file",
          readonly_catalog_discovery: false,
        },
        updated_at: verifiedAt,
      })
      .eq("id", payload.integrationId)
      .eq("organization_id", context.organizationId);
    if (updated.error) throw new Error(`Google Drive was verified, but connection state could not be saved: ${updated.error.message}`);

    await context.supabase
      .from("integration_setup_sessions")
      .update({
        current_step: 4,
        step_status: "completed",
        session_status: "completed",
        user_action_required: false,
        requires_user_action: false,
        updated_at: verifiedAt,
      })
      .eq("connection_id", payload.integrationId)
      .eq("organization_id", context.organizationId)
      .eq("automation_mode", "manual");

    await context.supabase.from("audit_events").insert({
      organization_id: context.organizationId,
      actor_type: "user",
      actor_user_id: context.user.id,
      event_type: "integration.google_drive_connected",
      object_type: "organization_integration",
      object_id: payload.integrationId,
      risk_level: "low",
      payload: { auth_type: "oauth", scopes: ["drive.file"], account_ref: accountRef, project_id: projectId },
    });

    return finish(request, payload.integrationId, projectId, "message", "Google Drive connected and verified with limited file access.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive authorization could not be completed.";
    const now = new Date().toISOString();
    await context.supabase
      .from("organization_integrations")
      .update({
        status: "needs_attention",
        last_error_at: now,
        last_error_code: "oauth_callback_failed",
        last_error_message: message.slice(0, 500),
        updated_at: now,
      })
      .eq("id", payload.integrationId)
      .eq("organization_id", context.organizationId);
    return finish(request, payload.integrationId, projectId, "error", message);
  }
}
