import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeErrorMetadata } from "@/lib/security/redaction";
import { resolveRoutingRollout, type ResolvedRoutingRollout, type RoutingRolloutRow } from "@/lib/ai/routing-rollout";
import type { AiGatewayFeature } from "@/lib/ai/gateway-contracts";

const CACHE_TTL_MS = 5_000;
const cache = new Map<string, { expiresAt: number; value: ResolvedRoutingRollout }>();

export async function loadRoutingRollout(input: {
  organizationId: string;
  environment: string;
  feature?: AiGatewayFeature;
  environmentKillSwitch?: string | boolean | null;
}): Promise<ResolvedRoutingRollout> {
  const cacheKey = `${input.environment}:${input.organizationId}:${input.feature ?? "generic"}:${String(input.environmentKillSwitch ?? "")}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return resolveRoutingRollout({ ...input, rows: null });
  }

  try {
    const [genericResult, featureResult] = await Promise.all([
      supabase.from("ai_routing_rollout_config").select("scope,environment,organization_id,routing_mode,kill_switch,policy_version"),
      input.feature
        ? supabase.from("ai_routing_feature_rollout_config").select("request_feature,scope,environment,organization_id,routing_mode,kill_switch,policy_version").eq("request_feature", input.feature)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (genericResult.error) throw genericResult.error;
    if (featureResult.error) throw featureResult.error;
    const rows = [
      ...(genericResult.data ?? []),
      ...(featureResult.data ?? []),
    ] as RoutingRolloutRow[];
    const value = resolveRoutingRollout({ ...input, requestFeature: input.feature, rows });
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
