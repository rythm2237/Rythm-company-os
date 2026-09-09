import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import {
  GOOGLE_SEARCH_CONSOLE_SCOPE,
  googleOAuthServerCredentials,
  signGoogleSearchConsoleState,
} from "@/lib/admin/integrations/google-search-console";

function back(request: Request, message: string) {
  const url = new URL("/admin/automation", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ error: "Cross-origin request denied." }, { status: 403 });
  const context = await getPlatformAdminContext();
  if (!context) return NextResponse.redirect(new URL("/login", request.url), 303);

  let clientId: string;
  try {
    ({ clientId } = googleOAuthServerCredentials());
  } catch (error) {
    return back(request, error instanceof Error ? error.message : "Google OAuth is not configured.");
  }

  const state = signGoogleSearchConsoleState({
    purpose: "platform_google_search_console_v1",
    userId: context.user.id,
    nonce: crypto.randomBytes(24).toString("base64url"),
    issuedAt: Date.now(),
  });
  const requestOrigin = new URL(request.url).origin;
  // Reuse the established Google OAuth callback URI so no duplicate OAuth client is required.
  const redirectUri = `${requestOrigin}/api/integrations/google-workspace/callback`;
  const consentUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  consentUrl.searchParams.set("client_id", clientId);
  consentUrl.searchParams.set("redirect_uri", redirectUri);
  consentUrl.searchParams.set("response_type", "code");
  consentUrl.searchParams.set("scope", GOOGLE_SEARCH_CONSOLE_SCOPE);
  consentUrl.searchParams.set("access_type", "offline");
  consentUrl.searchParams.set("prompt", "consent");
  consentUrl.searchParams.set("include_granted_scopes", "false");
  consentUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(consentUrl, 303);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/integrations/google-workspace",
    maxAge: 10 * 60,
  };
  response.cookies.set("rythm_gsc_oauth_state", state, cookieOptions);
  response.cookies.set("rythm_gsc_oauth_user", context.user.id, cookieOptions);
  return response;
}
