"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authCallbackOrigin } from "@/lib/auth/redirect";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    redirect(`/forgot-password?error=${encodeURIComponent("Email is required.")}`);
  }

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${authCallbackOrigin(process.env, (await headers()).get("host") ?? undefined)}/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error("password_reset_request_failed", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
  }

  // Do not reveal whether an account exists for the supplied email.
  redirect(`/forgot-password?message=${encodeURIComponent("If an account exists for that email, a password reset link has been sent.")}`);
}
