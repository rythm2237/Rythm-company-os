import { createClient } from "@supabase/supabase-js";

export function createServerSupabaseClient() {
  if (typeof window !== "undefined") throw new Error("Privileged Supabase client is server-only.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
