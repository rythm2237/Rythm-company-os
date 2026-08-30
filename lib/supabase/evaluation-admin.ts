import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role persistence for benchmark evidence tables.
 * Callers MUST authenticate/authorize the initiating user before using this client.
 * Raw benchmark scores are intentionally not writable through the normal authenticated client.
 */
export function createEvaluationAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
