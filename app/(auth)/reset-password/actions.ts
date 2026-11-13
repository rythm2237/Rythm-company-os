"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { endSession } from "@/lib/auth/logout";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    redirect(`/reset-password?error=${encodeURIComponent("Password must contain at least 8 characters.")}`);
  }

  if (password !== confirmPassword) {
    redirect(`/reset-password?error=${encodeURIComponent("Passwords do not match.")}`);
  }

  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?error=${encodeURIComponent("Password reset session is missing or expired. Request a new reset link.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("password_update_failed", {
      userId: user.id,
      status: error.status,
      code: error.code,
      message: error.message,
    });
    redirect(`/reset-password?error=${encodeURIComponent("Password could not be updated. Request a new reset link and try again.")}`);
  }

  // Password changes intentionally revoke all sessions, but cleanup remains bounded.
  const jar = await cookies();
  const { revoked, cookieNames } = await endSession({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    cookies: jar.getAll(), scope: "global",
  });
  for (const name of [...cookieNames, "rythm_active_org"]) jar.set(name, "", { path: "/", maxAge: 0, expires: new Date(0) });
  const message = revoked ? "Password updated successfully. Sign in with your new password." : "Password updated and signed out on this device. Remote session revocation could not be confirmed. Sign in with your new password.";
  redirect(`/login?message=${encodeURIComponent(message)}`);
}
