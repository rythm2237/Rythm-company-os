"use server";

import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!email || !password || fullName.length < 2) {
    redirect(`/signup?error=${encodeURIComponent("Name, email, and password are required.")}`);
  }
  if (password.length < 8) {
    redirect(`/signup?error=${encodeURIComponent("Password must contain at least 8 characters.")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/signup?error=${encodeURIComponent("Passwords do not match.")}`);
  }

  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent("Account could not be created. The email may already be registered.")}`);
  }

  if (data.session && data.user) {
    await supabase.from("customer_profiles").upsert({
      user_id: data.user.id,
      full_name: fullName,
      onboarding_status: "company_pending",
      updated_at: new Date().toISOString(),
    });
    redirect("/setup/company");
  }

  redirect(`/login?message=${encodeURIComponent("Account created. Confirm your email if required, then sign in to provision your company.")}`);
}
