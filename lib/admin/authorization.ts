import "server-only";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export async function getPlatformAdminContext() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: allowed, error } = await supabase.rpc("is_platform_admin");
  if (error || allowed !== true) return null;
  return { supabase, user };
}

export async function requirePlatformAdmin() {
  const context = await getPlatformAdminContext();
  if (!context) throw new Error("PLATFORM_ADMIN_REQUIRED");
  return context;
}
