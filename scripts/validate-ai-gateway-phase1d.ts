import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeAiRequest } from "../lib/ai/request-gateway";
import { resolveRoutingRollout, type RoutingMode } from "../lib/ai/routing-rollout";
import { DIRECT_PROVIDER_INVENTORY } from "../lib/ai/direct-provider-inventory";
import type { AiGatewayRequest } from "../lib/ai/gateway-contracts";
import type { RunAgentInput } from "../lib/ai/agent-provider";
import type { RoutingDecision } from "../lib/ai/routing-types";

let passed = 0;
async function test(name: string, action: () => void | Promise<void>) {
  await action();
  passed += 1;
  console.log(`✓ ${name}`);
}

const organizationId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function decision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    requestId: "00000000-0000-4000-8000-000000000004",
    language: "en", detectedLanguages: ["en"], responseLanguage: "en", intent: "summarization", intentTaxonomyVersion: "rythm-intents-v1", taskType: "summarization", operation: "read",
    complexity: "medium", risk: "low", reasoningRequirement: "medium", reasoningDepth: "standard", requiredTools: [], unavailableTools: [], requiredCapabilities: ["standard"],
    requiredModalities: ["text"], contextRequirements: ["boardroom"], estimatedInputTokens: 100, latencyPreference: "normal", authorizationSignal: "not_required", humanReviewRequired: false,
    recommendedCapabilityTier: "standard", recommendedTier: "terra", reasonCodes: ["MEDIUM_COMPLEXITY", "BOARDROOM_CONTEXT_REQUIRED"], reasonSummary: "medium complexity", confidence: 0.95, allowEscalation: true,
    classificationSource: "deterministic", classifierVersion: "request-intelligence-v2.0.0", selectedCapabilityTier: "standard", selectedTier: "terra", selectedProvider: "openai", selectedModel: "gpt-test-terra", reasoningLevel: "medium",
    estimatedCostUsd: 0.003, estimatedLatencyMs: 1200, escalationIndex: 0, escalationReasons: [], routingVersion: "adaptive-router-v2.0.0", policyVersion: "adaptive-policy-v2.0.0", modelRegistryVersion: "test-registry-v2",
    ...overrides,
  };
}

function request(overrides: Partial<AiGatewayRequest> = {}): AiGatewayRequest {
  return {
    organizationId,
    actor: { type: "user", userId },
    feature: "boardroom.summary",
    prompt: "Summarize this governed meeting.",
    systemInstructions: "Human CEO remains final authority.",
    legacyFallback: { provider: "openai", model: "legacy-openai", reason: "compatibility" },
    telemetryPolicy: "required",
    ...overrides,
  };
}

const rollout = (mode: RoutingMode) => async () => ({ mode, source: "organization" as const, policyVersion: "phase1d-test", killSwitchActive: false, reasonCodes: ["feature_organization_routing_mode"] });

