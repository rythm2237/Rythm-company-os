"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { endSession } from "@/lib/auth/logout";

export async function logout() {
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Sign out is temporarily unavailable.");
  const { cookieNames } = await endSession({ url, key, cookies: store.getAll() });
  for (const name of [...cookieNames, "rythm_active_org"]) store.set(name, "", { path: "/", maxAge: 0 });
  redirect("/login");
}
