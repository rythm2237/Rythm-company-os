import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adapter = readFileSync("lib/integrations/adapters/generic-business-api.ts", "utf8");
const providerAdapters = readFileSync("lib/integrations/adapters/provider-adapters.ts", "utf8");
const registry = readFileSync("lib/integrations/registry.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260828113000_generic_business_api_adapter_contract.sql", "utf8");

const mustContain = (source: string, values: string[]) =>
  values.forEach((value) => assert.ok(source.includes(value), `Missing Phase 4 adapter contract: ${value}`));

mustContain(adapter, [
  'const TOOL_ID = "generic_business_api.request"',
  'new URL(context.baseUrl)',
  'validatePublicHttpUrl',
  'target.origin !== base.origin',
  'path.startsWith("//")',
  'WRITE_METHODS = new Set(["POST", "PUT", "PATCH"])',
  'Authorization: `Bearer ${context.credential}`',
  'headers["Idempotency-Key"] = context.idempotencyKey',
  'redirect',
]);

assert.ok(!adapter.includes('method = "DELETE"'), "Generic connector must not expose arbitrary DELETE in v1");
assert.ok(!adapter.includes("input.url"), "Request input must not be able to replace the configured base URL");
assert.ok(!adapter.includes("input.baseUrl"), "Request input must not be able to replace the configured base URL");

mustContain(providerAdapters, [
  'GENERIC_BUSINESS_API_ADAPTER',
  'generic_business_api: GENERIC_BUSINESS_API_ADAPTER',
]);

mustContain(registry, [
  '"generic_business_api.request"',
  'integrationId: "generic_business_api"',
  '"api.read"',
  '"api.write"',
  '"webhook.send"',
  'defaultMode: "simulate"',
]);

assert.ok(registry.includes('risk: "high"'), "Generic writes must be high risk");
assert.ok(registry.includes('userPermission: "privileged"'), "Generic writes must require privileged user authority");
assert.ok(!registry.includes('"file.exchange":'), "File exchange must not be runtime-wired in v1");

mustContain(migration, [
  "tool_id = 'generic_business_api.request'",
  "adapter_version = 'generic-business-api-v1'",
  "set enabled = false",
  "where provider_key = 'generic_business_api'",
]);
assert.ok(!migration.includes("set enabled = true"), "Generic provider must stay fail-closed before Production validation");

console.log("Phase 4 Generic Business API adapter security contract validation passed.");
