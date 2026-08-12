import { NextResponse, type NextRequest } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

function safeInternalPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/command-center";
  return value;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Authentication link is invalid or expired.")}`,
    );
  }

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("auth_callback_exchange_failed", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Authentication link is invalid or expired. Request a new link.")}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
