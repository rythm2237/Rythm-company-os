import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";
import { LINKEDIN_MARKETING_READ_SCOPES } from "@/lib/integrations/adapters/linkedin-marketing";

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

function back(request: Request, id: string, message: string) {
  const url = new URL(`/integrations/${id}/setup`, canonicalOrigin(request));
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const context = await resolveOrganizationContext();
  if (!context) return NextResponse.redirect(new URL("/login", canonicalOrigin(request)), 303);

  const form = await request.formData();
  const integrationId = String(form.get("integrationId") ?? "").trim();
  const projectId = String(form.get("projectId") ?? "").trim();

  if (context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement)) {
    return back(request, integrationId, "Owner authorization with an active entitlement is required.");
  }

  const connection = await context.supabase
    .from("organization_integrations")
    .select("id,provider_key")
    .eq("id", integrationId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!connection.data || connection.data.provider_key !== "linkedin_marketing") {
    return back(request, integrationId, "This LinkedIn Marketing connection is not valid for the active company.");
  }

  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) {
    return back(request, integrationId, "LinkedIn OAuth platform credentials are not configured yet.");
  }

  const payload = {
    integrationId,
    userId: context.user.id,
    projectId,
    nonce: crypto.randomBytes(24).toString("base64url"),
    issuedAt: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const state = `${encoded}.${crypto.createHmac("sha256", clientSecret).update(encoded).digest("base64url")}`;
  const redirectUri = `${canonicalOrigin(request)}/api/integrations/linkedin-marketing/callback`;

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", LINKEDIN_MARKETING_READ_SCOPES.join(" "));

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
    payload: {
      provider_key: "linkedin_marketing",
      redirect_uri: redirectUri,
      scopes: [...LINKEDIN_MARKETING_READ_SCOPES],
      readonly: true,
    },
  });

  const response = NextResponse.redirect(url, 303);
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/integrations/linkedin-marketing",
    maxAge: 600,
  };
  response.cookies.set("rythm_li_state", state, opts);
  response.cookies.set("rythm_li_integration", integrationId, opts);
  response.cookies.set("rythm_li_user", context.user.id, opts);
  return response;
}
