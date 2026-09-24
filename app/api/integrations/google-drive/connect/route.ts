import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  isOrganizationEntitlementActive,
  resolveOrganizationContext,
} from "@/lib/auth/organization-context";

const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_DRIVE_SCOPES = ["openid", "email", GOOGLE_DRIVE_SCOPE];

type StatePayload = {
  integrationId: string;
  organizationId: string;
  userId: string;
  projectId?: string | null;
  providerKey: "google_drive";
  nonce: string;
  issuedAt: number;
};

function back(request: Request, integrationId: string, projectId: string | null, message: string) {
  const url = new URL(`/integrations/${integrationId}/setup`, request.url);
  url.searchParams.set("error", message);
  if (projectId) url.searchParams.set("project", projectId);
  return NextResponse.redirect(url, 303);
}

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

function sign(payload: StatePayload, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function canonicalOrigin(request: Request) {
  const explicit = process.env.RYTHM_PUBLIC_APP_ORIGIN?.trim();
  if (explicit) return new URL(explicit).origin;
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return "https://rythm-os.com";
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const context = await resolveOrganizationContext();
  if (!context) return NextResponse.redirect(new URL("/login", request.url), 303);

  const form = await request.formData();
  const integrationId = String(form.get("integrationId") ?? "").trim();
  const projectId = String(form.get("projectId") ?? "").trim() || null;
  if (!integrationId) return NextResponse.redirect(new URL("/integrations?error=Connection%20not%20found.", request.url), 303);

  if (context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) {
    return back(request, integrationId, projectId, "Owner authorization with an active entitlement is required.");
  }

  const { data: integration } = await context.supabase
    .from("organization_integrations")
    .select("id,provider_key")
    .eq("id", integrationId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!integration || integration.provider_key !== "google_drive") {
    return back(request, integrationId, projectId, "This Google Drive connection is not valid for the active company.");
  }

  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) {
    return back(request, integrationId, projectId, "Google OAuth platform credentials are not configured.");
  }

  const payload: StatePayload = {
    integrationId,
    organizationId: context.organizationId,
    userId: context.user.id,
    projectId,
    providerKey: "google_drive",
    nonce: crypto.randomBytes(24).toString("base64url"),
    issuedAt: Date.now(),
  };
  const state = sign(payload, clientSecret);
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const origin = canonicalOrigin(request);
  const redirectUri = `${origin}/api/integrations/google-drive/callback`;

  const consentUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  consentUrl.searchParams.set("client_id", clientId);
  consentUrl.searchParams.set("redirect_uri", redirectUri);
  consentUrl.searchParams.set("response_type", "code");
  consentUrl.searchParams.set("scope", GOOGLE_DRIVE_SCOPES.join(" "));
  consentUrl.searchParams.set("access_type", "offline");
  consentUrl.searchParams.set("prompt", "consent");
  consentUrl.searchParams.set("include_granted_scopes", "true");
  consentUrl.searchParams.set("state", state);
  consentUrl.searchParams.set("code_challenge", codeChallenge);
  consentUrl.searchParams.set("code_challenge_method", "S256");

  const now = new Date().toISOString();
  await context.supabase
    .from("organization_integrations")
    .update({
      status: "authorizing",
      authorization_started_at: now,
      last_error_at: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: now,
    })
    .eq("id", integrationId)
    .eq("organization_id", context.organizationId);
  await context.supabase.from("audit_events").insert({
    organization_id: context.organizationId,
    actor_type: "user",
    actor_user_id: context.user.id,
    event_type: "integration.authorization_started",
    object_type: "organization_integration",
    object_id: integrationId,
    risk_level: "low",
    payload: { provider_key: "google_drive", project_id: projectId, scope: "drive.file" },
  });

  const response = NextResponse.redirect(consentUrl, 303);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/integrations/google-drive",
    maxAge: 10 * 60,
  };
  response.cookies.set("rythm_google_drive_oauth_state", state, cookieOptions);
  response.cookies.set("rythm_google_drive_oauth_integration", integrationId, cookieOptions);
  response.cookies.set("rythm_google_drive_oauth_user", context.user.id, cookieOptions);
  response.cookies.set("rythm_google_drive_oauth_organization", context.organizationId, cookieOptions);
  response.cookies.set("rythm_google_drive_oauth_pkce", codeVerifier, cookieOptions);
  return response;
}
