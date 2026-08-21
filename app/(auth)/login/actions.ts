"use server";

import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/command-center");

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Email and password are required.")}`);
  }

  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirect(`/login?error=${encodeURIComponent("Invalid email or password.")}`);
  }

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", data.user.id)
    .limit(1);

  // Authenticated users without a company can explore the read-only demo first.
  // Company creation is an explicit choice, not a login prerequisite.
  if (!memberships?.length) redirect("/demo");

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/command-center";
  redirect(safeNext);
}
