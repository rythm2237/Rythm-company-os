import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { discoverGoogleResources } from "@/lib/integrations/connections/providers";
import { resolveProviderCredential } from "@/lib/integrations/connections/provider-credentials";

type ProviderKey = "google_search_console" | "google_analytics";
type Integration = {
  id: string;
  organization_id: string;
  provider_key: ProviderKey;
  status: string;
  enabled: boolean;
  last_health_check_at: string | null;
};
type Result = {
  provider: ProviderKey;
  integrationId: string;
  outcome: "verified" | "reauth_required" | "needs_attention" | "skipped";
  discoveredResources?: number;
  properties?: Array<{ type: string; id: string; name: string }>;
  reason?: string;
};

const eligible = new Set<ProviderKey>(["google_search_console", "google_analytics"]);
const cooldownMillis = 60 * 60 * 1000;

/**
 * Temporary operator-authorized, read-only Google provider reconciliation.
 * Uses the existing server-side Vault/OAuth implementation: credentials never
 * leave the server and cannot be returned to the dispatcher response.
 * Restricted to a single explicitly selected tenant using environment config.
 */
export async function reconcileGoogleConnections(
  service: SupabaseClient,
  organizationId: string,
  now = new Date(),
): Promise<Result[]> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(organizationId))
    throw new Error("Valid organization scope required");
  const { data, error } = await service.from("organization_integrations")
    .select("id,organization_id,provider_key,status,enabled,last_health_check_at")
    .eq("organization_id", organizationId)
    .eq("enabled", true)
    .in("provider_key", ["google_search_console", "google_analytics"])
    .limit(10);
  if (error) throw new Error("Unable to list scoped Google integrations");

  const results: Result[] = [];
  for (const connection of (data ?? []) as Integration[]) {
    const key = connection.provider_key;
    if (connection.organization_id !== organizationId || !eligible.has(key)) continue;
    const checked = connection.last_health_check_at ? Date.parse(connection.last_health_check_at) : 0;
    if (Number.isFinite(checked) && now.getTime() - checked < cooldownMillis) {
      results.push({ provider: key, integrationId: connection.id, outcome: "skipped", reason: "Recently checked" });
      continue;
    }
    const stamp = now.toISOString();
    try {
      const { data: secret, error: secretError } = await service.rpc(
        "get_organization_integration_secret_service_v1",
        { target_integration_id: connection.id },
      );
      if (secretError || !secret || typeof secret !== "string")
        throw new Error("credential_unavailable");
      const accessToken = await resolveProviderCredential({
        service,
        integrationId: connection.id,
        providerKey: key,
        storedSecret: secret,
      });
      const discovered = await discoverGoogleResources(key, accessToken);
      if (discovered.length === 0) throw new Error("no_accessible_properties");
      const rows = discovered.filter(resource => resource.resourceId && resource.resourceType).map(resource => ({
        organization_id: organizationId,
        integration_id: connection.id,
        provider_key: key,
        resource_type: resource.resourceType,
        resource_id: resource.resourceId,
        resource_name: resource.resourceName,
        resource_metadata: resource.metadata ?? {},
        available: true,
        last_verified_at: stamp,
      }));
      const { error: resourceError } = await service.from("integration_resources")
        .upsert(rows, { onConflict: "integration_id,resource_type,resource_id" });
      if (resourceError) throw new Error("resource_sync_failed");

      // A Search Console property must be visible in the live API before
      // re-asserting a verified legacy binding for that site.
      if (key === "google_search_console") {
        const {data: linked, error: linkedError} = await service
          .from("agency_seo_provider_bindings")
          .select("integration_resource_id,integration_resources!inner(resource_id)")
          .eq("organization_id", organizationId)
          .eq("provider_key", key);
        if (linkedError) throw new Error("site_binding_inspection_failed");
        const returned = new Set(rows.map(row => row.resource_id));
        const missing = (linked ?? []).some(item => {
          const property = (item as {integration_resources?: { resource_id?: string } | Array<{resource_id?: string}>}).integration_resources;
          const id = Array.isArray(property) ? property[0]?.resource_id : property?.resource_id;
          return Boolean(id && !returned.has(id));
        });
        if (missing) throw new Error("bound_property_not_accessible");
      }

      const { error: healthError } = await service.from("organization_integrations").update({
        status: "connected", last_health_check_at: stamp, last_verified_at: stamp,
        last_error_at: null, last_error_code: null, last_error_message: null,
        updated_at: stamp,
      }).eq("id", connection.id).eq("organization_id", organizationId);
      if (healthError) throw new Error("health_status_persistence_failed");

      results.push({
        provider: key, integrationId: connection.id,
        outcome: "verified", discoveredResources: rows.length,
        properties: rows.map(row => ({ type: row.resource_type, id: row.resource_id, name: row.resource_name })).slice(0, 30),
      });
    } catch (error) {
      const failure = error instanceof Error ? error.message : "provider_error";
      const requiresReauth = /reauthori[sz]|expired|invalid_grant|rejected the OAuth credential|401|credential_unavailable/i.test(failure);
      const reason = requiresReauth ? "reauth_required" : failure === "no_accessible_properties"
        ? "no_accessible_properties" : failure === "bound_property_not_accessible"
          ? "bound_property_not_accessible" : "provider_verification_failed";
      const { error: updateError } = await service.from("organization_integrations").update({
        status: requiresReauth ? "reauth_required" : "needs_attention",
        last_health_check_at: stamp, last_error_at: stamp,
        last_error_code: reason,
        last_error_message: "Google provider read-only verification did not complete. Check authorization and property access.",
        updated_at: stamp,
      }).eq("id", connection.id).eq("organization_id", organizationId);
      if (updateError) console.error("google_reconcile_status_persistence_failed", { provider: key, integrationId: connection.id });
      results.push({ provider: key, integrationId: connection.id,
        outcome: requiresReauth ? "reauth_required" : "needs_attention", reason });
    }
  }
  return results;
}
