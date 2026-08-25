import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeErrorMetadata } from "@/lib/security/redaction";
import { resolveRoutingRollout, type ResolvedRoutingRollout, type RoutingRolloutRow } from "@/lib/ai/routing-rollout";

const CACHE_TTL_MS = 5_000;
const cache = new Map<string, { expiresAt: number; value: ResolvedRoutingRollout }>();

export async function loadRoutingRollout(input: {
  organizationId: string;
  environment: string;
  environmentKillSwitch?: string | boolean | null;
}): Promise<ResolvedRoutingRollout> {
  const cacheKey = `${input.environment}:${input.organizationId}:${String(input.environmentKillSwitch ?? "")}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return resolveRoutingRollout({ ...input, rows: null });
  }

  try {
    const { data, error } = await supabase
      .from("ai_routing_rollout_config")
      .select("scope,environment,organization_id,routing_mode,kill_switch,policy_version");
    if (error) throw error;
    const value = resolveRoutingRollout({ ...input, rows: (data ?? []) as RoutingRolloutRow[] });
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  } catch (error) {
    console.warn("[RYTHM AI Gateway] routing rollout configuration unavailable", safeErrorMetadata(error));
    return resolveRoutingRollout({ ...input, rows: null });
  }
}

export function clearRoutingRolloutCache() {
  cache.clear();
}
