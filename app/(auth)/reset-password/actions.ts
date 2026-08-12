"use server";

import { redirect } from "next/navigation";
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

  await supabase.auth.signOut();
  redirect(`/login?message=${encodeURIComponent("Password updated successfully. Sign in with your new password.")}`);
}