async function main() {
  process.env.VERCEL_ENV = "production";
  process.env.OPENAI_API_KEY = "phase-1d-test-key";

  await test("all five approved Production targets are classified as Gateway migrated", () => {
    assert.deepEqual(DIRECT_PROVIDER_INVENTORY.filter((item) => item.disposition === "gateway_migrated").map((item) => item.path).sort(), [
      "app/api/meetings/deliberate/route.ts",
      "app/api/meetings/legal-review/route.ts",
      "app/api/meetings/legal-triage/route.ts",
      "app/api/meetings/summarize/route.ts",
      "lib/company-library-ingestion.ts",
    ]);
  });

  await test("only the four explicitly approved temporary exceptions remain", () => {
    assert.deepEqual(DIRECT_PROVIDER_INVENTORY.filter((item) => item.disposition === "temporary_exception").map((item) => item.path).sort(), [
      "app/(app)/studio/agents/[id]/run/actions.ts",
      "app/api/runtime/execute-validation/route.ts",
      "lib/evaluation/promotion.ts",
      "lib/evaluation/runtime.ts",
    ]);
  });

  await test("migrated modules use the Gateway and contain no direct-provider execution", () => {
    for (const item of DIRECT_PROVIDER_INVENTORY.filter((entry) => entry.disposition === "gateway_migrated")) {
      const source = readFileSync(item.path, "utf8");
      assert.match(source, /executeAiRequest/);
      assert.doesNotMatch(source, /from\s+["']openai["']|responses\.create|api\.anthropic\.com|generativelanguage\.googleapis\.com/);
    }
  });

  await test("feature rollout overrides generic modes narrowly and preserves organization precedence", () => {
    const rows = [
      { request_feature: null, scope: "global", environment: null, organization_id: null, routing_mode: "off", kill_switch: false, policy_version: "generic" },
      { request_feature: "boardroom.summary", scope: "global", environment: null, organization_id: null, routing_mode: "shadow", kill_switch: false, policy_version: "feature-global" },
      { request_feature: "boardroom.summary", scope: "organization", environment: null, organization_id: organizationId, routing_mode: "enforced", kill_switch: false, policy_version: "feature-org" },
    ];
    const summary = resolveRoutingRollout({ rows, environment: "production", organizationId, requestFeature: "boardroom.summary" });
    const legal = resolveRoutingRollout({ rows, environment: "production", organizationId, requestFeature: "boardroom.legal_review" });
    assert.equal(summary.mode, "enforced");
    assert.equal(summary.policyVersion, "feature-org");
    assert.equal(legal.mode, "off");
  });

  await test("an applicable feature kill switch fails closed", () => {
    const result = resolveRoutingRollout({ environment: "production", organizationId, requestFeature: "boardroom.summary", rows: [
      { request_feature: "boardroom.summary", scope: "global", environment: null, organization_id: null, routing_mode: "enforced", kill_switch: true, policy_version: "feature" },
    ] });
    assert.equal(result.mode, "off");
    assert.equal(result.killSwitchActive, true);
  });

  await test("Gateway sends the exact feature into rollout resolution", async () => {
    let feature = "";
    await executeAiRequest(request(), {
      loadRollout: async (input) => { feature = input.feature; return rollout("off")(); },
      execute: async () => ({ outputText: "summary", providerLatencyMs: 1, routingDecision: decision(), fallbackUsed: true, executionPolicy: "legacy_fallback" }),
      telemetryWriter: async () => {},
    });
    assert.equal(feature, "boardroom.summary");
  });

  await test("shadow comparison executes one provider request and records one outcome", async () => {
    let providerCalls = 0;
    let telemetryCalls = 0;
    const response = await executeAiRequest(request(), {
      loadRollout: rollout("shadow"),
      evaluateRouting: () => decision({ selectedModel: "proposed-openai" }),
      execute: async (input) => {
        providerCalls += 1;
        const actual = decision({ selectedModel: "legacy-openai" });
        await input.onRoutingDecision?.(actual);
        return { outputText: "summary", providerLatencyMs: 2, routingDecision: actual, fallbackUsed: true, executionPolicy: "legacy_fallback" };
      },
      telemetryWriter: async () => { telemetryCalls += 1; },
    });
    assert.equal(providerCalls, 1);
    assert.equal(telemetryCalls, 1);
    assert.equal(response.proposedRoutingDecision?.selectedModel, "proposed-openai");
    assert.equal(response.routingDecision.selectedModel, "legacy-openai");
  });

  await test("enforced routing failure never invokes the compatibility provider fallback", async () => {
    let providerCalls = 0;
    await assert.rejects(executeAiRequest(request(), {
      loadRollout: rollout("enforced"),
      evaluateRouting: () => { throw new Error("No eligible model"); },
      execute: async () => { providerCalls += 1; throw new Error("must not execute"); },
      telemetryWriter: async () => {},
    }));
    assert.equal(providerCalls, 0);
  });

  await test("document ingestion forwards fail-closed attachment handling", async () => {
    let received: RunAgentInput | null = null;
    await executeAiRequest(request({ feature: "company.document_extraction", attachments: [{ filename: "source.pdf", mimeType: "application/pdf", base64: "ZmlsZQ==" }], attachmentFailurePolicy: "fail" }), {
      loadRollout: rollout("enforced"),
      evaluateRouting: () => decision({ requiredModalities: ["text", "file"], selectedCapabilityTier: "multimodal" }),
      execute: async (input) => { received = input; return { outputText: "extracted", providerLatencyMs: 1, routingDecision: decision(), fallbackUsed: false, executionPolicy: "adaptive" }; },
      telemetryWriter: async () => {},
    });
    assert.equal((received as RunAgentInput | null)?.attachmentFailurePolicy, "fail");
  });

  await test("Boardroom governance, disagreement and Human CEO authority contracts remain present", () => {
    const source = readFileSync("app/api/meetings/deliberate/route.ts", "utf8");
    assert.match(source, /participants\.length < 2/);
    assert.match(source, /explicitly_authorized_by_ceo/);
    assert.match(source, /agent_code === "B-001"/);
    assert.match(source, /Preserve material disagreements/);
    assert.match(source, /Human CEO makes the final decision/);
    assert.match(source, /awaitingChairClose:true/);
    assert.match(source, /external_research_allowed/);
    assert.match(source, /budget_cap_usd/);
  });

  await test("legal routes remain advisory and closure/approval semantics are not replaced by routing", () => {
    const triage = readFileSync("app/api/meetings/legal-triage/route.ts", "utf8");
    const review = readFileSync("app/api/meetings/legal-review/route.ts", "utf8");
    assert.match(triage, /Human CEO \/ Chair must explicitly close/);
    assert.match(triage, /You are NOT giving legal advice/);
    assert.match(review, /not licensed legal advice/);
    assert.match(review, /never constitutes legal approval/);
    assert.match(review, /licensed_counsel_required/);
  });

  await test("Company Library preserves tenant provenance and derived-knowledge classification", () => {
    const action = readFileSync("app/(app)/company-library/actions.ts", "utf8");
    const ingestion = readFileSync("lib/company-library-ingestion.ts", "utf8");
    assert.match(action, /requireActiveOwnerOrganizationContext/);
    assert.match(action, /knowledge_trust_class: "derived_knowledge"/);
    assert.match(action, /organizationId: context\.organizationId/);
    assert.match(ingestion, /uploaded document as untrusted data/);
    assert.match(ingestion, /not authoritative company policy/);
  });

  await test("Phase 1D migration is additive, RLS-enabled, least-privilege and dedupes critical records", () => {
    const sql = readFileSync("supabase/migrations/20260825113000_phase1d_feature_scoped_routing_rollout.sql", "utf8").toLowerCase();
    assert.match(sql, /create table if not exists public\.ai_routing_feature_rollout_config/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /to authenticated[\s\S]*organization_members/);
    assert.match(sql, /revoke all on table public\.ai_routing_feature_rollout_config from public, anon, authenticated, service_role/);
    assert.match(sql, /grant select on table public\.ai_routing_feature_rollout_config to authenticated/);
    assert.match(sql, /company_knowledge_org_storage_path_unique/);
    assert.match(sql, /meeting_legal_reviews_one_running_per_session/);
    assert.doesNotMatch(sql, /drop table|truncate table|delete from/);
  });

  await test("CI includes the complete Phase 1D release gate", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    assert.match(ci, /npm run test:phase1d/);
  });

  console.log(`Phase 1D Production path migration validation passed (${passed} tests).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
