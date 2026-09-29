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

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", data.user.id)
    .limit(1);
  if (membershipError) {
    redirect(`/login?next=${encodeURIComponent(safeNext)}&error=${encodeURIComponent("Organization access could not be checked. Please try again.")}`);
  }

  // Authenticated users without a company can explore the read-only demo first.
  // Company creation is an explicit choice, not a login prerequisite.
  if (!memberships?.length) redirect(safeNext.startsWith("/setup/company") ? safeNext : "/demo");

  redirect(safeNext);
}
