import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";

const SCOPE = "https://www.googleapis.com/auth/business.manage";

type StatePayload = {
  integrationId: string;
  organizationId: string;
  userId: string;
  projectId?: string | null;
  providerKey: "google_business_profile";
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

function back(request: Request, integrationId: string, projectId: string | null, message: string) {
  const url = new URL(`/integrations/${integrationId}/setup`, canonicalOrigin(request));
  url.searchParams.set("error", message);
  if (projectId) url.searchParams.set("project", projectId);
  return NextResponse.redirect(url, 303);
}

function sign(payload: StatePayload, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export async function POST(request: Request) {
  const context = await resolveOrganizationContext();
  if (!context) return NextResponse.redirect(new URL("/login", canonicalOrigin(request)), 303);

  const form = await request.formData();
  const integrationId = String(form.get("integrationId") ?? "").trim();
  const projectId = String(form.get("projectId") ?? "").trim() || null;
  if (!integrationId) return NextResponse.redirect(new URL("/integrations?error=Connection%20not%20found.", canonicalOrigin(request)), 303);

  if (context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) {
    return back(request, integrationId, projectId, "Owner authorization with an active entitlement is required.");
  }

  const { data: integration } = await context.supabase
    .from("organization_integrations")
    .select("id,provider_key")
    .eq("id", integrationId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!integration || integration.provider_key !== "google_business_profile") {
    return back(request, integrationId, projectId, "This Google Business Profile connection is not valid for the active company.");
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
    providerKey: "google_business_profile",
    nonce: crypto.randomBytes(24).toString("base64url"),
    issuedAt: Date.now(),
  };
  const state = sign(payload, clientSecret);
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const redirectUri = `${canonicalOrigin(request)}/api/integrations/google-business-profile/callback`;

  const consentUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [key, value] of Object.entries({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ["openid", "email", SCOPE].join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  })) consentUrl.searchParams.set(key, value);

  const now = new Date().toISOString();
  await context.supabase
    .from("organization_integrations")
    .update({ status: "authorizing", authorization_started_at: now, last_error_at: null, last_error_code: null, last_error_message: null, updated_at: now })
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
    payload: { provider_key: "google_business_profile", project_id: projectId, scope: "business.manage", redirect_uri: redirectUri },
  });

  const response = NextResponse.redirect(consentUrl, 303);
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/integrations/google-business-profile", maxAge: 10 * 60 };
  response.cookies.set("rythm_gbp_state", state, options);
  response.cookies.set("rythm_gbp_integration", integrationId, options);
  response.cookies.set("rythm_gbp_user", context.user.id, options);
  response.cookies.set("rythm_gbp_organization", context.organizationId, options);
  response.cookies.set("rythm_gbp_pkce", codeVerifier, options);
  return response;
}
