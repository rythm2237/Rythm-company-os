import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(path:string)=>readFileSync(path,"utf8");
const code=read("lib/integrations/connections/google-connection-reconciliation.ts");
const dispatch=read("app/api/projects/dispatch/route.ts");
const existingProvider=read("lib/integrations/connections/provider-credentials.ts");
for(const required of [
  "get_organization_integration_secret_service_v1",
  "resolveProviderCredential",
  "discoverGoogleResources",
  '.eq("organization_id", organizationId)',
  '.eq("organization_id", organizationId)',
  "integration_resources",
  "last_health_check_at",
  "bound_property_not_accessible",
  "reauth_required",
  "resource_sync_failed",
])assert.ok(code.includes(required),"Missing Google reconciliation guard: "+required);
assert.ok(dispatch.includes('GOOGLE_CONNECTION_REPAIR_ENABLED === "true"'),"Recheck must be opt-in only");
assert.ok(dispatch.includes('GOOGLE_CONNECTION_REPAIR_ORG_ID'),"Recheck must be tenant scoped");
assert.ok(dispatch.includes("reconcileGoogleConnections(service, googleRepairOrganizationId)"));
assert.ok(existingProvider.includes("refreshGoogle(refreshToken)"),"Refresh token path must exist");
assert.ok(!code.includes("console.log(accessToken)"),"OAuth token must not be logged");
assert.ok(!code.includes("metadata: { verification_result: "), "Do not overwrite original provider verification evidence");
assert.ok(!code.includes("grant execute")&&!code.includes("http_post"),"Read-only provider verification must not create external actions");
console.log("Google provider health reconciliation guard validation passed");
