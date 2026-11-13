import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

function redirectTo(request: NextRequest, path: "/home" | "/login", error?: string) {
  const url = new URL(path, request.url);
  if (error) url.searchParams.set("error", error);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function POST(request: NextRequest) {
  // A full document navigation discards the previous organization's RSC/router
  // cache. The database RPC remains the sole authority for tenant selection.
  if (request.headers.get("origin") !== request.nextUrl.origin ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Same-origin request required." }, {
      status: 403, headers: { "Cache-Control": "no-store" },
    });
  }
  let form: FormData;
  try { form = await request.formData(); }
  catch { return redirectTo(request, "/home", "Invalid organization selection."); }
  const organizationId = String(form.get("organizationId") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
    return redirectTo(request, "/home", "Organization selection is required.");
  }
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirectTo(request, "/login");
  const { data, error } = await supabase.rpc("set_active_organization", { target_org_id: organizationId });
  if (error || String(data ?? "") !== organizationId) {
    return redirectTo(request, "/home", "You are not authorized for that organization.");
  }
  const response = redirectTo(request, "/home");
  response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
