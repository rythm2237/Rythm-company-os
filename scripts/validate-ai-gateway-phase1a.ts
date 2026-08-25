import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DIRECT_PROVIDER_INVENTORY } from "../lib/ai/direct-provider-inventory";
import { AiGatewayError, normalizeAiGatewayError } from "../lib/ai/gateway-errors";
import { getAgentProviderAdapter } from "../lib/ai/agent-provider";
import { getProviderEligibility } from "../lib/ai/provider-eligibility";
import { validateAiGatewayRequest } from "../lib/ai/request-gateway";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("OpenAI is the only production-approved provider", () => {
  const env = { NODE_ENV: "test", OPENAI_API_KEY: "configured", ANTHROPIC_API_KEY: "configured", GEMINI_API_KEY: "configured" } satisfies NodeJS.ProcessEnv;
  assert.equal(getProviderEligibility("openai", "production", env).eligible, true);
  const anthropic = getProviderEligibility("anthropic", "production", env);
  const google = getProviderEligibility("google", "production", env);
  assert.equal(anthropic.eligible, false);
  assert.equal(google.eligible, false);
  assert.ok(anthropic.reasonCodes.includes("provider_not_production_approved"));
  assert.ok(google.reasonCodes.includes("provider_not_production_approved"));
});

test("registered providers may be environment-enabled outside production", () => {
  const env = { NODE_ENV: "test", ANTHROPIC_API_KEY: "configured", GEMINI_API_KEY: "configured" } satisfies NodeJS.ProcessEnv;
  assert.equal(getProviderEligibility("anthropic", "preview", env).eligible, true);
  assert.equal(getProviderEligibility("google", "development", env).eligible, true);
});

test("missing provider credentials keep a provider ineligible", () => {
  const result = getProviderEligibility("openai", "production", { NODE_ENV: "test" });
  assert.equal(result.registered, true);
  assert.equal(result.technicallySupported, true);
  assert.equal(result.productionApproved, true);
  assert.equal(result.environmentEnabled, false);
  assert.equal(result.eligible, false);
});

test("gateway errors redact credentials and expose safe classifications", () => {
  const error = normalizeAiGatewayError(new Error("request failed authorization=Bearer super-secret-token"));
  assert.equal(error instanceof AiGatewayError, true);
  assert.equal(error.message.includes("super-secret-token"), false);
  assert.equal(normalizeAiGatewayError(new Error("provider returned 429 rate limit")).code, "rate_limited");
  assert.equal(normalizeAiGatewayError(new Error("AbortError timed out")).code, "timeout");
  assert.equal(normalizeAiGatewayError(new Error("request blocked by budget")).code, "policy_denied");
});

test("correlation identifiers use UUID-compatible values", () => {
  assert.match(randomUUID(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("all registered providers resolve through the adapter boundary", () => {
  assert.equal(getAgentProviderAdapter("openai").id, "openai");
  assert.equal(getAgentProviderAdapter("anthropic").id, "anthropic");
  assert.equal(getAgentProviderAdapter("google").id, "google");
});

test("canonical Gateway rejects requests without tenant context before provider execution", () => {
  assert.throws(
    () => validateAiGatewayRequest({
      organizationId: "",
      actor: { type: "user", userId: "00000000-0000-0000-0000-000000000001" },
      feature: "agent.console",
      prompt: "Status",
      systemInstructions: "Remain advisory.",
    }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "invalid_request" && error.retryable === false,
  );
});

test("canonical Gateway rejects malformed correlation identifiers", () => {
  assert.throws(
    () => validateAiGatewayRequest({
      organizationId: "00000000-0000-4000-8000-000000000001",
      correlationId: "not-a-uuid",
      actor: { type: "system" },
      feature: "internal.unspecified",
      prompt: "Status",
      systemInstructions: "Remain advisory.",
    }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "invalid_request",
  );
});

const providerPattern = /(?:from\s+["']openai["']|api\.anthropic\.com|generativelanguage\.googleapis\.com|from\s+["']@ai-sdk\/gateway["']|from\s+["']ai["'])/;
const legacyBoundaryPattern = /from\s+["'][^"']*ai\/agent-provider["']/;
const LEGACY_BOUNDARY_CALLERS = [
  "app/(app)/studio/agents/[id]/run/actions.ts",
  "app/(app)/studio/agents/actions.ts",
  "app/(app)/studio/agents/master-generate-actions.ts",
  "lib/ai/request-gateway.ts",
  "lib/company-knowledge.ts",
  "lib/trusted-agent-knowledge.ts",
  "lib/trusted-specialization-acquisition.ts",
].sort();

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

test("direct-provider inventory is complete and blocks unidentified call sites", () => {
  const root = process.cwd();
  const discovered = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "lib"))]
    .filter((path) => providerPattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .sort();
  const inventoried = DIRECT_PROVIDER_INVENTORY.map((item) => item.path).sort();
  assert.deepEqual(discovered, inventoried);
  for (const item of DIRECT_PROVIDER_INVENTORY) {
    assert.equal(existsSync(join(root, item.path)), true, `Missing inventoried path: ${item.path}`);
    assert.ok(item.reason.trim().length >= 20, `Missing reason for ${item.path}`);
    assert.ok(item.futurePath.trim().length >= 20, `Missing future path for ${item.path}`);
  }
});

test("temporary exceptions are limited to the approved Phase 1 list", () => {
  const exceptions = DIRECT_PROVIDER_INVENTORY
    .filter((item) => item.disposition === "temporary_exception")
    .map((item) => item.path)
    .sort();
  assert.deepEqual(exceptions, [
    "app/(app)/studio/agents/[id]/run/actions.ts",
    "app/api/runtime/execute-validation/route.ts",
    "lib/evaluation/promotion.ts",
    "lib/evaluation/runtime.ts",
  ]);
});

test("legacy AI wrapper callers are frozen so new capabilities must use the Gateway", () => {
  const root = process.cwd();
  const discovered = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "lib"))]
    .filter((path) => legacyBoundaryPattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(discovered, LEGACY_BOUNDARY_CALLERS);
});

test("there are no unidentified deprecated or dead provider paths", () => {
  assert.equal(DIRECT_PROVIDER_INVENTORY.some((item) => item.disposition === "deprecated_dead_path"), false);
});

console.log("Phase 1A AI Request Gateway boundary validation passed.");
