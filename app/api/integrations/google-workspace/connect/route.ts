import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  isOrganizationEntitlementActive,
  resolveOrganizationContext,
} from "@/lib/auth/organization-context";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

function back(request: Request, message: string) {
  const url = new URL("/integrations", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

function oauthStateSecret() {
  return (
    process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    ""
  );
}

function signedState(payload: {
  integrationId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
}) {
  const secret = oauthStateSecret();
  if (!secret) return null;
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export async function POST(request: Request) {
  const context = await resolveOrganizationContext();
  if (!context)
    return NextResponse.redirect(new URL("/login", request.url), 303);
  if (
    context.role !== "owner" ||
    !isOrganizationEntitlementActive(context.entitlement)
  )
    return back(
      request,
      "Owner authorization with an active entitlement is required.",
    );

  const clientId =
    process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim();
  const stateSecret = oauthStateSecret();
  if (!clientId || !stateSecret)
    return back(
      request,
      "Google Workspace OAuth server credentials are not configured.",
    );

  const form = await request.formData();
  const displayName =
    String(form.get("displayName") ?? "Google Workspace").trim() ||
    "Google Workspace";

  const connectionPayload = {
    organization_id: context.organizationId,
    provider_key: "google_workspace",
    display_name: displayName,
    account_ref: null,
    base_url: null,
    auth_type: "oauth",
    granted_scopes: ["gmail.readonly", "calendar.readonly"],
    status: "disconnected",
    enabled: true,
    connected_by_user_id: context.user.id,
    metadata: {
      oauth_flow: "google_workspace_v1",
      credential_format: "oauth_token_envelope_v1",
      phase3_read_only_bootstrap: true,
    },
  } as const;

  const { data: existing, error: lookupError } = await context.supabase
    .from("organization_integrations")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("provider_key", "google_workspace")
    .eq("display_name", displayName)
    .maybeSingle();

  if (lookupError) return back(request, lookupError.message);

  const prepared = existing
    ? await context.supabase
        .from("organization_integrations")
        .update(connectionPayload)
        .eq("id", existing.id)
        .eq("organization_id", context.organizationId)
        .select("id")
        .single()
    : await context.supabase
        .from("organization_integrations")
        .insert(connectionPayload)
        .select("id")
        .single();

  const integration = prepared.data;
  const error = prepared.error;
  if (error || !integration)
    return back(
      request,
      error?.message ?? "Google Workspace connection could not be prepared.",
    );

  const state = signedState({
    integrationId: integration.id,
    userId: context.user.id,
    nonce: crypto.randomBytes(24).toString("base64url"),
    issuedAt: Date.now(),
  });
  if (!state)
    return back(request, "Google Workspace OAuth state could not be created.");

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/google-workspace/callback`;
  const consentUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  consentUrl.searchParams.set("client_id", clientId);
  consentUrl.searchParams.set("redirect_uri", redirectUri);
  consentUrl.searchParams.set("response_type", "code");
  consentUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  consentUrl.searchParams.set("access_type", "offline");
  consentUrl.searchParams.set("prompt", "consent");
  consentUrl.searchParams.set("include_granted_scopes", "true");
  consentUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(consentUrl, 303);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/integrations/google-workspace",
    maxAge: 10 * 60,
  };
  response.cookies.set("rythm_google_oauth_state", state, cookieOptions);
  response.cookies.set(
    "rythm_google_oauth_integration",
    integration.id,
    cookieOptions,
  );
  response.cookies.set("rythm_google_oauth_user", context.user.id, cookieOptions);
  return response;
}
