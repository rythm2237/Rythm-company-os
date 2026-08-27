import { NextResponse } from "next/server";
import { resolveOrganizationContext, isOrganizationEntitlementActive } from "@/lib/auth/organization-context";

function value(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function scopes(raw: string) {
  return [...new Set(raw.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))].slice(0, 50);
}

function back(request: Request, key: "error" | "message", message: string) {
  const url = new URL("/integrations", request.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const context = await resolveOrganizationContext();
  if (!context) return NextResponse.redirect(new URL("/login", request.url), 303);
  if (context.role !== "owner" || !isOrganizationEntitlementActive(context.entitlement))
    return back(request, "error", "Owner authorization with an active entitlement is required.");

  const form = await request.formData();
  const providerKey = value(form, "providerKey");
  const displayName = value(form, "displayName");
  const accountRef = value(form, "accountRef") || null;
  const baseUrl = value(form, "baseUrl") || null;
  const authType = value(form, "authType") || "token";
  const grantedScopes = scopes(value(form, "grantedScopes"));
  const secret = value(form, "secret");

  if (!providerKey || !displayName)
    return back(request, "error", "Provider and connection name are required.");
  if (providerKey === "google_workspace")
    return back(request, "error", "Google Workspace must be connected through Google OAuth.");

  const { data: integration, error } = await context.supabase
    .from("organization_integrations")
    .insert({
      organization_id: context.organizationId,
      provider_key: providerKey,
      display_name: displayName,
      account_ref: accountRef,
      base_url: baseUrl,
      auth_type: authType,
      granted_scopes: grantedScopes,
      status: "disconnected",
      connected_by_user_id: context.user.id,
    })
    .select("id")
    .single();

  if (error || !integration)
    return back(request, "error", error?.message ?? "Integration could not be created.");

  if (secret) {
    const { error: secretError } = await context.supabase.rpc(
      "set_organization_integration_secret_v1",
      { target_integration_id: integration.id, secret_value: secret },
    );
    if (secretError)
      return back(
        request,
        "error",
        `Connection created, but credential could not be stored: ${secretError.message}`,
      );
  }

  return back(request, "message", "Integration connection created.");
}
