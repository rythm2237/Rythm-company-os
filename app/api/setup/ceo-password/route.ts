import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CEO_USER_ID = "30f4573e-e045-4740-b8d9-8bd7b592df46";

function redirectWithMessage(request: NextRequest, key: "error" | "message", value: string) {
  const url = request.nextUrl.clone();
  url.pathname = key === "message" ? "/login" : "/setup/ceo-password";
  url.search = "";
  url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const setupToken = String(formData.get("setupToken") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const expectedToken = process.env.RYTHM_SETUP_TOKEN;

  if (!expectedToken || setupToken !== expectedToken) {
    return redirectWithMessage(request, "error", "Invalid or missing setup token.");
  }

  if (password.length < 12) {
    return redirectWithMessage(request, "error", "Password must contain at least 12 characters.");
  }

  if (password !== confirmation) {
    return redirectWithMessage(request, "error", "Passwords do not match.");
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return redirectWithMessage(request, "error", "Server administration client is not configured.");
  }

  const { error } = await supabase.auth.admin.updateUserById(CEO_USER_ID, {
    password,
    email_confirm: true,
  });

  if (error) {
    return redirectWithMessage(request, "error", error.message);
  }

  return redirectWithMessage(
    request,
    "message",
    "CEO password updated. Sign in with the new password.",
  );
}
