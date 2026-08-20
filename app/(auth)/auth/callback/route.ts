import { NextResponse, type NextRequest } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

function safeInternalPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/command-center";
  return value;
}

function authFailureUrl(origin: string, next: string, flow: string | null) {
  const message = flow === "oauth"
    ? "Social sign-in could not be completed. Try again or use email and password."
    : "This email link is invalid, expired, or has already been used. Request a fresh link and use the newest email.";

  if (next.startsWith("/reset-password")) {
    return `${origin}/forgot-password?error=${encodeURIComponent(message)}`;
  }
  if (next.startsWith("/setup/company") && flow !== "oauth") {
    return `${origin}/signup/check-email?error=${encodeURIComponent(message)}`;
  }
  return `${origin}/login?error=${encodeURIComponent(message)}`;
}

function oauthDisplayName(user: { email?: string | null; user_metadata?: Record<string, unknown> }) {
  const metadata = user.user_metadata ?? {};
  const candidate = metadata.full_name ?? metadata.name ?? metadata.preferred_username;
  const name = typeof candidate === "string" ? candidate.trim() : "";
  if (name) return name.slice(0, 120);
  const localPart = user.email?.split("@")[0]?.trim();
  return (localPart || "Human CEO").slice(0, 120);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const flow = request.nextUrl.searchParams.get("flow");
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(authFailureUrl(origin, next, flow));
  }

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("auth_callback_exchange_failed", {
      status: error.status,
      code: error.code,
      message: error.message,
      flow,
    });
    return NextResponse.redirect(authFailureUrl(origin, next, flow));
  }

  if (flow === "oauth") {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("oauth_callback_user_missing", {
        status: userError?.status ?? null,
        code: userError?.code ?? null,
        message: userError?.message ?? "No authenticated user after OAuth exchange.",
      });
      return NextResponse.redirect(authFailureUrl(origin, next, flow));
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1);

    if (membershipError) {
      console.error("oauth_membership_lookup_failed", {
        code: membershipError.code,
        message: membershipError.message,
      });
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Your account was authenticated, but organization access could not be verified. Try again.")}`);
    }

    if (memberships?.length) {
      const destination = next.startsWith("/setup/company") ? "/command-center" : next;
      return NextResponse.redirect(`${origin}${destination}`);
    }

    const { error: profileError } = await supabase.from("customer_profiles").upsert({
      user_id: user.id,
      full_name: oauthDisplayName(user),
      onboarding_status: "company_pending",
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      console.error("oauth_profile_upsert_failed", {
        code: profileError.code,
        message: profileError.message,
      });
    }

    const onboardingDestination = next.startsWith("/setup/company") ? next : "/setup/company";
    return NextResponse.redirect(`${origin}${onboardingDestination}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
