import assert from "node:assert/strict";
import Module from "node:module";
import { canStartProviderSetup, initialSetupProvider, providerAvailabilityLabel } from "../lib/integrations/connections/availability";

async function main() {
  const providers = [
    { provider_key: "planned", setup_availability: "coming_later" },
    { provider_key: "token", setup_availability: "setup_available" },
    { provider_key: "oauth", setup_availability: "available" },
  ];
  assert.equal(initialSetupProvider(providers)?.provider_key, "token");
  assert.equal(initialSetupProvider(providers, "planned")?.provider_key, "token");
  assert.equal(initialSetupProvider(providers, "oauth")?.provider_key, "oauth");
  assert.equal(initialSetupProvider([providers[0]]), undefined);
  assert.equal(providerAvailabilityLabel(providers[0]), "Coming later");
  for (const value of [undefined, null, "coming_later", "unknown"]) {
    assert.equal(canStartProviderSetup({ setup_availability: value }), false);
  }

  // Invoke the server action with a forged form. Rejected availability must stop
  // before any integration, setup session or audit write, even for an owner.
  const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  let availability: string | null = "coming_later";
  let writes = 0;
  const redirectError = new Error("redirect");
  let destination = "";
  const query = {
    select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: { provider_key: "planned", setup_availability: availability } }; },
    insert() { writes++; throw new Error("Unavailable setup attempted a write"); },
  };
  loader._load = function(id, ...args) {
    if (id === "next/navigation") return { redirect(url: string) { destination = url; throw redirectError; } };
    if (id === "next/cache") return { revalidatePath() {} };
    if (id.includes("auth/organization-context")) return { async requireActiveOwnerOrganizationContext() { return { organizationId: "test-org", user: { id: "test-owner" }, supabase: { from() { return query; } } }; } };
    if (id.includes("connections/providers") || id.includes("connections/provider-credentials") || id.includes("integrations/service-runner") || id.includes("connections/setup-plans")) return {};
    if (id === "server-only") return {};
    return original.call(this, id, ...args);
  };
  try {
    const { createCustomerIntegration } = await import("../app/(app)/integrations/customer-actions");
    for (const value of ["coming_later", "unknown", null]) {
      availability = value;
      const form = new FormData();
      form.set("providerKey", "planned"); form.set("displayName", "Forged setup"); form.set("projectId", "test-project");
      await assert.rejects(createCustomerIntegration(form), error => error === redirectError);
      assert.match(decodeURIComponent(destination), /not available for customer setup/);
      assert.match(destination, /project=test-project/);
      assert.equal(writes, 0);
    }
  } finally { loader._load = original; }
  console.log("PASS unavailable/unknown provider setup denied before writes; safe initial selection; project context retained.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
