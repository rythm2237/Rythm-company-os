import { NextResponse, type NextRequest } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

function safeInternalPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/command-center";
  return value;
}

function authFailureUrl(origin: string, next: string) {
  const message = "This email link is invalid, expired, or has already been used. Request a fresh link and use the newest email.";
  if (next.startsWith("/reset-password")) {
    return `${origin}/forgot-password?error=${encodeURIComponent(message)}`;
  }
  if (next.startsWith("/setup/company")) {
    return `${origin}/signup/check-email?error=${encodeURIComponent(message)}`;
  }
  return `${origin}/login?error=${encodeURIComponent(message)}`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(authFailureUrl(origin, next));
  }

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("auth_callback_exchange_failed", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    return NextResponse.redirect(authFailureUrl(origin, next));
  }

  return NextResponse.redirect(`${origin}${next}`);
}
