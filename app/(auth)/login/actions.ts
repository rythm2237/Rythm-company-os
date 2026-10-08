"use server";

import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/home");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/home";

  if (!email || !password) {
    redirect(`/login?next=${encodeURIComponent(safeNext)}&error=${encodeURIComponent("Email and password are required.")}`);
  }

  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirect(`/login?next=${encodeURIComponent(safeNext)}&error=${encodeURIComponent("Invalid email or password.")}`);
  }

  const { data: organizations, error: organizationError } = await supabase.rpc("list_my_organizations");
  if (organizationError) {
    redirect(`/login?force=1&next=${encodeURIComponent(safeNext)}&error=${encodeURIComponent("Organization access could not be checked. Please try again.")}`);
  }

  if (!organizations?.length) {
    redirect(`/login?force=1&next=${encodeURIComponent(safeNext)}&error=${encodeURIComponent("This account is signed in, but it is not connected to a RYTHM company. Sign in with the account that owns or belongs to your company. New customers should use Get Started.")}`);
  }

  redirect(safeNext);
}
